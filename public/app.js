// Global state
let currentUser = null;
let categories = [];
let items = [];
let units = [];
let accounts = [];
let transactions = [];
let selectedItems = []; // For multiple item selection
let isMultiItemMode = false;
let dashboardCharts = {}; // Store chart instances

// DOM Elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.username;
            showApp();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    const changePasswordForm = document.getElementById('changePasswordForm');

    // Auth forms
    document.getElementById('showSignUp').addEventListener('click', (e) => {
        e.preventDefault();
        signInForm.style.display = 'none';
        signUpForm.style.display = 'block';
        changePasswordForm.style.display = 'none';
    });

    document.getElementById('showSignIn').addEventListener('click', (e) => {
        e.preventDefault();
        signUpForm.style.display = 'none';
        signInForm.style.display = 'block';
        changePasswordForm.style.display = 'none';
    });

    document.getElementById('showChangePassword').addEventListener('click', (e) => {
        e.preventDefault();
        signInForm.style.display = 'none';
        signUpForm.style.display = 'none';
        changePasswordForm.style.display = 'block';
    });

    document.getElementById('backToSignIn').addEventListener('click', (e) => {
        e.preventDefault();
        changePasswordForm.style.display = 'none';
        signInForm.style.display = 'block';
    });

    // Auto-generate userid
    document.getElementById('signupUsername').addEventListener('input', (e) => {
        const userid = e.target.value.toLowerCase().replace(/\s+/g, '');
        document.getElementById('signupUserid').value = userid;
    });

    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Register form
    document.getElementById('registerForm').addEventListener('submit', handleRegister);

    // Change password form
    document.getElementById('passwordChangeForm').addEventListener('submit', handleChangePassword);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });
    
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = btn.dataset.tab;
            switchTab(btn.closest('.page'), tabName);
        });
    });
    
    // Category form
    document.getElementById('categoryForm').addEventListener('submit', handleAddCategory);
    
    // Manage Categories filters
    document.getElementById('manageCategoryTypeFilter')?.addEventListener('change', renderManageCategoriesTable);
    document.getElementById('showDisabledCategories')?.addEventListener('change', renderManageCategoriesTable);
    
    // Manage Items filters
    document.getElementById('manageItemTypeFilter')?.addEventListener('change', renderManageItemsTable);
    document.getElementById('manageItemCategoryFilter')?.addEventListener('change', renderManageItemsTable);
    document.getElementById('showDisabledItems')?.addEventListener('change', renderManageItemsTable);

    // Manage Units filters
    document.getElementById('showDisabledUnits')?.addEventListener('change', renderManageUnitsTable);

    // Unit form
    document.getElementById('unitForm').addEventListener('submit', handleAddUnit);
    
    // Item form
    document.getElementById('itemForm').addEventListener('submit', handleAddItem);
    document.getElementById('itemType').addEventListener('change', loadCategoriesForItems);
    
    // Account forms
    document.getElementById('accountForm').addEventListener('submit', handleAddAccount);
    document.getElementById('accountType').addEventListener('change', handleAccountTypeChange);
    
    // Transaction form
    document.getElementById('transactionForm').addEventListener('submit', handleAddTransaction);
    document.getElementById('transactionType').addEventListener('change', handleTransactionTypeChange);
    document.getElementById('transactionCategory').addEventListener('change', loadItemsForTransaction);
    document.getElementById('transactionPrice').addEventListener('input', calculateTotal);
    document.getElementById('transactionQuantity').addEventListener('input', calculateTotal);
    document.getElementById('transactionAmount').addEventListener('input', updateTotalFromAmount);
    document.getElementById('transactionAccount').addEventListener('change', showAccountBalance);
    
    // Multi-item selection
    document.getElementById('multiItemToggle').addEventListener('change', handleMultiItemToggle);
    document.getElementById('transactionItem').addEventListener('change', handleItemSelection);
    
    // Item search
    document.getElementById('itemSearchInput').addEventListener('input', handleItemSearch);
    document.getElementById('toggleAdvancedSearch').addEventListener('click', toggleAdvancedSearch);
    document.getElementById('advancedSearchBtn').addEventListener('click', handleAdvancedSearch);
    document.getElementById('clearAdvancedSearchBtn').addEventListener('click', clearAdvancedSearch);
}

// Auth handlers
async function handleLogin(e) {
    e.preventDefault();
    const userid = document.getElementById('loginUserid').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userid, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.username;
            showApp();
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    
    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Account created successfully! Please login.');
            signUpForm.style.display = 'none';
            signInForm.style.display = 'block';
            document.getElementById('registerForm').reset();
        } else {
            alert(data.error || 'Registration failed');
        }
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
}

async function handleChangePassword(e) {
    e.preventDefault();
    const userid = document.getElementById('changePassUserid').value;
    const oldPassword = document.getElementById('changePassOldPassword').value;
    const newPassword = document.getElementById('changePassNewPassword').value;
    const confirmPassword = document.getElementById('changePassConfirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('New passwords do not match!');
        return;
    }

    if (newPassword.length < 4) {
        alert('New password must be at least 4 characters long!');
        return;
    }

    if (oldPassword === newPassword) {
        alert('New password must be different from current password!');
        return;
    }

    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userid, oldPassword, newPassword })
        });

        const data = await response.json();

        if (data.success) {
            alert('Password changed successfully! Please login with your new password.');
            document.getElementById('changePasswordForm').style.display = 'none';
            signInForm.style.display = 'block';
            document.getElementById('passwordChangeForm').reset();
        } else {
            alert(data.error || 'Failed to change password');
        }
    } catch (error) {
        alert('Failed to change password: ' + error.message);
    }
}

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        appContainer.style.display = 'none';
        authContainer.style.display = 'flex';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Show app
async function showApp() {
    authContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    document.getElementById('currentUser').textContent = currentUser;
    
    await loadAllData();
    renderDashboard(); // Render dashboard on initial load
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadCategories(),
        loadUnits(),
        loadItems(),
        loadAccounts(),
        loadTransactions()
    ]);
}

// Navigation
function navigateToPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageName}Page`).classList.add('active');

    // Render dashboard when navigating to it
    if (pageName === 'dashboard') {
        renderDashboard();
    }

    // Set report date defaults when navigating to reports
    if (pageName === 'reports') {
        setReportDateDefaults();
    }
}

// Navigate to Account Details tab (called from dashboard Total Accounts card)
function navigateToAccountDetails() {
    navigateToPage('account');
    // Switch to the Details tab
    const accountPage = document.getElementById('accountPage');
    switchTab(accountPage, 'accountDetails');
}

function switchTab(pageElement, tabName) {
    pageElement.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    pageElement.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    pageElement.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    pageElement.querySelector(`#${tabName}`).classList.add('active');
}

// Category functions
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        categories = await response.json();
        renderCategoryTable();
        renderManageCategoriesTable();
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

async function handleAddCategory(e) {
    e.preventDefault();
    const type = document.getElementById('categoryType').value;
    const name = document.getElementById('categoryName').value;
    
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            await loadCategories();
            e.target.reset();
            alert('Category added successfully! Code: ' + data.category_code);
        } else {
            alert(data.error || 'Failed to add category');
        }
    } catch (error) {
        alert('Failed to add category: ' + error.message);
    }
}

function renderCategoryTable() {
    const systemTbody = document.querySelector('#systemCategoryTable tbody');
    const customTbody = document.querySelector('#categoryTable tbody');
    systemTbody.innerHTML = '';
    customTbody.innerHTML = '';
    
    categories.forEach(cat => {
        const tr = document.createElement('tr');
        
        if (cat.is_system === 1) {
            tr.innerHTML = `
                <td>${cat.type}</td>
                <td>${cat.name}</td>
            `;
            systemTbody.appendChild(tr);
        } else {
            tr.innerHTML = `
                <td>${cat.type}</td>
                <td>${cat.name}</td>
                <td>
                    <button class="btn btn-edit" onclick="editCategory(${cat.id}, '${cat.name}')">Edit</button>
                    <button class="btn btn-delete" onclick="deleteCategory(${cat.id})">Delete</button>
                </td>
            `;
            customTbody.appendChild(tr);
        }
    });
}

async function editCategory(id, currentName) {
    const newName = prompt('Enter new category name:', currentName);
    if (newName && newName !== currentName) {
        try {
            const response = await fetch(`/api/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            const data = await response.json();
            if (response.ok) {
                await loadCategories();
            } else {
                alert(data.error || 'Failed to update category');
            }
        } catch (error) {
            alert('Failed to update category');
        }
    }
}

async function deleteCategory(id) {
    if (confirm('Are you sure you want to delete this category?')) {
        try {
            const response = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok) {
                await loadCategories();
            } else {
                alert(data.error || 'Failed to delete category');
            }
        } catch (error) {
            alert('Failed to delete category');
        }
    }
}

// Manage Categories functions
function renderManageCategoriesTable() {
    const tbody = document.querySelector('#manageCategoriesTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const typeFilter = document.getElementById('manageCategoryTypeFilter')?.value || '';
    const showDisabled = document.getElementById('showDisabledCategories')?.checked ?? true;
    
    let filteredCategories = categories.filter(cat => {
        if (typeFilter && cat.type !== typeFilter) return false;
        if (!showDisabled && cat.is_enabled === 0) return false;
        return true;
    });
    
    // Sort: enabled first, then by type, then by name
    filteredCategories.sort((a, b) => {
        if ((b.is_enabled || 1) !== (a.is_enabled || 1)) return (b.is_enabled || 1) - (a.is_enabled || 1);
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });
    
    filteredCategories.forEach((cat, index) => {
        const itemCount = items.filter(item => item.category_id === cat.id).length;
        const isEnabled = cat.is_enabled !== 0;
        const tr = document.createElement('tr');
        tr.className = isEnabled ? '' : 'disabled-row';
        
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${cat.category_code || '-'}</span></td>
            <td>${cat.name}</td>
            <td><span class="type-badge ${cat.type.toLowerCase()}">${cat.type}</span></td>
            <td>${itemCount}</td>
            <td>
                <span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}">
                    ${isEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </td>
            <td>
                <button class="btn btn-toggle ${isEnabled ? 'btn-disable' : 'btn-enable'}" onclick="toggleCategory(${cat.id})">
                    ${isEnabled ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-edit" onclick="editCategoryName(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function toggleCategory(id) {
    try {
        const response = await fetch(`/api/categories/${id}/toggle`, { method: 'PUT' });
        if (response.ok) {
            await loadCategories();
            renderManageCategoriesTable();
        } else {
            alert('Failed to toggle category');
        }
    } catch (error) {
        alert('Failed to toggle category: ' + error.message);
    }
}

async function editCategoryName(id, currentName) {
    const newName = prompt('Enter new category name:', currentName);
    if (newName && newName !== currentName) {
        try {
            const response = await fetch(`/api/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            if (response.ok) {
                await loadCategories();
                renderManageCategoriesTable();
            } else {
                alert('Failed to update category name');
            }
        } catch (error) {
            alert('Failed to update category: ' + error.message);
        }
    }
}

// Unit functions
async function loadUnits() {
    try {
        const response = await fetch('/api/units');
        units = await response.json();
        renderUnitTable();
        updateUnitDropdowns();
    } catch (error) {
        console.error('Failed to load units:', error);
    }
}

async function handleAddUnit(e) {
    e.preventDefault();
    const name = document.getElementById('unitName').value;
    
    try {
        const response = await fetch('/api/units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            await loadUnits();
            e.target.reset();
            renderManageUnitsTable();
            alert('Unit added successfully! Code: ' + data.unit_code);
        } else {
            alert(data.error || 'Failed to add unit');
        }
    } catch (error) {
        alert('Failed to add unit: ' + error.message);
    }
}

function renderUnitTable() {
    // Old function - kept for compatibility
    renderManageUnitsTable();
}

function renderManageUnitsTable() {
    const tbody = document.querySelector('#manageUnitsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const showDisabled = document.getElementById('showDisabledUnits')?.checked ?? true;

    let filteredUnits = units.filter(unit => {
        if (!showDisabled && unit.is_enabled === 0) return false;
        return true;
    });

    // Sort: enabled first, then by name
    filteredUnits.sort((a, b) => {
        if ((b.is_enabled || 1) !== (a.is_enabled || 1)) return (b.is_enabled || 1) - (a.is_enabled || 1);
        return a.name.localeCompare(b.name);
    });

    filteredUnits.forEach((unit, index) => {
        const tr = document.createElement('tr');
        const isEnabled = unit.is_enabled !== 0;
        tr.className = isEnabled ? '' : 'disabled-row';

        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${unit.unit_code || '-'}</span></td>
            <td>${unit.name}</td>
            <td>${unit.is_system === 1 ? 'System' : 'Custom'}</td>
            <td>
                <span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}">
                    ${isEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </td>
            <td>
                <button class="btn btn-toggle ${isEnabled ? 'btn-disable' : 'btn-enable'}" onclick="toggleUnit(${unit.id})">
                    ${isEnabled ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-edit" onclick="editUnit(${unit.id}, '${unit.name.replace(/'/g, "\\'")}')">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateUnitDropdowns() {
    const itemUnitSelect = document.getElementById('itemUnit');
    itemUnitSelect.innerHTML = '<option value="">Select Unit</option>';
    // Only show enabled units in dropdown
    const enabledUnits = units.filter(unit => unit.is_enabled !== 0);
    enabledUnits.forEach(unit => {
        itemUnitSelect.innerHTML += `<option value="${unit.id}">${unit.name}</option>`;
    });
}

async function deleteUnit(id) {
    if (confirm('Are you sure you want to delete this unit?')) {
        try {
            const response = await fetch(`/api/units/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok) {
                await loadUnits();
            } else {
                alert(data.error || 'Failed to delete unit');
            }
        } catch (error) {
            alert('Failed to delete unit');
        }
    }
}

async function toggleUnit(id) {
    try {
        const response = await fetch(`/api/units/${id}/toggle`, { method: 'PUT' });
        if (response.ok) {
            await loadUnits();
            renderManageUnitsTable();
        } else {
            alert('Failed to toggle unit');
        }
    } catch (error) {
        alert('Failed to toggle unit: ' + error.message);
    }
}

async function editUnit(id, currentName) {
    const newName = prompt('Enter new unit name:', currentName);
    if (newName && newName !== currentName) {
        try {
            const response = await fetch(`/api/units/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            const data = await response.json();
            if (response.ok) {
                await loadUnits();
                renderManageUnitsTable();
            } else {
                alert(data.error || 'Failed to update unit');
            }
        } catch (error) {
            alert('Failed to update unit: ' + error.message);
        }
    }
}

// Item functions
async function loadItems() {
    try {
        const response = await fetch('/api/items');
        items = await response.json();
        renderItemTable();
    } catch (error) {
        console.error('Failed to load items:', error);
    }
}

function loadCategoriesForItems() {
    const type = document.getElementById('itemType').value;
    const categorySelect = document.getElementById('itemCategory');

    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categorySelect.disabled = !type;

    if (type) {
        // Only show enabled categories in dropdown
        const filtered = categories.filter(cat => cat.type === type && cat.is_enabled !== 0);
        filtered.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }
}

async function handleAddItem(e) {
    e.preventDefault();
    const type = document.getElementById('itemType').value;
    const category_id = document.getElementById('itemCategory').value;
    const name = document.getElementById('itemName').value;
    const unit_id = document.getElementById('itemUnit').value;
    
    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, category_id, name, unit_id })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            await loadItems();
            e.target.reset();
            document.getElementById('itemCategory').disabled = true;
            renderManageItemsTable();
            alert('Item added successfully! Code: ' + data.item_code);
        } else {
            alert(data.error || 'Failed to add item');
        }
    } catch (error) {
        alert('Failed to add item: ' + error.message);
    }
}

function renderItemTable() {
    // Old function - kept for compatibility
    renderManageItemsTable();
}

function renderManageItemsTable() {
    const tbody = document.querySelector('#manageItemsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const typeFilter = document.getElementById('manageItemTypeFilter')?.value || '';
    const categoryFilter = document.getElementById('manageItemCategoryFilter')?.value || '';
    const showDisabled = document.getElementById('showDisabledItems')?.checked ?? true;

    let filteredItems = items.filter(item => {
        if (typeFilter && item.type !== typeFilter) return false;
        if (categoryFilter && item.category_id != categoryFilter) return false;
        if (!showDisabled && item.is_enabled === 0) return false;
        return true;
    });

    // Sort: enabled first, then by type, then category, then name
    filteredItems.sort((a, b) => {
        if ((b.is_enabled || 1) !== (a.is_enabled || 1)) return (b.is_enabled || 1) - (a.is_enabled || 1);
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        if (a.category_name !== b.category_name) return a.category_name.localeCompare(b.category_name);
        return a.name.localeCompare(b.name);
    });

    filteredItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        const isEnabled = item.is_enabled !== 0;
        tr.className = isEnabled ? '' : 'disabled-row';

        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${item.item_code || '-'}</span></td>
            <td>${item.name}</td>
            <td><span class="type-badge ${item.type.toLowerCase()}">${item.type}</span></td>
            <td>${item.category_name}</td>
            <td>${item.unit_name || 'N/A'}</td>
            <td>${item.is_system === 1 ? 'System' : 'Custom'}</td>
            <td>
                <span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}">
                    ${isEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </td>
            <td>
                <button class="btn btn-toggle ${isEnabled ? 'btn-disable' : 'btn-enable'}" onclick="toggleItem(${item.id})">
                    ${isEnabled ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-edit" onclick="editItem(${item.id}, '${item.name.replace(/'/g, "\\'")}', ${item.unit_id})">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Populate category filter dropdown
    populateItemCategoryFilter();
}

function populateItemCategoryFilter() {
    const select = document.getElementById('manageItemCategoryFilter');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}">${cat.name} (${cat.type})</option>`;
    });
    select.value = currentValue;
}

async function editItem(id, currentName, currentUnitId) {
    const newName = prompt('Enter new item name:', currentName);
    if (newName && newName !== currentName) {
        try {
            const response = await fetch(`/api/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, unit_id: currentUnitId })
            });
            const data = await response.json();
            if (response.ok) {
                await loadItems();
            } else {
                alert(data.error || 'Failed to update item');
            }
        } catch (error) {
            alert('Failed to update item');
        }
    }
}

async function deleteItem(id) {
    if (confirm('Are you sure you want to delete this item?')) {
        try {
            const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok) {
                await loadItems();
            } else {
                alert(data.error || 'Failed to delete item');
            }
        } catch (error) {
            alert('Failed to delete item');
        }
    }
}

async function toggleItem(id) {
    try {
        const response = await fetch(`/api/items/${id}/toggle`, { method: 'PUT' });
        if (response.ok) {
            await loadItems();
            renderManageItemsTable();
        } else {
            alert('Failed to toggle item');
        }
    } catch (error) {
        alert('Failed to toggle item: ' + error.message);
    }
}

// Account functions
async function loadAccounts() {
    try {
        const response = await fetch('/api/accounts');
        accounts = await response.json();
        renderAccountTable();
        updateAccountDropdowns();
    } catch (error) {
        console.error('Failed to load accounts:', error);
    }
}

// Handle account type change to show/hide relevant fields
function handleAccountTypeChange() {
    const accountType = document.getElementById('accountType').value;
    const bankNameGroup = document.getElementById('bankNameGroup');
    const accountNumberGroup = document.getElementById('accountNumberGroup');
    const bankNameInput = document.getElementById('bankName');
    const accountNumberInput = document.getElementById('accountNumber');

    // Types that need bank name and account number
    const bankTypes = ['Bank', 'Credit Card', 'FD', 'RD', 'PPF', 'Mutual Fund', 'Demat'];

    if (bankTypes.includes(accountType)) {
        bankNameGroup.style.display = 'block';
        accountNumberGroup.style.display = 'block';
        bankNameInput.required = true;
        accountNumberInput.required = true;
    } else {
        // Cash type - hide bank fields
        bankNameGroup.style.display = 'none';
        accountNumberGroup.style.display = 'none';
        bankNameInput.required = false;
        accountNumberInput.required = false;
        bankNameInput.value = '';
        accountNumberInput.value = '';
    }
}

async function handleAddAccount(e) {
    e.preventDefault();
    const type = document.getElementById('accountType').value;
    const name = document.getElementById('accountName').value;
    const bank_name = document.getElementById('bankName').value || null;
    const account_number = document.getElementById('accountNumber').value || null;
    const balance = parseFloat(document.getElementById('openingBalance').value);

    if (!type) {
        alert('Please select an account type');
        return;
    }

    // Check for duplicate account
    const duplicate = accounts.find(acc => {
        if (type === 'Cash') {
            return acc.type === 'Cash' && acc.name.toLowerCase() === name.toLowerCase();
        }
        return acc.name.toLowerCase() === name.toLowerCase() &&
               acc.bank_name?.toLowerCase() === bank_name?.toLowerCase() &&
               acc.account_number === account_number;
    });

    if (duplicate) {
        alert('Account with same details already exists!');
        return;
    }

    try {
        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name, bank_name, account_number, balance })
        });

        if (response.ok) {
            await loadAccounts();
            e.target.reset();
            // Reset field visibility
            document.getElementById('bankNameGroup').style.display = 'none';
            document.getElementById('accountNumberGroup').style.display = 'none';
            alert('Account added successfully!');
        }
    } catch (error) {
        alert('Failed to add account: ' + error.message);
    }
}

function renderAccountTable() {
    const tbody = document.querySelector('#accountDetailsTable tbody');
    tbody.innerHTML = '';

    // Type display names for better readability
    const typeDisplayNames = {
        'Cash': 'Cash',
        'Bank': 'Bank Account',
        'Credit Card': 'Credit Card',
        'FD': 'Fixed Deposit',
        'RD': 'Recurring Deposit',
        'PPF': 'PPF Account',
        'Mutual Fund': 'Mutual Fund',
        'Demat': 'Demat Account',
        'Wallet': 'Digital Wallet'
    };

    accounts.forEach((acc, index) => {
        const tr = document.createElement('tr');
        const typeDisplay = typeDisplayNames[acc.type] || acc.type;
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td>${typeDisplay}</td>
            <td>${acc.name}</td>
            <td>${acc.bank_name || 'N/A'}</td>
            <td>${acc.account_number ? '****' + acc.account_number : 'N/A'}</td>
            <td>₹${acc.balance.toFixed(2)}</td>
            <td>
                <button class="btn btn-edit" onclick="editAccount(${acc.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteAccount(${acc.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function editAccount(id) {
    const account = accounts.find(acc => acc.id === id);
    if (!account) return;

    // Determine if bank fields should be shown (all types except Cash)
    const showBankFields = account.type !== 'Cash';

    // Get display name for account type
    const typeDisplayNames = {
        'Cash': 'Cash',
        'Bank': 'Bank Account',
        'Credit Card': 'Credit Card',
        'FD': 'Fixed Deposit (FD)',
        'RD': 'Recurring Deposit (RD)',
        'PPF': 'PPF Account',
        'Mutual Fund': 'Mutual Fund Account',
        'Demat': 'Demat Account',
        'Wallet': 'Digital Wallet'
    };

    // Create modal for account editing
    const modal = document.createElement('div');
    modal.className = 'pay-modal-overlay';
    modal.innerHTML = `
        <div class="pay-modal" style="width:450px;">
            <h3>✏️ Edit Account</h3>
            <div class="form-group">
                <label>Account Type</label>
                <input type="text" value="${typeDisplayNames[account.type] || account.type}" disabled style="background-color: #e9ecef; cursor: not-allowed;">
            </div>
            <div class="form-group">
                <label>Account Name</label>
                <input type="text" id="editAccountName" value="${account.name}">
            </div>
            <div class="form-group" id="editBankNameGroup" style="${showBankFields ? '' : 'display:none'}">
                <label>Bank Name</label>
                <input type="text" id="editBankName" value="${account.bank_name || ''}">
            </div>
            <div class="form-group" id="editAccountNumberGroup" style="${showBankFields ? '' : 'display:none'}">
                <label>Account Number (Last 4 digits)</label>
                <input type="text" id="editAccountNumber" value="${account.account_number || ''}" maxlength="4">
            </div>
            <div class="form-group">
                <label>Current Balance</label>
                <input type="number" id="editAccountBalance" value="${account.balance}" step="0.01">
            </div>
            <div class="pay-modal-buttons">
                <button class="btn btn-primary" id="confirmEditAccountBtn">Save Changes</button>
                <button class="btn btn-secondary" id="cancelEditAccountBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle confirm - type is not editable, use original type
    document.getElementById('confirmEditAccountBtn').onclick = async () => {
        const type = account.type; // Keep original type
        const name = document.getElementById('editAccountName').value;
        const bank_name = document.getElementById('editBankName').value;
        const account_number = document.getElementById('editAccountNumber').value;
        const balance = parseFloat(document.getElementById('editAccountBalance').value);
        
        if (!name) {
            alert('Please enter account name');
            return;
        }
        
        try {
            const response = await fetch(`/api/accounts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, name, bank_name, account_number, balance })
            });
            
            if (response.ok) {
                await loadAccounts();
                modal.remove();
                alert('Account updated successfully!');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update account');
            }
        } catch (error) {
            alert('Failed to update account: ' + error.message);
        }
    };
    
    // Handle cancel
    document.getElementById('cancelEditAccountBtn').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function deleteAccount(id) {
    if (!confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
        
        if (response.ok) {
            await loadAccounts();
            alert('Account deleted successfully!');
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete account');
        }
    } catch (error) {
        alert('Failed to delete account');
    }
}

function updateAccountDropdowns() {
    const accountSelect = document.getElementById('transactionAccount');
    accountSelect.innerHTML = '<option value="">Select Account</option>';
    accounts.forEach(acc => {
        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name})`;
        accountSelect.innerHTML += `<option value="${acc.id}">${label}</option>`;
    });
}

// Transaction functions
async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions');
        transactions = await response.json();
        renderTransactionTable();
        populateFilterCategories();
        setDefaultDateFilters();
    } catch (error) {
        console.error('Failed to load transactions:', error);
    }
}

function handleTransactionTypeChange() {
    const type = document.getElementById('transactionType').value;

    // Show/hide fields based on type
    const expenseFields = document.querySelectorAll('.expense-field');
    const incomeFields = document.querySelectorAll('.income-field');
    const transferFields = document.querySelectorAll('.transfer-field');
    const regularFields = document.querySelectorAll('.regular-field');
    const dateFields = document.querySelectorAll('.date-field');
    const multiItemToggle = document.getElementById('multiItemToggle');
    const quantityInput = document.getElementById('transactionQuantity');

    // Reset all field visibility
    expenseFields.forEach(field => field.style.display = 'none');
    incomeFields.forEach(field => field.style.display = 'none');
    transferFields.forEach(field => field.style.display = 'none');
    dateFields.forEach(field => field.style.display = 'none');
    regularFields.forEach(field => field.style.display = 'block');

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];

    if (type === 'Income') {
        // Show income fields and date field
        incomeFields.forEach(field => field.style.display = 'block');
        dateFields.forEach(field => field.style.display = 'block');

        // Make income fields required, expense fields optional
        document.getElementById('transactionAmount').required = true;
        document.getElementById('transactionDate').required = true;
        document.getElementById('transactionPrice').required = false;
        document.getElementById('transactionCategory').required = true;
        document.getElementById('transactionItem').required = true;
        document.getElementById('transactionAccount').required = true;
        if (quantityInput) quantityInput.required = false;

        // Set default date to today
        document.getElementById('transactionDate').value = today;

        // Disable multi-item for income
        multiItemToggle.disabled = true;
        multiItemToggle.checked = false;
        isMultiItemMode = false;
        selectedItems = [];
        document.getElementById('selectedItemsContainer').style.display = 'none';

    } else if (type === 'Expense') {
        // Show expense fields and date field
        expenseFields.forEach(field => field.style.display = 'block');
        dateFields.forEach(field => field.style.display = 'block');

        // Make expense fields required based on multi-item mode
        document.getElementById('transactionPrice').required = true;
        document.getElementById('transactionCategory').required = true;
        document.getElementById('transactionItem').required = true;
        document.getElementById('transactionAccount').required = true;
        if (quantityInput) {
            quantityInput.required = !isMultiItemMode;
        }
        document.getElementById('transactionAmount').required = false;
        document.getElementById('transactionDate').required = false;

        // Set default date to today for expense
        document.getElementById('transactionDate').value = today;

        // Enable multi-item for expense
        multiItemToggle.disabled = false;

    } else if (type === 'Transfer') {
        // Show transfer fields and date field, hide regular fields
        regularFields.forEach(field => field.style.display = 'none');
        transferFields.forEach(field => field.style.display = 'block');
        dateFields.forEach(field => field.style.display = 'block');

        // Make transfer fields required
        document.getElementById('transactionPrice').required = false;
        document.getElementById('transactionCategory').required = false;
        document.getElementById('transactionItem').required = false;
        document.getElementById('transactionAccount').required = false;
        document.getElementById('transactionAmount').required = false;
        document.getElementById('transactionDate').required = false;
        if (quantityInput) quantityInput.required = false;

        // Set default date to today for transfer
        document.getElementById('transactionDate').value = today;

        // Disable multi-item for transfer
        multiItemToggle.disabled = true;
        multiItemToggle.checked = false;
        isMultiItemMode = false;
        selectedItems = [];
        document.getElementById('selectedItemsContainer').style.display = 'none';

        // Populate transfer account dropdowns
        populateTransferAccountDropdowns();

    } else {
        // No type selected, show default expense fields
        expenseFields.forEach(field => field.style.display = 'block');
        multiItemToggle.disabled = true;
        if (quantityInput) quantityInput.required = true;
    }

    // Load categories (not needed for Transfer)
    if (type !== 'Transfer') {
        loadCategoriesForTransaction();
    }
}

function populateTransferAccountDropdowns() {
    const fromSelect = document.getElementById('transferFromAccount');
    const toSelect = document.getElementById('transferToAccount');

    fromSelect.innerHTML = '<option value="">Select Source Account</option>';
    toSelect.innerHTML = '<option value="">Select Destination Account</option>';

    accounts.forEach(acc => {
        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
        fromSelect.innerHTML += `<option value="${acc.id}">${label} - ₹${acc.balance.toFixed(2)}</option>`;
        toSelect.innerHTML += `<option value="${acc.id}">${label}</option>`;
    });

    // Add event listener to filter To Account when From Account is selected
    fromSelect.addEventListener('change', updateTransferToAccountOptions);
}

function updateTransferToAccountOptions() {
    const fromSelect = document.getElementById('transferFromAccount');
    const toSelect = document.getElementById('transferToAccount');
    const selectedFromId = fromSelect.value;
    const currentToValue = toSelect.value;

    toSelect.innerHTML = '<option value="">Select Destination Account</option>';

    accounts.forEach(acc => {
        // Skip the account that is selected in From Account
        if (acc.id == selectedFromId) return;

        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
        const selected = acc.id == currentToValue ? 'selected' : '';
        toSelect.innerHTML += `<option value="${acc.id}" ${selected}>${label}</option>`;
    });
}

function loadCategoriesForTransaction() {
    const type = document.getElementById('transactionType').value;
    const categorySelect = document.getElementById('transactionCategory');
    
    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categorySelect.disabled = !type;
    document.getElementById('transactionItem').disabled = true;
    document.getElementById('transactionItem').innerHTML = '<option value="">Select Item</option>';
    
    if (type) {
        // Only show enabled categories
        const filtered = categories.filter(cat => cat.type === type && cat.is_enabled !== 0);
        filtered.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }
}

function loadItemsForTransaction() {
    const categoryId = document.getElementById('transactionCategory').value;
    const itemSelect = document.getElementById('transactionItem');

    itemSelect.innerHTML = '<option value="">Select Item</option>';
    itemSelect.disabled = !categoryId;

    if (categoryId) {
        // Only show enabled items in dropdown
        const filtered = items.filter(item => item.category_id == categoryId && item.is_enabled !== 0);
        filtered.forEach(item => {
            itemSelect.innerHTML += `<option value="${item.id}">${item.name} (${item.unit_name || 'N/A'})</option>`;
        });
    }
}

function calculateTotal() {
    if (isMultiItemMode) {
        calculateMultiItemTotal();
        return;
    }
    
    const price = parseFloat(document.getElementById('transactionPrice').value) || 0;
    const quantity = parseFloat(document.getElementById('transactionQuantity').value) || 0;
    const total = price * quantity;
    document.getElementById('transactionTotal').value = total.toFixed(2);
}

function updateTotalFromAmount() {
    const amount = parseFloat(document.getElementById('transactionAmount').value) || 0;
    document.getElementById('transactionTotal').value = amount.toFixed(2);
}

function showAccountBalance() {
    const accountId = document.getElementById('transactionAccount').value;
    const balanceInput = document.getElementById('accountBalance');
    
    if (accountId) {
        const account = accounts.find(acc => acc.id == accountId);
        if (account) {
            balanceInput.value = `₹${account.balance.toFixed(2)}`;
        }
    } else {
        balanceInput.value = '';
    }
}

async function handleAddTransaction(e) {
    e.preventDefault();

    const type = document.getElementById('transactionType').value;

    // Handle Transfer type separately
    if (type === 'Transfer') {
        await handleTransfer();
        return;
    }

    const category_id = document.getElementById('transactionCategory').value;
    const remark = document.getElementById('transactionRemark').value;
    const account_id = document.getElementById('transactionAccount').value;

    let price, quantity, total, transaction_date;

    // Check if in edit mode
    if (editingTransactionId) {
        if (type === 'Income') {
            price = parseFloat(document.getElementById('transactionAmount').value);
            quantity = 1;
        } else {
            price = parseFloat(document.getElementById('transactionPrice').value);
            quantity = parseFloat(document.getElementById('transactionQuantity').value) || 1;
        }
        
        try {
            const response = await fetch(`/api/transactions/${editingTransactionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price, quantity, remark: remark || null })
            });
            
            if (response.ok) {
                await loadTransactions();
                await loadAccounts();
                renderDashboard();
                cancelEditMode();
                alert('Transaction updated successfully!');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update transaction');
            }
        } catch (error) {
            alert('Failed to update transaction: ' + error.message);
        }
        return;
    }
    
    // Check if multi-item mode
    if (isMultiItemMode) {
        // Handle multiple items
        if (selectedItems.length === 0) {
            alert('Please select at least one item');
            return;
        }
        
        if (type === 'Income') {
            alert('Multiple items not supported for Income transactions');
            return;
        }
        
        price = parseFloat(document.getElementById('transactionPrice').value);
        if (!price || price <= 0) {
            alert('Please enter a valid price');
            return;
        }
        
        // Create single transaction with multiple items
        const item_ids = selectedItems.map(item => item.id).join(',');
        const itemNames = selectedItems.map(item => item.name).join(', ');
        const isOnCredit = document.getElementById('onCreditCheckbox')?.checked || false;

        // Check for insufficient balance on Expense (not on credit)
        if (type === 'Expense' && !isOnCredit && account_id) {
            const account = accounts.find(acc => acc.id == account_id);
            if (account && account.balance < price) {
                alert(`⚠️ Insufficient Balance!\n\nAccount "${account.name}" has only ₹${account.balance.toFixed(2)}, but the transaction amount is ₹${price.toFixed(2)}.\n\nTransaction cannot be processed.`);
                return;
            }
        }

        const multiItemDate = document.getElementById('transactionDate').value || null;

        try {
            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    category_id,
                    item_id: null,
                    item_ids: item_ids,
                    price,
                    quantity: 1,
                    remark: remark ? `${remark} (Items: ${itemNames})` : `Multiple items: ${itemNames}`,
                    total: price,
                    account_id,
                    transaction_date: multiItemDate,
                    is_multi_item: true,
                    is_credit: isOnCredit
                })
            });

            const data = await response.json();

            if (response.ok) {
                await loadTransactions();
                await loadAccounts();
                e.target.reset();
                document.getElementById('transactionCategory').disabled = true;
                document.getElementById('transactionItem').disabled = true;
                document.getElementById('accountBalance').value = '';
                document.getElementById('multiItemToggle').checked = false;
                isMultiItemMode = false;
                selectedItems = [];
                document.getElementById('selectedItemsContainer').style.display = 'none';

                // Reset field visibility
                document.querySelectorAll('.expense-field').forEach(field => field.style.display = 'block');
                document.querySelectorAll('.income-field').forEach(field => field.style.display = 'none');
                document.querySelectorAll('.date-field').forEach(field => field.style.display = 'none');

                alert('Multi-item transaction added successfully!');
            } else {
                if (data.error === 'Insufficient Balance') {
                    alert(`⚠️ Insufficient Balance!\n\n${data.message}\n\nTransaction cannot be processed.`);
                } else {
                    alert(data.error || 'Failed to add transaction');
                }
            }
        } catch (error) {
            alert('Failed to add transaction: ' + error.message);
        }
        return;
    }
    
    // Single item transaction
    const item_id = document.getElementById('transactionItem').value;
    const isOnCredit = document.getElementById('onCreditCheckbox')?.checked || false;

    if (!item_id) {
        alert('Please select an item');
        return;
    }

    if (type === 'Income') {
        // For income, use amount field
        const amount = parseFloat(document.getElementById('transactionAmount').value);
        price = amount;
        quantity = 1;
        total = amount;
        transaction_date = document.getElementById('transactionDate').value;
    } else {
        // For expense, use price and quantity
        price = parseFloat(document.getElementById('transactionPrice').value);
        quantity = parseFloat(document.getElementById('transactionQuantity').value);
        total = parseFloat(document.getElementById('transactionTotal').value);
        transaction_date = document.getElementById('transactionDate').value || null;
    }

    // Check for insufficient balance on Expense (not on credit)
    if (type === 'Expense' && !isOnCredit && account_id) {
        const account = accounts.find(acc => acc.id == account_id);
        if (account && account.balance < total) {
            alert(`⚠️ Insufficient Balance!\n\nAccount "${account.name}" has only ₹${account.balance.toFixed(2)}, but the transaction amount is ₹${total.toFixed(2)}.\n\nTransaction cannot be processed.`);
            return;
        }
    }

    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, category_id, item_id, price, quantity, remark, total, account_id, transaction_date, is_credit: isOnCredit })
        });

        const data = await response.json();

        if (response.ok) {
            await loadTransactions();
            await loadAccounts();
            e.target.reset();
            document.getElementById('transactionCategory').disabled = true;
            document.getElementById('transactionItem').disabled = true;
            document.getElementById('accountBalance').value = '';

            // Reset field visibility
            document.querySelectorAll('.expense-field').forEach(field => field.style.display = 'block');
            document.querySelectorAll('.income-field').forEach(field => field.style.display = 'none');
            document.querySelectorAll('.date-field').forEach(field => field.style.display = 'none');

            alert('Transaction added successfully!');
        } else {
            if (data.error === 'Insufficient Balance') {
                alert(`⚠️ Insufficient Balance!\n\n${data.message}\n\nTransaction cannot be processed.`);
            } else {
                alert(data.error || 'Failed to add transaction');
            }
        }
    } catch (error) {
        alert('Failed to add transaction: ' + error.message);
    }
}

async function handleTransfer() {
    const fromAccountId = document.getElementById('transferFromAccount').value;
    const toAccountId = document.getElementById('transferToAccount').value;
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const remark = document.getElementById('transferRemark').value;
    const transferDate = document.getElementById('transactionDate').value || null;

    if (!fromAccountId) {
        alert('Please select a source account');
        return;
    }

    if (!toAccountId) {
        alert('Please select a destination account');
        return;
    }

    if (fromAccountId === toAccountId) {
        alert('Source and destination accounts cannot be the same');
        return;
    }

    if (!amount || amount <= 0) {
        alert('Please enter a valid transfer amount');
        return;
    }

    // Check if source account has sufficient balance (client-side check)
    const fromAccount = accounts.find(acc => acc.id == fromAccountId);
    if (fromAccount && fromAccount.balance < amount) {
        alert(`⚠️ Insufficient Balance!\n\nSource account "${fromAccount.name}" has only ₹${fromAccount.balance.toFixed(2)}, but you are trying to transfer ₹${amount.toFixed(2)}.\n\nTransaction cannot be processed.`);
        return;
    }

    try {
        const response = await fetch('/api/transfers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_account_id: fromAccountId,
                to_account_id: toAccountId,
                amount,
                remark: remark || null,
                transaction_date: transferDate
            })
        });

        const data = await response.json();

        if (response.ok) {
            await loadTransactions();
            await loadAccounts();

            // Reset form
            document.getElementById('transactionForm').reset();
            document.getElementById('transactionType').value = '';

            // Reset field visibility
            document.querySelectorAll('.transfer-field').forEach(field => field.style.display = 'none');
            document.querySelectorAll('.regular-field').forEach(field => field.style.display = 'block');
            document.querySelectorAll('.expense-field').forEach(field => field.style.display = 'block');
            document.querySelectorAll('.income-field').forEach(field => field.style.display = 'none');
            document.querySelectorAll('.date-field').forEach(field => field.style.display = 'none');

            alert('Transfer completed successfully!');
        } else {
            if (data.error === 'Insufficient Balance') {
                alert(`⚠️ Insufficient Balance!\n\n${data.message}\n\nTransaction cannot be processed.`);
            } else {
                alert(data.error || 'Failed to complete transfer');
            }
        }
    } catch (error) {
        alert('Failed to complete transfer: ' + error.message);
    }
}

function renderTransactionTable() {
    const tbody = document.querySelector('#transactionTable tbody');
    tbody.innerHTML = '';

    transactions.forEach((trans, index) => {
        const tr = document.createElement('tr');
        const date = new Date(trans.transaction_date).toLocaleDateString();

        // For income, show amount instead of price x quantity
        let priceDisplay, quantityDisplay, itemDisplay, accountDisplay, actionButtons, typeDisplay;

        if (trans.type === 'Transfer') {
            priceDisplay = `₹${trans.total.toFixed(2)}`;
            quantityDisplay = '-';
            itemDisplay = '-';
            typeDisplay = `<span class="transfer-badge">🔄 Transfer</span>`;
            // Show from -> to account for transfers
            accountDisplay = `${trans.from_account_name || '?'} → ${trans.to_account_name || '?'}`;
        } else if (trans.type === 'Income') {
            priceDisplay = `₹${trans.total.toFixed(2)}`;
            quantityDisplay = '-';
            typeDisplay = trans.type;
        } else {
            priceDisplay = `₹${trans.price.toFixed(2)}`;
            quantityDisplay = `${trans.quantity} ${trans.unit_name || ''}`;
            typeDisplay = trans.type;
        }

        // Handle multi-item display (not for Transfer)
        if (trans.type !== 'Transfer') {
            if (trans.is_multi_item === 1 && trans.item_ids) {
                const itemIds = trans.item_ids.split(',');
                const itemNames = itemIds.map(id => {
                    const item = items.find(i => i.id == id);
                    return item ? item.name : 'Unknown';
                });
                itemDisplay = `<a href="#" class="multi-item-link" onclick="showMultiItems(event, '${itemNames.join(', ')}')" title="Click to view items">${itemNames.length} items</a>`;
            } else {
                itemDisplay = trans.item_name || 'N/A';
            }
        }

        // Handle credit status and account display
        if (trans.type === 'Transfer') {
            // Transfer already has accountDisplay set above
            actionButtons = `
                <button class="btn btn-edit" onclick="editTransfer(${trans.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteTransaction(${trans.id})">Delete</button>
            `;
        } else if ((trans.is_credit == 1 || trans.is_credit === true) && trans.credit_status === 'pending') {
            // Only show as credit if BOTH is_credit is truthy AND credit_status is pending
            accountDisplay = '<span class="credit-pending">💳 On Credit</span>';
            actionButtons = `
                <button class="btn btn-pay" onclick="payCredit(${trans.id})">Pay Now</button>
                <button class="btn btn-delete" onclick="deleteTransaction(${trans.id})">Delete</button>
            `;
        } else {
            accountDisplay = trans.account_name || 'N/A';
            actionButtons = `
                <button class="btn btn-edit" onclick="editTransaction(${trans.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteTransaction(${trans.id})">Delete</button>
            `;
        }

        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${trans.transaction_code || '-'}</span></td>
            <td>${date}</td>
            <td>${typeDisplay}</td>
            <td>${trans.category_name || '-'}</td>
            <td>${itemDisplay}</td>
            <td>${priceDisplay}</td>
            <td>${quantityDisplay}</td>
            <td>${trans.remark || 'N/A'}</td>
            <td>₹${trans.total.toFixed(2)}</td>
            <td>${accountDisplay}</td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });
}

function showMultiItems(event, itemNames) {
    event.preventDefault();
    alert(`Items in this transaction:\n\n${itemNames.split(', ').map((name, i) => `${i + 1}. ${name}`).join('\n')}`);
}

async function payCredit(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    
    // Create modal for account selection
    const modal = document.createElement('div');
    modal.className = 'pay-modal-overlay';
    modal.innerHTML = `
        <div class="pay-modal">
            <h3>💳 Complete Payment</h3>
            <p>Transaction: ₹${transaction.total.toFixed(2)}</p>
            <div class="form-group">
                <label>Select Account to Pay From:</label>
                <select id="payAccountSelect">
                    ${accounts.map(acc => {
                        const label = acc.type === 'Cash' ? `${acc.name} (Cash) - ₹${acc.balance.toFixed(2)}` : `${acc.name} (${acc.bank_name}) - ₹${acc.balance.toFixed(2)}`;
                        return `<option value="${acc.id}">${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="pay-modal-buttons">
                <button class="btn btn-primary" id="confirmPayBtn">Confirm Payment</button>
                <button class="btn btn-secondary" id="cancelPayBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Handle confirm
    document.getElementById('confirmPayBtn').onclick = async () => {
        const accountId = document.getElementById('payAccountSelect').value;
        
        try {
            const response = await fetch(`/api/transactions/${id}/pay`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: parseInt(accountId) })
            });
            
            if (response.ok) {
                await loadTransactions();
                await loadAccounts();
                renderDashboard();
                modal.remove();
                alert('Payment completed successfully!');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to complete payment');
            }
        } catch (error) {
            alert('Failed to complete payment: ' + error.message);
        }
    };
    
    // Handle cancel
    document.getElementById('cancelPayBtn').onclick = () => {
        modal.remove();
    };
    
    // Close on overlay click
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

async function editTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    if (transaction.is_multi_item === 1) {
        alert('Multi-item transactions cannot be edited. Please delete and create a new transaction.');
        return;
    }

    const isCurrentlyOnCredit = transaction.credit_status === 'pending';

    // Create edit modal
    const modal = document.createElement('div');
    modal.className = 'pay-modal-overlay';
    modal.innerHTML = `
        <div class="pay-modal" style="max-width: 450px;">
            <h3>✏️ Edit Transaction</h3>
            <p>Transaction ID: ${transaction.transaction_code || transaction.id}</p>
            <p>Type: ${transaction.type} | Category: ${transaction.category_name || '-'}</p>
            <div class="form-group">
                <label>Price (₹):</label>
                <input type="number" id="editTransPrice" value="${transaction.price}" min="0.01" step="0.01">
            </div>
            <div class="form-group">
                <label>Quantity:</label>
                <input type="number" id="editTransQuantity" value="${transaction.quantity}" min="0.01" step="0.01">
            </div>
            <div class="form-group">
                <label>Remark:</label>
                <input type="text" id="editTransRemark" value="${transaction.remark || ''}">
            </div>
            ${transaction.type === 'Expense' ? `
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="editTransOnCredit" ${isCurrentlyOnCredit ? 'checked' : ''}>
                    On Credit (Payment Pending)
                </label>
            </div>
            ${!isCurrentlyOnCredit ? `
            <div class="form-group" id="editAccountGroup">
                <label>Account:</label>
                <select id="editTransAccount">
                    ${accounts.map(acc => {
                        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
                        const selected = acc.id == transaction.account_id ? 'selected' : '';
                        return `<option value="${acc.id}" ${selected}>${label} - ₹${acc.balance.toFixed(2)}</option>`;
                    }).join('')}
                </select>
            </div>
            ` : ''}
            ` : ''}
            <div class="pay-modal-buttons">
                <button class="btn btn-primary" id="confirmEditTransBtn">Update</button>
                <button class="btn btn-secondary" id="cancelEditTransBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle credit toggle
    const creditCheckbox = document.getElementById('editTransOnCredit');
    const accountGroup = document.getElementById('editAccountGroup');
    if (creditCheckbox && accountGroup) {
        creditCheckbox.addEventListener('change', () => {
            accountGroup.style.display = creditCheckbox.checked ? 'none' : 'block';
        });
    }

    // Handle confirm
    document.getElementById('confirmEditTransBtn').onclick = async () => {
        const newPrice = parseFloat(document.getElementById('editTransPrice').value);
        const newQuantity = parseFloat(document.getElementById('editTransQuantity').value);
        const newRemark = document.getElementById('editTransRemark').value;
        const isOnCredit = creditCheckbox ? creditCheckbox.checked : false;
        const accountId = document.getElementById('editTransAccount')?.value || transaction.account_id;

        if (!newPrice || newPrice <= 0) {
            alert('Please enter a valid price');
            return;
        }

        if (!newQuantity || newQuantity <= 0) {
            alert('Please enter a valid quantity');
            return;
        }

        try {
            const response = await fetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price: newPrice,
                    quantity: newQuantity,
                    remark: newRemark,
                    is_credit: isOnCredit,
                    account_id: isOnCredit ? null : accountId
                })
            });

            const data = await response.json();

            if (response.ok) {
                await loadTransactions();
                await loadAccounts();
                renderDashboard();
                document.body.removeChild(modal);
                alert('Transaction updated successfully!');
            } else {
                if (data.error === 'Insufficient Balance') {
                    alert(`⚠️ Insufficient Balance!\n\n${data.message}\n\nTransaction cannot be updated.`);
                } else {
                    alert(data.error || 'Failed to update transaction');
                }
            }
        } catch (error) {
            alert('Failed to update transaction: ' + error.message);
        }
    };

    // Handle cancel
    document.getElementById('cancelEditTransBtn').onclick = () => {
        document.body.removeChild(modal);
    };
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction? This will adjust your account balance.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        
        if (response.ok) {
            await loadTransactions();
            await loadAccounts();
            renderDashboard();
            alert('Transaction deleted successfully!');
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete transaction');
        }
    } catch (error) {
        alert('Failed to delete transaction');
    }
}

// Edit mode state
let editingTransactionId = null;

function editTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    
    editingTransactionId = id;
    
    // Navigate to Transaction page
    navigateToPage('transaction');
    
    // Show edit mode banner
    document.getElementById('editModeBanner').style.display = 'flex';
    document.getElementById('editTransactionId').textContent = id;
    document.getElementById('transactionSubmitBtn').textContent = 'Update Transaction';
    
    // Fill form with transaction data
    document.getElementById('transactionType').value = transaction.type;
    handleTransactionTypeChange();
    
    // Wait for categories to load then set category
    setTimeout(() => {
        document.getElementById('transactionCategory').value = transaction.category_id;
        document.getElementById('transactionCategory').disabled = false;
        loadItemsForTransaction();
        
        setTimeout(() => {
            if (transaction.is_multi_item === 1 && transaction.item_ids) {
                // Multi-item transaction
                document.getElementById('multiItemToggle').checked = true;
                handleMultiItemToggle({ target: { checked: true } });
                
                const itemIds = transaction.item_ids.split(',');
                selectedItems = itemIds.map(id => items.find(i => i.id == id)).filter(Boolean);
                renderSelectedItems();
            } else {
                document.getElementById('transactionItem').value = transaction.item_id;
                document.getElementById('transactionItem').disabled = false;
            }
            
            if (transaction.type === 'Income') {
                document.getElementById('transactionAmount').value = transaction.total;
            } else {
                document.getElementById('transactionPrice').value = transaction.price;
                document.getElementById('transactionQuantity').value = transaction.quantity;
            }

            // Set date for both Income and Expense
            if (transaction.transaction_date) {
                document.getElementById('transactionDate').value = transaction.transaction_date.split('T')[0];
            }
            
            document.getElementById('transactionRemark').value = transaction.remark || '';
            document.getElementById('transactionAccount').value = transaction.account_id;
            showAccountBalance();
            calculateTotal();
        }, 100);
    }, 100);
}

function cancelEditMode() {
    editingTransactionId = null;
    document.getElementById('editModeBanner').style.display = 'none';
    document.getElementById('transactionSubmitBtn').textContent = 'Submit Transaction';
    document.getElementById('transactionForm').reset();
    document.getElementById('transactionCategory').disabled = true;
    document.getElementById('transactionItem').disabled = true;
    document.getElementById('multiItemToggle').checked = false;
    isMultiItemMode = false;
    selectedItems = [];
    document.getElementById('selectedItemsContainer').style.display = 'none';
    document.querySelectorAll('.expense-field').forEach(field => field.style.display = 'block');
    document.querySelectorAll('.income-field').forEach(field => field.style.display = 'none');
    document.querySelectorAll('.date-field').forEach(field => field.style.display = 'none');
}

// Edit Transfer function
async function editTransfer(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    // Create modal for editing transfer
    const modal = document.createElement('div');
    modal.className = 'pay-modal-overlay';
    modal.innerHTML = `
        <div class="pay-modal" style="max-width: 450px;">
            <h3>✏️ Edit Transfer</h3>
            <p>Transfer ID: ${transaction.transaction_code || transaction.id}</p>
            <div class="form-group">
                <label>From Account:</label>
                <select id="editTransferFromAccount">
                    ${accounts.map(acc => {
                        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
                        const selected = acc.id == transaction.from_account_id ? 'selected' : '';
                        return `<option value="${acc.id}" ${selected}>${label} - ₹${acc.balance.toFixed(2)}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>To Account:</label>
                <select id="editTransferToAccount">
                    ${accounts.map(acc => {
                        const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
                        const selected = acc.id == transaction.to_account_id ? 'selected' : '';
                        return `<option value="${acc.id}" ${selected}>${label}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Amount (₹):</label>
                <input type="number" id="editTransferAmount" value="${transaction.total}" min="0.01" step="0.01">
            </div>
            <div class="form-group">
                <label>Remark:</label>
                <input type="text" id="editTransferRemark" value="${transaction.remark || ''}">
            </div>
            <div class="pay-modal-buttons">
                <button class="btn btn-primary" id="confirmEditTransferBtn">Update Transfer</button>
                <button class="btn btn-secondary" id="cancelEditTransferBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Filter To Account based on From Account selection
    const fromSelect = document.getElementById('editTransferFromAccount');
    const toSelect = document.getElementById('editTransferToAccount');

    function updateToAccountOptions() {
        const selectedFromId = fromSelect.value;
        const currentToValue = toSelect.value;
        toSelect.innerHTML = accounts
            .filter(acc => acc.id != selectedFromId)
            .map(acc => {
                const label = acc.type === 'Cash' ? `${acc.name} (Cash)` : `${acc.name} (${acc.bank_name || acc.type})`;
                const selected = acc.id == currentToValue ? 'selected' : '';
                return `<option value="${acc.id}" ${selected}>${label}</option>`;
            }).join('');
    }

    fromSelect.addEventListener('change', updateToAccountOptions);
    updateToAccountOptions();

    // Handle confirm
    document.getElementById('confirmEditTransferBtn').onclick = async () => {
        const fromAccountId = document.getElementById('editTransferFromAccount').value;
        const toAccountId = document.getElementById('editTransferToAccount').value;
        const amount = parseFloat(document.getElementById('editTransferAmount').value);
        const remark = document.getElementById('editTransferRemark').value;

        if (fromAccountId === toAccountId) {
            alert('Source and destination accounts cannot be the same');
            return;
        }

        if (!amount || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        try {
            const response = await fetch(`/api/transfers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from_account_id: fromAccountId,
                    to_account_id: toAccountId,
                    amount,
                    remark
                })
            });

            const data = await response.json();

            if (response.ok) {
                await loadTransactions();
                await loadAccounts();
                renderDashboard();
                document.body.removeChild(modal);
                alert('Transfer updated successfully!');
            } else {
                if (data.error === 'Insufficient Balance') {
                    alert(`⚠️ Insufficient Balance!\n\n${data.message}\n\nTransfer cannot be updated.`);
                } else {
                    alert(data.error || 'Failed to update transfer');
                }
            }
        } catch (error) {
            alert('Failed to update transfer: ' + error.message);
        }
    };

    // Handle cancel
    document.getElementById('cancelEditTransferBtn').onclick = () => {
        document.body.removeChild(modal);
    };
}

// Filter functions
let filteredTransactions = [];
let filtersActive = false;

function applyFilters() {
    console.log('Apply Filters clicked');
    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const type = document.getElementById('filterType')?.value || '';
    const category = document.getElementById('filterCategory')?.value || '';
    const minAmount = parseFloat(document.getElementById('filterMinAmount')?.value) || 0;
    const maxAmount = parseFloat(document.getElementById('filterMaxAmount')?.value) || Infinity;

    console.log('Filter values:', { fromDate, toDate, type, category, minAmount, maxAmount });

    filtersActive = true;
    filteredTransactions = transactions.filter(t => {
        const transDate = t.transaction_date.split('T')[0];

        if (fromDate && transDate < fromDate) return false;
        if (toDate && transDate > toDate) return false;
        if (type && t.type !== type) return false;
        if (category && t.category_id != category) return false;
        if (t.total < minAmount) return false;
        if (t.total > maxAmount) return false;

        return true;
    });

    console.log('Filtered transactions:', filteredTransactions.length);
    renderFilteredTransactionTable();
}

// Wrapper function for HTML onclick - applies date filter
function applyDateFilter() {
    applyFilters();
}

// Wrapper function for HTML onclick - resets date filter
function resetDateFilter() {
    clearFilters();
}

function clearFilters() {
    document.getElementById('filterFromDate').value = '';
    document.getElementById('filterToDate').value = '';
    if (document.getElementById('filterType')) document.getElementById('filterType').value = '';
    if (document.getElementById('filterCategory')) document.getElementById('filterCategory').value = '';
    if (document.getElementById('filterMinAmount')) document.getElementById('filterMinAmount').value = '';
    if (document.getElementById('filterMaxAmount')) document.getElementById('filterMaxAmount').value = '';

    filtersActive = false;
    filteredTransactions = [];
    renderTransactionTable();
}

function renderFilteredTransactionTable() {
    console.log('Rendering filtered table, filtersActive:', filtersActive);
    const tbody = document.querySelector('#transactionTable tbody');
    tbody.innerHTML = '';
    
    // Use filtered transactions
    const dataToRender = filteredTransactions;
    
    if (dataToRender.length === 0 && filtersActive) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;">No transactions found matching filters</td></tr>';
        return;
    }
    
    if (dataToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;">No transactions available</td></tr>';
        return;
    }
    
    dataToRender.forEach((trans, index) => {
        const tr = document.createElement('tr');
        const date = new Date(trans.transaction_date).toLocaleDateString();
        
        let priceDisplay, quantityDisplay, itemDisplay, accountDisplay, actionButtons;
        
        if (trans.type === 'Income') {
            priceDisplay = `₹${trans.total.toFixed(2)}`;
            quantityDisplay = '-';
        } else {
            priceDisplay = `₹${trans.price.toFixed(2)}`;
            quantityDisplay = `${trans.quantity} ${trans.unit_name || ''}`;
        }
        
        if (trans.is_multi_item === 1 && trans.item_ids) {
            const itemIds = trans.item_ids.split(',');
            const itemNames = itemIds.map(id => {
                const item = items.find(i => i.id == id);
                return item ? item.name : 'Unknown';
            });
            itemDisplay = `<a href="#" class="multi-item-link" onclick="showMultiItems(event, '${itemNames.join(', ')}')" title="Click to view items">${itemNames.length} items</a>`;
        } else {
            itemDisplay = trans.item_name || 'N/A';
        }
        
        // Handle credit status
        if (trans.is_credit === 1 || trans.credit_status === 'pending') {
            accountDisplay = '<span class="credit-pending">💳 On Credit</span>';
            actionButtons = `
                <button class="btn btn-pay" onclick="payCredit(${trans.id})">Pay Now</button>
                <button class="btn btn-delete" onclick="deleteTransaction(${trans.id})">Delete</button>
            `;
        } else {
            accountDisplay = trans.account_name || 'N/A';
            actionButtons = `
                <button class="btn btn-edit" onclick="editTransaction(${trans.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteTransaction(${trans.id})">Delete</button>
            `;
        }
        
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${trans.transaction_code || '-'}</span></td>
            <td>${date}</td>
            <td>${trans.type}</td>
            <td>${trans.category_name}</td>
            <td>${itemDisplay}</td>
            <td>${priceDisplay}</td>
            <td>${quantityDisplay}</td>
            <td>${trans.remark || 'N/A'}</td>
            <td>₹${trans.total.toFixed(2)}</td>
            <td>${accountDisplay}</td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });
}

function populateFilterCategories() {
    const select = document.getElementById('filterCategory');
    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat.id}">${cat.name} (${cat.type})</option>`;
    });
}

function setDefaultDateFilters() {
    // Set default to last 7 days
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Set max date to today
    const filterFromDate = document.getElementById('filterFromDate');
    const filterToDate = document.getElementById('filterToDate');
    
    filterToDate.value = today.toISOString().split('T')[0];
    filterFromDate.value = sevenDaysAgo.toISOString().split('T')[0];
    
    // Set max attribute to limit to 6 months back
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    filterFromDate.setAttribute('min', sixMonthsAgo.toISOString().split('T')[0]);
    filterFromDate.setAttribute('max', today.toISOString().split('T')[0]);
    filterToDate.setAttribute('min', sixMonthsAgo.toISOString().split('T')[0]);
    filterToDate.setAttribute('max', today.toISOString().split('T')[0]);
    
    // Apply default filter
    applyFilters();
}

// Multi-item selection functions
function handleMultiItemToggle(e) {
    isMultiItemMode = e.target.checked;
    const itemSelect = document.getElementById('transactionItem');
    const selectedContainer = document.getElementById('selectedItemsContainer');
    const quantityField = document.querySelector('.expense-field:nth-child(5)'); // Quantity field
    const quantityInput = document.getElementById('transactionQuantity');
    
    if (isMultiItemMode) {
        selectedContainer.style.display = 'block';
        if (quantityField) quantityField.style.display = 'none';
        if (quantityInput) quantityInput.required = false; // Not required in multi-item mode
        selectedItems = [];
        renderSelectedItems();
        itemSelect.value = '';
        itemSelect.required = false; // Not required in multi-item mode
    } else {
        selectedContainer.style.display = 'none';
        if (quantityField) quantityField.style.display = 'block';
        if (quantityInput) quantityInput.required = true; // Required in single-item mode
        selectedItems = [];
        itemSelect.value = '';
        itemSelect.required = true; // Required in single-item mode
    }
}

function handleItemSelection(e) {
    if (!isMultiItemMode) return;
    
    const itemId = e.target.value;
    if (!itemId) return;
    
    const item = items.find(i => i.id == itemId);
    if (!item) return;
    
    // Check if already selected
    if (selectedItems.find(i => i.id == itemId)) {
        alert('Item already selected');
        e.target.value = '';
        return;
    }
    
    selectedItems.push(item);
    renderSelectedItems();
    e.target.value = '';
    
    // Update total if price is entered
    if (document.getElementById('transactionPrice').value) {
        calculateMultiItemTotal();
    }
}

function renderSelectedItems() {
    const container = document.getElementById('selectedItemsList');
    container.innerHTML = '';
    
    if (selectedItems.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 13px;">No items selected</p>';
        return;
    }
    
    selectedItems.forEach(item => {
        const tag = document.createElement('span');
        tag.className = 'selected-item-tag';
        tag.innerHTML = `
            ${item.name}
            <span class="remove-item" onclick="removeSelectedItem(${item.id})">×</span>
        `;
        container.appendChild(tag);
    });
}

function removeSelectedItem(itemId) {
    selectedItems = selectedItems.filter(i => i.id != itemId);
    renderSelectedItems();
    
    if (document.getElementById('transactionPrice').value) {
        calculateMultiItemTotal();
    }
}

function calculateMultiItemTotal() {
    if (!isMultiItemMode || selectedItems.length === 0) return;
    
    const price = parseFloat(document.getElementById('transactionPrice').value) || 0;
    // In multi-item mode, total is the same as price (not multiplied)
    document.getElementById('transactionTotal').value = price.toFixed(2);
}

// Item search functionality
function handleItemSearch(e) {
    const searchTerm = e.target.value.trim().toLowerCase();

    if (searchTerm.length === 0) {
        document.getElementById('itemSearchResults').style.display = 'none';
        return;
    }

    // Filter items based on search term
    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
    );

    renderItemSearchResults(filteredItems);
}

function toggleAdvancedSearch() {
    const advancedFields = document.getElementById('advancedSearchFields');
    const toggleBtn = document.getElementById('toggleAdvancedSearch');

    if (advancedFields.style.display === 'none') {
        advancedFields.style.display = 'block';
        toggleBtn.textContent = 'Advanced Search ▲';
    } else {
        advancedFields.style.display = 'none';
        toggleBtn.textContent = 'Advanced Search ▼';
    }
}

function handleAdvancedSearch() {
    const categoryId = document.getElementById('searchCategoryId').value;
    const itemId = document.getElementById('searchItemId').value;
    const unitId = document.getElementById('searchUnitId').value;

    let filteredItems = [...items];

    if (categoryId) {
        filteredItems = filteredItems.filter(item => item.category_id == categoryId);
    }

    if (itemId) {
        filteredItems = filteredItems.filter(item => item.id == itemId);
    }

    if (unitId) {
        filteredItems = filteredItems.filter(item => item.unit_id == unitId);
    }

    renderItemSearchResults(filteredItems);
}

function clearAdvancedSearch() {
    document.getElementById('searchCategoryId').value = '';
    document.getElementById('searchItemId').value = '';
    document.getElementById('searchUnitId').value = '';
    document.getElementById('itemSearchInput').value = '';
    document.getElementById('itemSearchResults').style.display = 'none';
}

function renderItemSearchResults(filteredItems) {
    const resultsDiv = document.getElementById('itemSearchResults');
    const tbody = document.querySelector('#itemSearchTable tbody');

    tbody.innerHTML = '';

    if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-results">No items found</td></tr>';
        resultsDiv.style.display = 'block';
        return;
    }

    filteredItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        const source = item.is_system === 1 ? 'System' : 'Custom';
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${item.id}</span></td>
            <td>${item.name}</td>
            <td>${item.type}</td>
            <td><span class="code-cell">${item.category_id}</span></td>
            <td>${item.category_name}</td>
            <td><span class="code-cell">${item.unit_id || '-'}</span></td>
            <td>${item.unit_name || 'N/A'}</td>
            <td><span style="color: ${item.is_system === 1 ? '#667eea' : '#28a745'}; font-weight: 600;">${source}</span></td>
        `;
        tbody.appendChild(tr);
    });

    resultsDiv.style.display = 'block';
}

// Dashboard functions
function renderDashboard() {
    updateDashboardCards();
    renderAccountBalanceChart();
    renderIncomeExpenseChart();
    renderCategoryExpenseChart();
    renderDailyTransactionChart();
    renderTopItemsChart();
}

function updateDashboardCards() {
    const totalIncome = transactions
        .filter(t => t.type === 'Income')
        .reduce((sum, t) => sum + t.total, 0);
    
    const totalExpense = transactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + t.total, 0);
    
    // Net Balance = Sum of all account balances (includes opening balances)
    const netBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    
    document.getElementById('totalIncome').textContent = `₹${totalIncome.toFixed(2)}`;
    document.getElementById('totalExpense').textContent = `₹${totalExpense.toFixed(2)}`;
    document.getElementById('netBalance').textContent = `₹${netBalance.toFixed(2)}`;
    document.getElementById('totalAccounts').textContent = accounts.length;
}

function renderAccountBalanceChart() {
    const ctx = document.getElementById('accountBalanceChart');
    
    if (dashboardCharts.accountBalance) {
        dashboardCharts.accountBalance.destroy();
    }
    
    // Show account name with bank name in labels
    const labels = accounts.map(acc => {
        if (acc.bank_name && acc.type !== 'Cash') {
            return `${acc.name} (${acc.bank_name})`;
        }
        return acc.name;
    });
    const data = accounts.map(acc => acc.balance);
    const colors = accounts.map((_, i) => `hsl(${i * 360 / accounts.length}, 70%, 60%)`);
    
    dashboardCharts.accountBalance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Balance',
                data: data,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('60%', '50%')),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₹' + value.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}

function renderIncomeExpenseChart() {
    const ctx = document.getElementById('incomeExpenseChart');
    
    if (dashboardCharts.incomeExpense) {
        dashboardCharts.incomeExpense.destroy();
    }
    
    const totalIncome = transactions
        .filter(t => t.type === 'Income')
        .reduce((sum, t) => sum + t.total, 0);
    
    const totalExpense = transactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + t.total, 0);
    
    dashboardCharts.incomeExpense = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Income', 'Expense'],
            datasets: [{
                data: [totalIncome, totalExpense],
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function renderCategoryExpenseChart() {
    const ctx = document.getElementById('categoryExpenseChart');
    
    if (dashboardCharts.categoryExpense) {
        dashboardCharts.categoryExpense.destroy();
    }
    
    const expenseTransactions = transactions.filter(t => t.type === 'Expense');
    const categoryTotals = {};
    
    expenseTransactions.forEach(t => {
        if (!categoryTotals[t.category_name]) {
            categoryTotals[t.category_name] = 0;
        }
        categoryTotals[t.category_name] += t.total;
    });
    
    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    const colors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 60%)`);
    
    dashboardCharts.categoryExpense = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function renderDailyTransactionChart() {
    const ctx = document.getElementById('dailyTransactionChart');
    
    if (dashboardCharts.dailyTransaction) {
        dashboardCharts.dailyTransaction.destroy();
    }
    
    // Get last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split('T')[0]);
    }
    
    const dailyIncome = last7Days.map(date => {
        return transactions
            .filter(t => t.type === 'Income' && t.transaction_date.startsWith(date))
            .reduce((sum, t) => sum + t.total, 0);
    });
    
    const dailyExpense = last7Days.map(date => {
        return transactions
            .filter(t => t.type === 'Expense' && t.transaction_date.startsWith(date))
            .reduce((sum, t) => sum + t.total, 0);
    });
    
    const labels = last7Days.map(date => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    dashboardCharts.dailyTransaction = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Income',
                data: dailyIncome,
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Expense',
                data: dailyExpense,
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₹' + value.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}

function renderTopItemsChart() {
    const ctx = document.getElementById('topItemsChart');
    
    if (dashboardCharts.topItems) {
        dashboardCharts.topItems.destroy();
    }
    
    const expenseTransactions = transactions.filter(t => t.type === 'Expense');
    const itemTotals = {};
    
    expenseTransactions.forEach(t => {
        if (!itemTotals[t.item_name]) {
            itemTotals[t.item_name] = 0;
        }
        itemTotals[t.item_name] += t.total;
    });
    
    const sorted = Object.entries(itemTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    const labels = sorted.map(([name]) => name);
    const data = sorted.map(([, total]) => total);
    
    dashboardCharts.topItems = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Spending',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₹' + value.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}


// Report functions
let reportData = [];

function setReportDateDefaults() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const reportFromDate = document.getElementById('reportFromDate');
    const reportToDate = document.getElementById('reportToDate');
    
    reportToDate.value = today.toISOString().split('T')[0];
    reportFromDate.value = thirtyDaysAgo.toISOString().split('T')[0];
    
    reportFromDate.setAttribute('min', sixMonthsAgo.toISOString().split('T')[0]);
    reportFromDate.setAttribute('max', today.toISOString().split('T')[0]);
    reportToDate.setAttribute('min', sixMonthsAgo.toISOString().split('T')[0]);
    reportToDate.setAttribute('max', today.toISOString().split('T')[0]);
}

function generateReport() {
    console.log('generateReport called');
    console.log('Total transactions available:', transactions.length);

    const reportType = document.getElementById('reportType').value;
    const fromDate = document.getElementById('reportFromDate').value;
    const toDate = document.getElementById('reportToDate').value;
    const transType = document.getElementById('reportTransType').value;

    console.log('Report filters:', { reportType, fromDate, toDate, transType });

    // Filter transactions
    reportData = transactions.filter(t => {
        const transDate = t.transaction_date.split('T')[0];
        console.log('Checking transaction:', t.id, 'date:', transDate, 'type:', t.type);
        if (fromDate && transDate < fromDate) return false;
        if (toDate && transDate > toDate) return false;
        if (transType && t.type !== transType) return false;
        return true;
    });

    console.log('Filtered report data:', reportData.length, 'transactions');
    
    // Calculate summary
    let totalIncome = 0;
    let totalExpense = 0;
    
    reportData.forEach(t => {
        if (t.type === 'Income') {
            totalIncome += t.total;
        } else {
            totalExpense += t.total;
        }
    });
    
    document.getElementById('reportTotalIncome').textContent = `₹${totalIncome.toFixed(2)}`;
    document.getElementById('reportTotalExpense').textContent = `₹${totalExpense.toFixed(2)}`;
    document.getElementById('reportNetBalance').textContent = `₹${(totalIncome - totalExpense).toFixed(2)}`;
    document.getElementById('reportTransCount').textContent = reportData.length;
    document.getElementById('reportSummary').style.display = 'grid';
    
    // Render report based on type
    switch(reportType) {
        case 'category':
            renderCategoryReport();
            break;
        case 'item':
            renderItemReport();
            break;
        case 'account':
            renderAccountReport();
            break;
        case 'date':
            renderDateReport();
            break;
        default:
            renderAllTransactionsReport();
    }
}

function renderAllTransactionsReport() {
    const thead = document.getElementById('reportTableHead');
    const tbody = document.querySelector('#reportTable tbody');

    thead.innerHTML = `
        <tr>
            <th>S.No</th>
            <th>Trans ID</th>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Item</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Remark</th>
            <th>Total</th>
            <th>Account</th>
        </tr>
    `;

    tbody.innerHTML = '';

    reportData.forEach((trans, index) => {
        const tr = document.createElement('tr');
        const date = new Date(trans.transaction_date).toLocaleDateString();

        let itemDisplay = trans.item_name || 'N/A';
        if (trans.is_multi_item === 1 && trans.item_ids) {
            const itemIds = trans.item_ids.split(',');
            const itemNames = itemIds.map(id => {
                const item = items.find(i => i.id == id);
                return item ? item.name : 'Unknown';
            });
            itemDisplay = itemNames.join(', ');
        }

        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td><span class="code-cell">${trans.transaction_code || trans.id}</span></td>
            <td>${date}</td>
            <td>${trans.type}</td>
            <td>${trans.category_name || '-'}</td>
            <td>${itemDisplay}</td>
            <td>₹${trans.price.toFixed(2)}</td>
            <td>${trans.quantity} ${trans.unit_name || ''}</td>
            <td>${trans.remark || '-'}</td>
            <td>₹${trans.total.toFixed(2)}</td>
            <td>${trans.account_name || 'On Credit'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCategoryReport() {
    const thead = document.getElementById('reportTableHead');
    const tbody = document.querySelector('#reportTable tbody');

    thead.innerHTML = `
        <tr>
            <th>S.No</th>
            <th>Category</th>
            <th>Type</th>
            <th>Transaction Count</th>
            <th>Transaction IDs</th>
            <th>Total Amount</th>
        </tr>
    `;

    tbody.innerHTML = '';

    const categoryMap = {};
    reportData.forEach(trans => {
        const key = `${trans.category_id}-${trans.category_name}-${trans.type}`;
        if (!categoryMap[key]) {
            categoryMap[key] = {
                name: trans.category_name || 'Transfer',
                type: trans.type,
                count: 0,
                total: 0,
                transactionIds: []
            };
        }
        categoryMap[key].count++;
        categoryMap[key].total += trans.total;
        categoryMap[key].transactionIds.push(trans.transaction_code || trans.id);
    });

    Object.values(categoryMap).forEach((cat, index) => {
        const tr = document.createElement('tr');
        const transIds = cat.transactionIds.slice(0, 5).join(', ') + (cat.transactionIds.length > 5 ? '...' : '');
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td>${cat.name}</td>
            <td>${cat.type}</td>
            <td>${cat.count}</td>
            <td><span class="code-cell" title="${cat.transactionIds.join(', ')}">${transIds}</span></td>
            <td>₹${cat.total.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderItemReport() {
    const thead = document.getElementById('reportTableHead');
    const tbody = document.querySelector('#reportTable tbody');

    thead.innerHTML = `
        <tr>
            <th>S.No</th>
            <th>Item</th>
            <th>Category</th>
            <th>Type</th>
            <th>Transaction Count</th>
            <th>Transaction IDs</th>
            <th>Total Quantity</th>
            <th>Total Amount</th>
        </tr>
    `;

    tbody.innerHTML = '';

    const itemMap = {};
    reportData.forEach(trans => {
        if (trans.is_multi_item === 1 && trans.item_ids) {
            const itemIds = trans.item_ids.split(',');
            itemIds.forEach(id => {
                const item = items.find(i => i.id == id);
                if (item) {
                    const key = `${item.id}-${item.name}`;
                    if (!itemMap[key]) {
                        itemMap[key] = {
                            name: item.name,
                            category: trans.category_name,
                            type: trans.type,
                            count: 0,
                            quantity: 0,
                            total: 0,
                            transactionIds: []
                        };
                    }
                    itemMap[key].count++;
                    itemMap[key].total += trans.total / itemIds.length;
                    itemMap[key].transactionIds.push(trans.transaction_code || trans.id);
                }
            });
        } else if (trans.item_name) {
            const key = `${trans.item_id}-${trans.item_name}`;
            if (!itemMap[key]) {
                itemMap[key] = {
                    name: trans.item_name,
                    category: trans.category_name,
                    type: trans.type,
                    count: 0,
                    quantity: 0,
                    total: 0,
                    transactionIds: []
                };
            }
            itemMap[key].count++;
            itemMap[key].quantity += trans.quantity;
            itemMap[key].total += trans.total;
            itemMap[key].transactionIds.push(trans.transaction_code || trans.id);
        }
    });

    Object.values(itemMap).forEach((item, index) => {
        const tr = document.createElement('tr');
        const transIds = item.transactionIds.slice(0, 5).join(', ') + (item.transactionIds.length > 5 ? '...' : '');
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>${item.type}</td>
            <td>${item.count}</td>
            <td><span class="code-cell" title="${item.transactionIds.join(', ')}">${transIds}</span></td>
            <td>${item.quantity.toFixed(2)}</td>
            <td>₹${item.total.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAccountReport() {
    const thead = document.getElementById('reportTableHead');
    const tbody = document.querySelector('#reportTable tbody');

    thead.innerHTML = `
        <tr>
            <th>S.No</th>
            <th>Account Name</th>
            <th>Account Type</th>
            <th>Transaction Count</th>
            <th>Total Income</th>
            <th>Total Expense</th>
            <th>Net Amount</th>
        </tr>
    `;

    tbody.innerHTML = '';

    const accountMap = {};
    reportData.forEach(trans => {
        const accountId = trans.account_id;
        const accountName = trans.account_name || 'On Credit';
        const account = accounts.find(a => a.id === accountId);
        const accountType = account ? account.type : 'N/A';
        const key = `${accountId}-${accountName}`;

        if (!accountMap[key]) {
            accountMap[key] = {
                name: accountName,
                type: accountType,
                count: 0,
                income: 0,
                expense: 0
            };
        }
        accountMap[key].count++;
        if (trans.type === 'Income' || (trans.type === 'Transfer' && trans.remark?.includes('Transfer IN'))) {
            accountMap[key].income += trans.total;
        } else {
            accountMap[key].expense += trans.total;
        }
    });

    Object.values(accountMap).forEach((data, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td>${data.name}</td>
            <td>${data.type}</td>
            <td>${data.count}</td>
            <td>₹${data.income.toFixed(2)}</td>
            <td>₹${data.expense.toFixed(2)}</td>
            <td>₹${(data.income - data.expense).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDateReport() {
    const thead = document.getElementById('reportTableHead');
    const tbody = document.querySelector('#reportTable tbody');

    thead.innerHTML = `
        <tr>
            <th>S.No</th>
            <th>Date</th>
            <th>Transaction Count</th>
            <th>Total Income</th>
            <th>Total Expense</th>
            <th>Net Amount</th>
        </tr>
    `;

    tbody.innerHTML = '';

    const dateMap = {};
    reportData.forEach(trans => {
        const date = new Date(trans.transaction_date).toLocaleDateString();
        if (!dateMap[date]) {
            dateMap[date] = {
                count: 0,
                income: 0,
                expense: 0
            };
        }
        dateMap[date].count++;
        if (trans.type === 'Income' || (trans.type === 'Transfer' && trans.remark?.includes('Transfer IN'))) {
            dateMap[date].income += trans.total;
        } else {
            dateMap[date].expense += trans.total;
        }
    });

    Object.entries(dateMap).sort((a, b) => new Date(a[0]) - new Date(b[0])).forEach(([date, data], index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="sno-cell">${index + 1}</td>
            <td>${date}</td>
            <td>${data.count}</td>
            <td>₹${data.income.toFixed(2)}</td>
            <td>₹${data.expense.toFixed(2)}</td>
            <td>₹${(data.income - data.expense).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function exportToPDF() {
    if (reportData.length === 0) {
        alert('Please generate a report first');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); // Use landscape for better table fit

    // Add title
    doc.setFontSize(18);
    doc.text('Home Expense Manager - Report', 14, 20);

    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

    // Add summary - use Rs. instead of ₹ for PDF compatibility
    const totalIncome = parseFloat(document.getElementById('reportTotalIncome').textContent.replace('₹', '').replace(/,/g, ''));
    const totalExpense = parseFloat(document.getElementById('reportTotalExpense').textContent.replace('₹', '').replace(/,/g, ''));
    const netBalance = parseFloat(document.getElementById('reportNetBalance').textContent.replace('₹', '').replace(/,/g, ''));

    doc.text(`Total Income: Rs. ${totalIncome.toFixed(2)}`, 14, 36);
    doc.text(`Total Expense: Rs. ${totalExpense.toFixed(2)}`, 80, 36);
    doc.text(`Net Balance: Rs. ${netBalance.toFixed(2)}`, 150, 36);

    // Get table data and replace ₹ with Rs. for PDF compatibility
    const table = document.getElementById('reportTable');
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/₹/g, 'Rs.'))
    );

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 45,
        theme: 'striped',
        styles: {
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak',
            halign: 'left'
        },
        headStyles: {
            fillColor: [52, 73, 94],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245]
        },
        columnStyles: {
            0: { cellWidth: 15 }, // S.No
        },
        margin: { left: 14, right: 14 }
    });

    doc.save('expense-report.pdf');
}

function exportToExcel() {
    if (reportData.length === 0) {
        alert('Please generate a report first');
        return;
    }

    const table = document.getElementById('reportTable');
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => {
            // Replace ₹ with Rs. for better Excel compatibility
            return td.textContent.replace(/₹/g, 'Rs.');
        })
    );

    // Create CSV content with proper escaping
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => {
            // Escape quotes and wrap in quotes
            const escaped = cell.replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(',') + '\n';
    });

    // Add UTF-8 BOM for proper encoding in Excel
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;

    // Create download link
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'expense-report.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
