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

function subscribeFor(phoneDigits) {
    cleanupSubs();
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
        const onChange = () => {
            clearTimeout(t);
            t = setTimeout(() => {
                currentPhone = phoneEl.value || '';
                subscribeFor(normalize(currentPhone));
            }, 300);
        };
        phoneEl.addEventListener('input',  onChange);
        phoneEl.addEventListener('change', onChange);
        // If a value is already present (form opened with a ?id=), react now.
        if (phoneEl.value) {
            currentPhone = phoneEl.value;
            subscribeFor(normalize(currentPhone));
        }
    }
    window.addEventListener('beforeunload', cleanupSubs);
}

function setOpen(isOpen) {
    if (!wrapEl) return;
    wrapEl.classList.toggle('cs-open', !!isOpen);
    try { localStorage.setItem(LS_KEY, isOpen ? '1' : '0'); } catch (_) {}
}

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
        setOpen(!wrapEl.classList.contains('cs-open'));
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
    installHandlers(config);
}
