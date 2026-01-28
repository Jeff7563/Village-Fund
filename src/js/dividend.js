import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
            <p class="text-muted">กำลังตรวจสอบสิทธิ์...</p>
        </div>
    `;
    
    const statusContainer = document.querySelector('.card.bg-surface > div');
    if(statusContainer) statusContainer.innerHTML = loadingHtml;
    if(window.lucide) window.lucide.createIcons();

    const [fundSettings] = await Promise.all([
        fetchFundStatus(),
        // We need fundSettings for checkEligibility, so we shouldn't run them parallel if dependent.
        // Actually, let's change flow: fetch settings first.
    ]);
    
    // Check Eligibility depends on Settings
    await checkEligibility(uid, fundSettings);
    await fetchDividends(uid);
}

async function fetchFundStatus() {
    try {
        const docRef = doc(db, "system", "fund_status");
        const docSnap = await getDoc(docRef);

        let data = {
            year: new Date().getFullYear(),
            profit: 0,
            rate: 0,
            minBalance: 1000,
            minMonths: 12
        };

        if (docSnap.exists()) {
            const snapData = docSnap.data();
            // Map Admin fields (year, rate, profit) to what we need
            // Admin saves: { year, rate, profit, minBalance, minMonths }
            data = { ...data, ...snapData };
        }

        const elYear = document.getElementById('fund-year');
        const elProfit = document.getElementById('fund-profit');
        const elRate = document.getElementById('fund-rate');

        if(elYear) elYear.textContent = data.year;
        if(elProfit) elProfit.textContent = formatCurrency(data.profit);
        if(elRate) elRate.textContent = data.rate + '%';

        return data;

    } catch (e) {
        console.error("Error loading fund status:", e);
        return null;
    }
}

async function checkEligibility(uid, settings) {
    if(!settings) settings = { minBalance: 1000, minMonths: 12 }; // Fallback

    try {
        const docRef = doc(db, "members", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const balance = data.Balance || 0;
            const regDate = data.Register_Date ? data.Register_Date.toDate() : new Date(); // Default to now if missing
            
            // 1. Check Membership Duration (Dynamic)
            // settings.minMonths (e.g., 12)
            const daysRequired = settings.minMonths * 30; // approx
            const daysMember = getDaysMember(regDate);
            const isMemberEnough = daysMember >= daysRequired;

            // 2. Check Monthly Deposits (Fetch transactions)
            const q = query(
                collection(db, "transactions"),
                where("memberId", "==", uid),
                where("type", "==", "deposit")
            );
            const transSnap = await getDocs(q);
            const deposits = [];
            transSnap.forEach(t => deposits.push(t.data()));

            // Identify Unique Months for the Fiscal Year
            // Standardizing on 'YYYY-M' format (M is 0-indexed: 0=Jan)
            const depositedMonths = new Set(deposits.map(d => {
                const date = d.transDate ? d.transDate.toDate() : new Date();
                return `${date.getFullYear()}-${date.getMonth()}`;
            }));
            
            // Generate Status for Calendar (Fiscal Year)
            const targetYear = settings.year || new Date().getFullYear();
            const monthlyStatus = [];
            const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
            
            let depositCountInYear = 0;

            for(let i=0; i<12; i++) {
                const key = `${targetYear}-${i}`;
                const hasDeposit = depositedMonths.has(key);
                if(hasDeposit) depositCountInYear++;
                
                monthlyStatus.push({
                    name: monthNames[i],
                    hasDeposit: hasDeposit
                });
            }

            // Simplify Logic: If checking for *this specific year's* dividend, 
            // maybe we should care about depositCountInYear vs settings.minMonths?
            // But preserving old logic (uniqueMonths.size) as fallback if user wants 'total' consistency?
            // User request implies checking THIS year's calendar.
            // Let's use depositCountInYear for the visual "Regular Deposit" rule match if we align STRICTLY to Fiscal Year.
            // But usually "12 months" means "Consistency". 
            // Let's accept if depositCountInYear == 12 OR if uniqueMonths.size >= 12?
            // The prompt asks for visual "Calendar". So let's lean on Fiscal Year data.
            
            const isRegular = depositCountInYear >= 12; // Strict for the grid visualization year

            // 3. Min Balance (Dynamic)
            const minBal = settings.minBalance;

            // Overall Eligibility
            const criteria = [
                { 
                    id: 'member',
                    label: `เป็นสมาชิก > ${settings.minMonths} เดือน`, 
                    pass: isMemberEnough, 
                    value: `${daysMember} วัน` 
                },
                { 
                    id: 'deposit',
                    label: `ฝากเงินสม่ำเสมอ (${targetYear})`, 
                    pass: isRegular, 
                    value: `${depositCountInYear}/12 เดือน`,
                    calendar: monthlyStatus // Pass grid data
                },
                { 
                    id: 'balance',
                    label: `เงินคงเหลือขั้นต่ำ > ${formatCurrency(minBal)}`, 
                    pass: balance >= minBal, 
                    value: formatCurrency(balance) 
                }
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
    const statusHeaderContainer = document.getElementById('eligibility-status-header');
    const listContainer = document.getElementById('criteria-list-container-inline');
    
    if (!statusHeaderContainer || !listContainer) return;
    
    // --- Stacked Dashboard Rendering (Inside Blue Card) ---
    // We reused these variable names, so we should either remove the declarations if they exist above 
    // or rename them. The best practice here since we edit blocks is to remove the duplicates if we can't see the whole scope, 
    // or just use the variables if they are already declared.
    
    // However, looking at previous edits, we likely have them declared at the very top of the function AND in the block we just added.
    // Let's remove the declarations in this block and just assign them, or if we need new ones, rename them.
    // Given the lint errors, they are definitely redeclared. 
    
    // Let's just use the existing variables if they match, or declare new ones with distinct names to be safe against previous code residue.
    const statusHeaderContainerInternal = document.getElementById('eligibility-status-header');
    const listContainerInternal = document.getElementById('criteria-list-container-inline');
    
    // Clean up external badge if it exists (from previous state)
    const externalBadge = document.getElementById('eligibility-badge-container');
    if (externalBadge) externalBadge.innerHTML = '';
    
    if (!statusHeaderContainerInternal || !listContainerInternal) return;
    
    // 1. Render Status Banner (Big Header Style)
    // Using a clean, high-contrast banner style
    const headerHtml = isEligible 
        ? `<div style="
                display: flex; align-items: center; justify-content: space-between;
                padding: 16px 24px; 
                background: rgba(255, 255, 255, 0.25); 
                backdrop-filter: blur(12px); 
                border: 1px solid rgba(255, 255, 255, 0.4); 
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                border-radius: 20px; 
                color: white; 
           ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 40px; height: 40px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #16a34a; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <i data-lucide="check" style="width: 24px; height: 24px; stroke-width: 3;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 800; font-size: 18px; line-height: 1.2;">ผ่านเกณฑ์การรับปันผล</div>
                        <div style="font-size: 12px; opacity: 0.9;">คุณได้รับสิทธิ์ปันผลปีนี้</div>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 12px;">
                    <i data-lucide="award" style="width: 24px; height: 24px; color: white;"></i>
                </div>
           </div>`
        : `<div style="
                display: flex; align-items: center; justify-content: space-between;
                padding: 16px 24px; 
                background: rgba(255, 255, 255, 0.25); 
                backdrop-filter: blur(12px); 
                border: 1px solid rgba(255, 255, 255, 0.4); 
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                border-radius: 20px; 
                color: white; 
           ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 40px; height: 40px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #dc2626; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <i data-lucide="lock" style="width: 20px; height: 20px; stroke-width: 2.5;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 800; font-size: 18px; line-height: 1.2;">ยังไม่ผ่านเกณฑ์</div>
                        <div style="font-size: 12px; opacity: 0.9;">กรุณาตรวจสอบเงื่อนไขด้านล่าง</div>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 12px;">
                    <i data-lucide="alert-circle" style="width: 24px; height: 24px; color: white;"></i>
                </div>
           </div>`;
           
    statusHeaderContainerInternal.innerHTML = headerHtml;

    // 2. Render Criteria List Items (Glass Cards)
    const renderItem = (c) => {
        // Special Layout for Calendar Item (Regular Deposit) to better fit mobile
        if (c.calendar) {
            const gridHtml = c.calendar.map(m => `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                    <div style="
                        width: 22px; height: 22px; 
                        border-radius: 50%;
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        background-color: ${m.hasDeposit ? '#dcfce7' : '#f3f4f6'}; 
                        color: ${m.hasDeposit ? '#15803d' : '#9ca3af'};
                        border: 1px solid ${m.hasDeposit ? '#bbf7d0' : '#e5e7eb'};
                        flex-shrink: 0;
                    ">
                        ${m.hasDeposit 
                            ? '<i data-lucide="check" style="width: 12px; height: 12px; stroke-width: 3;"></i>' 
                            : '<div style="width: 5px; height: 5px; background-color: currentColor; border-radius: 50%;"></div>'}
                    </div>
                    <span style="font-size: 9px; color: #64748b; font-weight: 600; white-space: nowrap;">${m.name}</span>
                </div>
            `).join('');

            return `
                <div style="
                    background-color: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(4px);
                    border-left: 5px solid ${c.pass ? '#22c55e' : '#f87171'};
                    border-radius: 16px;
                    padding: 16px 20px;
                    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.1);
                    display: flex; 
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 12px;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    
                    <!-- Top Row: Label & Status Badge -->
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%;">
                        <div style="display: flex; flex-direction: column;">
                             <span style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">${c.label}</span>
                        </div>
                        
                        <div style="text-align: right; flex-shrink: 0; margin-left: 12px;">
                            <span style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; background-color: ${c.pass ? '#dcfce7' : '#fee2e2'}; color: ${c.pass ? '#15803d' : '#991b1b'}; white-space: nowrap; border: 1px solid ${c.pass ? '#86efac' : '#fca5a5'};">
                                ${c.value}
                            </span>
                        </div>
                    </div>

                    <!-- Bottom Row: Calendar Grid (Full Width) -->
                    <div style="
                        display: flex; 
                        justify-content: space-between; 
                        overflow-x: auto; 
                        -webkit-overflow-scrolling: touch; 
                        padding-bottom: 4px;
                        gap: 4px;
                    ">
                        ${gridHtml}
                    </div>
                </div>
            `;
        }

        // Standard Layout for other items
        const borderLeftColor = c.pass ? '#22c55e' : '#f87171'; 
        
        return `
            <div style="
                background-color: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(4px);
                border-left: 5px solid ${borderLeftColor};
                border-radius: 16px;
                padding: 16px 20px;
                box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.1);
                display: flex; 
                align-items: center;
                justify-content: space-between;
                min-height: 72px;
                margin-bottom: 12px;
                transition: transform 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                 
                 <!-- Icon & Title -->
                 <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">${c.label}</span>
                        <span style="font-size: 12px; color: #64748b; font-weight: 500;">ปัจจุบัน: <span style="color: #334155;">${c.value}</span></span>
                    </div>
                 </div>

                 <!-- Right Status Badge -->
                 <div style="text-align: right; flex-shrink: 0; margin-left: 12px;">
                    <span style="font-size: 14px; font-weight: 800; color: ${c.pass ? '#16a34a' : '#ef4444'}; white-space: nowrap;">${c.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</span>
                 </div>
            </div>
        `;
    };

    const criteriaHtml = criteria.map(renderItem).join('');
    listContainerInternal.innerHTML = criteriaHtml;
    
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
            listBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-muted">ไม่พบประวัติการรับปันผล</td></tr>';
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
        listBody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-muted">ไม่มีข้อมูล</td></tr>';
    }
}

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(num || 0);
}

// Logout
const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch(e) { console.error(e); }
    });
}
