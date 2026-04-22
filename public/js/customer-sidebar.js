// public/js/customer-sidebar.js
//
// Reusable customer-history sidebar for ticket forms.
// Watches the form's phone (and/or pinned customer) and shows every
// other dashboard-tracked document for the same customer, grouped by
// type, clickable to open.
//
// Usage:
//   import { mountCustomerSidebar } from '/js/customer-sidebar.js';
//   mountCustomerSidebar({
//       phoneFieldId:   'cust-phone',
//       nameFieldId:    'cust-name',     // optional, used as fallback label
//       excludeDocId:   DOC_ID || null,  // hide the doc currently open
//       excludeCollection: 'phone_messages'
//   });
//
// Behavior:
//   - Collapsed by default. A narrow edge-tab on the right shows a
//     count badge when related records exist. Click to expand.
//   - Remembers collapsed/expanded state per-session in localStorage.
//   - Listens on 6 Firestore collections (phone_messages, sales_leads,
//     quotes, work_orders, service_tickets, invoices) with where phone
//     matches. Subscriptions torn down on beforeunload.
//   - Groups results by type with per-group counts.

import { db } from '/js/firebase-config.js';
import { DB } from '/js/db.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTIONS = {
    phone_messages:  { label: 'Phone Messages', emoji: '\ud83d\udce5', page: '/views/forms/phone_message.html', color: '#5f6368' },
    sales_leads:     { label: 'Sales Leads',    emoji: '\ud83d\udcbc', page: '/views/forms/sales_call.html',     color: '#b06000' },
    quotes:          { label: 'Quotes',         emoji: '\ud83d\udcdd', page: '/views/forms/quote.html',          color: '#1a73e8' },
    work_orders:     { label: 'Work Orders',    emoji: '\ud83d\udee0\ufe0f', page: '/views/forms/work_order.html', color: '#9c27b0' },
    service_tickets: { label: 'Service Tickets',emoji: '\ud83d\udda5\ufe0f', page: '/views/forms/service.html',   color: '#1e8e3e' },
    invoices:        { label: 'Invoices',       emoji: '\ud83d\udcb0', page: '/views/forms/invoice.html',         color: '#a82319' }
};

const LS_KEY = 'hd-sidebar-open';

let unsubs = [];            // active onSnapshot unsubscribes
let buckets = {};           // { collection: [docs] }
let currentPhone = '';
let currentFieldIds = null;
let rootEl = null;
let wrapEl = null;
let badgeEl = null;
let listEl  = null;
let statusEl = null;

// Franchise popout state
let franchiseEl = null;
let franchiseBadgeEl = null;
let franchiseBodyEl = null;
let currentCustomer = null;

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(phone) {
    // Keep only digits; makes "716-555-0101" / "(716) 555-0101" / "7165550101" all match.
    return (phone || '').replace(/\D+/g, '');
}

function cleanupSubs() {
    for (const u of unsubs) { try { u(); } catch (_) {} }
    unsubs = [];
    buckets = {};
}

// Look up the matched customer in the cached rolodex (phone digits
// matched). Returns null if the customer isn't known or has <2 sites.
function findFranchiseCustomer(phoneDigits) {
    if (!phoneDigits || phoneDigits.length < 7) return null;
    try {
        const all = DB.getAllCustomers ? DB.getAllCustomers() : [];
        for (const c of all) {
            const phones = [c.primaryPhone, c.phone, ...(c.alternatePhones || [])].filter(Boolean);
            for (const p of phones) {
                if ((p || '').replace(/\D+/g, '') === phoneDigits) {
                    const sites = Array.isArray(c.jobSites) ? c.jobSites : [];
                    // Only flag as franchise when there's >= 2 sites.
                    if (sites.length >= 2) return c;
                    return null;
                }
            }
        }
    } catch (e) {
        console.warn('[cust-sidebar] franchise lookup failed:', e);
    }
    return null;
}

function subscribeFor(phoneDigits) {
    cleanupSubs();
    currentCustomer = findFranchiseCustomer(phoneDigits);
    renderFranchisePopout();
    if (!phoneDigits || phoneDigits.length < 7) {
        render();
        return;
    }
    // We store phone as free-form text (e.g. "716-555-0101"). Firestore
    // doesn't support regex queries; we have to read every doc and
    // filter client-side. That's OK for a small shop \u2014 the dashboard
    // already subscribes to the same data. To keep this bounded, we
    // listen only to docs written in the last year (not implemented
    // here; the collection is small enough).
    for (const col of Object.keys(COLLECTIONS)) {
        const unsub = onSnapshot(collection(db, col), (snap) => {
            buckets[col] = [];
            snap.forEach(d => {
                const data = d.data();
                if (normalize(data.phone) === phoneDigits) {
                    buckets[col].push({ id: d.id, ...data });
                }
            });
            render();
        }, (err) => {
            console.warn('[cust-sidebar]', col, err);
        });
        unsubs.push(unsub);
    }
}

function countMatches() {
    return Object.values(buckets).reduce((n, arr) => n + arr.length, 0);
}

function render() {
    if (!rootEl) return;
    const total = countMatches();

    if (badgeEl) {
        if (total > 0) {
            badgeEl.textContent = total > 99 ? '99+' : String(total);
            badgeEl.style.display = 'inline-flex';
        } else {
            badgeEl.style.display = 'none';
        }
    }
    if (statusEl) {
        if (!currentPhone || normalize(currentPhone).length < 7) {
            statusEl.textContent = 'Enter a phone number to find related records.';
        } else if (total === 0) {
            statusEl.textContent = 'No other records for this customer.';
        } else {
            statusEl.textContent = `${total} related record${total !== 1 ? 's' : ''}`;
        }
    }
    if (!listEl) return;

    if (total === 0) {
        listEl.innerHTML = '';
        return;
    }

    const excludeDocId = currentFieldIds?.excludeDocId;
    const excludeCollection = currentFieldIds?.excludeCollection;
    let html = '';
    for (const col of Object.keys(COLLECTIONS)) {
        const entries = (buckets[col] || [])
            .filter(d => !(col === excludeCollection && d.id === excludeDocId))
            .sort((a, b) => {
                const ta = a.lastUpdated?.toMillis?.() || 0;
                const tb = b.lastUpdated?.toMillis?.() || 0;
                return tb - ta;
            });
        if (entries.length === 0) continue;

        const meta = COLLECTIONS[col];
        html += `
            <div class="cs-group">
                <div class="cs-group-head" style="--color: ${meta.color};">
                    <span class="cs-group-emoji">${meta.emoji}</span>
                    <span class="cs-group-label">${meta.label}</span>
                    <span class="cs-group-count">${entries.length}</span>
                </div>
                <div class="cs-group-body">
                    ${entries.map(e => {
                        const id = escapeHtml(e.ticketNumber || e.id);
                        const date = e.lastUpdated?.toDate ? e.lastUpdated.toDate().toLocaleDateString() : '';
                        const statusBadge = e.status ? `<span class="cs-status cs-status-${(e.status||'').toLowerCase()}">${escapeHtml(e.status)}</span>` : '';
                        return `
                            <a class="cs-item" href="${meta.page}?id=${encodeURIComponent(e.id)}">
                                <span class="cs-item-id">#${id}</span>
                                <span class="cs-item-desc">${escapeHtml((e.description || e.notes || e.proposalText || '').slice(0, 60))}</span>
                                <span class="cs-item-meta">${date}${statusBadge}</span>
                            </a>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    listEl.innerHTML = html;
}

function installHandlers(config) {
    const phoneEl = document.getElementById(config.phoneFieldId);
    if (phoneEl) {
        let t;
        let lastValue = phoneEl.value || '';
        const reactTo = (value) => {
            clearTimeout(t);
            t = setTimeout(() => {
                currentPhone = value || '';
                subscribeFor(normalize(currentPhone));
            }, 200);
        };
        const onChange = () => {
            if (phoneEl.value !== lastValue) {
                lastValue = phoneEl.value;
                reactTo(lastValue);
            }
        };
        phoneEl.addEventListener('input',  onChange);
        phoneEl.addEventListener('change', onChange);

        // loadForm() sets values via .value = ... which DOESN'T fire input
        // events. Poll for changes so programmatic fills (opening an
        // existing record, autocomplete fill, franchise popout click)
        // still trigger us. Lightweight — just reads .value every 300ms.
        const pollTimer = setInterval(() => {
            if (phoneEl.value !== lastValue) {
                lastValue = phoneEl.value;
                reactTo(lastValue);
            }
        }, 300);
        window.addEventListener('beforeunload', () => clearInterval(pollTimer));

        // If a value is already present (unlikely at mount time, but
        // possible after a fast reload), react now.
        if (phoneEl.value) {
            lastValue = phoneEl.value;
            reactTo(lastValue);
        }

        // Auto-expand the sidebar on first load when this form is
        // opened with an existing record (?id=). Respects the user's
        // explicit choice afterward via localStorage.
        try {
            const hasExistingId =
                new URLSearchParams(window.location.search).get('id');
            const alreadyToggled = localStorage.getItem(LS_KEY + '-explicit');
            if (hasExistingId && !alreadyToggled) {
                setOpen(true);
            }
        } catch (_) {}
    }
    window.addEventListener('beforeunload', cleanupSubs);
}

function setOpen(isOpen, userInitiated = false) {
    if (!wrapEl) return;
    wrapEl.classList.toggle('cs-open', !!isOpen);
    try {
        localStorage.setItem(LS_KEY, isOpen ? '1' : '0');
        if (userInitiated) localStorage.setItem(LS_KEY + '-explicit', '1');
    } catch (_) {}
}

// ==========================================================================
// FRANCHISE POPOUT — left edge, only appears when currentCustomer has
// 2+ job sites. Lets the user click a site to load its address into
// the current form's job-site fields.
// ==========================================================================

function mountFranchisePopoutUI() {
    if (document.getElementById('hd-franchise-popout')) return;
    const el = document.createElement('div');
    el.id = 'hd-franchise-popout';
    el.innerHTML = `
        <style>
            #hd-franchise-popout {
                position: fixed; top: 80px; left: 0; bottom: 0;
                z-index: 500;
                display: none; flex-direction: row;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                color: #202124;
                pointer-events: none;
            }
            #hd-franchise-popout.fp-show { display: flex; }
            #hd-franchise-popout > * { pointer-events: auto; }

            .fp-panel {
                width: 0;
                max-width: 32vw;
                overflow: hidden;
                transition: width 0.28s ease-out;
                background: #fff8e6;
                border-right: 1px solid #f9ab00;
                box-shadow: 8px 0 24px rgba(249,171,0,.12);
                display: flex; flex-direction: column;
            }
            #hd-franchise-popout.fp-open .fp-panel {
                width: 28vw;
                min-width: 320px;
            }

            .fp-tab {
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                width: 36px; background: #b06000;
                color: white; cursor: pointer;
                border-radius: 0 8px 8px 0;
                border: 1px solid #7a5a00;
                border-left: none;
                align-self: flex-start;
                padding: 14px 0;
                margin-top: 8px;
                box-shadow: 4px 4px 16px rgba(176,96,0,.25);
                animation: fp-breathe 3s ease-in-out infinite;
            }
            @keyframes fp-breathe {
                0%, 100% { box-shadow: 4px 4px 16px rgba(176,96,0,.25); }
                50%      { box-shadow: 4px 4px 20px rgba(249,171,0,.55); }
            }
            .fp-tab:hover { background: #EF3340; animation: none; }
            .fp-tab .fp-tab-label {
                writing-mode: vertical-rl;
                font-weight: 700; font-size: 11px;
                letter-spacing: 0.1em; text-transform: uppercase;
                margin-top: 8px;
            }
            .fp-tab .fp-tab-arrow {
                font-size: 14px; margin-bottom: 4px;
                transition: transform 0.25s;
            }
            #hd-franchise-popout.fp-open .fp-tab-arrow { transform: rotate(180deg); }

            .fp-header {
                padding: 14px 16px;
                background: linear-gradient(120deg, #b06000, #7a5a00);
                color: white;
                flex-shrink: 0;
            }
            .fp-header .fp-alert {
                font-size: 10px; font-weight: 700;
                text-transform: uppercase; letter-spacing: 0.1em;
                opacity: 0.9; margin-bottom: 4px;
            }
            .fp-header .fp-name {
                font-size: 16px; font-weight: 900;
                letter-spacing: -0.2px;
            }
            .fp-header .fp-sub {
                font-size: 11px; opacity: 0.8; margin-top: 2px;
            }

            .fp-body {
                flex: 1; overflow-y: auto; padding: 12px 14px;
            }

            .fp-site-label {
                font-size: 10px; font-weight: 700;
                text-transform: uppercase; letter-spacing: 0.1em;
                color: #7a5a00; margin: 4px 0 8px;
            }

            .fp-site {
                display: flex; flex-direction: column;
                background: white;
                padding: 10px 12px;
                border-radius: 6px;
                border-left: 3px solid #f9ab00;
                margin-bottom: 6px;
                cursor: pointer;
                transition: all 0.15s;
                text-align: left;
                font-family: inherit;
                border-top: none; border-right: none; border-bottom: none;
                width: 100%;
            }
            .fp-site:hover {
                background: #fff3cd;
                transform: translateX(2px);
                box-shadow: 2px 2px 8px rgba(249,171,0,.35);
            }
            .fp-site .fp-site-addr1 {
                font-weight: 700; font-size: 13px; color: #202124;
            }
            .fp-site .fp-site-addr2 {
                font-size: 11px; color: #5f6368; margin-top: 2px;
            }
            .fp-site .fp-site-label-inner {
                font-size: 10px; font-weight: 700;
                text-transform: uppercase; color: #b06000;
                margin-top: 4px;
            }
            .fp-site.fp-billing {
                border-left-color: #1a73e8;
            }
            .fp-site.fp-billing .fp-site-label-inner { color: #1a73e8; }

            .fp-help {
                font-size: 11px; color: #5f6368; font-style: italic;
                padding: 12px 8px 4px;
                line-height: 1.4;
            }

            @media (max-width: 900px) {
                #hd-franchise-popout { top: 60px; }
                #hd-franchise-popout.fp-open .fp-panel { width: 80vw; min-width: 280px; }
            }
            @media print { #hd-franchise-popout { display: none !important; } }
        </style>

        <div class="fp-panel">
            <div class="fp-header">
                <div class="fp-alert">⚠️ Franchise Customer</div>
                <div class="fp-name" id="fp-name">—</div>
                <div class="fp-sub" id="fp-sub">Multiple job sites on file</div>
            </div>
            <div class="fp-body" id="fp-body"></div>
        </div>
        <div class="fp-tab" id="fp-tab" title="Franchise customer — multiple job sites">
            <span class="fp-tab-arrow" id="fp-tab-arrow">▶</span>
            <span class="fp-tab-label">🏢 Franchise</span>
        </div>
    `;
    document.body.appendChild(el);
    franchiseEl = el;
    franchiseBodyEl = document.getElementById('fp-body');

    document.getElementById('fp-tab').onclick = () => {
        el.classList.toggle('fp-open');
    };
}

function renderFranchisePopout() {
    if (!franchiseEl && !currentCustomer) return;
    mountFranchisePopoutUI();
    if (!currentCustomer) {
        franchiseEl.classList.remove('fp-show', 'fp-open');
        return;
    }
    franchiseEl.classList.add('fp-show');
    document.getElementById('fp-name').textContent = currentCustomer.name || 'UNNAMED FRANCHISE';
    const n = (currentCustomer.jobSites || []).length;
    document.getElementById('fp-sub').textContent = `${n} job site${n !== 1 ? 's' : ''} on file`;

    const sites = currentCustomer.jobSites || [];
    const bill1 = currentCustomer.billingAddress1 || currentCustomer.address1 || '';
    const bill2 = currentCustomer.billingAddress2 || currentCustomer.address2 || '';

    let html = `
        <div class="fp-help">
            Click a site below to load its address into the current form's
            job-site fields.
        </div>
        <div class="fp-site-label">Billing</div>
        <button class="fp-site fp-billing" data-addr1="${escapeHtml(bill1)}" data-addr2="${escapeHtml(bill2)}">
            <div class="fp-site-addr1">${escapeHtml(bill1 || '(no billing address)')}</div>
            ${bill2 ? `<div class="fp-site-addr2">${escapeHtml(bill2)}</div>` : ''}
            <div class="fp-site-label-inner">💰 Billing / HQ</div>
        </button>
        <div class="fp-site-label" style="margin-top: 14px;">Job Sites</div>
    `;
    for (const s of sites) {
        html += `
            <button class="fp-site" data-addr1="${escapeHtml(s.address1 || '')}" data-addr2="${escapeHtml(s.address2 || '')}">
                <div class="fp-site-addr1">${escapeHtml(s.address1 || '(no address)')}</div>
                ${s.address2 ? `<div class="fp-site-addr2">${escapeHtml(s.address2)}</div>` : ''}
                ${s.label ? `<div class="fp-site-label-inner">📍 ${escapeHtml(s.label)}</div>` : ''}
            </button>
        `;
    }
    franchiseBodyEl.innerHTML = html;

    franchiseBodyEl.querySelectorAll('.fp-site').forEach(btn => {
        btn.onclick = () => {
            const a1 = btn.dataset.addr1 || '';
            const a2 = btn.dataset.addr2 || '';
            const siteIds = currentFieldIds?.siteFieldIds;
            if (!siteIds) return;
            const s1 = document.getElementById(siteIds.addr1);
            const s2 = document.getElementById(siteIds.addr2);
            if (s1) {
                s1.value = a1;
                s1.classList.add('input-changed');
            }
            if (s2) {
                s2.value = a2;
                s2.classList.add('input-changed');
            }
            // Flash feedback on the filled fields
            [s1, s2].filter(Boolean).forEach(el => {
                const prev = el.style.background;
                el.style.transition = 'background 0.4s';
                el.style.background = '#fff3cd';
                setTimeout(() => { el.style.background = prev; }, 500);
            });
            franchiseEl.classList.remove('fp-open');
        };
    });
}

// ==========================================================================
// CORE RIGHT SIDEBAR
// ==========================================================================

function mountUI() {
    if (document.getElementById('hd-cust-sidebar')) return;
    const el = document.createElement('div');
    el.id = 'hd-cust-sidebar';
    el.innerHTML = `
        <style>
            #hd-cust-sidebar {
                position: fixed; top: 80px; right: 0; bottom: 0;
                z-index: 500;
                display: flex; flex-direction: row;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                color: #202124;
                pointer-events: none;
            }
            #hd-cust-sidebar > * { pointer-events: auto; }

            /* Edge tab (always visible) */
            .cs-tab {
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                width: 36px; background: #202124;
                color: white; cursor: pointer;
                border-radius: 8px 0 0 8px;
                border: 1px solid #3c4043;
                border-right: none;
                transition: background 0.15s;
                position: relative;
                align-self: flex-start;
                padding: 14px 0;
                margin-top: 8px;
                box-shadow: -4px 4px 16px rgba(0,0,0,.15);
            }
            .cs-tab:hover { background: #EF3340; }
            .cs-tab .cs-tab-label {
                writing-mode: vertical-rl;
                transform: rotate(180deg);
                font-weight: 700; font-size: 11px;
                letter-spacing: 0.1em; text-transform: uppercase;
                margin-top: 8px;
            }
            .cs-tab .cs-tab-arrow {
                font-size: 14px; margin-bottom: 4px;
                transition: transform 0.25s;
            }
            #hd-cust-sidebar.cs-open .cs-tab-arrow { transform: rotate(180deg); }

            .cs-badge {
                background: #EF3340; color: white;
                font-size: 10px; font-weight: 900;
                min-width: 18px; height: 18px;
                border-radius: 9px;
                display: none; align-items: center; justify-content: center;
                padding: 0 5px;
                position: absolute; top: -6px; left: -6px;
                box-shadow: 0 2px 6px rgba(0,0,0,.3);
            }

            /* Panel body (hidden until .cs-open) */
            .cs-panel {
                width: 0;
                max-width: 30vw;
                overflow: hidden;
                transition: width 0.28s ease-out;
                background: white;
                border-left: 1px solid #dadce0;
                box-shadow: -8px 0 24px rgba(0,0,0,.12);
                display: flex; flex-direction: column;
            }
            #hd-cust-sidebar.cs-open .cs-panel {
                width: 28vw;
                min-width: 340px;
            }
            @media (min-width: 2000px) {
                #hd-cust-sidebar.cs-open .cs-panel { width: 25vw; }
            }

            .cs-header {
                padding: 14px 16px;
                border-bottom: 3px solid #EF3340;
                display: flex; justify-content: space-between; align-items: center;
                flex-shrink: 0;
            }
            .cs-header-title {
                font-weight: 900; font-size: 14px;
                letter-spacing: -0.2px;
            }
            .cs-header-sub {
                font-size: 11px; color: #5f6368;
                text-transform: uppercase; letter-spacing: 0.05em;
                margin-top: 2px;
            }

            .cs-body {
                flex: 1; overflow-y: auto; padding: 8px 4px 20px;
            }

            .cs-status {
                padding: 2px 8px; border-radius: 10px;
                font-size: 9px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.05em; margin-left: 6px;
            }
            .cs-status-open       { background: #fef7e0; color: #b06000; }
            .cs-status-scheduled  { background: #e3f2fd; color: #1a73e8; }
            .cs-status-complete   { background: #e6f4ea; color: #1e8e3e; }
            .cs-status-converted  { background: #f3e8ff; color: #9c27b0; }
            .cs-status-closed     { background: #fce8e6; color: #a82319; }
            .cs-status-attention  { background: #fff3cd; color: #b06000; border: 1px solid #f9ab00; }
            .cs-status-draft      { background: #f1f3f4; color: #5f6368; }

            .cs-group { padding: 8px 12px 12px; }
            .cs-group-head {
                display: flex; align-items: center; gap: 8px;
                padding: 6px 4px;
                border-bottom: 2px solid var(--color, #5f6368);
                font-weight: 700; font-size: 12px;
                text-transform: uppercase; letter-spacing: 0.05em;
                color: var(--color, #5f6368);
            }
            .cs-group-count {
                background: var(--color, #5f6368); color: white;
                border-radius: 10px; font-size: 10px; padding: 1px 7px;
                margin-left: auto;
            }
            .cs-group-body { margin-top: 4px; }

            .cs-item {
                display: grid;
                grid-template-columns: 60px 1fr;
                grid-template-rows: auto auto;
                gap: 2px 10px;
                padding: 8px 4px;
                border-bottom: 1px solid #f1f3f4;
                text-decoration: none; color: inherit;
                transition: background 0.1s;
                border-radius: 4px;
            }
            .cs-item:hover { background: #fff9c4; }
            .cs-item-id   { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--color, #5f6368); font-weight: 700; grid-column: 1; grid-row: 1 / span 2; align-self: center; }
            .cs-item-desc { font-size: 12px; color: #202124; line-height: 1.3; grid-column: 2; }
            .cs-item-meta { font-size: 10px; color: #80868b; grid-column: 2; display: flex; align-items: center; }

            @media (max-width: 900px) {
                #hd-cust-sidebar { top: 60px; }
                #hd-cust-sidebar.cs-open .cs-panel { width: 80vw; min-width: 300px; }
            }

            @media print {
                #hd-cust-sidebar { display: none !important; }
            }
        </style>

        <div class="cs-tab" id="cs-tab" title="Customer history">
            <span class="cs-badge" id="cs-badge">0</span>
            <span class="cs-tab-arrow" id="cs-tab-arrow">\u25c0</span>
            <span class="cs-tab-label">Related</span>
        </div>
        <div class="cs-panel">
            <div class="cs-header">
                <div>
                    <div class="cs-header-title">\u2194\ufe0f Customer History</div>
                    <div class="cs-header-sub" id="cs-status">Enter a phone number to find related records.</div>
                </div>
            </div>
            <div class="cs-body" id="cs-list"></div>
        </div>
    `;
    document.body.appendChild(el);
    rootEl  = el;
    wrapEl  = el;
    badgeEl = document.getElementById('cs-badge');
    listEl  = document.getElementById('cs-list');
    statusEl = document.getElementById('cs-status');

    document.getElementById('cs-tab').onclick = () => {
        setOpen(!wrapEl.classList.contains('cs-open'), true); // user-initiated
    };

    // Initial state: respect localStorage
    let remembered = '0';
    try { remembered = localStorage.getItem(LS_KEY) || '0'; } catch (_) {}
    setOpen(remembered === '1');
}

export function mountCustomerSidebar(config) {
    if (!config || !config.phoneFieldId) {
        console.warn('[cust-sidebar] needs at least phoneFieldId');
        return;
    }
    currentFieldIds = config;
    mountUI();
    mountFranchisePopoutUI();
    installHandlers(config);
}
