import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, runTransaction, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';

// Global state
let currentUser = null;
let allMembers = [];
let allTransactions = [];
let pendingTransactions = [];

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login.html';
        return;
    }
    
    const isAdmin = await checkAdminRole(user);
    if (!isAdmin) {
        alert('Access Denied: Admin privileges required');
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = user;
    initializeTabs();
    loadOverviewTab();
    loadPendingTab();
});

// Check Admin Role
async function checkAdminRole(user) {
    if (user.email.toLowerCase().includes('admin')) {
        return true;
    }
    
    try {
        const memberDoc = await getDoc(doc(db, "members", user.uid));
        if (memberDoc.exists()) {
            const data = memberDoc.data();
            return data.role === 'admin';
        }
    } catch (e) {
        console.error("Error checking admin role:", e);
    }
    
    return false;
}

// ============================================
// TAB SYSTEM
// ============================================

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById(`tab-${tabName}-content`);
    if (targetContent) {
        targetContent.classList.add('active');
    }
    
    // Load tab-specific content (always reload to ensure it's populated)
    switch(tabName) {
        case 'overview':
            loadOverviewTab();
            break;
        case 'pending':
            loadPendingTab();
            break;
        case 'members':
            loadMembersTab();
            break;
        case 'reports':
            loadReportsTab();
            break;
        case 'settings':
            loadSettingsTab();
            break;
    }
    
    if (window.lucide) window.lucide.createIcons();
}

// ============================================
// OVERVIEW TAB
// ============================================

async function loadOverviewTab() {
    const container = document.getElementById('tab-overview-content');
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="card hover:shadow-lg transition-shadow">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted mb-1">Total Members</p>
                        <h3 id="stat-members" class="text-2xl font-bold text-main">-</h3>
                    </div>
                    <div class="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                        <i data-lucide="users" class="w-6 h-6 text-primary"></i>
                    </div>
                </div>
            </div>

            <div class="card hover:shadow-lg transition-shadow">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted mb-1">Total Fund Balance</p>
                        <h3 id="stat-total-balance" class="text-2xl font-bold text-green-600">-</h3>
                    </div>
                    <div class="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                        <i data-lucide="wallet" class="w-6 h-6 text-green-600"></i>
                    </div>
                </div>
            </div>

            <div class="card hover:shadow-lg transition-shadow">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted mb-1">Dividends Paid (This Year)</p>
                        <h3 id="stat-dividends" class="text-2xl font-bold text-purple-600">-</h3>
                    </div>
                    <div class="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
                        <i data-lucide="trending-up" class="w-6 h-6 text-purple-600"></i>
                    </div>
                </div>
            </div>

            <div class="card hover:shadow-lg transition-shadow">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted mb-1">Pending Transactions</p>
                        <h3 id="stat-pending" class="text-2xl font-bold text-orange-600">-</h3>
                    </div>
                    <div class="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center">
                        <i data-lucide="clock" class="w-6 h-6 text-orange-600"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="card bg-green-50 border-green-200">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <i data-lucide="arrow-down-left" class="w-5 h-5 text-white"></i>
                    </div>
                    <div>
                        <p class="text-xs text-green-700">This Month Deposits</p>
                        <p id="stat-month-deposits" class="text-lg font-bold text-green-800">-</p>
                    </div>
                </div>
            </div>

            <div class="card bg-red-50 border-red-200">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                        <i data-lucide="arrow-up-right" class="w-5 h-5 text-white"></i>
                    </div>
                    <div>
                        <p class="text-xs text-red-700">This Month Withdrawals</p>
                        <p id="stat-month-withdrawals" class="text-lg font-bold text-red-800">-</p>
                    </div>
                </div>
            </div>

            <div class="card bg-blue-50 border-blue-200">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <i data-lucide="activity" class="w-5 h-5 text-white"></i>
                    </div>
                    <div>
                        <p class="text-xs text-blue-700">Net Change</p>
                        <p id="stat-net-change" class="text-lg font-bold text-blue-800">-</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    await loadStatistics();
}

async function loadStatistics() {
    try {
        // 1. Total Members
        const membersSnapshot = await getDocs(collection(db, "members"));
        const totalMembers = membersSnapshot.size;
        document.getElementById('stat-members').textContent = totalMembers;

        // 2. Total Fund Balance
        let totalBalance = 0;
        membersSnapshot.forEach(doc => {
            const data = doc.data();
            totalBalance += data.Balance || 0;
        });
        document.getElementById('stat-total-balance').textContent = formatCurrency(totalBalance);

        // 3. Total Dividends Paid This Year
        const currentYear = new Date().getFullYear();
        const dividendsQuery = query(
            collection(db, "dividends"),
            where("year", "==", currentYear)
        );
        const dividendsSnapshot = await getDocs(dividendsQuery);
        let totalDividends = 0;
        dividendsSnapshot.forEach(doc => {
            const data = doc.data();
            totalDividends += data.amount || 0;
        });
        document.getElementById('stat-dividends').textContent = formatCurrency(totalDividends);

        // 4. This Month Transactions
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const transactionsSnapshot = await getDocs(collection(db, "transactions"));
        let monthDeposits = 0;
        let monthWithdrawals = 0;
        
        transactionsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.transDate && data.status === 'approved') {
                const txDate = data.transDate.toDate();
                if (txDate >= firstDayOfMonth) {
                    if (data.type === 'deposit') {
                        monthDeposits += data.amount || 0;
                    } else if (data.type === 'withdraw') {
                        monthWithdrawals += data.amount || 0;
                    }
                }
            }
        });

        document.getElementById('stat-month-deposits').textContent = formatCurrency(monthDeposits);
        document.getElementById('stat-month-withdrawals').textContent = formatCurrency(monthWithdrawals);
        
        const netChange = monthDeposits - monthWithdrawals;
        const netChangeEl = document.getElementById('stat-net-change');
        netChangeEl.textContent = formatCurrency(Math.abs(netChange));
        netChangeEl.className = `text-lg font-bold ${netChange >= 0 ? 'text-green-800' : 'text-red-800'}`;

    } catch (error) {
        console.error("Error loading statistics:", error);
    }
}

// ============================================
// PENDING TRANSACTIONS TAB
// ============================================

function loadPendingTab() {
    const container = document.getElementById('tab-pending-content');
    
    container.innerHTML = `
        <div class="card mb-6">
            <div class="flex items-center gap-4">
                <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Quick Find by Transaction ID</label>
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"></i>
                            <input 
                                type="text" 
                                id="qr-search" 
                                class="input-field pl-10" 
                                placeholder="Paste or scan Transaction ID..."
                            />
                        </div>
                        <button id="clear-search-btn" class="btn btn-outline">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="mb-4">
                <h3 class="text-lg font-bold">Pending Transactions</h3>
            </div>

            <div id="pending-loading-state" class="text-center py-12">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-primary mb-2"></i>
                <p class="text-muted">Loading transactions...</p>
            </div>

            <div id="pending-empty-state" class="hidden text-center py-12">
                <i data-lucide="check-circle" class="w-16 h-16 mx-auto text-green-500 mb-4"></i>
                <p class="text-muted">No pending transactions</p>
            </div>

            <div id="pending-transactions-table" class="hidden overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="text-left p-3 text-sm font-medium text-muted">Date</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Member</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Type</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">Amount</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Transaction ID</th>
                            <th class="text-center p-3 text-sm font-medium text-muted">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="pending-transactions-tbody">
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Setup event listeners
    document.getElementById('qr-search').addEventListener('input', handleQRSearch);
    document.getElementById('clear-search-btn').addEventListener('click', clearSearch);
    
    // Load pending transactions
    loadPendingTransactions();
    
    // Inject modals
    injectModals();
}

function loadPendingTransactions() {
    const q = query(
        collection(db, "transactions"),
        where("status", "==", "pending")
    );

    onSnapshot(q, async (snapshot) => {
        const loadingState = document.getElementById('pending-loading-state');
        const emptyState = document.getElementById('pending-empty-state');
        const table = document.getElementById('pending-transactions-table');
        const tbody = document.getElementById('pending-transactions-tbody');
        
        if (!tbody) return;

        if (snapshot.empty) {
            if (loadingState) loadingState.classList.add('hidden');
            if (table) table.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            updatePendingCount(0);
            return;
        }

        const transactions = [];
        for (const docSnap of snapshot.docs) {
            const txData = { id: docSnap.id, ...docSnap.data() };
            
            try {
                const memberDoc = await getDoc(doc(db, "members", txData.memberId));
                if (memberDoc.exists()) {
                    txData.memberName = memberDoc.data().Full_Name || 'Unknown';
                    txData.memberData = memberDoc.data();
                } else {
                    txData.memberName = 'Unknown Member';
                }
            } catch (e) {
                console.error("Error fetching member:", e);
                txData.memberName = 'Error Loading';
            }
            
            transactions.push(txData);
        }

        transactions.sort((a, b) => {
            const tA = a.transDate ? a.transDate.seconds : 0;
            const tB = b.transDate ? b.transDate.seconds : 0;
            return tB - tA;
        });

        pendingTransactions = transactions;
        renderPendingTransactions(transactions, tbody);
        
        if (loadingState) loadingState.classList.add('hidden');
        if (emptyState) emptyState.classList.add('hidden');
        if (table) table.classList.remove('hidden');
        
        updatePendingCount(transactions.length);
        
        if (window.lucide) window.lucide.createIcons();
    });
}

function renderPendingTransactions(transactions, tbody) {
    tbody.innerHTML = '';

    transactions.forEach(tx => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';
        row.dataset.txId = tx.id;
        
        const date = tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        const isDeposit = tx.type === 'deposit';
        const typeClass = isDeposit ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
        const typeIcon = isDeposit ? 'arrow-down-left' : 'arrow-up-right';
        
        row.innerHTML = `
            <td class="p-3 text-sm">${date}</td>
            <td class="p-3 text-sm font-medium">${tx.memberName}</td>
            <td class="p-3">
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${typeClass} text-xs font-medium capitalize">
                    <i data-lucide="${typeIcon}" class="w-3 h-3"></i>
                    ${tx.type}
                </span>
            </td>
            <td class="p-3 text-sm font-bold text-right ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
            </td>
            <td class="p-3 text-xs text-muted font-mono">${tx.id.substring(0, 12)}...</td>
            <td class="p-3">
                <div class="flex items-center justify-center gap-2">
                    <button class="approve-btn btn btn-success px-3 py-1 text-sm" data-tx-id="${tx.id}">
                        <i data-lucide="check" class="w-4 h-4"></i>
                        Approve
                    </button>
                    <button class="reject-btn btn btn-danger px-3 py-1 text-sm" data-tx-id="${tx.id}">
                        <i data-lucide="x" class="w-4 h-4"></i>
                        Reject
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });

    // Attach event listeners
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.txId;
            const tx = pendingTransactions.find(t => t.id === txId);
            showConfirmModal('approve', tx);
        });
    });

    document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const txId = e.currentTarget.dataset.txId;
            const tx = pendingTransactions.find(t => t.id === txId);
            showConfirmModal('reject', tx);
        });
    });
}

function updatePendingCount(count) {
    const elements = [
        document.getElementById('pending-count'),
        document.getElementById('tab-pending-count'),
        document.getElementById('stat-pending')
    ];
    
    elements.forEach(el => {
        if (el) el.textContent = count;
    });
}

function handleQRSearch(e) {
    const searchTerm = e.target.value.trim().toLowerCase();
    
    document.querySelectorAll('tr[data-tx-id]').forEach(row => {
        if (!searchTerm) {
            row.classList.remove('bg-yellow-50', 'ring-2', 'ring-yellow-400');
            return;
        }
        
        const txId = row.dataset.txId.toLowerCase();
        if (txId.includes(searchTerm)) {
            row.classList.add('bg-yellow-50', 'ring-2', 'ring-yellow-400');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            row.classList.remove('bg-yellow-50', 'ring-2', 'ring-yellow-400');
        }
    });
}

function clearSearch() {
    const searchInput = document.getElementById('qr-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('tr[data-tx-id]').forEach(row => {
        row.classList.remove('bg-yellow-50', 'ring-2', 'ring-yellow-400');
    });
}

// Approval/Rejection Logic
let currentAction = null;

function showConfirmModal(action, tx) {
    const modal = document.getElementById('confirm-modal');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    
    if (!modal) return;

    currentAction = { action, tx };

    if (action === 'approve') {
        modalIcon.className = 'w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4';
        modalIcon.innerHTML = '<i data-lucide="check-circle" class="w-8 h-8"></i>';
        modalTitle.textContent = 'Approve Transaction';
        modalMessage.textContent = `Approve ${tx.type} of ${formatCurrency(tx.amount)} for ${tx.memberName}?`;
        modalConfirmBtn.className = 'btn btn-success w-full';
        modalConfirmBtn.textContent = 'Approve';
    } else {
        modalIcon.className = 'w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4';
        modalIcon.innerHTML = '<i data-lucide="x-circle" class="w-8 h-8"></i>';
        modalTitle.textContent = 'Reject Transaction';
        modalMessage.textContent = `Reject ${tx.type} of ${formatCurrency(tx.amount)} for ${tx.memberName}?`;
        modalConfirmBtn.className = 'btn btn-danger w-full';
        modalConfirmBtn.textContent = 'Reject';
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

async function approveTransaction(tx) {
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    try {
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Processing...';

        await runTransaction(db, async (transaction) => {
            const txRef = doc(db, "transactions", tx.id);
            const memberRef = doc(db, "members", tx.memberId);

            const memberDoc = await transaction.get(memberRef);
            if (!memberDoc.exists()) {
                throw new Error("Member not found");
            }

            const currentBalance = memberDoc.data().Balance || 0;
            const newBalance = tx.type === 'deposit' 
                ? currentBalance + tx.amount 
                : currentBalance - tx.amount;

            transaction.update(txRef, {
                status: 'approved',
                approvedBy: currentUser.uid,
                approvedAt: new Date()
            });

            transaction.update(memberRef, {
                Balance: newBalance
            });
        });

        hideConfirmModal();
        showSuccessMessage('Transaction approved successfully!');
    } catch (error) {
        console.error("Error approving transaction:", error);
        alert("Failed to approve transaction: " + error.message);
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = 'Approve';
    }
}

async function rejectTransaction(tx) {
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    try {
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Processing...';

        const txRef = doc(db, "transactions", tx.id);
        await updateDoc(txRef, {
            status: 'rejected',
            rejectedBy: currentUser.uid,
            rejectedAt: new Date()
        });

        hideConfirmModal();
        showSuccessMessage('Transaction rejected');
    } catch (error) {
        console.error("Error rejecting transaction:", error);
        alert("Failed to reject transaction: " + error.message);
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = 'Reject';
    }
}

function hideConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    currentAction = null;
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    if (modalConfirmBtn) modalConfirmBtn.disabled = false;
}

function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-white border-l-4 border-green-500 px-6 py-4 rounded-lg shadow-2xl z-[200] animate-fade-in flex items-center gap-3 max-w-md';
    toast.innerHTML = `
        <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <i data-lucide="check" class="w-5 h-5 text-white"></i>
        </div>
        <div class="flex-1">
            <p class="font-bold text-green-800">Success!</p>
            <p class="text-sm text-gray-600">${message}</p>
        </div>
        <button class="close-toast w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <i data-lucide="x" class="w-4 h-4 text-gray-400"></i>
        </button>
    `;
    document.body.appendChild(toast);
    
    if (window.lucide) window.lucide.createIcons();
    
    const closeBtn = toast.querySelector('.close-toast');
    closeBtn.addEventListener('click', () => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    });
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// MEMBERS TAB
// ============================================

async function loadMembersTab() {
    const container = document.getElementById('tab-members-content');
    
    container.innerHTML = `
        <div class="card mb-6">
            <div class="flex items-center gap-4">
                <div class="flex-1">
                    <label class="text-sm font-medium mb-2 block">Search Members</label>
                    <div class="relative">
                        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"></i>
                        <input 
                            type="text" 
                            id="member-search" 
                            class="input-field pl-10" 
                            placeholder="Search by name, ID, or phone..."
                        />
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="mb-4">
                <h3 class="text-lg font-bold">All Members</h3>
            </div>

            <div id="members-loading-state" class="text-center py-12">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-primary mb-2"></i>
                <p class="text-muted">Loading members...</p>
            </div>

            <div id="members-table" class="hidden overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="text-left p-3 text-sm font-medium text-muted">Member ID</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Full Name</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Phone</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">Balance</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">Reg. Date</th>
                            <th class="text-center p-3 text-sm font-medium text-muted">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="members-tbody">
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    document.getElementById('member-search').addEventListener('input', handleMemberSearch);
    
    await loadAllMembers();
}

async function loadAllMembers() {
    try {
        const membersSnapshot = await getDocs(collection(db, "members"));
        allMembers = [];
        
        membersSnapshot.forEach(doc => {
            allMembers.push({ id: doc.id, ...doc.data() });
        });
        
        allMembers.sort((a, b) => {
            const nameA = a.Full_Name || '';
            const nameB = b.Full_Name || '';
            return nameA.localeCompare(nameB);
        });
        
        renderMembers(allMembers);
        
        const loadingState = document.getElementById('members-loading-state');
        const table = document.getElementById('members-table');
        if (loadingState) loadingState.classList.add('hidden');
        if (table) table.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        console.error("Error loading members:", error);
    }
}

function renderMembers(members) {
    const tbody = document.getElementById('members-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    members.forEach(member => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';
        row.dataset.memberId = member.id;
        
        const regDate = member.Reg_Date ? new Date(member.Reg_Date.seconds * 1000).toLocaleDateString('th-TH') : '-';
        
        row.innerHTML = `
            <td class="p-3 text-sm font-mono text-muted">${member.id.substring(0, 8)}...</td>
            <td class="p-3 text-sm font-medium">${member.Full_Name || '-'}</td>
            <td class="p-3 text-sm">${member.Phone || '-'}</td>
            <td class="p-3 text-sm font-bold text-right text-green-600">${formatCurrency(member.Balance || 0)}</td>
            <td class="p-3 text-sm">${regDate}</td>
            <td class="p-3">
                <div class="flex items-center justify-center gap-2">
                    <button class="view-member-btn btn btn-outline px-3 py-1 text-sm" data-member-id="${member.id}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                        View
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    document.querySelectorAll('.view-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.currentTarget.dataset.memberId;
            const member = allMembers.find(m => m.id === memberId);
            showMemberModal(member);
        });
    });
}

function handleMemberSearch(e) {
    const searchTerm = e.target.value.trim().toLowerCase();
    
    if (!searchTerm) {
        renderMembers(allMembers);
        return;
    }
    
    const filtered = allMembers.filter(member => {
        const name = (member.Full_Name || '').toLowerCase();
        const phone = (member.Phone || '').toLowerCase();
        const id = member.id.toLowerCase();
        
        return name.includes(searchTerm) || phone.includes(searchTerm) || id.includes(searchTerm);
    });
    
    renderMembers(filtered);
}

async function showMemberModal(member) {
    // Fetch member's dividends
    let totalDividends = 0;
    let dividendHistory = [];
    
    try {
        const dividendsQuery = query(
            collection(db, "dividends"),
            where("memberId", "==", member.id)
        );
        const dividendsSnapshot = await getDocs(dividendsQuery);
        
        dividendsSnapshot.forEach(doc => {
            const data = doc.data();
            totalDividends += data.amount || 0;
            dividendHistory.push({
                year: data.year,
                amount: data.amount || 0,
                date: data.distributedAt
            });
        });
        
        // Sort by year descending
        dividendHistory.sort((a, b) => b.year - a.year);
    } catch (error) {
        console.error("Error fetching dividends:", error);
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in';
    modal.id = 'member-modal';
    
    const dividendHistoryHTML = dividendHistory.length > 0 
        ? dividendHistory.slice(0, 3).map(d => `
            <div class="flex justify-between items-center py-2 border-b border-purple-100 last:border-0">
                <span class="text-sm text-muted">Year ${d.year}</span>
                <span class="font-bold text-purple-600">${formatCurrency(d.amount)}</span>
            </div>
        `).join('')
        : '<p class="text-sm text-muted text-center py-2">No dividend history</p>';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-popup max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-main">Member Details</h3>
                <button class="close-member-modal w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <div class="space-y-4">
                <div class="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                    <div class="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                        ${(member.Full_Name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p class="font-bold text-lg">${member.Full_Name || 'Unknown'}</p>
                        <p class="text-sm text-muted font-mono">${member.id.substring(0, 12)}...</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-muted mb-1">Phone</p>
                        <p class="font-medium">${member.Phone || '-'}</p>
                    </div>
                    <div class="p-3 bg-green-50 rounded-lg">
                        <p class="text-xs text-green-700 mb-1">Balance</p>
                        <p class="font-bold text-green-600">${formatCurrency(member.Balance || 0)}</p>
                    </div>
                </div>
                
                <div class="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <i data-lucide="trending-up" class="w-5 h-5 text-purple-600"></i>
                            <p class="text-sm font-bold text-purple-800">Total Dividends</p>
                        </div>
                        <p class="text-lg font-bold text-purple-600">${formatCurrency(totalDividends)}</p>
                    </div>
                    ${dividendHistory.length > 0 ? `
                        <div class="mt-3 pt-3 border-t border-purple-200">
                            <p class="text-xs text-purple-700 mb-2 font-medium">Recent History</p>
                            ${dividendHistoryHTML}
                        </div>
                    ` : ''}
                </div>
                
                <div class="p-3 bg-gray-50 rounded-lg">
                    <p class="text-xs text-muted mb-1">Address</p>
                    <p class="font-medium">${member.Address || 'Not provided'}</p>
                </div>
                
                <div class="p-3 bg-gray-50 rounded-lg">
                    <p class="text-xs text-muted mb-1">Registration Date</p>
                    <p class="font-medium">${member.Reg_Date ? new Date(member.Reg_Date.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
                </div>
            </div>
            
            <div class="mt-6 flex gap-2">
                <button class="close-member-modal btn btn-outline w-full">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
    
    // Close handlers
    modal.querySelectorAll('.close-member-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// ============================================
// REPORTS TAB
// ============================================

function loadReportsTab() {
    const container = document.getElementById('tab-reports-content');
    
    container.innerHTML = `
        <div class="card">
            <h3 class="text-lg font-bold mb-4">Generate Reports</h3>
            <p class="text-muted mb-6">Select a report type to generate and export</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="file-text" class="w-6 h-6 text-primary"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">Transaction History</h4>
                            <p class="text-sm text-muted">All transactions with filters</p>
                        </div>
                    </div>
                </button>
                
                <button class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="users" class="w-6 h-6 text-green-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">Member List</h4>
                            <p class="text-sm text-muted">All members with balances</p>
                        </div>
                    </div>
                </button>
                
                <button class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="trending-up" class="w-6 h-6 text-purple-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">Dividend Summary</h4>
                            <p class="text-sm text-muted">Dividend distribution report</p>
                        </div>
                    </div>
                </button>
                
                <button class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="calendar" class="w-6 h-6 text-orange-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">Monthly Activity</h4>
                            <p class="text-sm text-muted">Monthly summary report</p>
                        </div>
                    </div>
                </button>
            </div>
            
            <div class="mt-6 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm text-blue-800">
                    <i data-lucide="info" class="w-4 h-4 inline mr-2"></i>
                    Reports feature coming soon! You'll be able to export data as CSV and PDF.
                </p>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
}

// ============================================
// SETTINGS TAB
// ============================================

async function loadSettingsTab() {
    const container = document.getElementById('tab-settings-content');
    
    container.innerHTML = `
        <div class="card">
            <h3 class="text-lg font-bold mb-4">Fund Settings</h3>
            <p class="text-muted mb-6">Configure fund parameters and dividend calculations</p>
            
            <form id="settings-form" class="space-y-4">
                <div class="input-group">
                    <label>Fiscal Year</label>
                    <input type="number" id="setting-year" class="input-field" placeholder="2026" />
                </div>
                
                <div class="input-group">
                    <label>Dividend Rate (%)</label>
                    <input type="number" step="0.01" id="setting-rate" class="input-field" placeholder="5.0" />
                </div>
                
                <div class="input-group">
                    <label>Net Profit (THB)</label>
                    <input type="number" id="setting-profit" class="input-field" placeholder="100000" />
                </div>
                
                <div class="input-group">
                    <label>Minimum Balance for Dividend (THB)</label>
                    <input type="number" id="setting-min-balance" class="input-field" placeholder="1000" />
                </div>
                
                <div class="input-group">
                    <label>Membership Duration Requirement (months)</label>
                    <input type="number" id="setting-min-months" class="input-field" placeholder="12" />
                </div>
                
                <button type="submit" class="btn btn-primary w-full">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    Save Settings
                </button>
            </form>
            
            <div id="settings-message" class="mt-4 hidden"></div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Load current settings
    await loadFundSettings();
    
    // Setup form handler
    document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
}

async function loadFundSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, "system", "fund_status"));
        
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            document.getElementById('setting-year').value = data.year || new Date().getFullYear();
            document.getElementById('setting-rate').value = data.rate || 0;
            document.getElementById('setting-profit').value = data.profit || 0;
            document.getElementById('setting-min-balance').value = data.minBalance || 1000;
            document.getElementById('setting-min-months').value = data.minMonths || 12;
        }
    } catch (error) {
        console.error("Error loading settings:", error);
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    
    const settings = {
        year: parseInt(document.getElementById('setting-year').value),
        rate: parseFloat(document.getElementById('setting-rate').value),
        profit: parseFloat(document.getElementById('setting-profit').value),
        minBalance: parseFloat(document.getElementById('setting-min-balance').value),
        minMonths: parseInt(document.getElementById('setting-min-months').value),
        updatedAt: new Date(),
        updatedBy: currentUser.uid
    };
    
    try {
        await setDoc(doc(db, "system", "fund_status"), settings, { merge: true });
        
        const messageDiv = document.getElementById('settings-message');
        messageDiv.className = 'mt-4 p-4 bg-green-50 text-green-800 rounded-lg';
        messageDiv.textContent = 'Settings saved successfully!';
        messageDiv.classList.remove('hidden');
        
        setTimeout(() => {
            messageDiv.classList.add('hidden');
        }, 3000);
    } catch (error) {
        console.error("Error saving settings:", error);
        const messageDiv = document.getElementById('settings-message');
        messageDiv.className = 'mt-4 p-4 bg-red-50 text-red-800 rounded-lg';
        messageDiv.textContent = 'Failed to save settings: ' + error.message;
        messageDiv.classList.remove('hidden');
    }
}

// ============================================
// MODALS
// ============================================

function injectModals() {
    const modalsContainer = document.getElementById('modals-container');
    if (!modalsContainer) return;
    
    modalsContainer.innerHTML = `
        <div id="confirm-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div class="text-center">
                    <div id="modal-icon" class="w-16 h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="alert-circle" class="w-8 h-8"></i>
                    </div>
                    <h3 id="modal-title" class="text-xl font-bold mb-2">Confirm Action</h3>
                    <p id="modal-message" class="text-muted text-sm mb-6">Are you sure?</p>
                    
                    <div class="flex gap-2">
                        <button id="modal-cancel-btn" class="btn btn-outline w-full">
                            Cancel
                        </button>
                        <button id="modal-confirm-btn" class="btn btn-primary w-full">
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-cancel-btn').addEventListener('click', hideConfirmModal);
    document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
        if (!currentAction) return;

        if (currentAction.action === 'approve') {
            await approveTransaction(currentAction.tx);
        } else {
            await rejectTransaction(currentAction.tx);
        }
    });
}

// ============================================
// LOGOUT
// ============================================

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

// ============================================
// UTILITIES
// ============================================

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}
