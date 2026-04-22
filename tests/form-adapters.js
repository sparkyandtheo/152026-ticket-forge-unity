/**
 * Pure-JS adapters for each form's save/load/convert logic.
 *
 * These mirror the save + load + convert functions in the HTML forms.
 * If the HTML forms change, update these adapters to match. The tests
 * verify the *shape contract* — that every field a form writes is read
 * back correctly, and that conversions preserve customer identity.
 *
 * Each adapter takes (formState) -> payload, or (doc) -> formState.
 * formState is a plain object keyed by DOM input id (e.g. `bill-name`).
 */

// ---------- phone_message.html ----------

function phoneMessage_save(state) {
  return {
    ticketNumber: state['msg-id'],
    date: state['date-field'],
    customerName: state['cust-name'],
    phone: state['cust-phone'],
    address1: state['cust-addr1'],
    address2: state['cust-addr2'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['cust-id'],
    notes: state['intake-notes'],
    status: 'Open'
  };
}

function phoneMessage_load(doc) {
  return {
    'msg-id': doc.ticketNumber,
    'date-field': doc.date,
    'cust-name': doc.customerName,
    'cust-phone': doc.phone,
    'cust-addr1': doc.address1,
    'cust-addr2': doc.address2,
    'site-addr1': doc.siteAddress1,
    'site-addr2': doc.siteAddress2,
    'intake-notes': doc.notes,
    'cust-id': doc.accountId
  };
}

function phoneMessage_convert(state, targetType) {
  const payload = {
    customerName: state['cust-name'],
    phone: state['cust-phone'],
    address1: state['cust-addr1'],
    address2: state['cust-addr2'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['cust-id'],
    description: state['intake-notes'],
    origin: 'phone_message',
    status: 'Open'
  };
  const target =
    targetType === 'service' ? 'service_tickets' :
    targetType === 'sales'   ? 'sales_leads'     :
    targetType === 'quote'   ? 'quotes'          : null;
  return { target, payload };
}

// ---------- sales_call.html ----------

function salesCall_save(state) {
  return {
    ticketNumber: state['sales-no'],
    date: state['sales-date'],
    poNumber: state['sales-po'],
    rep: state['sales-rep'],
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['site-acct'],
    siteType: state['site-type'],
    description: state['sales-notes'],
    techStart: state['time-start'],
    techFinish: state['time-finish'],
    meetingDate: state['meet-date'],
    visitComplete: state['chk-yes'] ? 'yes' : state['chk-no'] ? 'no' : '',
    accLadder: !!state['acc-ladder'],
    accKey: !!state['acc-key'],
    repSig: state['rep-sig'],
    custSig: state['cust-sig'],
    custDate: state['cust-date'],
    status: state['chk-yes'] ? 'Complete' : 'Open'
  };
}

function salesCall_load(doc) {
  return {
    'sales-no': doc.ticketNumber,
    'sales-date': doc.date,
    'sales-po': doc.poNumber,
    'sales-rep': doc.rep,
    'bill-name': doc.customerName,
    'bill-addr1': doc.address1,
    'bill-addr2': doc.address2,
    'bill-phone': doc.phone,
    'site-addr1': doc.siteAddress1,
    'site-addr2': doc.siteAddress2,
    'site-acct': doc.accountId || doc.accountNumber,
    'site-type': doc.siteType,
    'sales-notes': doc.description,
    'time-start': doc.techStart,
    'time-finish': doc.techFinish,
    'meet-date': doc.meetingDate,
    'chk-yes': doc.visitComplete === 'yes',
    'chk-no': doc.visitComplete === 'no',
    'acc-ladder': !!doc.accLadder,
    'acc-key': !!doc.accKey,
    'rep-sig': doc.repSig,
    'cust-sig': doc.custSig,
    'cust-date': doc.custDate
  };
}

// ---------- quote.html ----------

function quote_save(state) {
  return {
    ticketNumber: state['quote-no'],
    date: state['quote-date'],
    poNumber: state['quote-po'],
    rep: state['quote-rep'],
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['acct-id'],
    proposalText: state['prop-text'],
    items: state.items || [],
    grandTotal: state['grand-total'],
    status: 'Open'
  };
}

function quote_load(doc) {
  return {
    'quote-no': doc.ticketNumber,
    'quote-date': doc.date,
    'quote-po': doc.poNumber,
    'quote-rep': doc.rep,
    'bill-name': doc.customerName,
    'bill-addr1': doc.address1,
    'bill-addr2': doc.address2,
    'bill-phone': doc.phone,
    'site-addr1': doc.siteAddress1 || doc.siteAddress,
    'site-addr2': doc.siteAddress2,
    'acct-id': doc.accountId || doc.accountNumber,
    'prop-text': doc.proposalText,
    items: doc.items || []
  };
}

function quote_convertToWorkOrder(state, quoteId) {
  return {
    ticketNumber: null, // filled by ID generator on save
    date: new Date().toLocaleDateString(),
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['acct-id'],
    description: "INSTALLED PER QUOTE #" + state['quote-no'] + "\n" + state['prop-text'],
    items: state.items || [],
    status: 'Open',
    originQuoteId: quoteId || 'new'
  };
}

// ---------- work_order.html ----------

function workOrder_save(state) {
  const isComplete = !!state['chk-yes'];
  return {
    ticketNumber: state['wo-number'],
    date: state['wo-date'],
    poNumber: state['wo-po'],
    rep: state['wo-rep'],
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['site-acct'],
    siteType: state['site-type'],
    description: state['scope-text'],
    items: state.items || [],
    techStart: state['time-start'],
    techFinish: state['time-finish'],
    workDate: state['work-date'],
    jobComplete: isComplete ? 'yes' : state['chk-no'] ? 'no' : '',
    eqFork: !!state['eq-fork'],
    eqLift: !!state['eq-lift'],
    techSig: state['tech-sig'],
    status: state._statusOverride || (isComplete ? 'Complete' : 'Open')
  };
}

function workOrder_load(doc) {
  return {
    'wo-number': doc.ticketNumber,
    'wo-date': doc.date,
    'wo-po': doc.poNumber,
    'wo-rep': doc.rep,
    'bill-name': doc.customerName,
    'bill-addr1': doc.address1,
    'bill-addr2': doc.address2,
    'bill-phone': doc.phone,
    'site-addr1': doc.siteAddress1 || doc.siteAddress,
    'site-addr2': doc.siteAddress2,
    'site-acct': doc.accountId || doc.accountNumber,
    'site-type': doc.siteType,
    'scope-text': doc.description,
    'time-start': doc.techStart,
    'time-finish': doc.techFinish,
    'work-date': doc.workDate,
    'chk-yes': doc.jobComplete === 'yes',
    'chk-no': doc.jobComplete === 'no',
    'eq-fork': !!doc.eqFork,
    'eq-lift': !!doc.eqLift,
    'tech-sig': doc.techSig,
    items: doc.items || []
  };
}

function workOrder_convertToInvoice(state, workOrderId) {
  return {
    ticketNumber: null, // filled by invoice ID generator
    date: new Date().toLocaleDateString(),
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    accountId: state['site-acct'],
    items: (state.items || []).map(i => ({ ...i, unit: 'EACH' })),
    originDocId: workOrderId || 'new',
    status: 'Draft'
  };
}

// ---------- service.html ----------

function serviceTicket_save(state) {
  const isComplete = !!state['chk-yes'];
  return {
    ticketNumber: state['svc-no'],
    date: state['svc-date'],
    poNumber: state['svc-po'],
    rep: state['svc-rep'],
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    siteAddress1: state['site-addr1'],
    siteAddress2: state['site-addr2'],
    accountId: state['site-acct'],
    siteType: state['site-type'],
    description: state['svc-scope'],
    techStart: state['time-start'],
    techFinish: state['time-finish'],
    workDate: state['work-date'],
    visitComplete: isComplete ? 'yes' : state['chk-no'] ? 'no' : '',
    eqFork: !!state['eq-fork'],
    eqLift: !!state['eq-lift'],
    techSig: state['tech-sig'],
    custSig: state['cust-sig'],
    custDate: state['cust-date'],
    status: state._statusOverride || (isComplete ? 'Complete' : 'Draft')
  };
}

function serviceTicket_load(doc) {
  return {
    'svc-no': doc.ticketNumber,
    'svc-date': doc.date,
    'svc-po': doc.poNumber,
    'svc-rep': doc.rep,
    'bill-name': doc.customerName,
    'bill-addr1': doc.address1,
    'bill-addr2': doc.address2,
    'bill-phone': doc.phone,
    'site-addr1': doc.siteAddress1,
    'site-addr2': doc.siteAddress2,
    'site-acct': doc.accountId || doc.accountNumber,
    'site-type': doc.siteType,
    'svc-scope': doc.description,
    'time-start': doc.techStart,
    'time-finish': doc.techFinish,
    'work-date': doc.workDate,
    'chk-yes': doc.visitComplete === 'yes',
    'chk-no': doc.visitComplete === 'no',
    'eq-fork': !!doc.eqFork,
    'eq-lift': !!doc.eqLift,
    'tech-sig': doc.techSig,
    'cust-sig': doc.custSig,
    'cust-date': doc.custDate
  };
}

// ---------- invoice.html ----------

function invoice_save(state) {
  return {
    ticketNumber: state['inv-no'],
    date: state['inv-date'],
    dueDate: state['inv-due'],
    jobNumber: state['inv-job'],
    customerName: state['bill-name'],
    address1: state['bill-addr1'],
    address2: state['bill-addr2'],
    phone: state['bill-phone'],
    terms: state['meta-terms'],
    mechanic: state['meta-mech'],
    territory: state['meta-terr'],
    accountId: state['meta-acct'],
    items: state.items || [],
    grandTotal: state['grand-total'],
    status: 'Closed'
  };
}

function invoice_load(doc) {
  return {
    'inv-no': doc.ticketNumber,
    'inv-date': doc.date,
    'inv-due': doc.dueDate,
    'inv-job': doc.jobNumber,
    'bill-name': doc.customerName,
    'bill-addr1': doc.address1,
    'bill-addr2': doc.address2,
    'bill-phone': doc.phone,
    'meta-terms': doc.terms,
    'meta-mech': doc.mechanic,
    'meta-terr': doc.territory,
    'meta-acct': doc.accountId,
    items: doc.items || []
  };
}

// ---------- dispatch board drop ----------

function dispatchBoard_drop(ticketCol, ticketId, tech, slot) {
  return {
    _col: ticketCol,
    _id: ticketId,
    status: 'Scheduled',
    assignedTech: tech,
    scheduledSlot: slot
  };
}

module.exports = {
  phoneMessage_save, phoneMessage_load, phoneMessage_convert,
  salesCall_save, salesCall_load,
  quote_save, quote_load, quote_convertToWorkOrder,
  workOrder_save, workOrder_load, workOrder_convertToInvoice,
  serviceTicket_save, serviceTicket_load,
  invoice_save, invoice_load,
  dispatchBoard_drop
};
