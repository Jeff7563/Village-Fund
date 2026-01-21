// Shared Admin Role Check Utility
import { auth, db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function checkAndShowAdminNav(user) {
    try {
        // Check email
        if (user.email.toLowerCase().includes('admin')) {
            showAdminNav();
            return true;
        }
        
        // Check role field
        const memberDoc = await getDoc(doc(db, "members", user.uid));
        if (memberDoc.exists() && memberDoc.data().role === 'admin') {
            showAdminNav();
            return true;
        }
        
        return false;
    } catch (e) {
        console.error("Error checking admin role:", e);
        return false;
    }
}

function showAdminNav() {
    const adminLink = document.getElementById('admin-nav-link');
    const adminDivider = document.getElementById('admin-nav-divider');
    if (adminLink) adminLink.classList.remove('hidden');
    if (adminDivider) adminDivider.classList.remove('hidden');
}
