// public/js/auth.js

// 1. FIX: Use Absolute Path (starts with /) so it works from any subfolder
import { auth } from '/js/firebase-config.js'; 
import { 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Listen for auth status
onAuthStateChanged(auth, (user) => {
    // Check if we are currently on the login page
    const isLoginPage = window.location.pathname === '/' || 
                        window.location.pathname.includes('index.html');
    
    if (user) {
        console.log('User is logged in:', user.email);
        if (isLoginPage) {
            // FIX: Absolute path redirect to Dashboard
            window.location.href = '/views/office/dashboard.html'; 
        }
    } else {
        console.log('User is logged out');
        // If logged out and NOT on login page, kick them back to Login
        if (!isLoginPage) {
             // FIX: Absolute path redirect to Login
             window.location.href = '/index.html';
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