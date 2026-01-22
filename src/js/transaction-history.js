import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { checkAndShowAdminNav } from './admin-utils.js';
import './auth-guard.js';

// Global state
let allTransactions = [];
let filteredTransactions = [];
let currentPage = 1;
const itemsPerPage = 20;

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login.html';
        return;
    }
    
    await checkAndShowAdminNav(user);
    await loadTransactions(user.uid);
    setupEventListeners();
});

// Load all user transactions
async function loadTransactions(userId) {
    try {
        const q = query(
            collection(db, "transactions"),
            where("memberId", "==", userId),
            orderBy("transDate", "desc")
        );
        
        const snapshot = await getDocs(q);
        allTransactions = [];
        
        snapshot.forEach(doc => {
            allTransactions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        filteredTransactions = [...allTransactions];
        updateSummary();
        renderTransactions();
        
        document.getElementById('loading-state').classList.add('hidden');
        
        if (allTransactions.length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
        } else {
            document.getElementById('transactions-table').classList.remove('hidden');
        }
        
    } catch (error) {
        console.error("Error loading transactions:", error);
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
    }
}

// Update summary cards
function updateSummary() {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let pendingCount = 0;
    
    allTransactions.forEach(tx => {
        if (tx.status === 'approved') {
            if (tx.type === 'deposit') {
                totalDeposits += tx.amount || 0;
            } else if (tx.type === 'withdraw') {
                totalWithdrawals += tx.amount || 0;
            }
        }
        
        if (tx.status === 'pending') {
            pendingCount++;
        }
    });
    
    document.getElementById('total-deposits').textContent = formatCurrency(totalDeposits);
    document.getElementById('total-withdrawals').textContent = formatCurrency(totalWithdrawals);
    document.getElementById('total-pending').textContent = pendingCount;
}

// Render transactions with pagination
function renderTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    tbody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredTransactions.length);
    const pageTransactions = filteredTransactions.slice(startIndex, endIndex);
    
    pageTransactions.forEach(tx => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';
        
        const date = tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : '-';
        
        const isDeposit = tx.type === 'deposit';
        const typeClass = isDeposit ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
        const typeIcon = isDeposit ? 'arrow-down-left' : 'arrow-up-right';
        
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';
        
        switch(tx.status) {
            case 'pending':
                statusClass = 'text-orange-600 bg-orange-50';
                statusIcon = 'clock';
                statusText = 'Pending';
                break;
            case 'approved':
                statusClass = 'text-green-600 bg-green-50';
                statusIcon = 'check-circle';
                statusText = 'Approved';
                break;
            case 'rejected':
                statusClass = 'text-red-600 bg-red-50';
                statusIcon = 'x-circle';
                statusText = 'Rejected';
                break;
            default:
                statusClass = 'text-gray-600 bg-gray-50';
                statusIcon = 'help-circle';
                statusText = tx.status || 'Unknown';
        }
        
        row.innerHTML = `
            <td class="p-3 text-sm">${date}</td>
            <td class="p-3">
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${typeClass} text-xs font-medium capitalize">
                    <i data-lucide="${typeIcon}" class="w-3 h-3"></i>
                    ${tx.type}
                </span>
            </td>
            <td class="p-3 text-sm font-bold text-right ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
            </td>
            <td class="p-3">
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${statusClass} text-xs font-medium">
                    <i data-lucide="${statusIcon}" class="w-3 h-3"></i>
                    ${statusText}
                </span>
            </td>
            <td class="p-3 text-sm text-muted">${tx.note || '-'}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    if (window.lucide) window.lucide.createIcons();
    
    updatePagination();
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredTransactions.length);
    
    document.getElementById('showing-from').textContent = filteredTransactions.length > 0 ? startIndex : 0;
    document.getElementById('showing-to').textContent = endIndex;
    document.getElementById('total-count').textContent = filteredTransactions.length;
    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage >= totalPages;
}

// Apply filters
function applyFilters() {
    const statusFilter = document.getElementById('filter-status').value;
    const typeFilter = document.getElementById('filter-type').value;
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    filteredTransactions = allTransactions.filter(tx => {
        // Status filter
        if (statusFilter !== 'all' && tx.status !== statusFilter) {
            return false;
        }
        
        // Type filter
        if (typeFilter !== 'all' && tx.type !== typeFilter) {
            return false;
        }
        
        // Search filter
        if (searchTerm) {
            const amountStr = (tx.amount || 0).toString();
            const noteStr = (tx.note || '').toLowerCase();
            
            if (!amountStr.includes(searchTerm) && !noteStr.includes(searchTerm)) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTransactions();
    
    // Show/hide empty state
    if (filteredTransactions.length === 0) {
        document.getElementById('transactions-table').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
    } else {
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('transactions-table').classList.remove('hidden');
    }
}

// Clear all filters
function clearFilters() {
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-type').value = 'all';
    document.getElementById('search-input').value = '';
    applyFilters();
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
    
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTransactions();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    document.getElementById('next-page-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTransactions();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// Logout
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (e) {
            console.error(e);
        }
    });
}

// Utility
function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}
