import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';
import { checkAndShowAdminNav } from './admin-utils.js';

const amountInput = document.getElementById('amount');
const submitBtn = document.getElementById('confirm-btn');
const currentBalanceEl = document.getElementById('member-balance');
const memberNameEl = document.getElementById('member-name');
const memberIdEl = document.getElementById('member-id');

const depositBtn = document.getElementById('btn-deposit');
const withdrawBtn = document.getElementById('btn-withdraw');
const transForm = document.getElementById('trans-form');

// Sections
const loadingState = document.getElementById('loading-state');
const transactionSection = document.getElementById('transaction-section');

// Modal
const qrModal = document.getElementById('qr-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

let currentTransactionType = 'deposit'; 
let currentUser = null;
let currentBalance = 0;

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await checkAndShowAdminNav(user);
        await loadMemberData(user.uid);
        // We can load history if we had a place for it, but transaction.html doesn't seem to have a list container?
        // Checking HTML... HTML doesn't have a list container for history in the "New Transaction" page view provided.
        // It focus on "New Transaction". 
        // So no loadHistory() call here, or we need to add a history section to HTML.
        // User asked for "Transaction Approval Flow" -> QR Code.
        // The dashboard has history. 
    }
});

// UI Event Listeners
if(depositBtn) depositBtn.addEventListener('click', () => setType('deposit'));
if(withdrawBtn) withdrawBtn.addEventListener('click', () => setType('withdraw'));
if(closeModalBtn) closeModalBtn.addEventListener('click', hideWrapper);
if(transForm) transForm.addEventListener('submit', handleTransaction);

function setType(type) {
    currentTransactionType = type;
    
    // Update UI Classes
    if (type === 'deposit') {
        depositBtn.classList.add('active', 'border-green-500', 'bg-green-50', 'text-green-700');
        depositBtn.classList.remove('border-gray-100', 'bg-gray-50', 'text-gray-500');
        
        withdrawBtn.classList.remove('active', 'border-red-500', 'bg-red-50', 'text-red-700');
        withdrawBtn.classList.add('border-gray-100', 'bg-gray-50', 'text-gray-500');

        submitBtn.textContent = 'Confirm Deposit';
        submitBtn.classList.remove('btn-danger', 'shadow-red-200');
        submitBtn.classList.add('btn-primary', 'shadow-blue-200');
        
        document.getElementById('withdraw-warning').classList.add('hidden');
    } else {
        withdrawBtn.classList.add('active', 'border-red-500', 'bg-red-50', 'text-red-700');
        withdrawBtn.classList.remove('border-gray-100', 'bg-gray-50', 'text-gray-500');

        depositBtn.classList.remove('active', 'border-green-500', 'bg-green-50', 'text-green-700');
        depositBtn.classList.add('border-gray-100', 'bg-gray-50', 'text-gray-500');

        submitBtn.textContent = 'Confirm Withdraw';
        submitBtn.classList.remove('btn-primary', 'shadow-blue-200');
        submitBtn.classList.add('btn-danger', 'shadow-red-200');

        document.getElementById('withdraw-warning').classList.remove('hidden');
    }
}

async function loadMemberData(uid) {
    try {
        const docRef = doc(db, "members", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentBalance = data.Balance || 0;
            
            if(currentBalanceEl) currentBalanceEl.textContent = formatCurrency(currentBalance);
            if(memberIdEl) memberIdEl.textContent = data.Member_ID || 'MB-XXX';
            if(memberNameEl) memberNameEl.textContent = data.Full_Name || 'Member';
            
            // Show Content
            if(loadingState) loadingState.classList.add('hidden');
            if(transactionSection) transactionSection.classList.remove('hidden');

            if(window.lucide) window.lucide.createIcons();
        }
    } catch (e) {
        console.error("Error loading member:", e);
        if(loadingState) loadingState.innerHTML = `<p class="text-red-500">Failed to load data. Please refresh.</p>`;
    }
}

async function handleTransaction(e) {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    if (currentTransactionType === 'withdraw' && amount > currentBalance) {
        alert('Insufficient balance');
        return;
    }

    if (!currentUser) return;

    if (!confirm(`Confirm ${currentTransactionType} of ${formatCurrency(amount)}?`)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        // 1. Create PENDING Transaction
        const txDoc = await addDoc(collection(db, "transactions"), {
            memberId: currentUser.uid,
            type: currentTransactionType, 
            amount: amount,
            transDate: serverTimestamp(),
            status: 'pending', 
            description: `Request via App`
        });

        // 2. Show QR Code
        showQRModal(txDoc.id);

        // Reset Form
        amountInput.value = '';

    } catch (err) {
        console.error("Transaction Error:", err);
        alert("Transaction failed: " + err.message);
    } finally {
        submitBtn.disabled = false;
        setType(currentTransactionType); // Reset button text
    }
}

function showQRModal(txId) {
    const qrContainer = document.getElementById('qrcode');
    const txIdDisplay = document.getElementById('modal-tx-id');
    
    if(!qrContainer || !qrModal) return;

    qrContainer.innerHTML = ''; 
    if(txIdDisplay) txIdDisplay.textContent = txId;
    
    try {
        new QRCode(qrContainer, {
            text: txId,
            width: 160,
            height: 160,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } catch(e) {
        console.error("QR Error", e);
        qrContainer.innerHTML = "QR Lib Error";
    }

    qrModal.classList.remove('hidden');
}

function hideWrapper() {
    if(qrModal) qrModal.classList.add('hidden');
}

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}
