// public/js/auth.js
//
// Google sign-in, gated to @hamburgdoor.com email addresses.
// Firestore rules also enforce this server-side; the client check is
// for user-friendly messaging, not security.

import { auth } from '/js/firebase-config.js';
import {
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Domain allowlist. Extend this list if other internal domains ever need access.
export const ALLOWED_DOMAINS = ['hamburgdoor.com'];

function emailIsAllowed(email) {
    if (!email || typeof email !== 'string') return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return ALLOWED_DOMAINS.includes(domain);
}

// Listen for auth status
onAuthStateChanged(auth, async (user) => {
    const isLoginPage = window.location.pathname === '/' ||
                        window.location.pathname.includes('index.html');

    if (user) {
        // Gate: only @hamburgdoor.com accounts can stay signed in.
        if (!emailIsAllowed(user.email)) {
            console.warn('Access denied for email:', user.email);
            try { await signOut(auth); } catch (_) {}
            // Stash the rejected email so the login page can show a friendly message
            sessionStorage.setItem('hd-auth-rejected-email', user.email || '');
            sessionStorage.setItem('hd-auth-rejected-reason', 'domain');
            if (!isLoginPage) window.location.href = '/index.html';
            return;
        }

        console.log('User is logged in:', user.email);
        if (isLoginPage) {
            window.location.href = '/views/forms/dashboard.html';
        }
    } else {
        console.log('User is logged out');
        if (!isLoginPage) {
            window.location.href = '/index.html';
        }
    }
});

export const AuthService = {
    loginWithGoogle: async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Pre-check domain here too. If the user signed in with a
            // non-hamburgdoor Google account, reject immediately with a
            // clear message (instead of letting onAuthStateChanged kick
            // them out moments later).
            if (!emailIsAllowed(user.email)) {
                try { await signOut(auth); } catch (_) {}
                const err = new Error(
                    `Access denied. The staff portal is restricted to @hamburgdoor.com accounts. ` +
                    `You signed in as ${user.email}.`
                );
                err.code = 'auth/domain-not-allowed';
                throw err;
            }

            console.log("Logged in as: ", user.displayName);
            return user;
        } catch (error) {
            console.error("Login Failed:", error.message);
            throw error;
        }
    },
    logout: () => signOut(auth)
};
