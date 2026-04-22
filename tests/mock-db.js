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

  getAllCustomers() {
    const out = [];
    for (const [k, v] of store.entries()) {
      if (k.startsWith('customers/')) out.push({ id: k.split('/')[1], ...v });
    }
    return out;
  },

  async upsertCustomer(payload, opts = {}) {
    const data = {
      name: payload.name || '',
      primaryPhone: payload.primaryPhone || payload.phone || '',
      billingAddress1: payload.billingAddress1 || payload.address1 || '',
      billingAddress2: payload.billingAddress2 || payload.address2 || '',
      jobSites: Array.isArray(payload.jobSites) ? payload.jobSites : []
    };
    if (opts.customerId) {
      const key = 'customers/' + opts.customerId;
      const existing = store.get(key) || {};
      const merged = { ...existing, ...data };
      if (opts.addJobSite?.address1) {
        const sites = merged.jobSites || [];
        const norm = s => (s||'').toUpperCase().trim();
        if (!sites.find(s => norm(s.address1) === norm(opts.addJobSite.address1))) {
          sites.push(opts.addJobSite);
        }
        merged.jobSites = sites;
      }
      store.set(key, merged);
      return { id: opts.customerId, created: false };
    }
    // Check by phone/name
    const pd = (data.primaryPhone || '').replace(/\D+/g, '');
    const nn = (data.name || '').toUpperCase().trim();
    for (const [k, v] of store.entries()) {
      if (!k.startsWith('customers/')) continue;
      const vpd = (v.primaryPhone || v.phone || '').replace(/\D+/g, '');
      const vnn = (v.name || '').toUpperCase().trim();
      if ((pd && vpd === pd) || (nn && vnn === nn)) {
        const id = k.split('/')[1];
        store.set(k, { ...v, ...data });
        return { id, created: false };
      }
    }
    const id = freshId();
    store.set('customers/' + id, data);
    return { id, created: true };
  },

  async getAll(col, orderByField = null) {
    const out = [];
    for (const [k, v] of store.entries()) {
      if (k.startsWith(col + '/')) out.push({ id: k.split('/')[1], ...v });
    }
    if (orderByField) out.sort((a, b) => (a[orderByField] || 0) > (b[orderByField] || 0) ? 1 : -1);
    return out;
  },

  async deleteDoc(col, id) { store.delete(col + '/' + id); },

  async getCustomerHistory(identity) {
    const COLLECTIONS = ['phone_messages', 'sales_leads', 'quotes', 'work_orders', 'service_tickets', 'invoices'];
    const normPhone = (identity.phone || '').replace(/\D+/g, '');
    const normName = (identity.name || '').toUpperCase().trim();
    const result = {};
    let docs = 0, revenue = 0, open = 0;
    let firstMs = null, lastMs = null;
    for (const col of COLLECTIONS) {
      const all = await DB.getAll(col);
      const matched = all.filter(d => {
        const dp = (d.phone || '').replace(/\D+/g, '');
        const dn = (d.customerName || '').toUpperCase().trim();
        return (normPhone && dp === normPhone) || (normName && dn === normName);
      });
      result[col] = matched;
      docs += matched.length;
      if (col === 'invoices') {
        for (const inv of matched) {
          const n = parseFloat(String(inv.grandTotal || '').replace(/[\$,\s]/g, ''));
          if (!isNaN(n)) revenue += n;
          if (inv.status !== 'Paid' && !isNaN(n)) open += n;
        }
      }
      for (const d of matched) {
        const ts = new Date(d.lastUpdated || 0).getTime();
        if (!ts) continue;
        if (firstMs === null || ts < firstMs) firstMs = ts;
        if (lastMs === null || ts > lastMs) lastMs = ts;
      }
    }
    return { byCollection: result, totals: { docs, revenue, openBalance: open, firstContactMs: firstMs, lastContactMs: lastMs } };
  },

  async getCustomerTimeline(identity) {
    const { byCollection } = await DB.getCustomerHistory(identity);
    const timeline = [];
    for (const [col, docs] of Object.entries(byCollection)) {
      for (const d of docs) {
        timeline.push({ ...d, _collection: col, _ms: new Date(d.lastUpdated || 0).getTime() });
      }
    }
    timeline.sort((a, b) => b._ms - a._ms);
    return timeline;
  },

  async getNewCustomerId() {
    const n = await DB.getNewId('customer', 1000);
    return 'CUST-' + n;
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
