// public/js/auth.js
import { auth } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Listen for auth status
onAuthStateChanged(auth, (user) => {
    const isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/office/');
    
    if (user) {
        console.log('User is logged in:', user.email);
        if (isLoginPage) {
            // Redirect to dashboard if they are already logged in
            window.location.href = './views/office/dashboard.html'; 
        }
    } else {
        console.log('User is logged out');
        // If they are NOT on the login page, kick them back to it
        if (!isLoginPage) {
             window.location.href = '../../index.html';
        }
    }
});

export const AuthService = {
    loginWithGoogle: async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            // This gives you a Google Access Token. You can use it to access the Google API.
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            // The signed-in user info.
            const user = result.user;
            console.log("Logged in as: ", user.displayName);
            return user;
        } catch (error) {
            console.error("Login Failed:", error.message);
            throw error;
        }
    },
    logout: () => signOut(auth)
};