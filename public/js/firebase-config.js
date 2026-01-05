// public/js/firebase-config.js

// 1. Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// 2. Your Specific Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBYwmWn_uLTCsTbmMO0R6LrPIwCr5yxAsU",
  authDomain: "planar-alliance-448817-h0.firebaseapp.com",
  projectId: "planar-alliance-448817-h0",
  storageBucket: "planar-alliance-448817-h0.firebasestorage.app",
  messagingSenderId: "1049899901887",
  appId: "1:1049899901887:web:eefd89e745cfa77cafb70a",
  measurementId: "G-QMVM7J0YDF"
};

// 3. Initialize the App
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app); 
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// 4. Enable Offline Persistence
// This allows the app to work when the tech loses cell service.
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not available in this browser');
    }
});

// 5. Export these tools so auth.js and db.js can use them
export { app, analytics, db, auth, storage };