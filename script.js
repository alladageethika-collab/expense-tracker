// Expense Tracker - script.js
// Beginner-friendly JavaScript.
// Authentication is handled only through Supabase Auth.
// Expenses and incomes are stored and loaded from Supabase Database.

const SUPABASE_URL = "https://dubfhynzysmkhiovfyhr.supabase.co";
const SUPABASE_KEY = "sb_publishable__JvzSmVDFFJD0itosfI8cQ_HBQkoPIQ";
const LARGE_EXPENSE_THRESHOLD = 500;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

(function () {
  let expenses = [];
  let incomes = [];
  let currentCategoryFilter = 'all';
  let selectedMonth = String(new Date().getMonth() + 1);
  let selectedYear = String(new Date().getFullYear());
  let searchTerm = '';
  let expenseCategoryChart = null;
  let incomeExpenseChart = null;
  let currentBudget = null;

  let authRedirectListenerRegistered = false;
  let dashboardInitialized = false;

  async function getCurrentSupabaseUser() {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();

      if (error) {
        console.error('Supabase session error:', error.message);
        return null;
      }

      return session && session.user ? session.user : null;
    } catch (err) {
      console.error('Could not read Supabase session:', err);
      return null;
    }
  }

  function registerAuthRedirectListener() {
    if (authRedirectListenerRegistered) {
      return;
    }

    authRedirectListenerRegistered = true;

    supabaseClient.auth.onAuthStateChange((event, session) => {
      const pageName = window.location.pathname.split('/').pop() || 'index.html';
      const userId = session && session.user ? session.user.id : null;

      console.log('Auth state changed:', event, session);
      console.log('Auth state event:', {
        event,
        pageName,
        sessionExists: !!session,
        userId
      });

      if ((pageName === 'login.html' || pageName === 'signup.html') && event === 'SIGNED_IN' && session && session.user) {
        console.log('OAuth callback session:', session);
        console.log('Redirecting authenticated OAuth user to dashboard.html');
        window.location.replace('dashboard.html');
        return;
      }

      if (pageName === 'dashboard.html' && event === 'SIGNED_OUT' && !session && !dashboardInitialized) {
        console.error('REDIRECTING TO LOGIN - REASON:', {
          event,
          sessionExists: !!session,
          dashboardInitialized,
          currentPage: window.location.pathname
        });
        window.location.replace('login.html');
      }
    });
  }

  async function handleLogout() {
    const welcomeMessage = document.getElementById('welcome-message');

    if (welcomeMessage) {
      welcomeMessage.textContent = '';
    }

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      alert('Logout failed: ' + error.message);
      return;
    }

    window.location.href = 'index.html';
  }

  function getDisplayNameForUser(user) {
    const metadata = user && user.user_metadata ? user.user_metadata : {};

    const fullName = metadata.full_name || metadata.name;

    if (fullName && String(fullName).trim()) {
      return String(fullName).trim();
    }

    if (user && user.email) {
      return user.email;
    }

    return 'there';
  }

  function updateWelcomeMessage(user) {
    const welcomeMessage = document.getElementById('welcome-message');

    if (!welcomeMessage) return;

    const displayName = getDisplayNameForUser(user);
    welcomeMessage.textContent = `Welcome back, ${displayName} 👋`;
  }

  async function sendEmailAlert(type, payload = {}) {
    try {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        console.warn('Skipped email alert because no active user was found.');
        return;
      }

      const { error } = await supabaseClient.functions.invoke('resend-email', {
        body: {
          type,
          email: payload.email || user.email,
          ...payload
        }
      });

      if (error) {
        console.error('Email alert failed:', error.message);
      }
    } catch (err) {
      console.error('Could not send email alert:', err);
    }
  }

  function formatCurrency(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function getFilteredByMonthAndYear(items) {
    return items.filter((item) => {
      if (!item.date) return false;

      const itemDate = new Date(item.date + 'T00:00:00');
      if (Number.isNaN(itemDate.getTime())) return false;

      const itemMonth = itemDate.getMonth() + 1;
      const itemYear = itemDate.getFullYear();

      if (selectedMonth !== 'all' && Number(selectedMonth) !== itemMonth) {
        return false;
      }

      if (selectedYear !== 'all' && Number(selectedYear) !== itemYear) {
        return false;
      }

      return true;
    });
  }

  function getVisibleExpenses() {
    const filteredByDate = getFilteredByMonthAndYear(expenses);
    const filteredByCategory = currentCategoryFilter === 'all'
      ? filteredByDate
      : filteredByDate.filter(item => String(item.category) === String(currentCategoryFilter));

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return filteredByCategory;
    }

    return filteredByCategory.filter((item) => {
      const description = String(item.description || '').toLowerCase();
      const category = String(item.category || '').toLowerCase();
      const amount = String(item.amount || '').toLowerCase();

      return description.includes(normalizedSearch)
        || category.includes(normalizedSearch)
        || amount.includes(normalizedSearch);
    });
  }

  function getVisibleIncomes() {
    return getFilteredByMonthAndYear(incomes);
  }

  function formatCategoryLabel(category) {
    if (!category) return 'Other';
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  function getDateFilteredExpenses() {
    return getFilteredByMonthAndYear(expenses);
  }

  function getDateFilteredIncomes() {
    return getFilteredByMonthAndYear(incomes);
  }

  function getBudgetTargetPeriod() {
    const month = selectedMonth && selectedMonth !== 'all' ? Number(selectedMonth) : new Date().getMonth() + 1;
    const year = selectedYear && selectedYear !== 'all' ? Number(selectedYear) : new Date().getFullYear();

    return { month, year };
  }

  function getVisibleExpensesForBudget() {
    const { month, year } = getBudgetTargetPeriod();

    return expenses.filter((item) => {
      if (!item.date) return false;

      const itemDate = new Date(item.date + 'T00:00:00');
      if (Number.isNaN(itemDate.getTime())) return false;

      return (itemDate.getMonth() + 1) === month && itemDate.getFullYear() === year;
    });
  }

  function updateBudgetSummary() {
    const monthlyBudgetValueEl = document.getElementById('monthly-budget-value');
    const budgetSpentEl = document.getElementById('budget-total-spent');
    const budgetRemainingEl = document.getElementById('budget-remaining');
    const budgetWarningEl = document.getElementById('budget-warning');
    const progressFillEl = document.getElementById('budget-progress-fill');
    const progressLabelEl = document.getElementById('budget-progress-label');
    const budgetStatusEl = document.getElementById('budget-status');

    if (!monthlyBudgetValueEl && !budgetSpentEl && !budgetRemainingEl && !budgetWarningEl && !progressFillEl && !progressLabelEl && !budgetStatusEl) {
      return;
    }

    const budgetAmount = currentBudget ? Number(currentBudget.amount || 0) : 0;
    const totalSpent = getVisibleExpensesForBudget().reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const remaining = budgetAmount - totalSpent;
    const pct = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;
    const clampedPct = Math.min(Math.max(pct, 0), 100);

    if (monthlyBudgetValueEl) monthlyBudgetValueEl.textContent = formatCurrency(budgetAmount);
    if (budgetSpentEl) budgetSpentEl.textContent = formatCurrency(totalSpent);
    if (budgetRemainingEl) budgetRemainingEl.textContent = formatCurrency(remaining);

    if (progressFillEl) {
      const finalWidth = budgetAmount > 0 ? `${Math.min(clampedPct, 100)}%` : '0%';
      progressFillEl.style.width = finalWidth;
      progressFillEl.classList.toggle('over-budget', totalSpent > budgetAmount);
    }

    if (progressLabelEl) {
      progressLabelEl.textContent = budgetAmount > 0
        ? `${formatCurrency(totalSpent)} spent out of ${formatCurrency(budgetAmount)} (${Math.round(clampedPct)}%)`
        : `${formatCurrency(totalSpent)} spent out of ${formatCurrency(0)} (0%)`;
    }

    if (budgetStatusEl) {
      let message = 'Great! You are managing your budget well.';
      let statusClass = 'status-good';

      if (totalSpent > budgetAmount) {
        message = `Budget exceeded! You are over by ${formatCurrency(Math.abs(remaining))}.`;
        statusClass = 'status-danger';
      } else if (pct >= 80) {
        message = 'Careful! You are close to your budget limit.';
        statusClass = 'status-warning';
      } else if (pct >= 50) {
        message = 'You have used more than half of your budget.';
        statusClass = 'status-warning';
      }

      budgetStatusEl.textContent = message;
      budgetStatusEl.className = `status-badge ${statusClass}`;
    }

    if (budgetWarningEl) {
      const isOverBudget = remaining < 0;
      budgetWarningEl.hidden = !isOverBudget;
      budgetWarningEl.textContent = isOverBudget
        ? `You have exceeded your monthly budget by ${formatCurrency(Math.abs(remaining))}`
        : 'You have exceeded your monthly budget.';
    }
  }

  async function loadBudgetForSelectedMonth(user) {
    if (!user || !user.id) return;

    const { month, year } = getBudgetTargetPeriod();

    const { data: budgetData, error: budgetError } = await supabaseClient
      .from('budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (budgetError) {
      console.error('Could not load budget:', budgetError.message);
      currentBudget = null;
    } else {
      currentBudget = budgetData || null;
    }

    const { data: expenseData, error: expenseError } = await supabaseClient
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (expenseError) {
      console.error('Could not load expenses for budget:', expenseError.message);
      expenses = [];
    } else {
      expenses = expenseData || [];
    }

    updateBudgetSummary();
    renderExpenses();
  }

  async function saveBudgetForSelectedMonth(user) {
    const budgetInput = document.getElementById('budget-amount');
    const amountValue = Number((budgetInput ? budgetInput.value : '') || 0);

    if (isNaN(amountValue) || amountValue < 0) {
      alert('Please enter a valid budget amount greater than or equal to 0.');
      return;
    }

    const { month, year } = getBudgetTargetPeriod();

    const { error } = await supabaseClient
      .from('budgets')
      .upsert([
        {
          user_id: user.id,
          month,
          year,
          amount: Number(amountValue.toFixed(2))
        }
      ], { onConflict: 'user_id,month,year' });

    if (error) {
      alert('Could not save budget: ' + error.message);
      return;
    }

    await loadBudgetForSelectedMonth(user);
    if (budgetInput) budgetInput.value = '';
  }

  function renderCharts() {
    const categoryCanvas = document.getElementById('expense-category-chart');
    const comparisonCanvas = document.getElementById('income-expense-chart');

    if (!categoryCanvas || !comparisonCanvas || typeof Chart === 'undefined') {
      return;
    }

    const dateFilteredExpenses = getDateFilteredExpenses();
    const dateFilteredIncomes = getDateFilteredIncomes();

    const categoryTotals = {};
    dateFilteredExpenses.forEach((item) => {
      const key = String(item.category || 'other');
      categoryTotals[key] = (categoryTotals[key] || 0) + Number(item.amount || 0);
    });

    const categoryLabels = Object.keys(categoryTotals).map(formatCategoryLabel);
    const categoryValues = Object.values(categoryTotals);

    const totalExpenses = dateFilteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalIncome = dateFilteredIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    if (expenseCategoryChart) {
      expenseCategoryChart.destroy();
    }

    if (incomeExpenseChart) {
      incomeExpenseChart.destroy();
    }

    expenseCategoryChart = new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: categoryLabels.length ? categoryLabels : ['No data'],
        datasets: [{
          data: categoryValues.length ? categoryValues : [1],
          backgroundColor: [
            '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6', '#f97316', '#22c55e'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ${formatCurrency(context.parsed)}`;
              }
            }
          }
        }
      }
    });

    incomeExpenseChart = new Chart(comparisonCanvas, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses'],
        datasets: [{
          label: 'Amount',
          data: [totalIncome, totalExpenses],
          backgroundColor: ['#10b981', '#ef4444'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${formatCurrency(context.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return formatCurrency(value);
              }
            }
          }
        }
      }
    });
  }

  function updateTotals() {
    const totalBalanceEl = document.querySelector('#total-balance .amount');
    const totalIncomeEl = document.querySelector('#total-income .amount');
    const totalExpensesEl = document.querySelector('#total-expenses .amount');

    const visibleExpenses = getVisibleExpenses();
    const visibleIncomes = getVisibleIncomes();

    const totalExpenses = visibleExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalIncome = visibleIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = totalIncome - totalExpenses;

    if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(totalExpenses);
    if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(totalIncome);
    if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(balance);

    renderCharts();
  }

  function renderExpenses() {
    const expensesTbody = document.querySelector('#expenses-table tbody');
    const noExpensesMsg = document.getElementById('no-expenses-message');
    const categoryFilterSelect = document.getElementById('category-filter');

    if (categoryFilterSelect) {
      categoryFilterSelect.value = currentCategoryFilter;
    }

    if (!expensesTbody) return;

    expensesTbody.innerHTML = '';

    const filtered = getVisibleExpenses();

    if (filtered.length === 0) {
      if (expenses.length === 0) {
        if (noExpensesMsg) noExpensesMsg.style.display = '';
      } else {
        if (noExpensesMsg) noExpensesMsg.style.display = 'none';

        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.style.fontStyle = 'italic';
        cell.style.color = 'var(--muted)';
        cell.textContent = 'No expenses in this category.';
        row.appendChild(cell);
        expensesTbody.appendChild(row);
      }
    } else {
      if (noExpensesMsg) noExpensesMsg.style.display = 'none';

      filtered.forEach((expense) => {
        const row = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = expense.date || '';
        row.appendChild(dateCell);

        const descriptionCell = document.createElement('td');
        descriptionCell.textContent = expense.description;
        row.appendChild(descriptionCell);

        const categoryCell = document.createElement('td');
        categoryCell.textContent = expense.category || '';
        row.appendChild(categoryCell);

        const amountCell = document.createElement('td');
        amountCell.className = 'amount-cell';
        amountCell.textContent = formatCurrency(expense.amount);
        row.appendChild(amountCell);

        const actionCell = document.createElement('td');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'action-btn';
        editBtn.textContent = 'Edit';
        editBtn.setAttribute('aria-label', `Edit expense ${expense.description}`);
        editBtn.addEventListener('click', () => editExpenseById(expense.id));
        actionCell.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'action-btn delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.setAttribute('aria-label', `Delete expense ${expense.description}`);
        deleteBtn.addEventListener('click', () => deleteExpenseById(expense.id));
        actionCell.appendChild(deleteBtn);
        row.appendChild(actionCell);

        expensesTbody.appendChild(row);
      });
    }

    updateTotals();
  }

  function renderIncomes() {
    const incomesTbody = document.querySelector('#incomes-table tbody');
    const noIncomesMsg = document.getElementById('no-incomes-message');

    if (!incomesTbody) return;

    incomesTbody.innerHTML = '';

    const visibleIncomes = getVisibleIncomes();

    if (visibleIncomes.length === 0) {
      if (noIncomesMsg) noIncomesMsg.style.display = '';
    } else {
      if (noIncomesMsg) noIncomesMsg.style.display = 'none';

      visibleIncomes.forEach((income) => {
        const row = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = income.date || '';
        row.appendChild(dateCell);

        const descriptionCell = document.createElement('td');
        descriptionCell.textContent = income.description;
        row.appendChild(descriptionCell);

        const amountCell = document.createElement('td');
        amountCell.className = 'amount-cell';
        amountCell.textContent = formatCurrency(income.amount);
        row.appendChild(amountCell);

        const actionCell = document.createElement('td');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'action-btn';
        editBtn.textContent = 'Edit';
        editBtn.setAttribute('aria-label', `Edit income ${income.description}`);
        editBtn.addEventListener('click', () => editIncomeById(income.id));
        actionCell.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'action-btn delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.setAttribute('aria-label', `Delete income ${income.description}`);
        deleteBtn.addEventListener('click', () => deleteIncomeById(income.id));
        actionCell.appendChild(deleteBtn);
        row.appendChild(actionCell);

        incomesTbody.appendChild(row);
      });
    }

    updateTotals();
  }

  async function loadExpensesForCurrentUser(user) {
    const { data, error } = await supabaseClient
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      alert('Could not load expenses: ' + error.message);
      expenses = [];
      renderExpenses();
      updateTotals();
      return;
    }

    expenses = data || [];
    renderExpenses();
    updateTotals();
  }

  async function loadIncomesForCurrentUser(user) {
    const { data, error } = await supabaseClient
      .from('incomes')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      alert('Could not load incomes: ' + error.message);
      incomes = [];
      renderIncomes();
      updateTotals();
      return;
    }

    incomes = data || [];
    renderIncomes();
    updateTotals();
  }

  async function addExpenseToDatabase(user, expenseData) {
    const { error } = await supabaseClient
      .from('expenses')
      .insert([
        {
          user_id: user.id,
          description: expenseData.description,
          amount: expenseData.amount,
          category: expenseData.category,
          date: expenseData.date
        }
      ]);

    if (error) {
      alert('Could not add expense: ' + error.message);
      return;
    }

    const expenseAlertPayload = {
      email: user.email,
      description: expenseData.description,
      amount: expenseData.amount,
      category: expenseData.category || 'Uncategorized',
      date: expenseData.date
    };

    await sendEmailAlert('expense_added', expenseAlertPayload);

    if (Number(expenseData.amount) > LARGE_EXPENSE_THRESHOLD) {
      await sendEmailAlert('large_expense', {
        ...expenseAlertPayload,
        threshold: LARGE_EXPENSE_THRESHOLD
      });
    }

    await loadExpensesForCurrentUser(user);
  }

  async function addIncomeToDatabase(user, incomeData) {
    const { error } = await supabaseClient
      .from('incomes')
      .insert([
        {
          user_id: user.id,
          description: incomeData.description,
          amount: incomeData.amount,
          date: incomeData.date
        }
      ]);

    if (error) {
      alert('Could not add income: ' + error.message);
      return;
    }

    await loadIncomesForCurrentUser(user);
  }

  async function deleteExpenseById(id) {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const { error } = await supabaseClient
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      alert('Could not delete expense: ' + error.message);
      return;
    }

    await loadExpensesForCurrentUser(user);
  }

  async function deleteIncomeById(id) {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const { error } = await supabaseClient
      .from('incomes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      alert('Could not delete income: ' + error.message);
      return;
    }

    await loadIncomesForCurrentUser(user);
  }

  async function editExpenseById(id) {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const expense = expenses.find(item => String(item.id) === String(id));

    if (!expense) {
      alert('Expense not found.');
      return;
    }

    const newDescription = prompt('Edit description:', expense.description);
    if (newDescription === null) return;

    const newAmount = prompt('Edit amount:', String(expense.amount));
    if (newAmount === null) return;

    const newCategory = prompt('Edit category:', expense.category || '');
    if (newCategory === null) return;

    const newDate = prompt('Edit date (yyyy-mm-dd):', expense.date || new Date().toISOString().slice(0, 10));
    if (newDate === null) return;

    const parsedAmount = Number(newAmount);
    if (!newDescription.trim()) {
      alert('Description cannot be empty.');
      return;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    const { error } = await supabaseClient
      .from('expenses')
      .update({
        description: newDescription.trim(),
        amount: Number(parsedAmount.toFixed(2)),
        category: newCategory.trim(),
        date: newDate
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      alert('Could not update expense: ' + error.message);
      return;
    }

    await loadExpensesForCurrentUser(user);
  }

  async function editIncomeById(id) {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const income = incomes.find(item => String(item.id) === String(id));

    if (!income) {
      alert('Income not found.');
      return;
    }

    const newDescription = prompt('Edit description:', income.description);
    if (newDescription === null) return;

    const newAmount = prompt('Edit amount:', String(income.amount));
    if (newAmount === null) return;

    const newDate = prompt('Edit date (yyyy-mm-dd):', income.date || new Date().toISOString().slice(0, 10));
    if (newDate === null) return;

    const parsedAmount = Number(newAmount);
    if (!newDescription.trim()) {
      alert('Description cannot be empty.');
      return;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    const { error } = await supabaseClient
      .from('incomes')
      .update({
        description: newDescription.trim(),
        amount: Number(parsedAmount.toFixed(2)),
        date: newDate
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      alert('Could not update income: ' + error.message);
      return;
    }

    await loadIncomesForCurrentUser(user);
  }

  function populateYearFilter() {
    const yearFilter = document.getElementById('year-filter');
    if (!yearFilter) return;

    const years = Array.from(new Set([
      ...expenses.map(item => item.date ? new Date(item.date + 'T00:00:00').getFullYear() : null),
      ...incomes.map(item => item.date ? new Date(item.date + 'T00:00:00').getFullYear() : null)
    ].filter(year => Number.isFinite(year)))).sort((a, b) => b - a);

    const previousValue = yearFilter.value;
    yearFilter.innerHTML = '<option value="all">All Time</option>' +
      years.map(year => `<option value="${year}">${year}</option>`).join('');

    if (previousValue !== 'all' && years.includes(Number(previousValue))) {
      yearFilter.value = String(previousValue);
    } else {
      yearFilter.value = selectedYear;
    }
  }

  function applySavedTheme() {
    const savedTheme = localStorage.getItem('expense-tracker-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');

    document.body.classList.toggle('dark-theme', theme === 'dark');

    const lightThemeBtn = document.getElementById('theme-light');
    const darkThemeBtn = document.getElementById('theme-dark');

    if (lightThemeBtn) {
      lightThemeBtn.classList.toggle('active', theme === 'light');
      lightThemeBtn.setAttribute('aria-pressed', String(theme === 'light'));
    }

    if (darkThemeBtn) {
      darkThemeBtn.classList.toggle('active', theme === 'dark');
      darkThemeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }

  function getGoogleAuthRedirectUrl() {
    const currentOrigin = window.location.origin;

    if (currentOrigin && currentOrigin !== 'null') {
      return currentOrigin + '/login.html';
    }

    return 'http://localhost:5500/login.html';
  }

  async function handleGoogleSignIn() {
    try {
      registerAuthRedirectListener();

      const redirectUrl = getGoogleAuthRedirectUrl();
      console.log('Google OAuth redirectTo:', redirectUrl);

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });

      if (error) {
        alert('Google login failed: ' + error.message);
        return;
      }
    } catch (err) {
      alert('Google login failed. Please try again.');
      console.error('Google OAuth error:', err);
    }
  }

  function bindRouteButtons() {
    document.querySelectorAll('[data-route]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-route');
        if (target) {
          window.location.href = target;
        }
      });
    });
  }

  function initExpensesPage(user) {
    const expenseForm = document.getElementById('expense-form');
    const categoryFilterSelect = document.getElementById('category-filter');
    const monthFilterSelect = document.getElementById('month-filter');
    const yearFilterSelect = document.getElementById('year-filter');
    const expenseSearchInput = document.getElementById('expense-search');

    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener('change', (event) => {
        currentCategoryFilter = event.target.value || 'all';
        renderExpenses();
        updateTotals();
      });
    }

    if (expenseSearchInput) {
      expenseSearchInput.addEventListener('input', (event) => {
        searchTerm = event.target.value || '';
        renderExpenses();
        updateTotals();
      });
    }

    if (monthFilterSelect) {
      monthFilterSelect.addEventListener('change', async (event) => {
        selectedMonth = event.target.value || 'all';
        renderExpenses();
        renderIncomes();
        updateTotals();
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (yearFilterSelect) {
      yearFilterSelect.addEventListener('change', async (event) => {
        selectedYear = event.target.value || 'all';
        renderExpenses();
        renderIncomes();
        updateTotals();
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (expenseForm) {
      expenseForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const description = (expenseForm.querySelector('#description').value || '').trim();
        const amountRaw = expenseForm.querySelector('#amount').value;
        const category = expenseForm.querySelector('#category').value || '';
        const date = expenseForm.querySelector('#date').value || new Date().toISOString().slice(0, 10);

        if (!description) {
          alert('Please enter a description.');
          return;
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          alert('Please enter a valid amount greater than 0.');
          return;
        }

        await addExpenseToDatabase(user, {
          description,
          amount: Number(amount.toFixed(2)),
          category,
          date
        });

        expenseForm.reset();
      });
    }

    loadExpensesForCurrentUser(user).then(() => {
      populateYearFilter();
      renderExpenses();
      updateTotals();
    });
  }

  function initIncomePage(user) {
    const incomeForm = document.getElementById('income-form');

    if (incomeForm) {
      incomeForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const description = (incomeForm.querySelector('#income-description').value || '').trim();
        const amountRaw = incomeForm.querySelector('#income-amount').value;
        const date = incomeForm.querySelector('#income-date').value || new Date().toISOString().slice(0, 10);

        if (!description) {
          alert('Please enter a description for the income.');
          return;
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          alert('Please enter a valid income amount greater than 0.');
          return;
        }

        await addIncomeToDatabase(user, {
          description,
          amount: Number(amount.toFixed(2)),
          date
        });

        incomeForm.reset();
      });
    }

    loadIncomesForCurrentUser(user).then(() => {
      renderIncomes();
      updateTotals();
    });
  }

  function initBudgetPage(user) {
    const budgetForm = document.getElementById('budget-form');
    const budgetMonthSelect = document.getElementById('budget-month-select');
    const budgetYearSelect = document.getElementById('budget-year-select');

    if (budgetMonthSelect) {
      budgetMonthSelect.value = selectedMonth;
      budgetMonthSelect.addEventListener('change', async (event) => {
        selectedMonth = event.target.value || String(new Date().getMonth() + 1);
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (budgetYearSelect) {
      const yearOptions = [];
      const currentYear = new Date().getFullYear();
      for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
        yearOptions.push(`<option value="${year}">${year}</option>`);
      }
      budgetYearSelect.innerHTML = yearOptions.join('');
      budgetYearSelect.value = selectedYear;
      budgetYearSelect.addEventListener('change', async (event) => {
        selectedYear = event.target.value || String(new Date().getFullYear());
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (budgetForm) {
      budgetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveBudgetForSelectedMonth(user);
      });
    }

    loadBudgetForSelectedMonth(user);
  }

  function initDashboard(user) {
    const expenseForm = document.getElementById('expense-form');
    const incomeForm = document.getElementById('income-form');
    const categoryFilterSelect = document.getElementById('category-filter');
    const monthFilterSelect = document.getElementById('month-filter');
    const yearFilterSelect = document.getElementById('year-filter');
    const expenseSearchInput = document.getElementById('expense-search');

    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener('change', (event) => {
        currentCategoryFilter = event.target.value || 'all';
        renderExpenses();
        updateTotals();
      });
    }

    if (expenseSearchInput) {
      expenseSearchInput.addEventListener('input', (event) => {
        searchTerm = event.target.value || '';
        renderExpenses();
        updateTotals();
      });
    }

    if (monthFilterSelect) {
      monthFilterSelect.addEventListener('change', async (event) => {
        selectedMonth = event.target.value || 'all';
        renderExpenses();
        renderIncomes();
        updateTotals();
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (yearFilterSelect) {
      yearFilterSelect.addEventListener('change', async (event) => {
        selectedYear = event.target.value || 'all';
        renderExpenses();
        renderIncomes();
        updateTotals();
        await loadBudgetForSelectedMonth(user);
      });
    }

    if (expenseForm) {
      expenseForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const description = (expenseForm.querySelector('#description').value || '').trim();
        const amountRaw = expenseForm.querySelector('#amount').value;
        const category = expenseForm.querySelector('#category').value || '';
        const date = expenseForm.querySelector('#date').value || new Date().toISOString().slice(0, 10);

        if (!description) {
          alert('Please enter a description.');
          return;
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          alert('Please enter a valid amount greater than 0.');
          return;
        }

        await addExpenseToDatabase(user, {
          description,
          amount: Number(amount.toFixed(2)),
          category,
          date
        });

        expenseForm.reset();
      });
    }

    if (incomeForm) {
      incomeForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const description = (incomeForm.querySelector('#income-description').value || '').trim();
        const amountRaw = incomeForm.querySelector('#income-amount').value;
        const date = incomeForm.querySelector('#income-date').value || new Date().toISOString().slice(0, 10);

        if (!description) {
          alert('Please enter a description for the income.');
          return;
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          alert('Please enter a valid income amount greater than 0.');
          return;
        }

        await addIncomeToDatabase(user, {
          description,
          amount: Number(amount.toFixed(2)),
          date
        });

        incomeForm.reset();
      });
    }

    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) {
      budgetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveBudgetForSelectedMonth(user);
      });
    }

    loadExpensesForCurrentUser(user).then(() => {
      populateYearFilter();
      renderExpenses();
      updateTotals();
    });

    loadIncomesForCurrentUser(user).then(() => {
      populateYearFilter();
      renderIncomes();
      updateTotals();
    });

    loadBudgetForSelectedMonth(user);
  }

  applySavedTheme();

  const lightThemeBtn = document.getElementById('theme-light');
  const darkThemeBtn = document.getElementById('theme-dark');

  if (lightThemeBtn) {
    lightThemeBtn.addEventListener('click', () => {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('expense-tracker-theme', 'light');
      applySavedTheme();
    });
  }

  if (darkThemeBtn) {
    darkThemeBtn.addEventListener('click', () => {
      document.body.classList.add('dark-theme');
      localStorage.setItem('expense-tracker-theme', 'dark');
      applySavedTheme();
    });
  }

  bindRouteButtons();

  document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const dashboardSection = document.getElementById('dashboard');
    const yearEl = document.getElementById('year');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const forgotPasswordBox = document.getElementById('forgot-password-box');
    const showForgotPasswordBtn = document.getElementById('show-forgot-password');
    const forgotPasswordMessage = document.getElementById('forgot-password-message');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const resetPasswordMessage = document.getElementById('reset-password-message');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const googleSignupBtn = document.getElementById('google-signup-btn');

    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isAuthPage = currentPage === 'login.html' || currentPage === 'signup.html';
    const isDashboardPage = currentPage === 'dashboard.html';

    console.log('Current page loaded:', currentPage);
    console.log('OAuth callback URL details:', {
      href: window.location.href,
      hash: window.location.hash,
      search: window.location.search
    });

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    console.log('Supabase getSession on page load:', {
      sessionExists: !!session,
      userId: session && session.user ? session.user.id : null,
      error: error ? error.message : null,
      href: window.location.href,
      hash: window.location.hash,
      search: window.location.search
    });

    registerAuthRedirectListener();

    if (isAuthPage) {
      const { data: { session }, error } = await supabaseClient.auth.getSession();

      console.log('Auth page session check:', {
        page: currentPage,
        sessionExists: !!session,
        userId: session && session.user ? session.user.id : null,
        error: error ? error.message : null
      });

      if (error) {
        console.error('Session error:', error.message);
      }

      if (session && session.user) {
        console.log('Redirecting to dashboard.html: valid session found on auth page');
        window.location.replace('dashboard.html');
        return;
      }
    }

    const protectedPages = ['dashboard.html', 'expenses.html', 'income.html', 'budget.html'];

    if (protectedPages.includes(currentPage)) {
      const { data: { session }, error } = await supabaseClient.auth.getSession();

      if (error) {
        console.error('Session error:', error.message);
      }

      if (!session || !session.user) {
        console.error('REDIRECTING TO LOGIN - REASON:', {
          event: 'NO_SESSION',
          sessionExists: !!session,
          dashboardInitialized,
          currentPage: window.location.pathname
        });
        window.location.replace('login.html');
        return;
      }

      const user = session.user;

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          await handleLogout();
        });
      }

      if (currentPage === 'dashboard.html') {
        if (dashboardInitialized) {
          return;
        }

        dashboardInitialized = true;

        const welcomeKey = `welcome-email-sent-${user.id}`;
        if (!localStorage.getItem(welcomeKey)) {
          await sendEmailAlert('welcome', {
            email: user.email
          });
          localStorage.setItem(welcomeKey, 'true');
        }

        console.log('Initializing dashboard for user:', user.id);
        initDashboard(user);
      }

      if (currentPage === 'expenses.html') {
        initExpensesPage(user);
      }

      if (currentPage === 'income.html') {
        initIncomePage(user);
      }

      if (currentPage === 'budget.html') {
        initBudgetPage(user);
      }
    }

    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', async () => {
        await handleGoogleSignIn();
      });
    }

    if (googleSignupBtn) {
      googleSignupBtn.addEventListener('click', async () => {
        await handleGoogleSignIn();
      });
    }

    if (showForgotPasswordBtn && forgotPasswordBox) {
      showForgotPasswordBtn.addEventListener('click', () => {
        forgotPasswordBox.hidden = !forgotPasswordBox.hidden;
      });
    }

    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('reset-email');
        const email = (emailInput ? emailInput.value : '').trim();

        if (!email) {
          if (forgotPasswordMessage) {
            forgotPasswordMessage.textContent = 'Please enter your email address.';
            forgotPasswordMessage.style.color = '#ef4444';
          }
          return;
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password.html'
        });

        if (error) {
          if (forgotPasswordMessage) {
            forgotPasswordMessage.textContent = error.message;
            forgotPasswordMessage.style.color = '#ef4444';
          }
          return;
        }

        if (forgotPasswordMessage) {
          forgotPasswordMessage.textContent = 'Password reset email sent. Please check your inbox and follow the link.';
          forgotPasswordMessage.style.color = '#16a34a';
        }
        forgotPasswordForm.reset();
      });
    }

    if (resetPasswordForm) {
      resetPasswordForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const newPasswordInput = document.getElementById('new-password');
        const confirmPasswordInput = document.getElementById('confirm-password');

        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

        if (!newPassword || !confirmPassword) {
          if (resetPasswordMessage) {
            resetPasswordMessage.textContent = 'Please enter and confirm your new password.';
            resetPasswordMessage.style.color = '#ef4444';
          }
          return;
        }

        if (newPassword !== confirmPassword) {
          if (resetPasswordMessage) {
            resetPasswordMessage.textContent = 'Passwords do not match.';
            resetPasswordMessage.style.color = '#ef4444';
          }
          return;
        }

        const { error } = await supabaseClient.auth.updateUser({
          password: newPassword
        });

        if (error) {
          if (resetPasswordMessage) {
            resetPasswordMessage.textContent = error.message;
            resetPasswordMessage.style.color = '#ef4444';
          }
          return;
        }

        if (resetPasswordMessage) {
          resetPasswordMessage.textContent = 'Password updated successfully. Redirecting to login...';
          resetPasswordMessage.style.color = '#16a34a';
        }

        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');

        const email = (emailInput ? emailInput.value : '').trim();
        const password = passwordInput ? passwordInput.value : '';

        if (!email || !password) {
          alert('Please enter both email and password.');
          return;
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          alert(error.message);
          return;
        }

        if (data && data.user) {
          alert('Login successful!');
          window.location.href = 'dashboard.html';
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('signup-email');
        const passwordInput = document.getElementById('signup-password');

        const email = (emailInput ? emailInput.value : '').trim();
        const password = passwordInput ? passwordInput.value : '';

        if (!email || !password) {
          alert('Please enter both email and password.');
          return;
        }

        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password
        });

        if (error) {
          alert('Signup failed: ' + error.message);
          return;
        }

        if (data && data.user && data.session === null) {
          alert('Account created successfully. Please check your email and confirm your account before logging in.');
          signupForm.reset();
          window.location.href = 'login.html';
          return;
        }

        if (data && data.user && data.session) {
          alert('Account created successfully. Please check your email and confirm your account before logging in.');
          signupForm.reset();
          window.location.href = 'login.html';
        }
      });
    }

  });
})();
