import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';

const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const addressInput = document.getElementById('address');
const profileForm = document.getElementById('profile-form');
const saveBtn = document.getElementById('save-btn');
const msgDiv = document.getElementById('profile-message');

let currentUid = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        loadProfile(user.uid);
    }
});

async function loadProfile(uid) {
    try {
        const docRef = doc(db, "members", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            fullNameInput.value = data.Full_Name || '';
            phoneInput.value = data.Phone || '';
            addressInput.value = data.Address || '';
        }
    } catch (e) {
        console.error("Error loading profile:", e);
        showMsg("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้", "error");
    }
}

if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUid) return;

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> กำลังบันทึก...`;
        if(window.lucide) window.lucide.createIcons();

        try {
            const docRef = doc(db, "members", currentUid);
            await updateDoc(docRef, {
                Full_Name: fullNameInput.value,
                Phone: phoneInput.value,
                Address: addressInput.value
            });
            showMsg("บันทึกข้อมูลเรียบร้อยแล้ว!", "success");
        } catch (e) {
            console.error("Error updating profile:", e);
            showMsg("บันทึกข้อมูลไม่สำเร็จ", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <span class="flex items-center gap-2">
                    <i data-lucide="save" class="w-4 h-4"></i> 
                    บันทึกการเปลี่ยนแปลง
                </span>
            `;
            if(window.lucide) window.lucide.createIcons();
        }
    });
}

function showMsg(msg, type) {
    msgDiv.textContent = msg;
    msgDiv.className = `p-3 mb-4 text-sm rounded text-center ${type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`;
    msgDiv.classList.remove('hidden');
    setTimeout(() => msgDiv.classList.add('hidden'), 3000);
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
