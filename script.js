// Expense Tracker - script.js
// Beginner-friendly JavaScript to wire the form to the table
// Changes: added Income feature with localStorage persistence alongside existing Expense functionality.
// Features now include:
// - Add expense rows from the expense form
// - Add income rows from the income form
// - Update totals: Total Income, Total Expenses, and Total Balance (Income - Expenses)
// - Delete expenses and incomes; update and persist data
// - Save both expenses and incomes to localStorage and load them on page load

(function () {
  // --- Elements for expenses ---
  const expenseForm = document.getElementById('expense-form');
  const expensesTbody = document.querySelector('#expenses-table tbody');
  const noExpensesMsg = document.getElementById('no-expenses-message');

  // Category filter for expenses. The filter only affects what is shown in the
  // expenses table, not the totals. Default is 'all'.
  const categoryFilterSelect = document.getElementById('category-filter');
  let currentCategoryFilter = 'all';
  if (categoryFilterSelect) {
    categoryFilterSelect.addEventListener('change', (e) => {
      currentCategoryFilter = e.target.value || 'all';
      // Re-render expenses view when the filter changes
      renderExpenses();
    });
  }

  // --- Elements for incomes ---
  const incomeForm = document.getElementById('income-form');
  const incomesTbody = document.querySelector('#incomes-table tbody');
  const noIncomesMsg = document.getElementById('no-incomes-message');

  // --- Dashboard elements ---
  const totalBalanceEl = document.querySelector('#total-balance .amount');
  const totalIncomeEl = document.querySelector('#total-income .amount');
  const totalExpensesEl = document.querySelector('#total-expenses .amount');

  // Keep arrays of expense and income objects in memory
  // Expense: { id, description, amount, category, date }
  // Income:  { id, description, amount, date }
  let expenses = [];
  let incomes = [];

  // Helper to format numbers as currency
  function formatCurrency(value) {
    return "$" + Number(value).toFixed(2);
  }

  // -------------------------
  // Local storage helpers
  // -------------------------
  // Save both lists under separate keys so they are easy to manage
  function saveData() {
    try {
      localStorage.setItem('expenses', JSON.stringify(expenses));
      localStorage.setItem('incomes', JSON.stringify(incomes));
    } catch (err) {
      console.warn('Could not save data to localStorage:', err);
    }
  }

  // Load saved expenses and incomes. Normalize types to ensure numbers are numbers.
  function loadData() {
    try {
      const expensesRaw = localStorage.getItem('expenses');
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

      const incomesRaw = localStorage.getItem('incomes');
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

  // -------------------------
  // Totals and rendering
  // -------------------------
  function updateTotals() {
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const balance = totalIncome - totalExpenses;

    totalExpensesEl.textContent = formatCurrency(totalExpenses);
    totalIncomeEl.textContent = formatCurrency(totalIncome);
    totalBalanceEl.textContent = formatCurrency(balance);
  }

  // Render expenses table rows
  // This function respects the category filter (currentCategoryFilter) when
  // deciding which rows to show. Totals are NOT affected by the filter - they
  // are always calculated from the full expenses array.
  function renderExpenses() {
    expensesTbody.innerHTML = '';

    // Determine which expenses to show according to the selected filter
    const filtered = (currentCategoryFilter === 'all')
      ? expenses
      : expenses.filter(e => String(e.category) === String(currentCategoryFilter));

    if (filtered.length === 0) {
      // If there are no expenses to show for the filtered view, still check if
      // there are any expenses at all to decide which message to show. We use
      // the existing noExpensesMsg for simplicity; it will be visible when
      // the full list is empty. When the list has items but the filter hides
      // them, we show a small message instead.
      if (expenses.length === 0) {
        noExpensesMsg.style.display = '';
      } else {
        // Full list has items but filter hides them -> show a friendly message
        noExpensesMsg.style.display = 'none';

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
      noExpensesMsg.style.display = 'none';

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
        deleteBtn.addEventListener('click', () => removeExpense(expense.id));

        actionsTd.appendChild(deleteBtn);
        tr.appendChild(actionsTd);

        expensesTbody.appendChild(tr);
      });
    }

    // Always update totals from the full data set (not the filtered list)
    updateTotals();
  }

  // Render incomes table rows
  function renderIncomes() {
    incomesTbody.innerHTML = '';

    if (incomes.length === 0) {
      noIncomesMsg.style.display = '';
    } else {
      noIncomesMsg.style.display = 'none';
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

  // -------------------------
  // Modify data helpers
  // -------------------------
  function addExpense(expense) {
    expenses.push(expense);
    saveData(); // persist immediately
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
    saveData(); // persist immediately
    renderIncomes();
  }

  function removeIncome(id) {
    const idNum = Number(id);
    incomes = incomes.filter(i => Number(i.id) !== idNum);
    saveData();
    renderIncomes();
  }

  // -------------------------
  // Form handling
  // -------------------------
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

  incomeForm.addEventListener('submit', function (event) {
    event.preventDefault();

    // Read values from the income form fields
    const description = (incomeForm.querySelector('#income-description').value || '').trim();
    const amountRaw = incomeForm.querySelector('#income-amount').value;
    const date = incomeForm.querySelector('#income-date').value || new Date().toISOString().slice(0, 10);

    // Basic validation: description and amount required
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

  // -------------------------
  // Initialization
  // -------------------------
  function init() {
    // Load saved data (both expenses and incomes) before rendering so UI shows
    // previously-saved entries immediately.
    loadData();
    renderIncomes();
    renderExpenses();

    // Set footer year if present
    const yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
