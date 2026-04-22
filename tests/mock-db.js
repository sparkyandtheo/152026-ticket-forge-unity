/**
 * Mock Firestore + DB facade.
 *
 * Exports the same interface as public/js/db.js so we can `require` this
 * from the test harness and let any "code under test" think it's talking
 * to real Firestore. Stores everything in plain JS maps.
 *
 * The app's production db.js imports Firebase SDKs over HTTPS, which we
 * cannot do in Node without a network round-trip. So the tests don't run
 * the real db.js — they run THIS file, and we verify that the *shape* of
 * what the forms write matches what the forms read back.
 *
 * The form logic itself is duplicated in tests/form-adapters.js (pure JS
 * translations of saveTicket/loadForm) so we can exercise them without a
 * DOM. Any drift between the adapters and the real forms is caught by the
 * browser-side smoke tests the cassette runs.
 */

const store = new Map();          // key = `${col}/${id}`, val = doc
const counters = new Map();       // key = counterName, val = number

function now() { return new Date().toISOString(); }

function freshId() {
  return 'auto_' + Math.random().toString(36).slice(2, 10);
}

const DB = {
  _store: store,           // exposed for assertions in tests
  _counters: counters,
  _reset() { store.clear(); counters.clear(); },

  async saveDoc(col, data, id = null) {
    const docId = id || freshId();
    const key = `${col}/${docId}`;
    const prev = store.get(key) || {};
    const merged = { ...prev, ...data, lastUpdated: now() };
    store.set(key, merged);
    return docId;
  },

  async getDoc(col, id) {
    const key = `${col}/${id}`;
    if (!store.has(key)) return null;
    return { id, ...store.get(key) };
  },

  async findCustomerByPhone(phone) {
    for (const [k, v] of store.entries()) {
      if (k.startsWith('customers/') && v.phone === phone) return v;
    }
    return null;
  },

  async saveCustomer(data) {
    const id = data.phone || freshId();
    store.set(`customers/${id}`, { ...data });
  },

  async findRecentDuplicates(col, identity, mins = 5) {
    const cutoff = Date.now() - mins * 60 * 1000;
    const norm = (s) => (s || '').toString().toUpperCase().trim();
    const wantPhone = norm(identity.phone), wantName = norm(identity.name);
    const inactive = new Set(['Converted', 'Complete', 'Closed', 'Cancelled']);
    const results = [];
    for (const [k, v] of store.entries()) {
      if (!k.startsWith(col + '/')) continue;
      const ms = new Date(v.lastUpdated || 0).getTime();
      if (!ms || ms < cutoff) continue;
      if (inactive.has(v.status)) continue;
      const phoneMatch = wantPhone && norm(v.phone) === wantPhone;
      const nameMatch  = wantName  && norm(v.customerName) === wantName;
      if (phoneMatch || nameMatch) results.push({ id: k.split('/')[1], ...v });
    }
    return results;
  },

  async getNewId(counterName, startFrom = 1000) {
    let cur = counters.get(counterName);
    if (cur === undefined || cur < startFrom) cur = startFrom;
    const next = cur + 1;
    counters.set(counterName, next);
    return String(next);
  }
};

module.exports = { DB };
