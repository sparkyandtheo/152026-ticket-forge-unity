// public/js/db.js
import { db } from '/js/firebase-config.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    addDoc, 
    serverTimestamp, 
    query, 
    where, 
    getDocs,
    runTransaction 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const clean = (obj) => JSON.parse(JSON.stringify(obj));

export const DB = {
    // --- GENERIC SAVER ---
    async saveDoc(collectionName, data, id = null) {
        const payload = clean({ ...data, lastUpdated: serverTimestamp() });
        if (id) {
            // If ID is provided (e.g. "600001"), use it as the Document ID
            await setDoc(doc(db, collectionName, id), payload, { merge: true });
            return id;
        } else {
            const ref = await addDoc(collection(db, collectionName), payload);
            return ref.id;
        }
    },

    async getDoc(collectionName, id) {
        const snap = await getDoc(doc(db, collectionName, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async findCustomerByPhone(phoneNumber) {
        const q = query(collection(db, "customers"), where("phone", "==", phoneNumber));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data();
        }
        return null;
    },

    async saveCustomer(data) {
        if (data.phone) {
            await setDoc(doc(db, "customers", data.phone), clean(data), { merge: true });
        } else {
            await addDoc(collection(db, "customers"), clean(data));
        }
    },

    // --- SEQUENTIAL ID GENERATOR ---
    async getNewId(counterName, startFrom = 1000) {
        const counterRef = doc(db, "counters", counterName);
        
        try {
            const newId = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                
                let currentCount;
                if (!counterDoc.exists()) {
                    // Start at the requested number if no counter exists
                    currentCount = startFrom;
                } else {
                    currentCount = counterDoc.data().count;
                }

                // If the current database count is somehow LOWER than our desired start
                // (e.g. we changed logic), jump up to the start number.
                if(currentCount < startFrom) {
                    currentCount = startFrom;
                }

                const nextCount = currentCount + 1;
                transaction.set(counterRef, { count: nextCount });
                return nextCount;
            });
            
            return newId.toString(); // Return as string
        } catch (e) {
            console.error("ID Generation Failed: ", e);
            return "ERR-" + Date.now();
        }
    }
};