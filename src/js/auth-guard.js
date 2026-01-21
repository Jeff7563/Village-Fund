import { auth } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname;

    if (!user) {
        // Redirect to login if NOT authenticated and NOT on public pages
        if (!path.includes('login.html') && !path.includes('register.html')) {
            window.location.href = '/login.html';
        }
    } else {
        // User IS authenticated
        
        // CRITICAL FIX: If we are on register page AND currently ensuring registration data is saved, DO NOT REDIRECT yet.
        if (path.includes('register.html') && sessionStorage.getItem('is_registering') === 'true') {
            console.log("Auth Guard: Letting registration finish...");
            return;
        }

        // If logged in and trying to view public pages, go to index
        if (path.includes('login.html') || path.includes('register.html')) {
            window.location.href = '/';
        }
    }
});
