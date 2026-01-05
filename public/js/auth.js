// public/js/auth.js
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Listen for auth status
onAuthStateChanged(auth, (user) => {
    const isLoginPage = window.location.pathname.includes('login.html');
    
    if (user) {
        console.log('User is logged in:', user.email);
        if (isLoginPage) {
            // Redirect to index to let the router decide where they go
            window.location.href = '/index.html'; 
        }
    } else {
        console.log('User is logged out');
        // If not on login page, kick them to login
        if (!isLoginPage && window.location.pathname !== '/index.html') {
             // Optional: Uncomment this line when you are ready to lock the app
             // window.location.href = '/views/office/login.html';
        }
    }
});

export const AuthService = {
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth)
};