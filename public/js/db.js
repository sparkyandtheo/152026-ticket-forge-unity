// public/js/db.js
import { db } from './firebase-config.js';
import { collection, doc, setDoc, getDoc, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Helper to sanitize data (remove undefined values)
const clean = (obj) => JSON.parse(JSON.stringify(obj));

export const DB = {
    // --- GENERIC SAVER (Works for any collection) ---
    async saveDoc(collectionName, data, id = null) {
        const payload = clean({ ...data, lastUpdated: serverTimestamp() });
        if (id) {
            await setDoc(doc(db, collectionName, id), payload, { merge: true });
            return id;
        } else {
            const ref = await addDoc(collection(db, collectionName), payload);
            return ref.id;
        }
    },

    // --- GENERIC LOADER ---
    async getDoc(collectionName, id) {
        const snap = await getDoc(doc(db, collectionName, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    // --- CUSTOMER ROLODEX (Phone Lookup) ---
    async findCustomerByPhone(phoneNumber) {
        // Remove non-numeric chars for better matching if needed, 
        // but for now we assume exact match or strict formatting.
        const q = query(collection(db, "customers"), where("phone", "==", phoneNumber));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data();
        }
        return null;
    },

    async saveCustomer(data) {
        // Use Phone as ID for uniqueness, or auto-ID if no phone
        if (data.phone) {
            await setDoc(doc(db, "customers", data.phone), clean(data), { merge: true });
        } else {
            await addDoc(collection(db, "customers"), clean(data));
        }
    }
};