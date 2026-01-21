import { auth } from './firebase.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import './auth-guard.js'; 

const loginForm = document.getElementById('login-form');
const errorDiv = document.getElementById('error-message');
const submitBtn = document.getElementById('submit-btn');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = '/';
        } catch (error) {
            console.error(error);
            errorDiv.textContent = 'Failed to log in. Please check your credentials.';
            errorDiv.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    });
}
