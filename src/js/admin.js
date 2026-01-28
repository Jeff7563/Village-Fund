import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, runTransaction, getDocs, setDoc, addDoc, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';
import './modal-system.js';

// Global state
let currentUser = null;
let allMembers = [];
let allTransactions = [];
let pendingTransactions = [];
let unsubscribePending = null;
let selectedTransactions = new Set();

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login.html';
        return;
    }
    
    const isAdmin = await checkAdminRole(user);
    if (!isAdmin) {
        showAlert('Access Denied: Admin privileges required', 'error'); return;
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = user;
    initializeTabs();
    loadOverviewTab();
    loadPendingTab();
    injectModals();
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
        case 'dividend':
            loadDividendTab();
            break;
        case 'reports':
            loadReportsTab();
            break;
        case 'activity-log':
            loadActivityLogTab();
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
    console.log("Loading Overview Tab...");
    try {
        const container = document.getElementById('tab-overview-content');
        if (!container) {
            console.error("Overview container not found!");
            return;
        }
        
        container.innerHTML = `
            <!-- Confirm Modal -->
            <div class="grid grid-cols-1 gap-6 mb-6 animate-fade-in">
                <div class="card">
                    <h3 class="font-bold mb-4 text-gray-800 flex items-center gap-2">
                        <i data-lucide="bar-chart-2" class="w-4 h-4 text-primary"></i>
                        กิจกรรมธุรกรรม (6 เดือนล่าสุด)
                    </h3>
                    <div class="relative h-64">
                        <canvas id="chart-volume"></canvas>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="card hover:shadow-lg transition-shadow">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted mb-1">สมาชิกทั้งหมด</p>
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
                            <p class="text-sm text-muted mb-1">ยอดเงินออมทรัพย์รวม</p>
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
                            <p class="text-sm text-muted mb-1">เงินปันผลที่จ่าย (ปีนี้)</p>
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
                            <p class="text-sm text-muted mb-1">ธุรกรรมรอตรวจสอบ</p>
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
                            <p class="text-xs text-green-700">ยอดฝากเดือนนี้</p>
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
                            <p class="text-xs text-red-700">ยอดถอนเดือนนี้</p>
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
                            <p class="text-xs text-blue-700">การเปลี่ยนแปลงสุทธิ</p>
                            <p id="stat-net-change" class="text-lg font-bold text-blue-800">-</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mt-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-800">ธุรกรรมล่าสุด</h3>
                    <div class="flex gap-2">
                         <button onclick="console.log('Reloading...'); loadOverviewTab();" class="text-xs text-muted hover:text-primary">
                            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                        </button>
                        <button onclick="switchTab('pending')" class="text-primary text-sm hover:underline">ดูทั้งหมด</button>
                    </div>
                </div>
                
                <!-- Desktop Table -->
                <div class="hidden md:block overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-gray-200">
                                <th class="text-left p-3 text-sm font-medium text-muted">วันที่</th>
                                <th class="text-left p-3 text-sm font-medium text-muted">สมาชิก</th>
                                <th class="text-left p-3 text-sm font-medium text-muted">ประเภท</th>
                                <th class="text-right p-3 text-sm font-medium text-muted">จำนวนเงิน</th>
                                <th class="text-center p-3 text-sm font-medium text-muted">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody id="recent-transactions-tbody">
                             <tr><td colspan="5" class="p-4 text-center text-muted">กำลังโหลด...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Mobile List -->
                <div id="recent-transactions-mobile" class="md:hidden space-y-4">
                     <div class="text-center py-4 text-muted">กำลังโหลด...</div>
                </div>
            </div>
        `;
        
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        try {
            await loadStatistics();
        } catch(statErr) {
            console.error("Error loading statistics:", statErr);
        }
        
        // Add delay to ensure DOM is ready and Chart.js is loaded
        setTimeout(() => {
            if (typeof renderCharts === 'function') renderCharts();
            if (typeof subscribeToRecentTransactions === 'function' && typeof renderRecentTransactions === 'function') {
                subscribeToRecentTransactions(renderRecentTransactions);
            } else {
                console.error("Missing helper functions for transactions table");
            }
        }, 100);

    } catch (e) {
        console.error("CRITICAL ERROR in loadOverviewTab:", e);
        const container = document.getElementById('tab-overview-content');
        if(container) {
             container.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded">Error loading dashboard: ${e.message}</div>`;
        }
    }
}






// Helper to render recent transactions
function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('recent-transactions-tbody');
    const mobileList = document.getElementById('recent-transactions-mobile');
    
    if (!tbody || !mobileList) return;

    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-muted">ไม่มีรายการล่าสุด</td></tr>`;
        mobileList.innerHTML = `<div class="text-center py-4 text-muted">ไม่มีรายการล่าสุด</div>`;
        return;
    }

    // 1. Desktop Render
    tbody.innerHTML = transactions.map(tx => {
        const date = tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        const isDeposit = tx.type === 'deposit';
        const typeClass = isDeposit ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
        const typeIcon = isDeposit ? 'arrow-down-left' : 'arrow-up-right';
        const typeThai = isDeposit ? 'ฝาก' : 'ถอน';
        
        let statusBadge = '';
        if (tx.status === 'pending') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-600">รอตรวจสอบ</span>`;
        else if (tx.status === 'approved' || tx.status === 'success') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-600">สำเร็จ</span>`;
        else if (tx.status === 'rejected') statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600">ปฏิเสธ</span>`;

        return `
            <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td class="p-3 text-sm">${date}</td>
                <td class="p-3 text-sm font-medium">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                            ${(tx.memberName || '?').charAt(0)}
                        </div>
                        <span class="truncate max-w-[100px]">${tx.memberName || 'Unknown'}</span>
                    </div>
                </td>
                <td class="p-3">
                     <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${typeClass} text-[10px] font-medium">
                        <i data-lucide="${typeIcon}" class="w-3 h-3"></i> ${typeThai}
                    </span>
                </td>
                <td class="p-3 text-right font-bold text-sm ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                    ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
                </td>
                <td class="p-3 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');

    // 2. Mobile Render
    mobileList.innerHTML = transactions.map(tx => {
        const date = tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        const isDeposit = tx.type === 'deposit';
        const typeClass = isDeposit ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
        const typeThai = isDeposit ? 'ฝาก' : 'ถอน';

        let statusBadge = '';
        if (tx.status === 'pending') statusBadge = `<span class="px-2 py-1 rounded text-xs bg-orange-100 text-orange-600 font-medium">รอตรวจสอบ</span>`;
        else if (tx.status === 'approved' || tx.status === 'success') statusBadge = `<span class="px-2 py-1 rounded text-xs bg-green-100 text-green-600 font-medium">สำเร็จ</span>`;
        else if (tx.status === 'rejected') statusBadge = `<span class="px-2 py-1 rounded text-xs bg-red-100 text-red-600 font-medium">ปฏิเสธ</span>`;

        return `
            <div class="card p-3 border border-gray-100 shadow-sm mb-2">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
                             ${(tx.memberName || '?').charAt(0)}
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-gray-900">${tx.memberName || 'Unknown'}</h4>
                            <p class="text-xs text-muted">${date}</p>
                        </div>
                    </div>
                    ${statusBadge}
                </div>
                
                <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${typeClass} text-xs font-medium">
                        ${typeThai}
                    </span>
                    <span class="text-lg font-bold ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                        ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

async function loadStatistics() {
    try {
        // 1. Total Members
        const membersSnapshot = await getDocs(collection(db, "members"));
        const totalMembers = membersSnapshot.size;
        const statMembersEl = document.getElementById('stat-members');
        if (statMembersEl) statMembersEl.textContent = totalMembers;

        // 2. Total Fund Balance
        let totalBalance = 0;
        membersSnapshot.forEach(doc => {
            const data = doc.data();
            totalBalance += data.Balance || 0;
        });
        const statTotalBalanceEl = document.getElementById('stat-total-balance');
        if (statTotalBalanceEl) statTotalBalanceEl.textContent = formatCurrency(totalBalance);

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
        const statDividendsEl = document.getElementById('stat-dividends');
        if (statDividendsEl) statDividendsEl.textContent = formatCurrency(totalDividends);

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

        const statMonthDepositsEl = document.getElementById('stat-month-deposits');
        if (statMonthDepositsEl) statMonthDepositsEl.textContent = formatCurrency(monthDeposits);
        
        const statMonthWithdrawalsEl = document.getElementById('stat-month-withdrawals');
        if (statMonthWithdrawalsEl) statMonthWithdrawalsEl.textContent = formatCurrency(monthWithdrawals);
        
        const netChange = monthDeposits - monthWithdrawals;
        const netChangeEl = document.getElementById('stat-net-change');
        if (netChangeEl) {
            netChangeEl.textContent = formatCurrency(Math.abs(netChange));
            netChangeEl.className = `text-lg font-bold ${netChange >= 0 ? 'text-green-800' : 'text-red-800'}`;
        }

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
                    <label class="text-sm font-medium mb-2 block">ค้นหาด้วยรหัสธุรกรรม</label>
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"></i>
                            <input 
                                type="text" 
                                id="qr-search" 
                                class="input-field pl-10" 
                                placeholder="วางหรือสแกนรหัสธุรกรรม..."
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
            <div class="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center mb-4 rounded-t-lg">
                <div class="flex items-center gap-2">
                    <h3 class="font-bold text-gray-800">คำขอรอตรวจสอบ</h3>
                    <span id="pending-count-badge" class="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-lg text-xs font-bold">0</span>
                </div>
                
                <div id="bulk-actions" class="hidden items-center gap-2 animate-fade-in">
                    <span class="text-sm font-medium text-muted mr-2"><span id="selected-count">0</span> รายการที่เลือก</span>
                    <button id="bulk-reject-btn" class="btn btn-outline-danger px-3 py-1 text-sm flex items-center gap-1">
                        <i data-lucide="x" class="w-4 h-4"></i> ปฏิเสธ
                    </button>
                    <button id="bulk-approve-btn" class="btn btn-success px-3 py-1 text-sm flex items-center gap-1">
                        <i data-lucide="check-circle" class="w-4 h-4"></i> อนุมัติ
                    </button>
                </div>
            </div>

            <div id="pending-loading-state" class="text-center py-12">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-primary mb-2"></i>
                <p class="text-muted">กำลังโหลดรายการ...</p>
            </div>

            <div id="pending-empty-state" class="hidden text-center py-12">
                <i data-lucide="check-circle" class="w-16 h-16 mx-auto text-green-500 mb-4"></i>
                <p class="text-muted">ไม่มีรายการรอตรวจสอบ</p>
            </div>

            <div id="pending-transactions-table" class="hidden md:block overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="p-3 w-12 text-center">
                                <input type="checkbox" id="select-all-checkbox" class="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer">
                            </th>
                            <th class="text-left p-3 text-sm font-medium text-muted">วันที่</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">สมาชิก</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">ประเภท</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">จำนวนเงิน</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">รหัสธุรกรรม</th>
                            <th class="text-center p-3 text-sm font-medium text-muted">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody id="pending-transactions-tbody">
                    </tbody>
                </table>
            </div>

            <!-- Mobile List View (Cards) -->
            <div id="pending-mobile-list" class="md:hidden space-y-4 hidden">
                <!-- Cards injected by JS -->
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

// Global variable to store unsubscribe function
// Ensure this is declared at the top level of admin.js (already done in previous steps)

function loadPendingTransactions() {
    const loadingState = document.getElementById('pending-loading-state');
    const emptyState = document.getElementById('pending-empty-state');
    const table = document.getElementById('pending-transactions-table');
    const tbody = document.getElementById('pending-transactions-tbody');
    const mobileList = document.getElementById('pending-mobile-list'); // New Element

    // Clean up previous listener if exists
    if (unsubscribePending) {
        unsubscribePending();
        unsubscribePending = null;
    }

    const q = query(
        collection(db, "transactions"),
        where("status", "==", "pending")
    );

    unsubscribePending = onSnapshot(q, async (snapshot) => {
        try {
            // Handle Empty State
            if (snapshot.empty) {
                if (loadingState) loadingState.classList.add('hidden');
                if (table) table.classList.add('hidden');
                if (mobileList) mobileList.classList.add('hidden');
                if (emptyState) emptyState.classList.remove('hidden');
                
                // Also hide bulk actions
                if (typeof toggleBulkActions === 'function') toggleBulkActions(false);
                
                updatePendingCount(0);
                return;
            }

            // Process Data
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
                    txData.memberName = 'Error Loading';
                }
                
                transactions.push(txData);
            }

            // Sort by Date Descending
            transactions.sort((a, b) => {
                const tA = a.transDate ? a.transDate.seconds : 0;
                const tB = b.transDate ? b.transDate.seconds : 0;
                return tB - tA;
            });

            // Update Global State
            pendingTransactions = transactions;
            
            // Render Both Views
            if (tbody) renderPendingTransactions(transactions, tbody, mobileList);
            
            // Validate Select All Checkbox State
            if (typeof updateBulkActionUI === 'function') updateBulkActionUI();

            // Update UI States
            if (loadingState) loadingState.classList.add('hidden');
            if (emptyState) emptyState.classList.add('hidden');
            if (table) table.classList.remove('hidden');
            if (mobileList) mobileList.classList.remove('hidden');
            
            updatePendingCount(transactions.length);
            
            if (window.lucide) window.lucide.createIcons();
            
            // Re-attach listeners that might be outside table (like Select All)
            const selectAllCheckbox = document.getElementById('select-all-checkbox');
            if (selectAllCheckbox) {
                const newCheckbox = selectAllCheckbox.cloneNode(true);
                selectAllCheckbox.parentNode.replaceChild(newCheckbox, selectAllCheckbox);
                
                newCheckbox.addEventListener('change', (e) => {
                    const rows = document.querySelectorAll('.tx-checkbox');
                    rows.forEach(cb => {
                        const id = cb.getAttribute('data-id');
                        cb.checked = e.target.checked;
                        if (e.target.checked) {
                            selectedTransactions.add(id);
                            cb.closest('tr')?.classList.add('bg-blue-50');
                            // Handle mobile selection if needed or shared
                        } else {
                            selectedTransactions.delete(id);
                            cb.closest('tr')?.classList.remove('bg-blue-50');
                        }
                    });
                    if (typeof updateBulkActionUI === 'function') updateBulkActionUI();
                });
            }

            // Re-attach Bulk Buttons
            const bulkApproveBtn = document.getElementById('bulk-approve-btn');
            if (bulkApproveBtn) {
                const newBtn = bulkApproveBtn.cloneNode(true);
                bulkApproveBtn.parentNode.replaceChild(newBtn, bulkApproveBtn);
                newBtn.addEventListener('click', () => {
                    if (typeof bulkAction === 'function') bulkAction('approve');
                });
            }
            
            const bulkRejectBtn = document.getElementById('bulk-reject-btn');
            if (bulkRejectBtn) {
                const newBtn = bulkRejectBtn.cloneNode(true);
                bulkRejectBtn.parentNode.replaceChild(newBtn, bulkRejectBtn);
                newBtn.addEventListener('click', () => {
                   if (typeof bulkAction === 'function') bulkAction('reject');
                });
            }

        } catch (error) {
            console.error("Error loading pending transactions:", error);
            if (loadingState) loadingState.classList.add('hidden');
            if (table) table.classList.add('hidden');
            if (mobileList) mobileList.classList.add('hidden');
            if (emptyState) {
                emptyState.innerHTML = `<p class="text-red-500">Error loading data: ${error.message}</p>`;
                emptyState.classList.remove('hidden');
            }
        }
    });
}

function renderPendingTransactions(transactions, tbody, mobileList) {
    if (transactions.length === 0) {
        const emptyHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center">
                        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="check-circle" class="w-8 h-8 text-gray-400"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800">จัดการครบแล้ว!</h3>
                        <p class="text-muted">ไม่มีรายการรอตรวจสอบ</p>
                    </div>
                </td>
            </tr>
        `;
        if(tbody) tbody.innerHTML = emptyHTML;
        if(mobileList) mobileList.innerHTML = `<div class="text-center py-8 text-muted">ไม่มีรายการรอตรวจสอบ</div>`;
        
        toggleBulkActions(false);
        if (window.lucide) window.lucide.createIcons();
        return;
    }
    
    if(tbody) tbody.innerHTML = '';
    if(mobileList) mobileList.innerHTML = '';

    transactions.forEach(tx => {
        const isSelected = selectedTransactions.has(tx.id);
        const date = tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        const isDeposit = tx.type === 'deposit';
        const typeClass = isDeposit ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
        const typeIcon = isDeposit ? 'arrow-down-left' : 'arrow-up-right';
        const typeThai = isDeposit ? 'ฝาก' : 'ถอน';

        // 1. Render Desktop Row
        if(tbody) {
            const row = document.createElement('tr');
            row.className = `border-b border-gray-100 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`;
            row.dataset.txId = tx.id;
            
            row.innerHTML = `
                <td class="p-3 text-center">
                    <input type="checkbox" class="tx-checkbox w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" 
                        data-id="${tx.id}" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="p-3 text-sm text-gray-900">${date}</td>
                <td class="p-3 text-sm font-medium">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                            ${tx.memberName.charAt(0)}
                        </div>
                        ${tx.memberName}
                    </div>
                </td>
                <td class="p-3">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${typeClass} text-xs font-medium">
                        <i data-lucide="${typeIcon}" class="w-3 h-3"></i>
                        ${typeThai}
                    </span>
                </td>
                <td class="p-3 text-sm font-bold text-right ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                    ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
                </td>
                <td class="p-3 text-xs text-muted font-mono">${tx.id.substring(0, 8)}...</td>
                <td class="p-3">
                    <div class="flex items-center justify-center gap-2">
                        <button class="approve-btn btn btn-success px-3 py-1 text-sm" data-tx-id="${tx.id}">
                            <i data-lucide="check" class="w-4 h-4"></i>
                        </button>
                        <button class="reject-btn btn btn-danger px-3 py-1 text-sm" data-tx-id="${tx.id}">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        }

        // 2. Render Mobile Card
        if(mobileList) {
            const card = document.createElement('div');
            card.className = `card p-4 border-2 transition-all ${isSelected ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                 ${tx.memberName.charAt(0)}
                            </div>
                            <h4 class="font-bold text-base text-gray-900">${tx.memberName}</h4>
                        </div>
                        <p class="text-xs text-gray-500 ml-10">${date}</p>
                    </div>
                    <span class="px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${typeClass} shadow-sm">
                        <i data-lucide="${typeIcon}" class="w-3.5 h-3.5"></i>
                        ${typeThai}
                    </span>
                </div>
                
                <div class="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 mb-4 border border-gray-200">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600">จำนวนเงิน</span>
                        <span class="text-2xl font-bold ${isDeposit ? 'text-green-600' : 'text-red-600'}">
                            ${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}
                        </span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <button class="reject-btn btn btn-outline-danger flex justify-center items-center gap-2 py-3 text-sm font-medium" data-tx-id="${tx.id}">
                        <i data-lucide="x" class="w-4 h-4"></i> ปฏิเสธ
                    </button>
                    <button class="approve-btn btn btn-success flex justify-center items-center gap-2 py-3 text-sm font-medium text-white shadow-md" data-tx-id="${tx.id}">
                        <i data-lucide="check" class="w-4 h-4"></i> อนุมัติ
                    </button>
                </div>
            `;
            mobileList.appendChild(card);
        }
    });

    // Attach Listeners for both Desktop and Mobile elements
    const attachListeners = (container) => {
        if(!container) return;
        
        container.querySelectorAll('.tx-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) {
                    selectedTransactions.add(id);
                } else {
                    selectedTransactions.delete(id);
                }
                // Re-render to update UI state for both views (simplest way to sync selection state visually)
                // Note: calling render again inside itself might be recursive loop if not careful. 
                // Better to just toggle classes manually on both.
                // For now, simpler: just update UI.
                updateBulkActionUI();
            });
        });

        container.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const txId = e.currentTarget.dataset.txId;
                const tx = pendingTransactions.find(t => t.id === txId);
                approveTransaction(tx); // Ensure this function exists globally or imported
            });
        });

        container.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const txId = e.currentTarget.dataset.txId;
                const tx = pendingTransactions.find(t => t.id === txId);
                rejectTransaction(tx); // Ensure this function exists globally
            });
        });
    };

    if(tbody) attachListeners(tbody);
    if(mobileList) attachListeners(mobileList);
    
    updateBulkActionUI();
}

function updateBulkActionUI() {
    const count = selectedTransactions.size;
    const bulkActionDiv = document.getElementById('bulk-actions');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    
    if (bulkActionDiv) {
        if (count > 0) {
            bulkActionDiv.classList.remove('hidden');
            bulkActionDiv.classList.add('flex');
            document.getElementById('selected-count').textContent = count;
        } else {
            bulkActionDiv.classList.add('hidden');
            bulkActionDiv.classList.remove('flex');
        }
    }
    
    // Update Select All State
    if (selectAllCheckbox && pendingTransactions.length > 0) {
        selectAllCheckbox.checked = count === pendingTransactions.length;
        selectAllCheckbox.indeterminate = count > 0 && count < pendingTransactions.length;
    }
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
    
    const internalBadge = document.getElementById('pending-count-badge');
    if (internalBadge) internalBadge.textContent = count;
}

function toggleBulkActions(show) {
    const bulkActionDiv = document.getElementById('bulk-actions');
    if (bulkActionDiv) {
        if (show) {
            bulkActionDiv.classList.remove('hidden');
            bulkActionDiv.classList.add('flex');
        } else {
            bulkActionDiv.classList.add('hidden');
            bulkActionDiv.classList.remove('flex');
        }
    }
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
        modalTitle.textContent = 'อนุมัติการทำธุรกรรม';
        const typeThai = tx.type === 'deposit' ? 'ฝาก' : 'ถอน';
        modalMessage.textContent = `อนุมัติรายการ${typeThai} จำนวน ${formatCurrency(tx.amount)} ของ ${tx.memberName} หรือไม่?`;
        modalConfirmBtn.className = 'btn btn-success w-full';
        modalConfirmBtn.textContent = 'อนุมัติ';
    } else {
        modalIcon.className = 'w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4';
        modalIcon.innerHTML = '<i data-lucide="x-circle" class="w-8 h-8"></i>';
        modalTitle.textContent = 'ปฏิเสธการทำธุรกรรม';
        const typeThai = tx.type === 'deposit' ? 'ฝาก' : 'ถอน';
        modalMessage.textContent = `ปฏิเสธรายการ${typeThai} จำนวน ${formatCurrency(tx.amount)} ของ ${tx.memberName} หรือไม่?`;
        modalConfirmBtn.className = 'btn btn-danger w-full';
        modalConfirmBtn.textContent = 'ปฏิเสธ';
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

async function approveTransaction(tx) {
    showConfirm(
        `คุณแน่ใจหรือไม่ว่าต้องการอนุมัติรายการนี้?`,
        async () => {
            try {
                showLoadingToast('กำลังอนุมัติรายการ...');
                await executeApprove(tx.id, false);
                
                const loadingToast = document.getElementById('loading-toast');
                if (loadingToast) loadingToast.remove();
                
                showSuccessMessage('อนุมัติรายการสำเร็จ!');
            } catch (error) {
                console.error("Error approving transaction:", error);
                showAlert("ไม่สามารถอนุมัติรายการได้: " + error.message, 'error');
            }
        }
    );
}

async function rejectTransaction(tx) {
    showConfirm(
        `คุณแน่ใจหรือไม่ว่าต้องการปฏิเสธรายการนี้?`,
        async () => {
            try {
                showLoadingToast('กำลังปฏิเสธรายการ...');
                await executeReject(tx.id, false);
                
                const loadingToast = document.getElementById('loading-toast');
                if (loadingToast) loadingToast.remove();
                
                showSuccessMessage('ปฏิเสธรายการแล้ว');
            } catch (error) {
                console.error("Error rejecting transaction:", error);
                showAlert("ไม่สามารถปฏิเสธรายการได้: " + error.message, 'error');
            }
        }
    );
}

function hideConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    currentAction = null;
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    if (modalConfirmBtn) modalConfirmBtn.disabled = false;
}

function showSuccessMessage(message) {
    // Remove loading toast if exists
    const loadingToast = document.getElementById('loading-toast');
    if (loadingToast) loadingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-white border-l-4 border-green-500 px-6 py-4 rounded-lg shadow-2xl z-[200] animate-fade-in flex items-center gap-3 max-w-md';
    toast.innerHTML = `
        <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <i data-lucide="check" class="w-5 h-5 text-white"></i>
        </div>
        <div class="flex-1">
            <p class="font-bold text-green-800">สำเร็จ!</p>
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
                    <label class="text-sm font-medium mb-2 block">ค้นหาสมาชิก</label>
                    <div class="relative">
                        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"></i>
                        <input 
                            type="text" 
                            id="member-search" 
                            class="input-field pl-10" 
                            placeholder="ค้นหาชื่อ, รหัส, หรือเบอร์โทร..."
                        />
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="mb-4">
                <h3 class="text-lg font-bold">สมาชิกทั้งหมด</h3>
            </div>

            <div id="members-loading-state" class="text-center py-12">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-primary mb-2"></i>
                <p class="text-muted">กำลังโหลดสมาชิก...</p>
            </div>

            <div id="members-table" class="hidden overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="text-left p-3 text-sm font-medium text-muted">รหัสสมาชิก</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">ชื่อ-นามสกุล</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">เบอร์โทร</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">ยอดเงิน</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">วันที่สมัคร</th>
                            <th class="text-center p-3 text-sm font-medium text-muted">จัดการ</th>
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
                    </button>
                    <button class="edit-member-btn btn btn-outline-primary px-3 py-1 text-sm" data-member-id="${member.id}">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Use Event Delegation for buttons
    tbody.onclick = (e) => {
        const viewBtn = e.target.closest('.view-member-btn');
        const editBtn = e.target.closest('.edit-member-btn');
        
        if (viewBtn) {
            const memberId = viewBtn.dataset.memberId;
            const member = allMembers.find(m => m.id === memberId);
            if (member) showMemberModal(member);
        }
        
        if (editBtn) {
            const memberId = editBtn.dataset.memberId;
            const member = allMembers.find(m => m.id === memberId);
            if (member) showEditMemberModal(member);
        }
    };
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
        
        console.log(`Found ${dividendsSnapshot.size} dividend records for member ${member.id}`);
        
        dividendsSnapshot.forEach(doc => {
            const data = doc.data();
            console.log('Raw dividend data:', data); // ← Debug: see raw data
            
            const amount = data.amount || 0;
            totalDividends += amount;
            
            // Try to get year from multiple sources
            let year = data.year;
            if (!year && data.distributedAt) {
                try {
                    year = new Date(data.distributedAt.toDate()).getFullYear();
                } catch (e) {
                    year = new Date().getFullYear();
                }
            } else if (!year) {
                year = new Date().getFullYear();
            }
            
            dividendHistory.push({
                year: year,
                amount: amount,
                date: data.distributedAt,
                docId: doc.id
            });
            
            console.log(`Dividend: Year ${year}, Amount ${amount}, Type: ${typeof amount}`);
        });
        
        // Sort by year descending
        dividendHistory.sort((a, b) => b.year - a.year);
        
        console.log('Dividend History Array:', dividendHistory);
        console.log('Total Dividends:', totalDividends);
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
// DIVIDEND TAB
// ============================================

async function loadDividendTab() {
    const container = document.getElementById('tab-dividend-content');
    
    container.innerHTML = `
        <div class="card mb-6">
            <h3 class="text-lg font-bold mb-4">การปันผล</h3>
            <p class="text-muted mb-6">คำนวณและแจกจ่ายเงินปันผลให้สมาชิกที่มีสิทธิ์</p>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="card bg-purple-50 border-purple-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                            <i data-lucide="users-2" class="w-5 h-5 text-white"></i>
                        </div>
                        <div>
                            <p class="text-xs text-purple-700">สมาชิกที่มีสิทธิ์</p>
                            <p id="eligible-count" class="text-lg font-bold text-purple-800">-</p>
                        </div>
                    </div>
                </div>

                <div class="card bg-green-50 border-green-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                            <i data-lucide="wallet" class="w-5 h-5 text-white"></i>
                        </div>
                        <div>
                            <p class="text-xs text-green-700">ยอดปันผลรวม</p>
                            <p id="total-distribution" class="text-lg font-bold text-green-800">-</p>
                        </div>
                    </div>
                </div>

                <div class="card bg-blue-50 border-blue-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                            <i data-lucide="percent" class="w-5 h-5 text-white"></i>
                        </div>
                        <div>
                            <p class="text-xs text-blue-700">อัตราปันผล</p>
                            <p id="dividend-rate" class="text-lg font-bold text-blue-800">-</p>
                        </div>
                    </div>
                </div>
            </div>

            <button id="calculate-dividend-btn" class="btn btn-primary w-full md:w-auto">
                <i data-lucide="calculator" class="w-4 h-4"></i>
                คำนวณเงินปันผล
            </button>
        </div>

        <div id="dividend-preview" class="card hidden">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold">ตัวอย่างรายการปันผล</h3>
                <button id="close-preview-btn" class="btn btn-outline px-3 py-1">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>

            <div class="overflow-x-auto mb-4">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="text-left p-3 text-sm font-medium text-muted">ชื่อสมาชิก</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">ยอดเงินเดิม</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">เงินปันผล</th>
                            <th class="text-right p-3 text-sm font-medium text-muted">ยอดเงินใหม่</th>
                        </tr>
                    </thead>
                    <tbody id="dividend-preview-tbody">
                    </tbody>
                </table>
            </div>

            <div class="flex gap-2 justify-end">
                <button id="cancel-distribution-btn" class="btn btn-outline">
                    ยกเลิก
                </button>
                <button id="confirm-distribution-btn" class="btn btn-success">
                    <i data-lucide="check" class="w-4 h-4"></i>
                    ยืนยันการเเจกจ่าย
                </button>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Load current settings
    await loadDividendSettings();
    
    // Setup event listeners
    document.getElementById('calculate-dividend-btn').addEventListener('click', calculateDividends);
}

async function loadDividendSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, "system", "fund_status"));
        
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            const rate = data.rate || 0;
            document.getElementById('dividend-rate').textContent = `${rate}%`;
        }
    } catch (error) {
        console.error("Error loading dividend settings:", error);
    }
}

let eligibleMembers = [];

async function calculateDividends() {
    try {
        showLoadingToast('Calculating dividends...');
        
        // Get settings
        const settingsDoc = await getDoc(doc(db, "system", "fund_status"));
        if (!settingsDoc.exists()) {
            showAlert('Please configure fund settings first!', 'warning');
            return;
        }
        
        const settings = settingsDoc.data();
        const rate = settings.rate || 0;
        const minBalance = settings.minBalance || 1000;
        const minMonths = settings.minMonths || 12;
        const currentYear = new Date().getFullYear();
        
        if (rate <= 0) {
            showAlert('Dividend rate must be greater than 0%', 'warning');
            return;
        }
        
        // Get all members
        const membersSnapshot = await getDocs(collection(db, "members"));
        eligibleMembers = [];
        let totalDistribution = 0;
        
        const now = new Date();
        
        membersSnapshot.forEach(docSnap => {
            const member = { id: docSnap.id, ...docSnap.data() };
            const balance = member.Balance || 0;
            
            // Check eligibility
            if (balance < minBalance) return;
            
            // Check membership duration
            if (member.Reg_Date) {
                const regDate = new Date(member.Reg_Date.seconds * 1000);
                const monthsDiff = (now - regDate) / (1000 * 60 * 60 * 24 * 30);
                
                if (monthsDiff < minMonths) return;
            } else {
                return; // No registration date
            }
            
            // Calculate dividend
            const dividendAmount = Math.floor(balance * (rate / 100));
            
            eligibleMembers.push({
                ...member,
                dividendAmount: dividendAmount,
                newBalance: balance + dividendAmount
            });
            
            totalDistribution += dividendAmount;
        });
        
        // Update summary
        document.getElementById('eligible-count').textContent = eligibleMembers.length;
        document.getElementById('total-distribution').textContent = formatCurrency(totalDistribution);
        
        // Show preview
        renderDividendPreview();
        
        const loadingToast = document.getElementById('loading-toast');
        if (loadingToast) loadingToast.remove();
        
        if (eligibleMembers.length === 0) {
            showAlert('No eligible members found!', 'info');
        }
        
    } catch (error) {
        console.error("Error calculating dividends:", error);
        showAlert('Failed to calculate dividends: ' + error.message, 'error');
    }
}

function renderDividendPreview() {
    const tbody = document.getElementById('dividend-preview-tbody');
    tbody.innerHTML = '';
    
    eligibleMembers.forEach(member => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100';
        
        row.innerHTML = `
            <td class="p-3 text-sm font-medium">${member.Full_Name || 'Unknown'}</td>
            <td class="p-3 text-sm text-right">${formatCurrency(member.Balance)}</td>
            <td class="p-3 text-sm text-right font-bold text-purple-600">+${formatCurrency(member.dividendAmount)}</td>
            <td class="p-3 text-sm text-right font-bold text-green-600">${formatCurrency(member.newBalance)}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    document.getElementById('dividend-preview').classList.remove('hidden');
    
    if (window.lucide) window.lucide.createIcons();
    
    // Setup preview buttons
    document.getElementById('close-preview-btn').addEventListener('click', () => {
        document.getElementById('dividend-preview').classList.add('hidden');
    });
    
    document.getElementById('cancel-distribution-btn').addEventListener('click', () => {
        document.getElementById('dividend-preview').classList.add('hidden');
    });
    
    document.getElementById('confirm-distribution-btn').addEventListener('click', distributeDividends);
}

async function distributeDividends() {
    if (eligibleMembers.length === 0) {
        showAlert('No members to distribute dividends to!', 'warning');
        return;
    }
    
    showConfirm(
        `Are you sure you want to distribute dividends to ${eligibleMembers.length} members?`,
        async () => {
            await executeDividendDistribution();
        }
    );
}

async function executeDividendDistribution() {
    
    try {
        showLoadingToast('Distributing dividends...');
        
        const currentYear = new Date().getFullYear();
        const distributedAt = new Date();
        const membersCount = eligibleMembers.length;
        
        // Process each member
        for (const member of eligibleMembers) {
            // Update member balance
            const memberRef = doc(db, "members", member.id);
            await updateDoc(memberRef, {
                Balance: member.newBalance
            });
            
            // Create dividend record
            await setDoc(doc(collection(db, "dividends")), {
                memberId: member.id,
                year: currentYear,
                amount: member.dividendAmount,
                distributedAt: distributedAt,
                distributedBy: currentUser.uid
            });
        }
        
        // Hide preview
        document.getElementById('dividend-preview').classList.add('hidden');
        
        // Reset
        eligibleMembers = [];
        document.getElementById('eligible-count').textContent = '0';
        document.getElementById('total-distribution').textContent = formatCurrency(0);
        
        // Log Audit
        logAudit('DIVIDENDS_DISTRIBUTED', `Distributed dividends for year ${currentYear}`, null);
        
        showSuccessMessage(`Successfully distributed dividends to ${membersCount} members!`);
        
        // Reload statistics
        loadStatistics();
        
    } catch (error) {
        console.error("Error distributing dividends:", error);
        showAlert('Failed to distribute dividends: ' + error.message, 'error');
    }
}

// ============================================
// REPORTS TAB
// ============================================

function loadReportsTab() {
    const container = document.getElementById('tab-reports-content');
    
    container.innerHTML = `
        <div class="card">
            <h3 class="text-lg font-bold mb-4">สร้างรายงาน</h3>
            <p class="text-muted mb-6">เลือกประเภทรายงานเพื่อส่งออกเป็นไฟล์ CSV</p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button id="export-transactions" class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="file-text" class="w-6 h-6 text-primary"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">ประวัติธุรกรรม</h4>
                            <p class="text-sm text-muted">รายการธุรกรรมทั้งหมดพร้อมตัวกรอง</p>
                        </div>
                    </div>
                </button>
                
                <button id="export-members" class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="users" class="w-6 h-6 text-green-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">รายชื่อสมาชิก</h4>
                            <p class="text-sm text-muted">สมาชิกพร้อมยอดเงินปัจจุบัน</p>
                        </div>
                    </div>
                </button>
                
                <button id="export-dividends" class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="trending-up" class="w-6 h-6 text-purple-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">สรุปเงินปันผล</h4>
                            <p class="text-sm text-muted">รายงานการแจกจ่ายเงินปันผล</p>
                        </div>
                    </div>
                </button>
                
                <button id="export-monthly" class="card hover:shadow-lg transition-shadow text-left p-6 border-2 border-gray-200 hover:border-primary">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                            <i data-lucide="calendar" class="w-6 h-6 text-orange-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold">กิจกรรมรายเดือน</h4>
                            <p class="text-sm text-muted">สรุปยอดประจำเดือน</p>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Attach event listeners
    document.getElementById('export-transactions').addEventListener('click', exportTransactionsReport);
    document.getElementById('export-members').addEventListener('click', exportMembersReport);
    document.getElementById('export-dividends').addEventListener('click', exportDividendsReport);
    document.getElementById('export-monthly').addEventListener('click', exportMonthlyReport);
}

// Export Functions
async function exportTransactionsReport() {
    try {
        showLoadingToast('Generating transaction report...');
        
        const transactionsSnapshot = await getDocs(collection(db, "transactions"));
        const transactions = [];
        
        for (const docSnap of transactionsSnapshot.docs) {
            const tx = docSnap.data();
            
            // Fetch member name
            let memberName = 'Unknown';
            try {
                const memberDoc = await getDoc(doc(db, "members", tx.memberId));
                if (memberDoc.exists()) {
                    memberName = memberDoc.data().Full_Name || 'Unknown';
                }
            } catch (e) {
                console.error("Error fetching member:", e);
            }
            
            transactions.push({
                'Transaction ID': docSnap.id,
                'Date': tx.transDate ? new Date(tx.transDate.seconds * 1000).toLocaleString('th-TH') : '-',
                'Member Name': memberName,
                'Type': tx.type || '-',
                'Amount': tx.amount || 0,
                'Status': tx.status || '-',
                'Note': tx.note || '-'
            });
        }
        
        downloadCSV(transactions, 'transaction_history.csv');
        showSuccessMessage('Transaction report downloaded!');
    } catch (error) {
        console.error("Error exporting transactions:", error);
        showAlert('Failed to export transactions: ' + error.message, 'error');
    }
}

async function exportMembersReport() {
    try {
        showLoadingToast('Generating members report...');
        
        const membersSnapshot = await getDocs(collection(db, "members"));
        const members = [];
        
        membersSnapshot.forEach(doc => {
            const data = doc.data();
            members.push({
                'Member ID': doc.id,
                'Full Name': data.Full_Name || '-',
                'Phone': data.Phone || '-',
                'Address': data.Address || '-',
                'Balance': data.Balance || 0,
                'Registration Date': data.Reg_Date ? new Date(data.Reg_Date.seconds * 1000).toLocaleDateString('th-TH') : '-'
            });
        });
        
        downloadCSV(members, 'member_list.csv');
        showSuccessMessage('Member list downloaded!');
    } catch (error) {
        console.error("Error exporting members:", error);
        showAlert('Failed to export members: ' + error.message, 'error');
    }
}

async function exportDividendsReport() {
    try {
        showLoadingToast('Generating dividends report...');
        
        const dividendsSnapshot = await getDocs(collection(db, "dividends"));
        const dividends = [];
        
        for (const docSnap of dividendsSnapshot.docs) {
            const div = docSnap.data();
            
            // Fetch member name
            let memberName = 'Unknown';
            try {
                const memberDoc = await getDoc(doc(db, "members", div.memberId));
                if (memberDoc.exists()) {
                    memberName = memberDoc.data().Full_Name || 'Unknown';
                }
            } catch (e) {
                console.error("Error fetching member:", e);
            }
            
            dividends.push({
                'Member Name': memberName,
                'Year': div.year || '-',
                'Amount': div.amount || 0,
                'Distributed Date': div.distributedAt ? new Date(div.distributedAt.seconds * 1000).toLocaleDateString('th-TH') : '-'
            });
        }
        
        downloadCSV(dividends, 'dividend_summary.csv');
        showSuccessMessage('Dividend report downloaded!');
    } catch (error) {
        console.error("Error exporting dividends:", error);
        showAlert('Failed to export dividends: ' + error.message, 'error');
    }
}

async function exportMonthlyReport() {
    try {
        showLoadingToast('Generating monthly activity report...');
        
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const transactionsSnapshot = await getDocs(collection(db, "transactions"));
        const monthlyData = [];
        
        for (const docSnap of transactionsSnapshot.docs) {
            const tx = docSnap.data();
            
            if (tx.transDate && tx.status === 'approved') {
                const txDate = new Date(tx.transDate.seconds * 1000);
                
                if (txDate >= firstDayOfMonth) {
                    // Fetch member name
                    let memberName = 'Unknown';
                    try {
                        const memberDoc = await getDoc(doc(db, "members", tx.memberId));
                        if (memberDoc.exists()) {
                            memberName = memberDoc.data().Full_Name || 'Unknown';
                        }
                    } catch (e) {
                        console.error("Error fetching member:", e);
                    }
                    
                    monthlyData.push({
                        'Date': txDate.toLocaleDateString('th-TH'),
                        'Member Name': memberName,
                        'Type': tx.type || '-',
                        'Amount': tx.amount || 0
                    });
                }
            }
        }
        
        downloadCSV(monthlyData, `monthly_activity_${now.getFullYear()}_${now.getMonth() + 1}.csv`);
        showSuccessMessage('Monthly report downloaded!');
    } catch (error) {
        console.error("Error exporting monthly report:", error);
        showAlert('Failed to export monthly report: ' + error.message, 'error');
    }
}

// CSV Download Helper
function downloadCSV(data, filename) {
    if (data.length === 0) {
        showAlert('No data to export!', 'warning');
        return;
    }
    
    // Get headers from first object
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvContent += values.join(',') + '\n';
    });
    
    // Create blob and download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showLoadingToast(message) {
    const existingToast = document.getElementById('loading-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'loading-toast';
    toast.className = 'fixed top-4 right-4 bg-white border-l-4 border-blue-500 px-6 py-4 rounded-lg shadow-2xl z-[200] animate-fade-in flex items-center gap-3';
    toast.innerHTML = `
        <div class="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <i data-lucide="loader-2" class="w-5 h-5 text-white animate-spin"></i>
        </div>
        <div class="flex-1">
            <p class="font-bold text-blue-800">Processing...</p>
            <p class="text-sm text-gray-600">${message}</p>
        </div>
    `;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
}

// ============================================
// SETTINGS TAB
// ============================================

async function loadSettingsTab() {
    const container = document.getElementById('tab-settings-content');
    
    container.innerHTML = `
        <div class="card">
            <h3 class="text-lg font-bold mb-4">ตั้งค่าออมทรัพย์</h3>
            <p class="text-muted mb-6">กำหนดค่าพารามิเตอร์ออมทรัพย์และการคำนวณเงินปันผล</p>
            
            <form id="settings-form" class="space-y-4">
                <div class="input-group">
                    <label>ปีงบประมาณ</label>
                    <input type="number" id="setting-year" class="input-field" placeholder="2026" />
                </div>
                
                <div class="input-group">
                    <label>อัตราเงินปันผล (%)</label>
                    <input type="number" step="0.01" id="setting-rate" class="input-field" placeholder="5.0" />
                </div>
                
                <div class="input-group">
                    <label>กำไรสุทธิ (บาท)</label>
                    <input type="number" id="setting-profit" class="input-field" placeholder="100000" />
                </div>
                
                <div class="input-group">
                    <label>ยอดเงินขั้นต่ำสำหรับปันผล (บาท)</label>
                    <input type="number" id="setting-min-balance" class="input-field" placeholder="1000" />
                </div>
                
                <div class="input-group">
                    <label>ระยะเวลาสมาชิกขั้นต่ำ (เดือน)</label>
                    <input type="number" id="setting-min-months" class="input-field" placeholder="12" />
                </div>
                
                <button type="submit" class="btn btn-primary w-full">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    บันทึกการตั้งค่า
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
        <!-- Edit Member Modal -->
        <div id="edit-member-modal" class="fixed inset-0 bg-black/50 z-[110] hidden flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl animate-scale-in">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-2xl font-bold text-gray-800">แก้ไขข้อมูลสมาชิก</h3>
                    <button id="close-edit-member-btn" class="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <i data-lucide="x" class="w-6 h-6 text-gray-500"></i>
                    </button>
                </div>
                
                <form id="edit-member-form" class="space-y-4">
                    <input type="hidden" id="edit-member-id">
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                        <input type="text" id="edit-member-name" class="input-field" required>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                        <input type="tel" id="edit-member-phone" class="input-field" required>
                    </div>

                    <div class="p-4 bg-orange-50 border border-orange-100 rounded-lg">
                        <label class="block text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                            ปรับยอดเงินคงเหลือ (Manual)
                        </label>
                        <p class="text-xs text-orange-600 mb-3">แก้ไขเฉพาะเมื่อจำเป็นเท่านั้น การเปลี่ยนแปลงทั้งหมดจะถูกบันทึกไว้</p>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">฿</span>
                            <input type="number" id="edit-member-balance" class="input-field pl-8" step="0.01" required>
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button type="button" id="cancel-edit-btn" class="btn btn-outline flex-1">ยกเลิก</button>
                        <button type="submit" class="btn btn-primary flex-1">บันทึกการเปลี่ยนแปลง</button>
                    </div>
                </form>
            </div>
        </div>
        <div id="confirm-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div class="text-center">
                    <div id="modal-icon" class="w-16 h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="alert-circle" class="w-8 h-8"></i>
                    </div>
                    <h3 id="modal-title" class="text-xl font-bold mb-2">ยืนยันการดำเนินการ</h3>
                    <p id="modal-message" class="text-muted text-sm mb-6">คุณแน่ใจหรือไม่?</p>
                    
                    <div class="flex gap-2">
                        <button id="modal-cancel-btn" class="btn btn-outline w-full">
                            ยกเลิก
                        </button>
                        <button id="modal-confirm-btn" class="btn btn-primary w-full">
                            ยืนยัน
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
// AUDIT LOG SYSTEM
// ============================================

async function logAudit(action, details, targetId = null) {
    if (!currentUser) return;
    
    try {
        await addDoc(collection(db, "audit_log"), {
            action: action,
            details: details,
            targetId: targetId,
            performedBy: currentUser.uid,
            performerEmail: currentUser.email,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}

// ============================================
// UTILITIES
// ============================================

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}



// ============================================
// ACTIVITY LOG TAB
// ============================================

async function loadActivityLogTab() {
    const container = document.getElementById('tab-activity-log-content');
    
    container.innerHTML = `
        <div class="card mb-6">
            <h3 class="text-lg font-bold mb-4">บันทึกกิจกรรม</h3>
            <p class="text-muted mb-6">ติดตามการดำเนินการทั้งหมดของผู้ดูแลระบบ</p>
            
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200">
                            <th class="text-left p-3 text-sm font-medium text-muted">เวลา</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">การกระทำ</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">รายละเอียด</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">ดำเนินโดย</th>
                            <th class="text-left p-3 text-sm font-medium text-muted">อีเมล</th>
                        </tr>
                    </thead>
                    <tbody id="activity-log-tbody">
                        <tr>
                            <td colspan="5" class="p-8 text-center text-muted">
                                <div class="flex flex-col items-center">
                                    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mb-2"></i>
                                    กำลังโหลดบันทึก...
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4 flex justify-end">
                <button id="refresh-logs-btn" class="btn btn-outline text-sm flex items-center gap-2">
                    <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
                    รีเฟรช
                </button>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Load logs
    await fetchAndRenderLogs();
    
    document.getElementById('refresh-logs-btn').addEventListener('click', fetchAndRenderLogs);
}

async function fetchAndRenderLogs() {
    try {
        const tbody = document.getElementById('activity-log-tbody');
        const q = query(
            collection(db, "audit_log"),
            orderBy("timestamp", "desc"),
            limit(50)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-muted">No activity logs found</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = '';
        
        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const date = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('th-TH') : '-';
            
            // Style action badges
            let actionClass = 'bg-gray-100 text-gray-800';
            let icon = 'activity';
            
            if (log.action.includes('APPROVED')) {
                actionClass = 'bg-green-100 text-green-800';
                icon = 'check-circle';
            } else if (log.action.includes('REJECTED')) {
                actionClass = 'bg-red-100 text-red-800';
                icon = 'x-circle';
            } else if (log.action.includes('SETTINGS')) {
                actionClass = 'bg-blue-100 text-blue-800';
                icon = 'settings';
            } else if (log.action.includes('DIVIDEND')) {
                actionClass = 'bg-purple-100 text-purple-800';
                icon = 'trending-up';
            }
            
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-100 hover:bg-gray-50';
            
            tr.innerHTML = `
                <td class="p-3 text-sm font-mono text-muted">${date}</td>
                <td class="p-3">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${actionClass}">
                        <i data-lucide="${icon}" class="w-3 h-3"></i>
                        ${log.action.replace(/_/g, ' ')}
                    </span>
                </td>
                <td class="p-3 text-sm text-gray-700 max-w-xs truncate" title="${log.details}">${log.details}</td>
                <td class="p-3 text-sm font-mono text-muted text-xs">${log.performedBy.substring(0, 8)}...</td>
                <td class="p-3 text-sm text-gray-600">${log.performerEmail || '-'}</td>
            `;
            
            tbody.appendChild(tr);
        });
        
        if (window.lucide) window.lucide.createIcons();
        
    } catch (error) {
        console.error("Error fetching logs:", error);
        document.getElementById('activity-log-tbody').innerHTML = `
            <tr>
                <td colspan="5" class="p-4 text-center text-red-500">Failed to load logs: ${error.message}</td>
            </tr>
        `;
    }
}

async function bulkAction(action) {
    const count = selectedTransactions.size;
    if (count === 0) return;
    
    const actionText = action === 'approve' ? 'Approve' : 'Reject';
    const actionPast = action === 'approve' ? 'Approved' : 'Rejected';
    
    showConfirm(
        `Are you sure you want to ${actionText.toUpperCase()} ${count} selected transactions?`,
        async () => {
            try {
                showLoadingToast(`${actionText}ing ${count} transactions...`);
                
                const ids = Array.from(selectedTransactions);
                let successes = 0;
                let failures = 0;
                
                // Execute sequentially
                for (const id of ids) {
                    try {
                        // Retrieve full transaction data for audit log (since execute logic usually needs just ID but audit might need details)
                        // Actually execute logic does read from DB
                        
                        if (action === 'approve') {
                            await executeApprove(id, true);
                        } else {
                            await executeReject(id, true);
                        }
                        successes++;
                    } catch (e) {
                        console.error(`Failed to ${action} ${id}:`, e);
                        failures++;
                    }
                }
                
                // Clear selection
                selectedTransactions.clear();
                updateBulkActionUI();
                
                // Remove loading toast
                const loadingToast = document.getElementById('loading-toast');
                if (loadingToast) loadingToast.remove();
                
                // Log Audit Summary
                logAudit(`BULK_${actionText.toUpperCase()}`, `Bulk ${actionPast.toLowerCase()} ${successes} transactions. Failed: ${failures}`, null);
                
                if (failures === 0) {
                    showAlert(`Successfully ${actionPast.toLowerCase()} ${successes} transactions!`, 'success');
                } else {
                    showAlert(`${actionPast} ${successes} transactions. Failed: ${failures}`, 'warning');
                }
                
            } catch (error) {
                console.error("Bulk action error:", error);
                showAlert(`Error during bulk ${action}: ${error.message}`, 'error');
            }
        }
    );
}

// Core execution logic for approval (reused by bulk action)
async function executeApprove(transactionId, silent = false) {
    if (!transactionId) throw "Invalid Transaction ID";
    
    let txDataSnapshot = null;
    
    await runTransaction(db, async (transaction) => {
        // 1. Get Transaction Ref
        const txRef = doc(db, "transactions", transactionId);
        const txDoc = await transaction.get(txRef);
        
        if (!txDoc.exists()) throw "Transaction does not exist!";
        
        const txData = txDoc.data();
        // If already processed, skip without error (idempotent) or throw? 
        if (txData.status !== 'pending') throw "Transaction is not pending!";
        
        txDataSnapshot = { ...txData, id: transactionId };
        
        // 2. Get Member Ref
        const memberRef = doc(db, "members", txData.memberId);
        const memberDoc = await transaction.get(memberRef);
        
        if (!memberDoc.exists()) throw "Member does not exist!";
        
        const currentBalance = memberDoc.data().Balance || 0;
        let newBalance = currentBalance;
        
        // 3. Calculate New Balance
        if (txData.type === 'deposit') {
            newBalance += txData.amount;
        } else if (txData.type === 'withdraw') {
            if (currentBalance < txData.amount) throw "Insufficient balance!";
            newBalance -= txData.amount;
        }
        
        // 4. Update Member Balance
        transaction.update(memberRef, { Balance: newBalance });
        
        // 5. Update Transaction Status
        transaction.update(txRef, { 
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: currentUser.uid
        });
    });
    
    // Log Audit (individual logs for bulk? Maybe too spammy. Let's do it only if NOT silent)
    if (!silent && txDataSnapshot) {
        logAudit('TRANSACTION_APPROVED', `Approved ${txDataSnapshot.type} of ${formatCurrency(txDataSnapshot.amount)} for member ${txDataSnapshot.memberId}`, transactionId);
    }
}

// Core execution logic for rejection
async function executeReject(transactionId, silent = false) {
    if (!transactionId) throw "Invalid Transaction ID";
    
    const txRef = doc(db, "transactions", transactionId);
    const txDoc = await getDoc(txRef);
    
    if (!txDoc.exists()) throw "Transaction not found";
    const txData = txDoc.data();
    
    if (txData.status !== 'pending') throw "Transaction is not pending";
    
    await updateDoc(txRef, {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: currentUser.uid
    });
    
    if (!silent) {
        logAudit('TRANSACTION_REJECTED', `Rejected ${txData.type} of ${formatCurrency(txData.amount)} for member ${txData.memberId}`, transactionId);
    }
}

// ============================================
// CHARTS LOGIC
// ============================================

async function renderCharts() {
    try {
        const volumeCtx = document.getElementById('chart-volume');
        
        if (!volumeCtx) return;

        // 1. Prepare Data for Volume Chart (Last 6 Months)
        const months = [];
        const deposits = [];
        const withdrawals = [];
        
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push(d.toLocaleDateString('en-US', { month: 'short' }));
            deposits.push(0);
            withdrawals.push(0);
        }

        const transactionsSnapshot = await getDocs(collection(db, "transactions"));


        transactionsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'approved' && data.transDate) {
                const date = data.transDate.toDate();
                const amount = data.amount || 0;



                // For Volume Chart
                const monthDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
                if (monthDiff >= 0 && monthDiff < 6) {
                    const index = 5 - monthDiff;
                    if (data.type === 'deposit') deposits[index] += amount;
                    else if (data.type === 'withdraw') withdrawals[index] += amount;
                }
            }
        });

        // 2. Render Volume Chart (Bar)
        new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Deposits',
                        data: deposits,
                        backgroundColor: 'rgba(34, 197, 94, 0.6)', // Green-500
                        borderColor: 'rgb(34, 197, 94)',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Withdrawals',
                        data: withdrawals,
                        backgroundColor: 'rgba(239, 68, 68, 0.6)', // Red-500
                        borderColor: 'rgb(239, 68, 68)',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });



    } catch (error) {
        console.error("Error rendering charts:", error);
    }
}

// ============================================
// EDIT MEMBER LOGIC
// ============================================

function showEditMemberModal(member) {
    const modal = document.getElementById('edit-member-modal');
    if (!modal) return;
    
    document.getElementById('edit-member-id').value = member.id;
    document.getElementById('edit-member-name').value = member.Full_Name || '';
    document.getElementById('edit-member-phone').value = member.Phone || '';
    document.getElementById('edit-member-balance').value = member.Balance || 0;
    
    // Store initial balance to check for changes
    modal.dataset.initialBalance = member.Balance || 0;
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    
    // Close handlers
    const closeBtn = document.getElementById('close-edit-member-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    
    const closeModal = () => {
        modal.classList.add('hidden');
    };
    
    // clone to remove old listeners
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeModal);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', closeModal);

    // Form Submit
    const form = document.getElementById('edit-member-form');
    // Check if form exists
    if (form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveMemberChanges();
        });
    }
}

async function saveMemberChanges() {
    const modal = document.getElementById('edit-member-modal');
    const memberId = document.getElementById('edit-member-id').value;
    const newName = document.getElementById('edit-member-name').value;
    const newPhone = document.getElementById('edit-member-phone').value;
    const newBalance = parseFloat(document.getElementById('edit-member-balance').value);
    
    const initialBalance = parseFloat(modal.dataset.initialBalance);
    
    showConfirm(
        'คุณแน่ใจหรือไม่ว่าต้องการบันทึกการเปลี่ยนแปลง?',
        async () => {
            try {
                showLoadingToast('กำลังบันทึก...');
                
                const memberRef = doc(db, "members", memberId);
                const updates = {
                    Full_Name: newName,
                    Phone: newPhone
                };
                
                // Handle Balance Change
                if (newBalance !== initialBalance) {
                    updates.Balance = newBalance;
                    
                    // Log Audit for Balance Change
                    const diff = newBalance - initialBalance;
                    logAudit(
                        'BALANCE_ADJUSTMENT', 
                        `Manual adjustment of ${formatCurrency(diff)} for member ${memberId}. Old: ${initialBalance}, New: ${newBalance}`,
                        memberId
                    );
                }
                
                await updateDoc(memberRef, updates);
                
                // Refresh data
                await loadAllMembers();
                
                modal.classList.add('hidden');
                
                // Remove loading toast
                const loadingToast = document.getElementById('loading-toast');
                if (loadingToast) loadingToast.remove();
                
                showSuccessMessage('อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว!');
                
            } catch (error) {
                console.error("Error updating member:", error);
                showAlert("ไม่สามารถอัปเดตสมาชิกได้: " + error.message, 'error');
            }
        }
    );
}

// ============================================
// RECENT TRANSACTIONS LOGIC
// ============================================

let unsubscribeRecent = null;
function subscribeToRecentTransactions(callback) {
    if (unsubscribeRecent) unsubscribeRecent();
    
    // Query: Order by Date Desc, Limit 5
    const q = query(collection(db, "transactions"), orderBy("transDate", "desc"), limit(5));
    
    unsubscribeRecent = onSnapshot(q, async (snapshot) => {
        const transactions = [];
        for (const docSnap of snapshot.docs) {
            const txData = { id: docSnap.id, ...docSnap.data() };
            
            // Member lookup (simple cache could be good but for 5 items, await is fine)
            try {
                if (txData.memberId) {
                    const memberDoc = await getDoc(doc(db, "members", txData.memberId));
                    if (memberDoc.exists()) {
                        txData.memberName = memberDoc.data().Full_Name || 'Unknown';
                    }
                }
            } catch (e) {
                console.error("Error fetching member for recent tx:", e);
                txData.memberName = 'Error';
            }
            
            transactions.push(txData);
        }
        callback(transactions);
    });
}


// Approve Transaction with Balance Update
// Approve Transaction with Balance Update
async function approveTransaction(tx) {
    if (!confirm('ยืนยันการอนุมัติยอดเงิน ' + formatCurrency(tx.amount) + '?')) return;

    try {
        await runTransaction(db, async (transaction) => {
            const memberRef = doc(db, 'members', tx.memberId);
            const txRef = doc(db, 'transactions', tx.id);

            const memberDoc = await transaction.get(memberRef);
            const txDoc = await transaction.get(txRef);

            if (!txDoc.exists()) throw 'Transaction does not exist!';
            if (txDoc.data().status !== 'pending') throw 'Transaction is not pending!';

            const currentBalance = memberDoc.exists() ? (memberDoc.data().Balance || 0) : 0;
            let newBalance = currentBalance;

            if (tx.type === 'deposit') {
                newBalance += tx.amount;
            } else if (tx.type === 'withdraw') {
                if (currentBalance < tx.amount) throw 'Insufficient funds!';
                newBalance -= tx.amount;
            }

            transaction.update(memberRef, { Balance: newBalance });
            transaction.update(txRef, { 
                status: 'approved',
                approvedAt: serverTimestamp(),
                approvedBy: auth.currentUser.uid
            });
        });

        alert('อนุมัติรายการสำเร็จ!');
    } catch (e) {
        console.error('Approval Error:', e);
        alert('เกิดข้อผิดพลาด: ' + e);
    }
}

// Reject Transaction
async function rejectTransaction(tx) {
    if (!confirm('ยืนยันการปฏิเสธรายการนี้?')) return;

    try {
        const txRef = doc(db, 'transactions', tx.id);
        await updateDoc(txRef, {
            status: 'rejected',
            rejectedAt: serverTimestamp(),
            rejectedBy: auth.currentUser.uid
        });
        alert('ปฏิเสธรายการเรียบร้อย');
    } catch (e) {
        console.error('Rejection Error:', e);
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}
