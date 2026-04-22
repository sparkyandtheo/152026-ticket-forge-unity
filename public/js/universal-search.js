// public/js/universal-search.js
//
// Universal "jump-to-anything" search palette.
// Ctrl/Cmd+K (or click the search icon in any toolbar) opens a
// centered floating panel that searches across:
//
//   - Customers            (name, phone, billing+job-site addrs, account id)
//   - Tickets (6 types)    (ticket #, customer, phone, addr, description,
//                           rep, signatures, line-item descs)
//   - Employees            (name, title, email, extension, phone)
//   - Inventory            (category, name, GL account)
//   - Service-area ZIPs    (zip, city, county)
//   - Org contacts         (label, notes)
//
// Results are grouped by type, capped at 5 per group, keyboard-nav friendly:
//   ↑/↓   move selection
//   Enter go to the selected result
//   Esc   close
//
// Caching: on first open we pull everything into memory in parallel.
// Subsequent opens are instant. Cache refreshes once per page load;
// the palette is for discovery, not real-time dashboarding.
//
// Usage:
//   import { mountUniversalSearch } from '/js/universal-search.js';
//   mountUniversalSearch(document.getElementById('some-toolbar-slot'));
//
// The icon mounts once per page (idempotent). The Ctrl+K listener is
// global and also only installs once.

import { db, auth } from '/js/firebase-config.js';
import { DB } from '/js/db.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TICKET_COLLECTIONS = {
    phone_messages:  { label: 'Phone Message',  emoji: '\ud83d\udce5', page: '/views/forms/phone_message.html', color: '#5f6368' },
    sales_leads:     { label: 'Sales Lead',     emoji: '\ud83d\udcbc', page: '/views/forms/sales_call.html',    color: '#b06000' },
    quotes:          { label: 'Quote',          emoji: '\ud83d\udcdd', page: '/views/forms/quote.html',         color: '#1a73e8' },
    work_orders:     { label: 'Work Order',     emoji: '\ud83d\udee0\ufe0f', page: '/views/forms/work_order.html',    color: '#9c27b0' },
    service_tickets: { label: 'Service Ticket', emoji: '\ud83d\udda5\ufe0f', page: '/views/forms/service.html',      color: '#1e8e3e' },
    invoices:        { label: 'Invoice',        emoji: '\ud83d\udcb0', page: '/views/forms/invoice.html',       color: '#a82319' }
};

// Cached data, populated on first open
let cache = null;
let cachePromise = null;
let installed = false;
let paletteEl = null;
let inputEl = null;
let resultsEl = null;
let flatResults = [];   // current filtered, ordered, selectable result list
let selectedIdx = 0;

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(s) {
    return (s || '').toString().toUpperCase().trim();
}
function normalizePhone(s) {
    return (s || '').replace(/\D+/g, '');
}

async function fetchAll(col) {
    try {
        const snap = await getDocs(collection(db, col));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('[search]', col, 'fetch failed:', e.message);
        return [];
    }
}

async function loadCache() {
    if (cache) return cache;
    if (cachePromise) return cachePromise;

    cachePromise = (async () => {
        const [
            customers, phoneMsgs, salesLeads, quotes, workOrders,
            serviceTickets, invoices, employees, inventory, zips, orgContacts
        ] = await Promise.all([
            fetchAll('customers'),
            fetchAll('phone_messages'),
            fetchAll('sales_leads'),
            fetchAll('quotes'),
            fetchAll('work_orders'),
            fetchAll('service_tickets'),
            fetchAll('invoices'),
            fetchAll('employees'),
            fetchAll('inventory_items'),
            fetchAll('service_area_zips'),
            fetchAll('org_contacts')
        ]);

        cache = {
            customers,
            tickets: {
                phone_messages:  phoneMsgs,
                sales_leads:     salesLeads,
                quotes:          quotes,
                work_orders:     workOrders,
                service_tickets: serviceTickets,
                invoices:        invoices
            },
            employees,
            inventory,
            zips,
            orgContacts,
            loadedAt: Date.now()
        };
        return cache;
    })();

    return cachePromise;
}

// ================================================================
// SEARCH ALGORITHM
// ================================================================
//
// Per item, build a lowercase haystack + a small "rank score" for the
// query. Exact/prefix match on the primary display field scores higher
// than a substring match elsewhere. Results are returned as an
// ordered list grouped by type.
//
// For phone-number queries we strip non-digits and match against
// digit-only phone values separately.

function score(haystack, query) {
    if (!haystack) return 0;
    const h = haystack.toUpperCase();
    const q = query.toUpperCase();
    if (h === q) return 100;
    if (h.startsWith(q)) return 80;
    const idx = h.indexOf(q);
    if (idx === 0) return 70;
    if (idx > 0) return 50;
    return 0;
}

function search(query, cache) {
    const qU = normalize(query);
    const qDigits = normalizePhone(query);
    const groups = [];

    if (qU.length < 2 && qDigits.length < 3) return groups;

    // --- Customers ---
    const custMatches = [];
    for (const c of cache.customers) {
        let bestScore = 0;
        let matchedOn = '';
        const fields = [
            ['name',     c.name],
            ['accountId', c.accountId || c.id],
            ['billing1', c.billingAddress1 || c.address1],
            ['billing2', c.billingAddress2 || c.address2]
        ];
        for (const [k, v] of fields) {
            const s = score(v, qU);
            if (s > bestScore) { bestScore = s; matchedOn = v; }
        }
        // Job-site addresses
        if (Array.isArray(c.jobSites)) {
            for (const site of c.jobSites) {
                const s = Math.max(score(site.address1, qU), score(site.address2, qU), score(site.label, qU));
                if (s > bestScore) {
                    bestScore = s;
                    matchedOn = [site.address1, site.address2].filter(Boolean).join(', ');
                }
            }
        }
        // Phone digits
        if (qDigits.length >= 3) {
            const phones = [c.primaryPhone, c.phone, ...(c.alternatePhones || [])].filter(Boolean);
            for (const p of phones) {
                const pd = normalizePhone(p);
                const s = pd === qDigits ? 100 : pd.startsWith(qDigits) ? 80 : pd.includes(qDigits) ? 50 : 0;
                if (s > bestScore) { bestScore = s; matchedOn = p; }
            }
        }
        if (bestScore > 0) custMatches.push({ score: bestScore, item: c, matchedOn });
    }
    if (custMatches.length) {
        custMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'customer',
            label: 'Customers',
            emoji: '\ud83d\udc65',
            color: '#1a73e8',
            items: custMatches.slice(0, 5).map(m => ({
                id: m.item.id,
                primary: m.item.name || '(UNNAMED)',
                secondary: m.item.primaryPhone || m.item.phone || '',
                meta: Array.isArray(m.item.jobSites) && m.item.jobSites.length >= 2
                    ? `\ud83c\udfe2 Franchise \u00b7 ${m.item.jobSites.length} sites`
                    : (m.matchedOn || ''),
                href: `/views/customers/detail.html?id=${encodeURIComponent(m.item.id)}`
            }))
        });
    }

    // --- Tickets (across 6 collections) ---
    const ticketMatches = [];
    for (const [col, meta] of Object.entries(TICKET_COLLECTIONS)) {
        const docs = cache.tickets[col] || [];
        for (const d of docs) {
            let bestScore = 0;
            let matchedOn = '';
            const fields = [
                d.ticketNumber, d.id,
                d.customerName, d.address1, d.address2,
                d.siteAddress1, d.siteAddress2, d.siteAddress,
                d.description, d.notes, d.proposalText,
                d.rep, d.accountId, d.accountNumber,
                d.techSig, d.custSig, d.poNumber, d.jobNumber
            ];
            for (const f of fields) {
                const s = score(f, qU);
                if (s > bestScore) { bestScore = s; matchedOn = String(f || '').slice(0, 80); }
            }
            // Items line text
            if (Array.isArray(d.items)) {
                for (const it of d.items) {
                    const s = score([it.id, it.desc].filter(Boolean).join(' '), qU);
                    if (s > bestScore) { bestScore = s; matchedOn = `line: ${it.desc || it.id || ''}`; }
                }
            }
            // Phone digits
            if (qDigits.length >= 3) {
                const pd = normalizePhone(d.phone);
                const s = pd === qDigits ? 100 : pd.startsWith(qDigits) ? 80 : pd.includes(qDigits) ? 50 : 0;
                if (s > bestScore) { bestScore = s; matchedOn = d.phone; }
            }
            if (bestScore > 0) {
                ticketMatches.push({ score: bestScore, col, meta, item: d, matchedOn });
            }
        }
    }
    if (ticketMatches.length) {
        ticketMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'ticket',
            label: 'Tickets',
            emoji: '\ud83d\udcc4',
            color: '#5f6368',
            items: ticketMatches.slice(0, 6).map(m => ({
                id: m.item.id,
                primary: `#${m.item.ticketNumber || m.item.id} \u00b7 ${m.item.customerName || '(no customer)'}`,
                secondary: `${m.meta.emoji} ${m.meta.label}`,
                meta: m.matchedOn,
                href: `${m.meta.page}?id=${encodeURIComponent(m.item.id)}`,
                color: m.meta.color,
                status: m.item.status
            }))
        });
    }

    // --- Employees ---
    const empMatches = [];
    for (const e of cache.employees) {
        let bestScore = 0;
        let matchedOn = '';
        const fields = [e.name, e.title, e.email, e.extension, e.location, e.role];
        for (const f of fields) {
            const s = score(f, qU);
            if (s > bestScore) { bestScore = s; matchedOn = f; }
        }
        if (qDigits.length >= 3) {
            const phones = [e.primaryPhone, e.secondaryPhone, e.thirdPhone, e.phone].filter(Boolean);
            for (const p of phones) {
                const pd = normalizePhone(p);
                const s = pd === qDigits ? 100 : pd.startsWith(qDigits) ? 80 : pd.includes(qDigits) ? 50 : 0;
                if (s > bestScore) { bestScore = s; matchedOn = p; }
            }
        }
        if (bestScore > 0) empMatches.push({ score: bestScore, item: e, matchedOn });
    }
    if (empMatches.length) {
        empMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'employee',
            label: 'Staff',
            emoji: '\ud83d\udc64',
            color: '#9c27b0',
            items: empMatches.slice(0, 5).map(m => ({
                id: m.item.id,
                primary: m.item.name || '(unnamed)',
                secondary: [m.item.title || m.item.role, m.item.extension ? `x${m.item.extension}` : null]
                    .filter(Boolean).join(' \u00b7 '),
                meta: [m.item.primaryPhone || m.item.phone, m.item.email].filter(Boolean).join(' \u00b7 '),
                href: '/views/office/admin.html#staff'
            }))
        });
    }

    // --- Inventory ---
    const invMatches = [];
    for (const i of cache.inventory) {
        const hay = [i.category, i.name, i.glAccount].filter(Boolean).join(' ');
        const s = score(hay, qU);
        if (s > 0) invMatches.push({ score: s, item: i });
    }
    if (invMatches.length) {
        invMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'inventory',
            label: 'Inventory',
            emoji: '\ud83d\udce6',
            color: '#1e8e3e',
            items: invMatches.slice(0, 5).map(m => ({
                id: m.item.id,
                primary: m.item.name || '',
                secondary: m.item.category || '',
                meta: `${m.item.price || 'no price'}${m.item.isTaxable ? ' \u00b7 taxable' : ''}`,
                href: '/views/office/admin.html#inventory'
            }))
        });
    }

    // --- ZIPs ---
    const zipMatches = [];
    for (const z of cache.zips) {
        const hay = [z.zip, z.city, z.county].filter(Boolean).join(' ');
        const s = score(hay, qU);
        if (s > 0) zipMatches.push({ score: s, item: z });
    }
    if (zipMatches.length) {
        zipMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'zip',
            label: 'Service Areas',
            emoji: '\ud83d\uddfa\ufe0f',
            color: '#f9ab00',
            items: zipMatches.slice(0, 5).map(m => ({
                id: m.item.id,
                primary: `${m.item.zip} \u00b7 ${m.item.city || ''}`,
                secondary: m.item.county || '',
                meta: `${m.item.charge || ''} \u00b7 ${m.item.turnaround || ''}`,
                href: '/views/office/admin.html#zips'
            }))
        });
    }

    // --- Org contacts ---
    const orgMatches = [];
    for (const o of cache.orgContacts) {
        const hay = [o.label, o.notes, o.email, o.primaryPhone].filter(Boolean).join(' ');
        const s = score(hay, qU);
        if (s > 0) orgMatches.push({ score: s, item: o });
    }
    if (orgMatches.length) {
        orgMatches.sort((a, b) => b.score - a.score);
        groups.push({
            kind: 'org',
            label: 'Org Contacts',
            emoji: '\u260e\ufe0f',
            color: '#5f6368',
            items: orgMatches.slice(0, 5).map(m => ({
                id: m.item.id,
                primary: m.item.label || '',
                secondary: m.item.notes || '',
                meta: [m.item.primaryPhone, m.item.email].filter(Boolean).join(' \u00b7 '),
                href: null   // nothing to open yet; show as reference card
            }))
        });
    }

    return groups;
}

// ================================================================
// PALETTE UI
// ================================================================

function ensurePaletteMounted() {
    if (document.getElementById('hd-search-palette')) return;
    const wrap = document.createElement('div');
    wrap.id = 'hd-search-palette';
    wrap.innerHTML = `
        <style>
            #hd-search-palette {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.55);
                display: none; align-items: flex-start; justify-content: center;
                z-index: 9000;
                padding: 80px 20px 20px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            #hd-search-palette.open { display: flex; }

            .hd-sp-card {
                background: white; color: #202124;
                width: 100%; max-width: 680px;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,.4);
                display: flex; flex-direction: column;
                max-height: calc(100vh - 100px);
                overflow: hidden;
                animation: hd-sp-pop 0.15s ease-out;
            }
            @keyframes hd-sp-pop {
                from { opacity: 0; transform: translateY(-12px) scale(0.98); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }

            .hd-sp-input-row {
                display: flex; align-items: center; gap: 10px;
                padding: 16px 20px;
                border-bottom: 3px solid #EF3340;
            }
            .hd-sp-icon { font-size: 20px; opacity: 0.7; }
            .hd-sp-input {
                flex: 1; border: none; outline: none;
                font-family: inherit; font-size: 16px;
                font-weight: 500;
            }
            .hd-sp-input::placeholder { color: #9aa0a6; }
            .hd-sp-kbd {
                font-size: 10px; color: #5f6368; font-weight: 700;
                background: #f1f3f4; padding: 3px 7px;
                border-radius: 4px; letter-spacing: 0.05em;
            }

            .hd-sp-body {
                flex: 1; overflow-y: auto;
                padding: 6px 0;
            }

            .hd-sp-empty {
                padding: 40px 20px; text-align: center; color: #5f6368;
                font-size: 13px;
            }

            .hd-sp-group {
                padding: 4px 0;
            }
            .hd-sp-group-head {
                padding: 8px 20px 4px;
                font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
                text-transform: uppercase; color: var(--g-color, #5f6368);
                border-bottom: 1px solid #f1f3f4;
                display: flex; gap: 6px; align-items: center;
            }
            .hd-sp-group-count {
                background: var(--g-color, #5f6368); color: white;
                padding: 1px 7px; border-radius: 8px;
                font-size: 9px; margin-left: auto;
            }

            .hd-sp-item {
                display: block; padding: 10px 20px;
                border-bottom: 1px solid #f8f9fa;
                text-decoration: none; color: inherit;
                cursor: pointer; transition: background 0.08s;
            }
            .hd-sp-item:hover,
            .hd-sp-item.selected {
                background: #fff9c4;
            }
            .hd-sp-item.selected {
                background: #fff3cd;
                border-left: 4px solid #f9ab00;
                padding-left: 16px;
            }
            .hd-sp-item-primary {
                font-size: 14px; font-weight: 600;
            }
            .hd-sp-item-secondary {
                font-size: 12px; color: var(--color, #5f6368); margin-top: 2px;
            }
            .hd-sp-item-meta {
                font-size: 11px; color: #80868b; margin-top: 2px;
                font-family: 'IBM Plex Mono', monospace;
            }
            .hd-sp-status {
                display: inline-block; padding: 1px 7px; border-radius: 8px;
                font-size: 9px; font-weight: 700; text-transform: uppercase;
                margin-left: 6px;
            }
            .hd-sp-status-open      { background: #fef7e0; color: #b06000; }
            .hd-sp-status-scheduled { background: #e3f2fd; color: #1a73e8; }
            .hd-sp-status-complete  { background: #e6f4ea; color: #1e8e3e; }
            .hd-sp-status-converted { background: #f3e8ff; color: #9c27b0; }
            .hd-sp-status-closed    { background: #fce8e6; color: #a82319; }
            .hd-sp-status-attention { background: #fff3cd; color: #b06000; }
            .hd-sp-status-draft     { background: #f1f3f4; color: #5f6368; }

            .hd-sp-foot {
                padding: 8px 20px; border-top: 1px solid #f1f3f4;
                font-size: 11px; color: #80868b;
                display: flex; gap: 14px; flex-wrap: wrap;
            }
            .hd-sp-foot span { display: inline-flex; gap: 5px; align-items: center; }
            .hd-sp-foot kbd {
                background: #f1f3f4; padding: 1px 6px; border-radius: 3px;
                font-family: monospace; font-size: 10px;
            }

            @media (max-width: 700px) {
                #hd-search-palette { padding: 40px 10px 10px; }
            }
            @media print { #hd-search-palette { display: none !important; } }
        </style>
        <div class="hd-sp-card" role="dialog" aria-label="Universal search">
            <div class="hd-sp-input-row">
                <span class="hd-sp-icon">\ud83d\udd0d</span>
                <input type="text" class="hd-sp-input" id="hd-sp-input"
                       placeholder="Search customers, tickets, staff, parts, zips\u2026"
                       autocomplete="off" spellcheck="false">
                <span class="hd-sp-kbd">ESC</span>
            </div>
            <div class="hd-sp-body" id="hd-sp-body"></div>
            <div class="hd-sp-foot">
                <span><kbd>\u2191</kbd> <kbd>\u2193</kbd> navigate</span>
                <span><kbd>\u21b5</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
                <span style="margin-left:auto;" id="hd-sp-stats"></span>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);

    paletteEl = wrap;
    inputEl = document.getElementById('hd-sp-input');
    resultsEl = document.getElementById('hd-sp-body');

    // Click backdrop to close
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) close();
    });
    // Input → re-render
    inputEl.addEventListener('input', renderResults);
    inputEl.addEventListener('keydown', onInputKeyDown);
}

function open() {
    ensurePaletteMounted();
    paletteEl.classList.add('open');
    inputEl.value = '';
    flatResults = [];
    selectedIdx = 0;

    // Show loader while cache warms
    resultsEl.innerHTML = `<div class="hd-sp-empty">Loading index\u2026</div>`;
    loadCache().then(() => {
        document.getElementById('hd-sp-stats').textContent = cacheStatsLabel();
        renderResults();
    });
    setTimeout(() => inputEl.focus(), 40);
}

function close() {
    if (!paletteEl) return;
    paletteEl.classList.remove('open');
}

function cacheStatsLabel() {
    if (!cache) return '';
    const t = Object.values(cache.tickets).reduce((n, a) => n + a.length, 0);
    return `${cache.customers.length} customers \u00b7 ${t} tickets \u00b7 ${cache.employees.length} staff`;
}

function renderResults() {
    if (!cache) return;
    const q = inputEl.value;
    if (!q || q.trim().length < 2) {
        resultsEl.innerHTML = `
            <div class="hd-sp-empty">
                Type at least 2 characters to search.<br>
                <small>Customers, tickets, staff, inventory, zips, org contacts.</small>
            </div>
        `;
        flatResults = [];
        return;
    }

    const groups = search(q, cache);
    if (groups.length === 0) {
        resultsEl.innerHTML = `
            <div class="hd-sp-empty">
                No results for "<b>${escapeHtml(q)}</b>".
            </div>
        `;
        flatResults = [];
        return;
    }

    let html = '';
    flatResults = [];
    for (const g of groups) {
        html += `
            <div class="hd-sp-group" style="--g-color: ${g.color};">
                <div class="hd-sp-group-head">
                    <span>${g.emoji}</span><span>${escapeHtml(g.label)}</span>
                    <span class="hd-sp-group-count">${g.items.length}</span>
                </div>
                ${g.items.map((it, localIdx) => {
                    const globalIdx = flatResults.length;
                    flatResults.push(it);
                    const statusBadge = it.status
                        ? `<span class="hd-sp-status hd-sp-status-${(it.status||'').toLowerCase()}">${escapeHtml(it.status)}</span>`
                        : '';
                    return `
                        <a class="hd-sp-item" data-idx="${globalIdx}"
                           ${it.href ? `href="${escapeHtml(it.href)}"` : ''}
                           style="--color: ${it.color || g.color};">
                            <div class="hd-sp-item-primary">${escapeHtml(it.primary)}${statusBadge}</div>
                            ${it.secondary ? `<div class="hd-sp-item-secondary">${escapeHtml(it.secondary)}</div>` : ''}
                            ${it.meta ? `<div class="hd-sp-item-meta">${escapeHtml(it.meta)}</div>` : ''}
                        </a>
                    `;
                }).join('')}
            </div>
        `;
    }
    resultsEl.innerHTML = html;

    // Always select the first result by default
    selectedIdx = 0;
    updateSelection();

    // Wire row clicks
    resultsEl.querySelectorAll('.hd-sp-item').forEach(el => {
        el.addEventListener('mouseenter', () => {
            selectedIdx = parseInt(el.dataset.idx, 10);
            updateSelection();
        });
    });
}

function updateSelection() {
    const items = resultsEl.querySelectorAll('.hd-sp-item');
    items.forEach((el, i) => {
        if (parseInt(el.dataset.idx, 10) === selectedIdx) {
            el.classList.add('selected');
            el.scrollIntoView({ block: 'nearest' });
        } else {
            el.classList.remove('selected');
        }
    });
}

function onInputKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % flatResults.length;
        updateSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + flatResults.length) % flatResults.length;
        updateSelection();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = flatResults[selectedIdx];
        if (pick && pick.href) {
            close();
            window.location.href = pick.href;
        }
    }
}

// ================================================================
// MOUNTING
// ================================================================

function installShortcut() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+K or Cmd+K anywhere opens the palette.
        // Also accept slash (/) like GitHub when no input is focused.
        const isTyping =
            document.activeElement &&
            (document.activeElement.tagName === 'INPUT' ||
             document.activeElement.tagName === 'TEXTAREA' ||
             document.activeElement.isContentEditable);

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (paletteEl && paletteEl.classList.contains('open')) close();
            else open();
        } else if (e.key === '/' && !isTyping) {
            e.preventDefault();
            open();
        }
    });
}

export function mountUniversalSearch(slot) {
    if (installed) {
        // Allow re-mounting just the icon into different toolbars
        mountIcon(slot);
        return;
    }
    installed = true;
    ensurePaletteMounted();
    installShortcut();
    mountIcon(slot);
}

function mountIcon(slot) {
    if (!slot) return;
    // Only insert once into each slot
    if (slot.querySelector('.hd-sp-trigger')) return;
    const btn = document.createElement('button');
    btn.className = 'hd-sp-trigger';
    btn.title = 'Search everything (Ctrl/Cmd+K)';
    btn.innerHTML = `
        <style>
            .hd-sp-trigger {
                display: inline-flex; align-items: center; gap: 8px;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.18);
                color: white;
                padding: 7px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-family: 'Inter', -apple-system, sans-serif;
                font-size: 12px; font-weight: 500;
                transition: all 0.15s;
                line-height: 1;
            }
            .hd-sp-trigger:hover {
                background: rgba(255,255,255,0.15);
                border-color: rgba(255,255,255,0.4);
            }
            .hd-sp-trigger .hd-sp-trigger-kbd {
                background: rgba(0,0,0,0.25);
                padding: 2px 6px; border-radius: 3px;
                font-size: 10px; font-weight: 700;
            }
            @media (max-width: 900px) {
                .hd-sp-trigger .hd-sp-trigger-text,
                .hd-sp-trigger .hd-sp-trigger-kbd { display: none; }
                .hd-sp-trigger { padding: 7px 10px; }
            }
        </style>
        <span>\ud83d\udd0d</span>
        <span class="hd-sp-trigger-text">Search</span>
        <span class="hd-sp-trigger-kbd">\u2318K</span>
    `;
    btn.onclick = () => open();
    slot.insertBefore(btn, slot.firstChild);
}
