// Expense Tracker - script.js
// Beginner-friendly JavaScript with a small client-side authentication
// layer added. The file is intentionally defensive: it runs different code
// depending on which page is loaded (landing, login, signup, or dashboard).
//
// SECURITY NOTE: This is a client-side demo only. User credentials are stored
// in localStorage in plain text for simplicity and should NOT be used for
// real applications.

(function () {
  // -------------------------
  // Authentication helpers
  // -------------------------
  function getUsers() {
    try {
      const raw = localStorage.getItem('users');
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem('users', JSON.stringify(users));
    } catch (err) {
      console.warn('Could not save users:', err);
    }
  }

  function signUp(email, password) {
    // Simple signup: check if user exists, then save.
    // IMPORTANT: Do not auto-login after signup. Redirect user to the login
    // page so they can authenticate with their new credentials.
    const users = getUsers();
    const exists = users.some(u => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (exists) return { ok: false, error: 'A user with that email already exists.' };

    users.push({ email, password }); // WARNING: storing plain text passwords — demo only
    saveUsers(users);
    // Do NOT setCurrentUser here; require user to log in explicitly.
    return { ok: true };
  }

  function login(email, password) {
    const users = getUsers();
    const user = users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (!user) return { ok: false, error: 'No account found for that email.' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password.' };

    setCurrentUser(email);
    return { ok: true };
  }

  function logout() {
    try { localStorage.removeItem('currentUser'); } catch (e) { }
    // Send user back to landing page after logout
    window.location.href = 'index.html';
  }

  function setCurrentUser(email) {
    try { localStorage.setItem('currentUser', String(email)); } catch (e) { }
  }

  function getCurrentUser() {
    try { return localStorage.getItem('currentUser'); } catch (e) { return null; }
  }

  function requireAuth() {
    const user = getCurrentUser();
    if (!user) {
      // Not logged in -> go to login page
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // -------------------------
  // Page-specific initialization
  // -------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // If we're on the login page, wire up the login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = (document.getElementById('login-email').value || '').trim();
        const password = (document.getElementById('login-password').value || '');
        const res = login(email, password);
        if (res.ok) {
          // Redirect to dashboard after login
          window.location.href = 'dashboard.html';
        } else {
          alert(res.error || 'Login failed');
        }
      });
    }

    // If we're on the signup page, wire up signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = (document.getElementById('signup-email').value || '').trim();
        const password = (document.getElementById('signup-password').value || '');
        const res = signUp(email, password);
        if (res.ok) {
          // After successful signup, redirect the user to the login page so
          // they can authenticate. This enforces that signup != automatic login.
          alert('Account created. Please log in.');
          window.location.href = 'login.html';
        } else {
          alert(res.error || 'Sign up failed');
        }
      });
    }

    // If we're on the dashboard page, initialize dashboard features but only
    // after access control check.
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) {
      // Enforce authentication: if not logged-in, redirect to login page.
      if (!requireAuth()) return; // requireAuth redirects if needed

      // Wire logout button (if present)
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) logoutBtn.addEventListener('click', () => logout());

      // Run the original dashboard setup (expenses, incomes, filters)
      initDashboard();
    }

    // Optionally update footer year on any page
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });

  // -------------------------
  // Dashboard / tracker code (scoped)
  // -------------------------
  function initDashboard() {
    // Query elements inside the dashboard page only — avoids errors on other pages
    const expenseForm = document.getElementById('expense-form');
    const expensesTbody = document.querySelector('#expenses-table tbody');
    const noExpensesMsg = document.getElementById('no-expenses-message');

    const incomeForm = document.getElementById('income-form');
    const incomesTbody = document.querySelector('#incomes-table tbody');
    const noIncomesMsg = document.getElementById('no-incomes-message');

    const categoryFilterSelect = document.getElementById('category-filter');
    let currentCategoryFilter = (categoryFilterSelect && categoryFilterSelect.value) ? categoryFilterSelect.value : 'all';
    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value || 'all';
        renderExpenses();
      });
    }

    const totalBalanceEl = document.querySelector('#total-balance .amount');
    const totalIncomeEl = document.querySelector('#total-income .amount');
    const totalExpensesEl = document.querySelector('#total-expenses .amount');

    // Data arrays kept in local execution scope. These use the same storage
    // keys as before so existing data is preserved.
    let expenses = [];
    let incomes = [];

    function formatCurrency(value) {
      return '$' + Number(value).toFixed(2);
    }

    // Per-user storage keys. Use the currently logged-in user's email
    // to keep each user's data separate. This function will also migrate any
    // existing global data (saved under 'expenses'/'incomes') into the
    // user's namespace the first time they load the dashboard so no data is lost.
    const currentUserEmail = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const safeUser = currentUserEmail ? String(currentUserEmail) : 'anonymous';
    const expensesKey = `expenses::${safeUser}`;
    const incomesKey = `incomes::${safeUser}`;

    function saveData() {
      try {
        localStorage.setItem(expensesKey, JSON.stringify(expenses));
        localStorage.setItem(incomesKey, JSON.stringify(incomes));
      } catch (err) {
        console.warn('Could not save data to localStorage:', err);
      }
    }

    function loadData() {
      try {
        // Migrate global data if per-user keys are empty but global keys exist.
        // This makes the change backward-compatible: old data will become the
        // current user's data on first dashboard visit.
        const hasPerExpenses = !!localStorage.getItem(expensesKey);
        const hasGlobalExpenses = !!localStorage.getItem('expenses');
        if (!hasPerExpenses && hasGlobalExpenses) {
          try {
            const parsedGlobal = JSON.parse(localStorage.getItem('expenses'));
            if (Array.isArray(parsedGlobal)) {
              localStorage.setItem(expensesKey, JSON.stringify(parsedGlobal));
            }
          } catch (err) {
            // ignore parse errors
          }
        }

        const hasPerIncomes = !!localStorage.getItem(incomesKey);
        const hasGlobalIncomes = !!localStorage.getItem('incomes');
        if (!hasPerIncomes && hasGlobalIncomes) {
          try {
            const parsedGlobal = JSON.parse(localStorage.getItem('incomes'));
            if (Array.isArray(parsedGlobal)) {
              localStorage.setItem(incomesKey, JSON.stringify(parsedGlobal));
            }
          } catch (err) {
            // ignore parse errors
          }
        }

        // Load per-user expenses
        const expensesRaw = localStorage.getItem(expensesKey);
        if (expensesRaw) {
          const parsed = JSON.parse(expensesRaw);
          if (Array.isArray(parsed)) {
            expenses = parsed.map(item => ({
              id: Number(item.id) || Date.now(),
              description: String(item.description || ''),
              amount: Number(item.amount) || 0,
              category: String(item.category || ''),
              date: String(item.date || new Date().toISOString().slice(0, 10)),
            }));
          }
        }

        // Load per-user incomes
        const incomesRaw = localStorage.getItem(incomesKey);
        if (incomesRaw) {
          const parsed = JSON.parse(incomesRaw);
          if (Array.isArray(parsed)) {
            incomes = parsed.map(item => ({
              id: Number(item.id) || Date.now(),
              description: String(item.description || ''),
              amount: Number(item.amount) || 0,
              date: String(item.date || new Date().toISOString().slice(0, 10)),
            }));
          }
        }
      } catch (err) {
        console.warn('Could not load data from localStorage:', err);
        expenses = [];
        incomes = [];
      }
    }

    function updateTotals() {
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
      const balance = totalIncome - totalExpenses;

      if (totalExpensesEl) totalExpensesEl.textContent = formatCurrency(totalExpenses);
      if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(totalIncome);
      if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(balance);
    }

    function renderExpenses() {
      if (!expensesTbody) return;
      expensesTbody.innerHTML = '';

      const filtered = (currentCategoryFilter === 'all')
        ? expenses
        : expenses.filter(e => String(e.category) === String(currentCategoryFilter));

      if (filtered.length === 0) {
        if (expenses.length === 0) {
          if (noExpensesMsg) noExpensesMsg.style.display = '';
        } else {
          if (noExpensesMsg) noExpensesMsg.style.display = 'none';
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 5;
          td.style.fontStyle = 'italic';
          td.style.color = 'var(--muted)';
          td.textContent = 'No expenses in this category.';
          tr.appendChild(td);
          expensesTbody.appendChild(tr);
        }
      } else {
        if (noExpensesMsg) noExpensesMsg.style.display = 'none';
        filtered.forEach(expense => {
          const tr = document.createElement('tr');

          const dateTd = document.createElement('td');
          dateTd.textContent = expense.date || '';
          tr.appendChild(dateTd);

          const descTd = document.createElement('td');
          descTd.textContent = expense.description;
          tr.appendChild(descTd);

          const catTd = document.createElement('td');
          catTd.textContent = expense.category || '';
          tr.appendChild(catTd);

          const amountTd = document.createElement('td');
          amountTd.className = 'amount-cell';
          amountTd.textContent = formatCurrency(expense.amount);
          tr.appendChild(amountTd);

          const actionsTd = document.createElement('td');
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = 'Delete';
          deleteBtn.className = 'action-btn delete';
          deleteBtn.setAttribute('aria-label', `Delete expense ${expense.description} for ${formatCurrency(expense.amount)}`);
          deleteBtn.addEventListener('click', () => {
            removeExpense(expense.id);
          });

          actionsTd.appendChild(deleteBtn);
          tr.appendChild(actionsTd);

          expensesTbody.appendChild(tr);
        });
      }

      updateTotals();
    }

    function renderIncomes() {
      if (!incomesTbody) return;
      incomesTbody.innerHTML = '';

      if (incomes.length === 0) {
        if (noIncomesMsg) noIncomesMsg.style.display = '';
      } else {
        if (noIncomesMsg) noIncomesMsg.style.display = 'none';
        incomes.forEach(income => {
          const tr = document.createElement('tr');

          const dateTd = document.createElement('td');
          dateTd.textContent = income.date || '';
          tr.appendChild(dateTd);

          const descTd = document.createElement('td');
          descTd.textContent = income.description;
          tr.appendChild(descTd);

          const amountTd = document.createElement('td');
          amountTd.className = 'amount-cell';
          amountTd.textContent = formatCurrency(income.amount);
          tr.appendChild(amountTd);

          const actionsTd = document.createElement('td');
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = 'Delete';
          deleteBtn.className = 'action-btn delete';
          deleteBtn.setAttribute('aria-label', `Delete income ${income.description} for ${formatCurrency(income.amount)}`);
          deleteBtn.addEventListener('click', () => removeIncome(income.id));

          actionsTd.appendChild(deleteBtn);
          tr.appendChild(actionsTd);

          incomesTbody.appendChild(tr);
        });
      }

      updateTotals();
    }

    function addExpense(expense) {
      expenses.push(expense);
      saveData();
      renderExpenses();
    }

    function removeExpense(id) {
      const idNum = Number(id);
      expenses = expenses.filter(e => Number(e.id) !== idNum);
      saveData();
      renderExpenses();
    }

    function addIncome(income) {
      incomes.push(income);
      saveData();
      renderIncomes();
    }

    function removeIncome(id) {
      const idNum = Number(id);
      incomes = incomes.filter(i => Number(i.id) !== idNum);
      saveData();
      renderIncomes();
    }

    if (expenseForm) {
      expenseForm.addEventListener('submit', function (event) {
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

        const expense = {
          id: Date.now(),
          description,
          amount: Number(amount.toFixed(2)),
          category,
          date,
        };

        addExpense(expense);
        expenseForm.reset();
      });
    }

    if (incomeForm) {
      incomeForm.addEventListener('submit', function (event) {
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

        const income = {
          id: Date.now(),
          description,
          amount: Number(amount.toFixed(2)),
          date,
        };

        addIncome(income);
        incomeForm.reset();
      });
    }

    // Initialize dashboard data and render
    loadData();
    renderIncomes();
    renderExpenses();
  }

})();
