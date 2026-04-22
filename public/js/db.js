// public/js/db.js
import { db, auth } from '/js/firebase-config.js';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    deleteDoc as fsDeleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    getDocs,
    onSnapshot,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firestore cannot serialize `undefined`. The clean() helper strips them.
const clean = (obj) => JSON.parse(JSON.stringify(obj));

// ============================================================
// Customer cache — single source of truth for rolodex lookups.
//
// On first call to DB.startCustomerCache(), subscribes to the full
// customers collection and keeps a local Map in sync. Autocomplete
// searches run in memory against this cache. One read per customer per
// session; updates come in via onSnapshot deltas.
// ============================================================

let customerCache = new Map();   // id -> customer doc
let cacheStarted = false;
let cacheReady = false;
const cacheListeners = [];        // callbacks to fire when cache changes

function notifyCacheListeners() {
    for (const fn of cacheListeners) {
        try { fn([...customerCache.values()]); } catch (e) { console.error(e); }
    }
}

export const DB = {
    // ============================================================
    // Generic CRUD
    // ============================================================
    async saveDoc(collectionName, data, id = null) {
        const payload = clean({ ...data, lastUpdated: serverTimestamp() });

        // Stamp authorship on first create (doesn't overwrite on updates).
        // `createdByEmail` is used by the notification bell to route
        // 'Attention' alerts back to whoever opened the ticket.
        if (!id && auth && auth.currentUser && auth.currentUser.email) {
            if (!payload.createdByEmail) payload.createdByEmail = auth.currentUser.email;
            if (!payload.createdAt) payload.createdAt = serverTimestamp();
        }

        if (id) {
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

    async deleteDoc(collectionName, id) {
        await fsDeleteDoc(doc(db, collectionName, id));
    },

    async getAll(collectionName, orderByField = null) {
        const q = orderByField
            ? query(collection(db, collectionName), orderBy(orderByField))
            : collection(db, collectionName);
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    // ============================================================
    // Duplicate detection
    //
    // Returns any docs in `collectionName` saved within the last
    // `withinMinutes` that match the given customer identity. Used by
    // forms before save to warn against accidental double-create.
    //
    // Matches by normalizedPhone OR normalizedName (whichever exists),
    // scoped to active docs (ignores Converted / Complete / Closed).
    // ============================================================
    async findRecentDuplicates(collectionName, identity, withinMinutes = 5) {
        const docs = await DB.getAll(collectionName);
        const cutoffMs = Date.now() - withinMinutes * 60 * 1000;
        const norm = (s) => (s || '').toString().replace(/\s+/g, ' ').trim().toUpperCase();
        const wantPhone = norm(identity.phone);
        const wantName  = norm(identity.name);
        if (!wantPhone && !wantName) return [];

        return docs.filter(d => {
            // Must be recent. Firestore serverTimestamp -> {seconds, nanoseconds} or Date.
            const ts = d.lastUpdated;
            let ms = null;
            if (ts && typeof ts.toMillis === 'function') ms = ts.toMillis();
            else if (ts && typeof ts.seconds === 'number') ms = ts.seconds * 1000;
            else if (ts instanceof Date) ms = ts.getTime();
            else if (typeof ts === 'string') { const d2 = new Date(ts); if (!isNaN(d2)) ms = d2.getTime(); }
            if (ms === null || ms < cutoffMs) return false;

            // Skip records that are already closed out.
            const inactive = new Set(['Converted', 'Complete', 'Closed', 'Cancelled']);
            if (inactive.has(d.status)) return false;

            const phoneMatch = wantPhone && norm(d.phone) === wantPhone;
            const nameMatch  = wantName  && norm(d.customerName) === wantName;
            return phoneMatch || nameMatch;
        });
    },

    // ============================================================
    // Sequential ID generator
    // ============================================================
    async getNewId(counterName, startFrom = 1000) {
        const counterRef = doc(db, "counters", counterName);
        try {
            const newId = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let currentCount = counterDoc.exists() ? counterDoc.data().count : startFrom;
                if (currentCount < startFrom) currentCount = startFrom;
                const nextCount = currentCount + 1;
                transaction.set(counterRef, { count: nextCount });
                return nextCount;
            });
            return newId.toString();
        } catch (e) {
            console.error("ID Generation Failed: ", e);
            return "ERR-" + Date.now();
        }
    },

    // ============================================================
    // Customer model (new, richer shape)
    //
    //   customers/{id} = {
    //     name: string,
    //     primaryPhone: string,
    //     alternatePhones: string[],
    //     billingAddress1: string,
    //     billingAddress2: string,
    //     jobSites: [
    //       { label?: string, address1: string, address2: string }
    //     ]
    //   }
    //
    // Legacy docs with flat { phone, address1, address2 } still load
    // via readers that tolerate either shape.
    // ============================================================

    // Start the background subscription. Safe to call many times.
    async startCustomerCache() {
        if (cacheStarted) return;
        cacheStarted = true;
        onSnapshot(collection(db, 'customers'), (snap) => {
            customerCache = new Map();
            snap.forEach(d => customerCache.set(d.id, { id: d.id, ...d.data() }));
            cacheReady = true;
            notifyCacheListeners();
        }, (err) => {
            console.warn('[rolodex] customer cache failed to start:', err.message);
            cacheReady = true; // mark ready anyway so UIs unblock; cache stays empty
            notifyCacheListeners();
        });
    },

    onCustomerCacheChange(fn) {
        cacheListeners.push(fn);
        // Fire immediately with current state
        if (cacheReady) fn([...customerCache.values()]);
    },

    isCustomerCacheReady() { return cacheReady; },

    getAllCustomers() {
        return [...customerCache.values()];
    },

    // ============================================================
    // Rolodex search: the one function autocomplete calls.
    //
    // Returns up to `limit` matches of the form:
    //   {
    //     customer: <full customer doc>,
    //     match: { type: 'phone' | 'billing' | 'job-site' | 'name',
    //              field: <string>,
    //              jobSiteIndex?: <int> }   // only when type==='job-site'
    //   }
    //
    // Searches across:
    //   - customer.name
    //   - customer.primaryPhone + alternatePhones
    //   - customer.billingAddress1 + billingAddress2
    //   - every entry in customer.jobSites[]
    //   - legacy flat fields (phone, address1, address2) for not-yet-migrated docs
    // ============================================================
    searchCustomers(raw, limit = 6) {
        const q = (raw || '').trim().toUpperCase();
        if (q.length < 3) return [];
        const results = [];

        const match = (hay) => typeof hay === 'string' && hay.toUpperCase().includes(q);

        for (const c of customerCache.values()) {
            // Normalize phone fields (support both new + legacy shape)
            const phones = [
                c.primaryPhone,
                c.phone, // legacy
                ...(Array.isArray(c.alternatePhones) ? c.alternatePhones : [])
            ].filter(Boolean);
            for (const p of phones) {
                if (match(p)) {
                    results.push({ customer: c, match: { type: 'phone', field: p } });
                    break;
                }
            }

            if (match(c.name)) {
                results.push({ customer: c, match: { type: 'name', field: c.name } });
            }

            // Billing address
            const ba1 = c.billingAddress1 || c.address1;   // legacy fallback
            const ba2 = c.billingAddress2 || c.address2;
            if (match(ba1) || match(ba2)) {
                results.push({
                    customer: c,
                    match: { type: 'billing', field: [ba1, ba2].filter(Boolean).join(', ') }
                });
            }

            // Every job site
            if (Array.isArray(c.jobSites)) {
                c.jobSites.forEach((site, i) => {
                    if (match(site.address1) || match(site.address2) || match(site.label)) {
                        results.push({
                            customer: c,
                            match: {
                                type: 'job-site',
                                field: [site.address1, site.address2].filter(Boolean).join(', '),
                                jobSiteIndex: i
                            }
                        });
                    }
                });
            }
        }

        // Dedupe by (customer.id + match.type + match.jobSiteIndex)
        const seen = new Set();
        const deduped = [];
        for (const r of results) {
            const key = r.customer.id + ':' + r.match.type + ':' + (r.match.jobSiteIndex ?? '');
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(r);
            if (deduped.length >= limit) break;
        }
        return deduped;
    },

    // ============================================================
    // Save customer from a form payload (billing + optional job site).
    //
    // Modes:
    //   opts.customerId (existing id)       → update existing customer
    //   + opts.addJobSite                    → also add this job site to jobSites[]
    //   (no customerId)                      → create new
    //
    // If phone is provided and no customerId, we also search existing
    // customers and return { id, created, existingMatch } so the caller
    // can decide whether to prompt the user.
    // ============================================================
    async upsertCustomer(payload, opts = {}) {
        const data = clean({
            name: payload.name || '',
            primaryPhone: payload.primaryPhone || payload.phone || '',
            alternatePhones: payload.alternatePhones || [],
            billingAddress1: payload.billingAddress1 || payload.address1 || '',
            billingAddress2: payload.billingAddress2 || payload.address2 || '',
            jobSites: Array.isArray(payload.jobSites) ? payload.jobSites : [],
            accountId: payload.accountId || ''
        });

        // Branch 1: explicit customer id → merge
        if (opts.customerId) {
            const existing = await DB.getDoc('customers', opts.customerId) || {};
            const merged = { ...existing, ...data, id: undefined };
            // Add job site if requested and not already present
            if (opts.addJobSite && opts.addJobSite.address1) {
                const sites = Array.isArray(existing.jobSites) ? [...existing.jobSites] : [];
                const norm = (s) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();
                const already = sites.find(s =>
                    norm(s.address1) === norm(opts.addJobSite.address1) &&
                    norm(s.address2) === norm(opts.addJobSite.address2));
                if (!already) sites.push(clean(opts.addJobSite));
                merged.jobSites = sites;
            }
            await setDoc(doc(db, 'customers', opts.customerId),
                { ...merged, lastUpdated: serverTimestamp() },
                { merge: true });
            return { id: opts.customerId, created: false };
        }

        // Branch 2: no id → create fresh (auto id)
        const ref = await addDoc(collection(db, 'customers'),
            { ...data, lastUpdated: serverTimestamp() });
        return { id: ref.id, created: true };
    },

    // ============================================================
    // Legacy helpers (kept for backward compatibility with existing forms)
    // ============================================================
    async findCustomerByPhone(phoneNumber) {
        // Delegate to the cache + searcher. Returns the FIRST match, or null.
        const matches = DB.searchCustomers(phoneNumber, 1);
        if (matches.length === 0) return null;
        // Return legacy shape for backward compat
        const c = matches[0].customer;
        return {
            name: c.name,
            phone: c.primaryPhone || c.phone,
            address1: c.billingAddress1 || c.address1,
            address2: c.billingAddress2 || c.address2,
            id: c.accountId || c.id
        };
    },

    async saveCustomer(data) {
        // Legacy entry point from the old updateRolodex flow. Maps the flat
        // shape to the new upsert API.
        return DB.upsertCustomer({
            name: data.name,
            primaryPhone: data.phone,
            billingAddress1: data.address1,
            billingAddress2: data.address2,
            accountId: data.id
        });
    }
};

// Kick off the cache as soon as db.js is imported. Safe if rules deny
// reads (the error is logged and cacheReady flips to true anyway).
DB.startCustomerCache();
