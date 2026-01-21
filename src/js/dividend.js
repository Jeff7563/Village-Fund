import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        initDividendPage(user.uid);
    }
});

async function initDividendPage(uid) {
    const loadingHtml = `
        <div class="text-center p-8">
            <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-primary mb-2"></i>
            <p class="text-muted">Checking eligibility...</p>
        </div>
    `;
    
    const statusContainer = document.querySelector('.card.bg-surface > div');
    if(statusContainer) statusContainer.innerHTML = loadingHtml;
    if(window.lucide) window.lucide.createIcons();

    await Promise.all([
        fetchFundStatus(),
        checkEligibility(uid),
        fetchDividends(uid)
    ]);
}

async function fetchFundStatus() {
    try {
        const docRef = doc(db, "system", "fund_status");
        const docSnap = await getDoc(docRef);

        let data;
        if (docSnap.exists()) {
            data = docSnap.data();
        } else {
            // Demo: Auto-create if missing
            data = {
                fiscalYear: new Date().getFullYear(),
                netProfit: 1500000.00,
                dividendRate: 4.5
            };
            await setDoc(docRef, data);
        }

        const elYear = document.getElementById('fund-year');
        const elProfit = document.getElementById('fund-profit');
        const elRate = document.getElementById('fund-rate');

        if(elYear) elYear.textContent = data.fiscalYear;
        if(elProfit) elProfit.textContent = formatCurrency(data.netProfit);
        if(elRate) elRate.textContent = data.dividendRate + '%';

    } catch (e) {
        console.error("Error loading fund status:", e);
    }
}

async function checkEligibility(uid) {
    try {
        const docRef = doc(db, "members", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const balance = data.Balance || 0;
            const regDate = data.Register_Date ? data.Register_Date.toDate() : new Date(); // Default to now if missing
            
            // 1. Check Membership Duration (> 1 Year)
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const isMemberMoreThanYear = regDate <= oneYearAgo;

            // 2. Check Monthly Deposits (Fetch transactions)
            const q = query(
                collection(db, "transactions"),
                where("memberId", "==", uid),
                where("type", "==", "deposit")
            );
            const transSnap = await getDocs(q);
            const deposits = [];
            transSnap.forEach(t => deposits.push(t.data()));

            const uniqueMonths = new Set(deposits.map(d => {
                const date = d.transDate ? d.transDate.toDate() : new Date();
                return `${date.getFullYear()}-${date.getMonth()}`;
            }));
            
            const isRegular = uniqueMonths.size >= 12; // Strict 12 months rule

            // Overall Eligibility
            const criteria = [
                { label: "Membership > 1 Year", pass: isMemberMoreThanYear, current: `${getDaysMember(regDate)} days` },
                { label: "Regular Deposit (12 Months)", pass: isRegular, current: `${uniqueMonths.size} months` },
                { label: "Min Balance > ฿1,000", pass: balance >= 1000, current: formatCurrency(balance) }
            ];

            const allPass = criteria.every(c => c.pass);

            renderEligibilityUI(allPass, criteria);
        }
    } catch (e) {
        console.error("Error checking eligibility:", e);
    }
}

function getDaysMember(date) {
    const diff = new Date() - date;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function renderEligibilityUI(isEligible, criteria) {
    const statusContainer = document.querySelector('.card.bg-surface > div');
    if (!statusContainer) return;

    let criteriaHtml = criteria.map(c => `
        <div class="flex justify-between items-center text-sm mb-2 pb-2 border-b border-gray-50 last:border-0">
            <span class="text-muted flex items-center gap-2">
                <i data-lucide="${c.pass ? 'check' : 'x'}" class="w-4 h-4 ${c.pass ? 'text-green-500' : 'text-red-400'}"></i>
                ${c.label}
            </span>
            <span class="font-medium ${c.pass ? 'text-green-600' : 'text-danger'}">${c.current}</span>
        </div>
    `).join('');

    if (isEligible) {
        statusContainer.innerHTML = `
            <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="check-circle" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-4">You are eligible!</h3>
            <div class="bg-gray-50 rounded-lg p-4 text-left">
                ${criteriaHtml}
            </div>
        `;
    } else {
        statusContainer.innerHTML = `
            <div class="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="x-circle" class="w-8 h-8"></i>
            </div>
            <h3 class="font-bold text-lg mb-1 text-gray-600">Not Eligible Yet</h3>
            <p class="text-xs text-muted mb-4">You need to meet all criteria below:</p>
            <div class="bg-gray-50 rounded-lg p-4 text-left">
                ${criteriaHtml}
            </div>
        `;
    }
    if(window.lucide) window.lucide.createIcons();
}

async function fetchDividends(uid) {
    const listBody = document.getElementById('dividend-list');
    if (!listBody) return;

    // ... (Same fetching logic as before) ...
    try {
        const q = query(collection(db, "dividends"), where("memberId", "==", uid));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            listBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-muted">No dividend history found</td></tr>';
            return;
        }

        listBody.innerHTML = '';
        const docs = [];
        snapshot.forEach(doc => docs.push(doc.data()));
        docs.sort((a, b) => b.year - a.year);

        docs.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-4 font-medium">${d.year}</td>
                <td class="p-4 text-right text-muted">${formatCurrency(d.totalSaving)}</td>
                <td class="p-4 text-right font-bold text-green-600">+${formatCurrency(d.amount)}</td>
            `;
            listBody.appendChild(tr);
        });
    } catch (err) {
        listBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-muted">No data available</td></tr>';
    }
}

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}
