import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, onSnapshot, collection, query, where, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Modal Elements
const qrModal = document.getElementById('qr-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

if(closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        if(qrModal) qrModal.classList.add('hidden');
    });
}

// Auth Guard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/login.html';
    } else {
        await checkAndShowAdminNav(user);
        initDashboard(user);
    }
});

// Check if user is admin and show admin nav
async function checkAndShowAdminNav(user) {
    try {
        // Check email
        if (user.email.toLowerCase().includes('admin')) {
            showAdminNav();
            return;
        }
        
        // Check role field
        const memberDoc = await getDoc(doc(db, "members", user.uid));
        if (memberDoc.exists() && memberDoc.data().role === 'admin') {
            showAdminNav();
        }
    } catch (e) {
        console.error("Error checking admin role:", e);
    }
}

function showAdminNav() {
    const adminLink = document.getElementById('admin-nav-link');
    const adminDivider = document.getElementById('admin-nav-divider');
    if (adminLink) adminLink.classList.remove('hidden');
    if (adminDivider) adminDivider.classList.remove('hidden');
}

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}

function formatDate(timestamp) {
    if (!timestamp) return 'เมื่อสักครู่';
    return new Date(timestamp.seconds * 1000).toLocaleDateString('th-TH', { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function initDashboard(user) {
    // 1. Fetch Member Data
    onSnapshot(doc(db, "members", user.uid), (doc) => {
        const data = doc.data();
        if (data) {
            const elName = document.getElementById('member-name');
            const elBal = document.getElementById('member-balance');
            if(elName) elName.textContent = data.Full_Name?.split(' ')[0] || 'Member';
            if(elBal) elBal.textContent = formatCurrency(data.Balance);
        }
    });

    // 2. Fetch Recent Transactions
    const listContainer = document.getElementById('transaction-list');
    
    // NOTE: Removed orderBy("transDate") to prevent "Missing Index" error.
    // Sorting will be done in memory.
    const q = query(
        collection(db, "transactions"),
        where("memberId", "==", user.uid)
    );

    onSnapshot(q, (snapshot) => {
        if(!listContainer) return;

        listContainer.innerHTML = ''; 

        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="text-center p-8 text-muted">ไม่พบรายการธุรกรรม</div>';
            return;
        }

        // Convert to array and sort manually (descending)
        const transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });

        transactions.sort((a, b) => {
            const tA = a.transDate ? a.transDate.seconds : 0;
            const tB = b.transDate ? b.transDate.seconds : 0;
            return tB - tA; 
        });

        // Take top 5
        transactions.slice(0, 5).forEach(t => {
            const isDeposit = t.type === 'deposit';
            const isPending = t.status === 'pending';
            let statusBadge = '';
            
            if (isPending) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-600 font-medium ml-2">รอตรวจสอบ</span>`;
            } else if (t.status === 'rejected') {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600 font-medium ml-2">ถูกปฏิเสธ</span>`;
            }

            const item = document.createElement('div');
            // Add cursor-pointer and hover effect if pending
            const cursorClass = isPending ? 'cursor-pointer hover:bg-orange-50' : 'hover:bg-gray-50';
            
            item.className = `flex items-center justify-between p-4 border-b border-gray-100 ${cursorClass} transition-colors last:border-0`;
            item.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${isDeposit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">
                        <i data-lucide="${isDeposit ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <p class="font-medium text-main flex items-center">
                            ${isDeposit ? 'ฝากเงิน' : 'ถอนเงิน'} ${statusBadge}
                        </p>
                        <p class="text-xs text-muted">${formatDate(t.transDate)}</p>
                         ${isPending ? '<p class="text-[10px] text-orange-500 mt-0.5">คลิกเพื่อดู QR Code</p>' : ''}
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold ${isDeposit ? 'text-green-600' : 'text-danger'}">
                        ${isDeposit ? '+' : '-'}${formatCurrency(t.amount)}
                    </p>
                </div>
            `;

            // Add Click Event for Pending using CLOSURE for t.id
            if (isPending) {
                // Remove existing listeners by strict replacement? No, we created new element 'item'
                item.addEventListener('click', (e) => {
                    // console.log("Clicked pending tx:", t.id);
                    showQRModal(t.id);
                });
            }

            listContainer.appendChild(item);
        });
        
        if (window.lucide) window.lucide.createIcons();
    }, (error) => {
        console.error("Dashboard Error:", error);
        if(listContainer) {
            listContainer.innerHTML = `<div class="text-center p-4 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}</div>`;
        }
    });
}

// Added missing function
function showQRModal(txId) {
    const qrContainer = document.getElementById('qrcode');
    const txIdDisplay = document.getElementById('modal-tx-id');
    
    if(!qrContainer || !qrModal) {
        console.error("QR Modal elements not found");
        return;
    }

    qrContainer.innerHTML = ''; 
    if(txIdDisplay) txIdDisplay.textContent = txId;
    
    try {
        if(typeof QRCode === 'undefined') {
            console.error("QRCode library not loaded");
            qrContainer.innerHTML = "QR Error: Library missing";
            return;
        }
        
        new QRCode(qrContainer, {
            text: txId,
            width: 160,
            height: 160,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        
        qrModal.classList.remove('hidden');
    } catch(e) {
        console.error("QR Generation Error", e);
        qrContainer.innerHTML = "QR Generation Failed";
    }
}

// Logout
const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        console.log("Logging out...");
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch(e) { console.error(e); }
    });
}
