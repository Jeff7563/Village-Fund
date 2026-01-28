import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import './auth-guard.js';

const registerForm = document.getElementById('register-form');
const errorDiv = document.getElementById('error-message');
const submitBtn = document.getElementById('submit-btn');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('fullName').value;
        const idCard = document.getElementById('idCard').value;
        const phone = document.getElementById('phone').value;
        const address = document.getElementById('address').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            showError('รหัสผ่านไม่ตรงกัน');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังสร้างบัญชี...';
        hideError();

        try {
            // Set flag to prevent auth-guard from redirecting immediately
            sessionStorage.setItem('is_registering', 'true');

            // 1. Create User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Create Member Doc
            await setDoc(doc(db, "members", user.uid), {
                Member_ID: "MB" + Math.floor(1000 + Math.random() * 9000),
                Full_Name: fullName,
                ID_Card: idCard,
                Address: address,
                Phone: phone,
                Email: email,
                Balance: 0.00,
                Register_Date: serverTimestamp(),
                Role: 'member'
            });

            // 3. Success
            // Clear flag and redirect
            sessionStorage.removeItem('is_registering');
            window.location.href = '/';

        } catch (err) {
            console.error("Registration Error:", err);
            sessionStorage.removeItem('is_registering');
            showError('ลงทะเบียนไม่สำเร็จ: ' + formatError(err.code));
            submitBtn.disabled = false;
            submitBtn.textContent = 'ลงทะเบียน';
        }
    });
}

function formatError(code) {
    if (code === 'auth/email-already-in-use') return 'อีเมลนี้ถูกใช้งานแล้ว';
    if (code === 'auth/weak-password') return 'รหัสผ่านง่ายเกินไป (ต้องมี 6 ตัวอักษรขึ้นไป)';
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.className = 'p-4 mb-6 text-sm text-danger bg-red-50 rounded border border-red-100';
    errorDiv.classList.remove('hidden');
}

function hideError() {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
}
