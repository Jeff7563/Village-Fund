import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAtuzlbtKR3aMLoBZ7fjC9dZ2g3P0f5VEo",
  authDomain: "village-fund-65537.firebaseapp.com",
  projectId: "village-fund-65537",
  storageBucket: "village-fund-65537.firebasestorage.app",
  messagingSenderId: "24676382824",
  appId: "1:24676382824:web:6b0e55befa4394aa23a3dd",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
