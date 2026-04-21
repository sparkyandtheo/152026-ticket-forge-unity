// public/js/firebase-config.js

// 1. Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
// UPDATED: Imported enableMultiTabIndexedDbPersistence
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// 2. Your Specific Configuration
// Project: hamburg-door-ops (Hamburg Door Staff Portal)
// Registered 2026-04-21 under william@hamburgdoor.com
const firebaseConfig = {
  apiKey: "AIzaSyAjrqfUHhTw8u9ohwksE0FPlr1TvL6LLX8",
  authDomain: "hamburg-door-ops.firebaseapp.com",
  projectId: "hamburg-door-ops",
  storageBucket: "hamburg-door-ops.firebasestorage.app",
  messagingSenderId: "406049238606",
  appId: "1:406049238606:web:703204bd5dc17ba4bb9d1f",
  measurementId: "G-NBLEGYCM6P"
};

// 3. Initialize the App
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app); 
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// 4. Enable Offline Persistence (Multi-Tab Support)
// This allows the app to work offline even if open in multiple tabs.
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open (and multi-tab support failed)');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not available in this browser');
    }
});

// 5. Export these tools so auth.js and db.js can use them
export { app, analytics, db, auth, storage };