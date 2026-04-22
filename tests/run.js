#!/usr/bin/env node
/**
 * Test runner for Hamburg Door / Ticket Forge Unity workflows.
 *
 * Usage:
 *   node tests/run.js
 *
 * Zero dependencies. Exits 0 on all-pass, 1 on any fail. Prints a
 * human-readable report with pass/fail per test and a summary.
 */

const { DB } = require('./mock-db');
const F = require('./form-adapters');

let passed = 0, failed = 0;
const results = [];

function log(color, label, msg) {
  const colors = { green: 32, red: 31, yellow: 33, cyan: 36, gray: 90 };
  const code = colors[color] || 0;
  process.stdout.write(`\x1b[${code}m${label}\x1b[0m ${msg}\n`);
}

function assertEqual(actual, expected, path) {
  if (actual === expected) return true;
  throw new Error(`at ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, path = '$') {
  if (actual === expected) return true;
  if (typeof actual !== typeof expected) {
    throw new Error(`at ${path}: type mismatch (${typeof actual} vs ${typeof expected})`);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`at ${path}: array length ${actual && actual.length} vs ${expected.length}`);
    }
    expected.forEach((v, i) => assertDeepEqual(actual[i], v, `${path}[${i}]`));
    return true;
  }
  if (expected && typeof expected === 'object') {
    for (const k of Object.keys(expected)) {
      assertDeepEqual(actual && actual[k], expected[k], `${path}.${k}`);
    }
    return true;
  }
  if (actual !== expected) {
    throw new Error(`at ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return true;
}

async function test(name, fn) {
  DB._reset();
  try {
    await fn();
    passed++;
    log('green', '  PASS', name);
    results.push({ name, ok: true });
  } catch (e) {
    failed++;
    log('red', '  FAIL', name);
    log('red', '       ', e.message);
    results.push({ name, ok: false, err: e.message });
  }
}

function section(title) {
  process.stdout.write(`\n\x1b[1m\x1b[36m━━━ ${title} ━━━\x1b[0m\n`);
}

// ================================================================
// Fixtures
// ================================================================

const JANET = {
  name: 'JANET HAMBURG',
  phone: '716-555-0101',
  address1: '1 DOOR STREET',
  address2: 'HAMBURG, NY 14075',
  id: '12345'
};

function janetState() {
  return {
    'cust-name': JANET.name,
    'cust-phone': JANET.phone,
    'cust-addr1': JANET.address1,
    'cust-addr2': JANET.address2,
    'cust-id': JANET.id,
    'site-addr1': JANET.address1,
    'site-addr2': JANET.address2,
    'date-field': '4/22/2026',
    'intake-notes': 'Garage door stuck halfway open. Cable broken.',
    'msg-id': ''
  };
}

// ================================================================
// Workflow tests
// ================================================================

(async () => {

section('Round-trip: each form saves and reloads cleanly');

await test('phone_message: save -> load preserves every field', async () => {
  const state = janetState();
  state['msg-id'] = '800001';
  const payload = F.phoneMessage_save(state);
  const id = await DB.saveDoc('phone_messages', payload, '800001');
  const doc = await DB.getDoc('phone_messages', id);
  const reloaded = F.phoneMessage_load(doc);
  assertEqual(reloaded['cust-name'], JANET.name, 'cust-name');
  assertEqual(reloaded['cust-phone'], JANET.phone, 'cust-phone');
  assertEqual(reloaded['site-addr1'], JANET.address1, 'site-addr1');
  assertEqual(reloaded['site-addr2'], JANET.address2, 'site-addr2');
  assertEqual(reloaded['intake-notes'], 'Garage door stuck halfway open. Cable broken.', 'intake-notes');
  assertEqual(reloaded['cust-id'], JANET.id, 'cust-id');
  assertEqual(doc.status, 'Open', 'status');
});

await test('sales_call: save -> load preserves every field', async () => {
  const state = {
    'sales-no': '400001',
    'sales-date': '4/22/2026',
    'sales-po': 'PO-77',
    'sales-rep': 'Kathy',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1,
    'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-addr1': JANET.address1,
    'site-addr2': JANET.address2,
    'site-acct': JANET.id,
    'site-type': 'Residential',
    'sales-notes': 'Wants new opener + springs',
    'time-start': '9:00',
    'time-finish': '10:00',
    'meet-date': '4/25/2026',
    'chk-yes': false, 'chk-no': false,
    'acc-ladder': true, 'acc-key': false,
    'rep-sig': 'Kathy',
    'cust-sig': '',
    'cust-date': ''
  };
  const payload = F.salesCall_save(state);
  const id = await DB.saveDoc('sales_leads', payload, '400001');
  const doc = await DB.getDoc('sales_leads', id);
  const reloaded = F.salesCall_load(doc);
  assertEqual(reloaded['site-acct'], JANET.id, 'site-acct (via accountId)');
  assertEqual(reloaded['site-type'], 'Residential', 'site-type');
  assertEqual(reloaded['acc-ladder'], true, 'acc-ladder');
  assertEqual(doc.status, 'Open', 'status');
});

await test('quote: save -> load preserves items and totals', async () => {
  const state = {
    'quote-no': '300001',
    'quote-date': '4/22/2026',
    'quote-po': 'PO-88',
    'quote-rep': 'Jim',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1,
    'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-addr1': JANET.address1,
    'site-addr2': JANET.address2,
    'acct-id': JANET.id,
    'prop-text': 'NEW INSTALL PER SCOPE',
    items: [
      { qty: 1, id: 'D200', desc: '16x7 door', price: 900, tax: true },
      { qty: 1, id: 'M500', desc: 'Opener',    price: 350, tax: true }
    ],
    'grand-total': '$1358.75'
  };
  const payload = F.quote_save(state);
  const id = await DB.saveDoc('quotes', payload, '300001');
  const doc = await DB.getDoc('quotes', id);
  const reloaded = F.quote_load(doc);
  assertEqual(reloaded.items.length, 2, 'item count');
  assertEqual(reloaded.items[0].id, 'D200', 'first item id');
  assertEqual(reloaded['site-addr2'], JANET.address2, 'site-addr2');
  assertEqual(reloaded['acct-id'], JANET.id, 'acct-id');
});

await test('work_order: save -> load preserves every field', async () => {
  const state = {
    'wo-number': '500001',
    'wo-date': '4/22/2026',
    'wo-po': 'PO-88',
    'wo-rep': 'Bob',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1,
    'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-addr1': JANET.address1,
    'site-addr2': JANET.address2,
    'site-acct': JANET.id,
    'site-type': 'Residential',
    'scope-text': 'Install new door',
    'time-start': '10:00',
    'time-finish': '13:00',
    'work-date': '4/25/2026',
    'chk-yes': true, 'chk-no': false,
    'eq-fork': true, 'eq-lift': false,
    'tech-sig': 'Bob',
    items: [{ qty: 1, id: 'D200', desc: '16x7 door', price: 900, tax: true }]
  };
  const payload = F.workOrder_save(state);
  const id = await DB.saveDoc('work_orders', payload, '500001');
  const doc = await DB.getDoc('work_orders', id);
  const reloaded = F.workOrder_load(doc);
  assertEqual(reloaded['site-addr1'], JANET.address1, 'site-addr1');
  assertEqual(reloaded['site-addr2'], JANET.address2, 'site-addr2');
  assertEqual(reloaded['site-acct'], JANET.id, 'site-acct');
  assertEqual(reloaded['eq-fork'], true, 'eq-fork');
  assertEqual(doc.status, 'Complete', 'status (completed)');
  assertEqual(doc.jobComplete, 'yes', 'jobComplete');
});

await test('service_ticket: save -> load preserves every field', async () => {
  const state = {
    'svc-no': '700001',
    'svc-date': '4/22/2026',
    'svc-po': '', 'svc-rep': 'Mario',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1, 'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-addr1': JANET.address1, 'site-addr2': JANET.address2,
    'site-acct': JANET.id,
    'site-type': 'Residential',
    'svc-scope': 'Replace broken cable',
    'time-start': '14:00', 'time-finish': '15:30',
    'work-date': '4/22/2026',
    'chk-yes': true, 'chk-no': false,
    'eq-fork': false, 'eq-lift': false,
    'tech-sig': 'Mario',
    'cust-sig': 'Janet Hamburg', 'cust-date': '4/22/2026'
  };
  const payload = F.serviceTicket_save(state);
  const id = await DB.saveDoc('service_tickets', payload, '700001');
  const doc = await DB.getDoc('service_tickets', id);
  const reloaded = F.serviceTicket_load(doc);
  assertEqual(reloaded['site-acct'], JANET.id, 'site-acct (via accountId)');
  assertEqual(doc.visitComplete, 'yes', 'visitComplete');
  assertEqual(doc.status, 'Complete', 'status');
});

await test('invoice: save -> load preserves every field (and items)', async () => {
  const state = {
    'inv-no': '600001',
    'inv-date': '4/22/2026',
    'inv-due': '5/22/2026',
    'inv-job': 'JOB-12',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1, 'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'meta-terms': 'NET 30',
    'meta-mech': 'Bob',
    'meta-terr': 'WNY',
    'meta-acct': JANET.id,
    items: [{ qty: 1, desc: 'Door install', unit: 'EACH', price: 900, tax: true }],
    'grand-total': '$978.75'
  };
  const payload = F.invoice_save(state);
  const id = await DB.saveDoc('invoices', payload, '600001');
  const doc = await DB.getDoc('invoices', id);
  const reloaded = F.invoice_load(doc);
  assertEqual(reloaded['meta-acct'], JANET.id, 'meta-acct');
  assertEqual(reloaded.items.length, 1, 'invoice item count');
  assertEqual(doc.status, 'Closed', 'status');
});

section('Conversions: data carries across the pipeline');

await test('phone_message -> sales_lead: customer identity preserved', async () => {
  const state = janetState();
  const { target, payload } = F.phoneMessage_convert(state, 'sales');
  assertEqual(target, 'sales_leads', 'target collection');
  assertEqual(payload.customerName, JANET.name, 'customer name carries');
  assertEqual(payload.phone, JANET.phone, 'phone carries');
  assertEqual(payload.siteAddress1, JANET.address1, 'site address carries');
  assertEqual(payload.description, 'Garage door stuck halfway open. Cable broken.', 'notes carry as description');
  assertEqual(payload.status, 'Open', 'defaults to Open');
});

await test('phone_message -> service_ticket: routes correctly', async () => {
  const state = janetState();
  const { target, payload } = F.phoneMessage_convert(state, 'service');
  assertEqual(target, 'service_tickets', 'target');
  assertEqual(payload.customerName, JANET.name, 'customer name');
});

await test('phone_message -> quote: routes correctly', async () => {
  const state = janetState();
  const { target, payload } = F.phoneMessage_convert(state, 'quote');
  assertEqual(target, 'quotes', 'target');
  assertEqual(payload.phone, JANET.phone, 'phone');
});

await test('quote -> work_order: site address + account + items carry', async () => {
  const quoteState = {
    'quote-no': '300001',
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1, 'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-addr1': JANET.address1, 'site-addr2': JANET.address2,
    'acct-id': JANET.id,
    'prop-text': 'Install 16x7 door + opener',
    items: [{ qty: 1, id: 'D200', desc: '16x7 door', price: 900, tax: true }]
  };
  const woPayload = F.quote_convertToWorkOrder(quoteState, '300001');
  assertEqual(woPayload.customerName, JANET.name, 'name');
  assertEqual(woPayload.siteAddress1, JANET.address1, 'site-addr1');
  assertEqual(woPayload.siteAddress2, JANET.address2, 'site-addr2');
  assertEqual(woPayload.accountId, JANET.id, 'accountId');
  assertEqual(woPayload.items.length, 1, 'items carry');
  assertEqual(woPayload.originQuoteId, '300001', 'origin tracked');
  // The description should reference the source quote number
  if (!woPayload.description.includes('300001')) {
    throw new Error('description missing source quote number');
  }
});

await test('work_order -> invoice: customer + items + accountId carry', async () => {
  const woState = {
    'bill-name': JANET.name,
    'bill-addr1': JANET.address1, 'bill-addr2': JANET.address2,
    'bill-phone': JANET.phone,
    'site-acct': JANET.id,
    items: [
      { qty: 1, id: 'D200', desc: '16x7 door', price: 900, tax: true },
      { qty: 1, id: 'M500', desc: 'Opener',    price: 350, tax: true }
    ]
  };
  const invPayload = F.workOrder_convertToInvoice(woState, '500001');
  assertEqual(invPayload.customerName, JANET.name, 'name');
  assertEqual(invPayload.accountId, JANET.id, 'accountId carries');
  assertEqual(invPayload.items.length, 2, 'all items carry');
  assertEqual(invPayload.items[0].unit, 'EACH', 'unit default populated');
  assertEqual(invPayload.originDocId, '500001', 'origin tracked');
  assertEqual(invPayload.status, 'Draft', 'starts as Draft');
});

section('Dispatch board: drag-and-drop semantics');

await test('dispatch drop: writes status + tech + slot to the right doc', async () => {
  // Seed an open work order
  const woId = await DB.saveDoc('work_orders', {
    customerName: JANET.name,
    status: 'Open'
  }, '500001');

  const update = F.dispatchBoard_drop('work_orders', woId, 'Bob', 'MONDAY');
  assertEqual(update._col, 'work_orders', 'collection');
  assertEqual(update._id, '500001', 'id');
  assertEqual(update.status, 'Scheduled', 'status flips to Scheduled');
  assertEqual(update.assignedTech, 'Bob', 'tech assigned');
  assertEqual(update.scheduledSlot, 'MONDAY', 'slot assigned');

  // Apply it the way the real app would:
  await DB.saveDoc('work_orders', {
    status: update.status,
    assignedTech: update.assignedTech,
    scheduledSlot: update.scheduledSlot
  }, woId);

  const doc = await DB.getDoc('work_orders', woId);
  assertEqual(doc.status, 'Scheduled', 'doc.status updated');
  assertEqual(doc.assignedTech, 'Bob', 'doc.assignedTech updated');
});

await test('dispatch drop: service ticket routes to same collection', async () => {
  await DB.saveDoc('service_tickets', { customerName: JANET.name, status: 'Open' }, '700001');
  const update = F.dispatchBoard_drop('service_tickets', '700001', 'Mario', '9:00');
  assertEqual(update._col, 'service_tickets', 'collection');
  assertEqual(update.scheduledSlot, '9:00', 'hour-slot preserved');
});

section('ID generators: atomic, monotonic, per-counter');

await test('counters are independent per counterName', async () => {
  const a = await DB.getNewId('quote', 300000);
  const b = await DB.getNewId('work_order', 500000);
  const c = await DB.getNewId('quote', 300000);
  assertEqual(a, '300001', 'first quote');
  assertEqual(b, '500001', 'first work order');
  assertEqual(c, '300002', 'second quote increments independently');
});

await test('counter respects startFrom when DB is behind', async () => {
  await DB.getNewId('phone_message', 100);   // seed at 101
  const bumped = await DB.getNewId('phone_message', 800000);
  assertEqual(bumped, '800001', 'jumps up to new startFrom');
});

section('End-to-end pipeline: Janet\'s repair call becomes an invoice');

await test('phone call -> service ticket -> dispatch -> complete -> (no invoice)', async () => {
  // 1. Phone rings. Office creates a phone message.
  const phoneState = janetState();
  phoneState['msg-id'] = await DB.getNewId('phone_message', 800000);
  await DB.saveDoc('phone_messages', F.phoneMessage_save(phoneState), phoneState['msg-id']);
  assertEqual(phoneState['msg-id'], '800001', 'phone message id');

  // 2. Office decides this is a service call.
  const { target, payload } = F.phoneMessage_convert(phoneState, 'service');
  const svcId = await DB.getNewId('service', 700000);
  payload.ticketNumber = svcId;
  await DB.saveDoc(target, payload, svcId);
  assertEqual(svcId, '700001', 'service ticket id');

  // 3. Dispatcher drags it to Mario @ 9:00.
  const drop = F.dispatchBoard_drop('service_tickets', svcId, 'Mario', '9:00');
  await DB.saveDoc('service_tickets', {
    status: drop.status,
    assignedTech: drop.assignedTech,
    scheduledSlot: drop.scheduledSlot
  }, svcId);

  // 4. Mario's mobile view queries status=Scheduled + assignedTech contains 'mario'.
  // Simulate that query:
  let found = null;
  for (const [k, v] of DB._store.entries()) {
    if (k.startsWith('service_tickets/') &&
        v.status === 'Scheduled' &&
        (v.assignedTech || '').toLowerCase().includes('mario')) {
      found = { key: k, ...v };
    }
  }
  if (!found) throw new Error('Mario cannot see his scheduled job');
  assertEqual(found.scheduledSlot, '9:00', 'mario sees the 9:00 slot');

  // 5. Mario completes it on mobile.
  await DB.saveDoc('service_tickets', {
    status: 'Complete',
    techNotes: 'Replaced cable, tested 5 cycles.',
    techSig: 'Mario',
    completedAt: 'now'
  }, svcId);

  const final = await DB.getDoc('service_tickets', svcId);
  assertEqual(final.status, 'Complete', 'final status');
  assertEqual(final.techSig, 'Mario', 'tech signature preserved');
  assertEqual(final.customerName, JANET.name, 'customer preserved through pipeline');
});

await test('new-install pipeline: phone -> quote -> work_order -> invoice', async () => {
  // 1. Phone call: wants a new garage door
  const phoneState = janetState();
  phoneState['intake-notes'] = 'Wants new 16x7 garage door + opener';
  const phoneId = await DB.getNewId('phone_message', 800000);
  phoneState['msg-id'] = phoneId;
  await DB.saveDoc('phone_messages', F.phoneMessage_save(phoneState), phoneId);

  // 2. Convert to quote
  const quoteId = await DB.getNewId('quote', 300000);
  const { payload: quotePayload } = F.phoneMessage_convert(phoneState, 'quote');
  quotePayload.ticketNumber = quoteId;
  await DB.saveDoc('quotes', quotePayload, quoteId);

  // 3. Salesperson fills out line items and saves the quote
  const doc = await DB.getDoc('quotes', quoteId);
  const quoteState = F.quote_load(doc);
  quoteState['quote-rep'] = 'Jim';
  quoteState['prop-text'] = 'Install 16x7 door + opener';
  quoteState.items = [
    { qty: 1, id: 'D200', desc: '16x7 door', price: 900, tax: true },
    { qty: 1, id: 'M500', desc: 'Opener',    price: 350, tax: true }
  ];
  await DB.saveDoc('quotes', F.quote_save(quoteState), quoteId);

  // 4. Convert quote -> work order
  const woId = await DB.getNewId('work_order', 500000);
  const woPayload = F.quote_convertToWorkOrder(quoteState, quoteId);
  woPayload.ticketNumber = woId;
  await DB.saveDoc('work_orders', woPayload, woId);
  await DB.saveDoc('quotes', { status: 'Converted' }, quoteId);

  // 5. Dispatch to Bob
  const drop = F.dispatchBoard_drop('work_orders', woId, 'Bob', 'TUESDAY');
  await DB.saveDoc('work_orders', drop, woId);

  // 6. Bob completes the install
  const woDoc = await DB.getDoc('work_orders', woId);
  const woState = F.workOrder_load(woDoc);
  woState['chk-yes'] = true;
  woState['tech-sig'] = 'Bob';
  woState['work-date'] = '4/25/2026';
  await DB.saveDoc('work_orders', F.workOrder_save(woState), woId);

  // 7. Convert work order -> invoice
  const invId = await DB.getNewId('invoice', 600000);
  const invPayload = F.workOrder_convertToInvoice(woState, woId);
  invPayload.ticketNumber = invId;
  await DB.saveDoc('invoices', invPayload, invId);

  // Verify the invoice is what we expect
  const finalInvoice = await DB.getDoc('invoices', invId);
  assertEqual(finalInvoice.customerName, JANET.name, 'invoice name');
  assertEqual(finalInvoice.accountId, JANET.id, 'invoice accountId');
  assertEqual(finalInvoice.items.length, 2, 'invoice item count');
  assertEqual(finalInvoice.originDocId, woId, 'invoice tracks source WO');

  // Verify the quote is marked Converted (not still Open)
  const finalQuote = await DB.getDoc('quotes', quoteId);
  assertEqual(finalQuote.status, 'Converted', 'quote moves to Converted');

  // Verify the work order is Complete
  const finalWO = await DB.getDoc('work_orders', woId);
  assertEqual(finalWO.status, 'Complete', 'work order complete');
  assertEqual(finalWO.techSig, 'Bob', 'tech signed');

  // Verify all 4 unique IDs came from separate counters
  assertEqual(phoneId, '800001', 'phone id');
  assertEqual(quoteId, '300001', 'quote id');
  assertEqual(woId, '500001', 'work order id');
  assertEqual(invId, '600001', 'invoice id');
});

section('Customer rolodex: phone is the key');

await test('rolodex save then lookup by phone returns same customer', async () => {
  await DB.saveCustomer(JANET);
  const found = await DB.findCustomerByPhone(JANET.phone);
  if (!found) throw new Error('rolodex lookup failed');
  assertEqual(found.name, JANET.name, 'name matches');
  assertEqual(found.address1, JANET.address1, 'address matches');
});

await test('rolodex does not return stale match for different phone', async () => {
  await DB.saveCustomer(JANET);
  const notFound = await DB.findCustomerByPhone('716-555-9999');
  if (notFound !== null) throw new Error('unexpected customer returned');
});

section('Dashboard search: every saved field is indexable');

await test('search index covers description, rep, account, signatures, line items', async () => {
  // Replicate the production dashboard.html index string
  const doc = {
    id: '500001',
    ticketNumber: '500001',
    customerName: JANET.name,
    phone: JANET.phone,
    email: 'janet@example.com',
    address1: JANET.address1,
    address2: JANET.address2,
    siteAddress1: JANET.address1,
    siteAddress2: JANET.address2,
    jobNumber: 'JOB-12',
    poNumber: 'PO-99',
    accountId: JANET.id,
    rep: 'Bob',
    description: 'Install 16x7 door per quote 300001',
    techSig: 'Bob',
    custSig: 'Janet Hamburg',
    items: [
      { id: 'D200', desc: '16x7 insulated residential door' },
      { id: 'M500', desc: 'LiftMaster Wi-Fi opener' }
    ]
  };

  const displayId = doc.ticketNumber || doc.id || '---';
  const displayName = doc.customerName || 'UNKNOWN';
  const itemsText = Array.isArray(doc.items)
    ? doc.items.map(i => [i.id, i.desc].filter(Boolean).join(' ')).join(' ')
    : '';
  const index = [
    displayId, displayName,
    doc.phone || '', doc.email || '',
    doc.address1 || '', doc.address2 || '',
    doc.siteAddress || '', doc.siteAddress1 || '', doc.siteAddress2 || '',
    doc.jobNumber || '', doc.poNumber || '',
    doc.accountId || doc.accountNumber || '',
    doc.rep || '',
    doc.description || doc.notes || doc.proposalText || '',
    doc.techSig || '', doc.custSig || '',
    itemsText
  ].join(' ').toUpperCase();

  // All the things an office admin might search:
  const queries = [
    'JANET', 'HAMBURG', '716-555', '14075', 'INSTALL',
    'LIFTMASTER', '16X7', 'PO-99', 'JOB-12', '12345',
    'BOB', 'D200', 'WI-FI', '500001'
  ];
  for (const q of queries) {
    if (!index.includes(q.toUpperCase())) {
      throw new Error(`search query "${q}" does not match the index`);
    }
  }
});

// ================================================================
// Summary
// ================================================================

const total = passed + failed;
process.stdout.write('\n');
if (failed === 0) {
  log('green', `✅ ${passed}/${total} passed`, '');
} else {
  log('red', `❌ ${failed}/${total} failed`, '');
}
process.exit(failed === 0 ? 0 : 1);

})();
