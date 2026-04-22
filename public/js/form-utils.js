import { DB } from '/js/db.js';

// ==========================================================================
// BASICS
// ==========================================================================

export function getUrlParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

export function autoGrow(element) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight) + "px";
}

export function setVal(id, val) {
    if (val !== undefined && document.getElementById(id)) {
        document.getElementById(id).value = val;
    }
}

export function setChk(id, val) {
    if (val && document.getElementById(id)) document.getElementById(id).checked = true;
}

export function setupInputHighlighting() {
    document.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.target.classList.add('input-changed');
        }
    });
    setTimeout(() => document.querySelectorAll("textarea").forEach(autoGrow), 100);
}

// ==========================================================================
// ROLODEX AUTOCOMPLETE
//
// Usage:
//   setupCustomerAutocomplete({
//       billing:   { phone, name, addr1, addr2 },   // DOM input ids
//       jobSite:   { addr1, addr2 },                // optional, if form has job site fields
//       accountIdField: 'acct-id',                  // optional id input to populate
//       suggestionsBox: 'suggestions'               // the <div> that holds matches
//   });
//
// Behavior:
//   - Typing into any of the configured fields (phone, name, billing addr,
//     job-site addr) triggers a search against the locally-cached
//     customers collection.
//   - Matches show in a single dropdown grouped by match type.
//   - Clicking a match fires the disambiguation modal (if the match is
//     less than a full lock — e.g. billing-only match with a different
//     job site typed), or auto-fills if the match is unambiguous.
// ==========================================================================

let activeAutocompleteConfig = null;  // remember for modal callbacks
let activeAutocompleteFields = null;

export function setupCustomerAutocomplete(config) {
    activeAutocompleteConfig = config;
    activeAutocompleteFields = config;

    const box = document.getElementById(config.suggestionsBox);
    if (!box) {
        console.warn('setupCustomerAutocomplete: suggestionsBox not found:', config.suggestionsBox);
        return;
    }

    const watchFields = [];
    if (config.billing) {
        ['phone', 'name', 'addr1', 'addr2'].forEach(k => {
            if (config.billing[k]) watchFields.push(config.billing[k]);
        });
    }
    if (config.jobSite) {
        ['addr1', 'addr2'].forEach(k => {
            if (config.jobSite[k]) watchFields.push(config.jobSite[k]);
        });
    }

    let searchTimer = null;
    const onInput = (e) => {
        const val = e.target.value;
        clearTimeout(searchTimer);
        if (!val || val.trim().length < 3) {
            box.style.display = 'none';
            return;
        }
        searchTimer = setTimeout(() => {
            const matches = DB.searchCustomers(val, 8);
            if (matches.length === 0) {
                box.style.display = 'none';
                return;
            }
            renderSuggestions(box, matches, config, e.target.id);
        }, 200);
    };

    for (const fid of watchFields) {
        const el = document.getElementById(fid);
        if (!el) continue;
        el.addEventListener('input', onInput);
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (e.target === box) return;
        if (box.contains(e.target)) return;
        if (watchFields.includes(e.target.id)) return;
        box.style.display = 'none';
    });

    // Lazy-mount the disambiguation modal (once per page)
    ensureModal();
}

function renderSuggestions(box, matches, config, triggeredByFieldId) {
    const labelForType = {
        phone:      '📞 Phone',
        name:       '👤 Name',
        billing:    '🏢 Billing',
        'job-site': '📍 Job Site'
    };

    // Re-anchor the suggestions box under whichever field triggered it.
    // Works because the box is absolutely positioned inside a page-relative
    // wrapper — we detach it to body and set fixed coords so it floats
    // correctly under the active field regardless of form layout.
    const trigger = document.getElementById(triggeredByFieldId);
    if (trigger) {
        if (box.parentNode !== document.body) document.body.appendChild(box);
        const r = trigger.getBoundingClientRect();
        box.style.position = 'fixed';
        box.style.top    = (r.bottom + 2) + 'px';
        box.style.left   = r.left + 'px';
        box.style.width  = r.width + 'px';
        box.style.maxHeight = '260px';
        box.style.zIndex = '4000';
    }

    box.innerHTML = matches.map((m, i) => {
        const c = m.customer;
        const sub = m.match.field || '';
        const extra = m.match.type === 'job-site' && Array.isArray(c.jobSites)
            ? `<span style="font-size:10px; color:#888;">(+${c.jobSites.length - 1} other site${c.jobSites.length > 2 ? 's' : ''})</span>`
            : '';
        return `
            <div class="suggestion-item" data-idx="${i}">
                <div style="font-size: 10px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: 0.05em;">
                    ${labelForType[m.match.type] || 'Match'}
                </div>
                <div><strong>${escapeHtml(c.name || 'UNNAMED')}</strong> ${extra}</div>
                <div style="font-size: 11px; color: #666;">${escapeHtml(sub)}</div>
            </div>
        `;
    }).join('');

    box.querySelectorAll('.suggestion-item').forEach((item) => {
        item.onclick = () => {
            const idx = parseInt(item.dataset.idx, 10);
            handlePick(matches[idx], config, triggeredByFieldId);
            box.style.display = 'none';
        };
    });

    box.style.display = 'block';
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ==========================================================================
// DISAMBIGUATION MODAL
// ==========================================================================

function ensureModal() {
    if (document.getElementById('rolodex-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'rolodex-modal';
    wrap.innerHTML = `
        <style>
            #rolodex-modal {
                position: fixed; inset: 0; background: rgba(0,0,0,0.7);
                display: none; align-items: center; justify-content: center;
                z-index: 5000; padding: 20px;
                font-family: 'Inter', sans-serif;
            }
            #rolodex-modal.open { display: flex; }
            #rolodex-modal .rm-card {
                background: white; color: #202124; border-radius: 8px;
                padding: 28px; width: 100%; max-width: 520px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                animation: rm-pop 0.18s ease-out;
            }
            @keyframes rm-pop {
                from { opacity: 0; transform: scale(0.95); }
                to   { opacity: 1; transform: scale(1); }
            }
            #rolodex-modal h3 {
                margin: 0 0 16px 0; font-weight: 900; font-size: 20px;
                letter-spacing: -0.3px;
                border-bottom: 2px solid #000; padding-bottom: 10px;
            }
            #rolodex-modal .rm-row {
                margin: 10px 0; font-size: 14px; line-height: 1.4;
            }
            #rolodex-modal .rm-label {
                font-size: 10px; font-weight: 700; text-transform: uppercase;
                color: #5f6368; letter-spacing: 0.08em; margin-bottom: 2px;
            }
            #rolodex-modal .rm-val { font-family: 'IBM Plex Mono', monospace; }
            #rolodex-modal .rm-hint {
                background: #fff3cd; border-left: 4px solid #f9ab00;
                padding: 10px 14px; border-radius: 4px;
                font-size: 13px; margin: 14px 0; color: #7a5a00;
            }
            #rolodex-modal .rm-actions {
                display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap;
            }
            #rolodex-modal .rm-btn {
                flex: 1; padding: 12px 16px; border: none; border-radius: 6px;
                font-family: inherit; font-weight: 700; font-size: 13px;
                cursor: pointer; transition: filter 0.15s;
                text-transform: uppercase; letter-spacing: 0.03em;
                min-width: 140px;
            }
            #rolodex-modal .rm-btn:hover { filter: brightness(1.1); }
            #rolodex-modal .rm-green { background: #1e8e3e; color: white; }
            #rolodex-modal .rm-blue  { background: #1a73e8; color: white; }
            #rolodex-modal .rm-gray  { background: #5f6368; color: white; }
        </style>
        <div class="rm-card" id="rolodex-modal-card"></div>
    `;
    document.body.appendChild(wrap);

    // Close on backdrop click or Escape
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) wrap.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('open')) {
            wrap.classList.remove('open');
        }
    });
}

function showModal(innerHtml, handlers = {}) {
    ensureModal();
    const wrap = document.getElementById('rolodex-modal');
    const card = document.getElementById('rolodex-modal-card');
    card.innerHTML = innerHtml;
    // Wire handlers after render
    for (const [action, fn] of Object.entries(handlers)) {
        const btn = card.querySelector(`[data-action="${action}"]`);
        if (btn) btn.onclick = () => { wrap.classList.remove('open'); fn(); };
    }
    wrap.classList.add('open');
}

function hideModal() {
    const wrap = document.getElementById('rolodex-modal');
    if (wrap) wrap.classList.remove('open');
}

// ==========================================================================
// PICK HANDLER — decide what to do when a user clicks a suggestion
// ==========================================================================

function handlePick(match, config, triggeredByFieldId) {
    const c = match.customer;

    // Is the user actively typing into a job-site field right now?
    const jobSiteFields = [config.jobSite?.addr1, config.jobSite?.addr2].filter(Boolean);
    const typingIntoJobSite = jobSiteFields.includes(triggeredByFieldId);

    // Case A: match was against a specific job site → auto-fill that site
    if (match.match.type === 'job-site') {
        const site = c.jobSites[match.match.jobSiteIndex] || {};
        confirmAndFill(c, {
            billing: true,
            jobSite: { address1: site.address1, address2: site.address2 },
            reason: `📍 Job site for <b>${escapeHtml(c.name)}</b>`
        });
        return;
    }

    // Case B: phone or billing match. If the user's active field is a
    // job-site field and the customer has no matching job site yet, ask
    // whether to ADD this typed address as a new site.
    if (typingIntoJobSite) {
        const addr1 = (document.getElementById(config.jobSite.addr1) || {}).value || '';
        const addr2 = (document.getElementById(config.jobSite.addr2) || {}).value || '';

        showModal(`
            <h3>🤔 Is this a job site for ${escapeHtml(c.name || 'this customer')}?</h3>
            <div class="rm-row">
                <div class="rm-label">You typed</div>
                <div class="rm-val">${escapeHtml(addr1)}${addr2 ? ', ' + escapeHtml(addr2) : ''}</div>
            </div>
            <div class="rm-row">
                <div class="rm-label">Matched customer</div>
                <div class="rm-val"><b>${escapeHtml(c.name || 'UNNAMED')}</b></div>
            </div>
            <div class="rm-row">
                <div class="rm-label">Billed to</div>
                <div class="rm-val">${escapeHtml(c.billingAddress1 || c.address1 || '')}
                ${(c.billingAddress2 || c.address2) ? ', ' + escapeHtml(c.billingAddress2 || c.address2) : ''}</div>
            </div>
            ${Array.isArray(c.jobSites) && c.jobSites.length ? `
                <div class="rm-hint">
                    <b>${c.jobSites.length}</b> existing job site${c.jobSites.length !== 1 ? 's' : ''} on file.
                    Adding this will create one more.
                </div>
            ` : ''}
            <div class="rm-actions">
                <button class="rm-btn rm-green" data-action="addSite">✅ ADD AS JOB SITE</button>
                <button class="rm-btn rm-blue"  data-action="fillOnly">📋 FILL, DON'T ADD</button>
                <button class="rm-btn rm-gray"  data-action="cancel">CANCEL</button>
            </div>
        `, {
            addSite: async () => {
                // Fill billing from customer, keep the typed job site, mark to save
                fillBillingFromCustomer(c, config);
                pinCustomerId(c.id, config);
                markJobSiteToAdd(addr1, addr2, config);
            },
            fillOnly: () => {
                fillBillingFromCustomer(c, config);
                pinCustomerId(c.id, config);
            },
            cancel: () => {}
        });
        return;
    }

    // Case C: name or phone match, user wasn't typing into job site.
    // If the customer has exactly one job site, auto-fill it. Otherwise,
    // present a job-site picker.
    const sites = Array.isArray(c.jobSites) ? c.jobSites : [];

    if (sites.length === 0) {
        // Customer has no stored job sites. Pre-fill billing as the site
        // (common for residential work).
        confirmAndFill(c, {
            billing: true,
            jobSite: {
                address1: c.billingAddress1 || c.address1 || '',
                address2: c.billingAddress2 || c.address2 || ''
            },
            reason: `👤 ${escapeHtml(c.name || 'Customer')}`
        });
        return;
    }

    if (sites.length === 1) {
        // Unambiguous.
        confirmAndFill(c, {
            billing: true,
            jobSite: sites[0],
            reason: `👤 ${escapeHtml(c.name || 'Customer')} — using their only job site`
        });
        return;
    }

    // Customer has multiple sites → show picker.
    showModal(`
        <h3>🏢 ${escapeHtml(c.name || 'Customer')} — pick job site</h3>
        <div class="rm-row">
            <div class="rm-label">Billed to</div>
            <div class="rm-val">${escapeHtml(c.billingAddress1 || c.address1 || '')}</div>
        </div>
        <div class="rm-row">
            <div class="rm-label">Job sites on file</div>
            <div>
                ${sites.map((s, i) => `
                    <button class="rm-btn rm-blue" style="width:100%; margin-bottom:6px; text-align:left; text-transform:none;"
                            data-action="site-${i}">
                        📍 ${escapeHtml(s.address1 || '')}
                        ${s.address2 ? ', ' + escapeHtml(s.address2) : ''}
                        ${s.label ? ` — ${escapeHtml(s.label)}` : ''}
                    </button>
                `).join('')}
            </div>
        </div>
        <div class="rm-actions">
            <button class="rm-btn rm-gray" data-action="cancel">CANCEL</button>
        </div>
    `, Object.fromEntries([
        ...sites.map((s, i) => [`site-${i}`, () => {
            confirmAndFill(c, { billing: true, jobSite: s, silent: true });
        }]),
        ['cancel', () => {}]
    ]));
}

// ==========================================================================
// FILL HELPERS
// ==========================================================================

function fillBillingFromCustomer(c, config) {
    if (!config.billing) return;
    setVal(config.billing.name,  c.name || '');
    setVal(config.billing.phone, c.primaryPhone || c.phone || '');
    setVal(config.billing.addr1, c.billingAddress1 || c.address1 || '');
    setVal(config.billing.addr2, c.billingAddress2 || c.address2 || '');
    if (config.accountIdField) {
        setVal(config.accountIdField, c.accountId || '');
    }
    // Highlight the filled fields
    ['name','phone','addr1','addr2'].forEach(k => {
        const id = config.billing[k];
        if (id && document.getElementById(id)) {
            document.getElementById(id).classList.add('input-changed');
        }
    });
}

function fillJobSite(site, config) {
    if (!config.jobSite || !site) return;
    setVal(config.jobSite.addr1, site.address1 || '');
    setVal(config.jobSite.addr2, site.address2 || '');
    ['addr1','addr2'].forEach(k => {
        const id = config.jobSite[k];
        if (id && document.getElementById(id)) {
            document.getElementById(id).classList.add('input-changed');
        }
    });
}

function pinCustomerId(customerId, config) {
    // Stash on the form so the caller's save logic can pass it back in.
    if (!config._formHandle) config._formHandle = {};
    config._formHandle.pinnedCustomerId = customerId;
    // Also stick on window for cross-module reads
    window.__rolodexPinned = { customerId, ts: Date.now() };
}

function markJobSiteToAdd(addr1, addr2, config) {
    if (!config._formHandle) config._formHandle = {};
    config._formHandle.pendingJobSite = { address1: addr1, address2: addr2 };
    window.__rolodexPendingJobSite = { address1: addr1, address2: addr2 };
}

function confirmAndFill(customer, opts) {
    // Used when match is clear enough not to need a confirm modal —
    // but we still briefly flash the fact in the UI so the user knows
    // what just got filled in.
    const cfg = activeAutocompleteConfig;
    if (!cfg) return;
    fillBillingFromCustomer(customer, cfg);
    if (opts.jobSite) fillJobSite(opts.jobSite, cfg);
    pinCustomerId(customer.id, cfg);
    if (opts.silent) return;
    // Non-blocking toast-ish confirmation
    flashToast(opts.reason || 'Filled from rolodex');
}

function flashToast(htmlMsg) {
    let t = document.getElementById('rolodex-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'rolodex-toast';
        t.style.cssText = 'position:fixed; top:80px; right:20px; z-index:6000;' +
            'background:#202124; color:white; padding:10px 16px; border-radius:6px;' +
            'font-family:Inter,sans-serif; font-size:13px; box-shadow:0 4px 12px rgba(0,0,0,.3);' +
            'transition: opacity 0.3s; max-width: 320px;';
        document.body.appendChild(t);
    }
    t.innerHTML = '✅ ' + htmlMsg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ==========================================================================
// SAVE-TIME HELPERS — forms call this on save to commit customer+job-site
// updates. Returns the customer id to stash on the saved form doc.
// ==========================================================================

export async function commitCustomerFromForm(config, formValues) {
    // formValues: { name, phone, billingAddr1, billingAddr2, accountId,
    //               siteAddr1, siteAddr2 }
    const pinnedId =
        (config && config._formHandle && config._formHandle.pinnedCustomerId) ||
        (window.__rolodexPinned && window.__rolodexPinned.customerId) || null;

    const pendingSite =
        (config && config._formHandle && config._formHandle.pendingJobSite) ||
        window.__rolodexPendingJobSite || null;

    // Build the customer payload from form values
    const payload = {
        name: (formValues.name || '').toUpperCase().trim(),
        primaryPhone: (formValues.phone || '').trim(),
        billingAddress1: (formValues.billingAddr1 || '').toUpperCase().trim(),
        billingAddress2: (formValues.billingAddr2 || '').toUpperCase().trim(),
        accountId: (formValues.accountId || '').trim()
    };

    // Don't create a customer on save if neither name nor phone was entered.
    if (!payload.name && !payload.primaryPhone) return null;

    const opts = { customerId: pinnedId };
    if (pendingSite && pendingSite.address1) {
        opts.addJobSite = pendingSite;
    } else if (formValues.siteAddr1 && (
        (formValues.siteAddr1 || '').toUpperCase().trim() !==
        (formValues.billingAddr1 || '').toUpperCase().trim()
    )) {
        // Silently record the current site address on the customer too,
        // so next time someone looks up by this address we find them.
        opts.addJobSite = {
            address1: (formValues.siteAddr1 || '').toUpperCase().trim(),
            address2: (formValues.siteAddr2 || '').toUpperCase().trim()
        };
    }

    try {
        const { id } = await DB.upsertCustomer(payload, opts);
        // Clear pending flags so a subsequent save doesn't re-add
        if (config && config._formHandle) {
            config._formHandle.pinnedCustomerId = id;
            config._formHandle.pendingJobSite = null;
        }
        delete window.__rolodexPendingJobSite;
        window.__rolodexPinned = { customerId: id, ts: Date.now() };
        return id;
    } catch (e) {
        console.error('commitCustomerFromForm failed:', e);
        return null;
    }
}

// ==========================================================================
// BACKWARD COMPAT (keep existing forms working)
// ==========================================================================

// Old single-field rolodex. Kept for forms that haven't migrated yet.
// New forms should use setupCustomerAutocomplete instead.
export function setupRolodex(inputId, boxId, callback) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    if (!input || !box) return;

    let t;
    input.addEventListener('keyup', () => {
        clearTimeout(t);
        const val = input.value.trim();
        if (val.length < 3) { box.style.display = 'none'; return; }
        t = setTimeout(() => {
            const matches = DB.searchCustomers(val, 5);
            if (matches.length === 0) { box.style.display = 'none'; return; }
            box.innerHTML = matches.map((m, i) => {
                const c = m.customer;
                return `<div class="suggestion-item" data-idx="${i}">
                    <strong>${escapeHtml(c.name || '')}</strong>
                    <br>${escapeHtml(c.billingAddress1 || c.address1 || '')}
                </div>`;
            }).join('');
            box.querySelectorAll('.suggestion-item').forEach(el => {
                el.onclick = () => {
                    const idx = parseInt(el.dataset.idx, 10);
                    const c = matches[idx].customer;
                    callback({
                        name: c.name,
                        phone: c.primaryPhone || c.phone,
                        address1: c.billingAddress1 || c.address1,
                        address2: c.billingAddress2 || c.address2,
                        id: c.accountId || c.id
                    });
                    box.style.display = 'none';
                };
            });
            box.style.display = 'block';
        }, 200);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) box.style.display = 'none';
    });
}

// ==========================================================================
// FORWARD-BREADCRUMB — shows "← Forwarded from Phone Message #800001"
// on any doc that has originDocType + originDocId set. Renders once per
// page and clicks navigate to the source.
// ==========================================================================

export function renderOriginBreadcrumb(data) {
    if (!data || !data.originDocType) return;
    const typeLabel = {
        phone_message: '📥 Phone Message',
        sales_lead:    '💼 Sales Lead',
        quote:         '📝 Quote',
        work_order:    '🛠️ Work Order',
        service_ticket:'🖥️ Service Ticket',
        invoice:       '💰 Invoice'
    }[data.originDocType] || data.originDocType;
    const pagePath = {
        phone_message: '/views/forms/phone_message.html',
        sales_lead:    '/views/forms/sales_call.html',
        quote:         '/views/forms/quote.html',
        work_order:    '/views/forms/work_order.html',
        service_ticket:'/views/forms/service.html',
        invoice:       '/views/forms/invoice.html'
    }[data.originDocType];

    // Avoid duplicates
    if (document.getElementById('origin-breadcrumb')) return;

    const crumb = document.createElement('div');
    crumb.id = 'origin-breadcrumb';
    crumb.style.cssText = 'position: fixed; top: 70px; left: 50%; transform: translateX(-50%);' +
        'background: #fff3cd; color: #7a5a00; padding: 8px 16px; border-radius: 20px;' +
        'font-family: Inter, sans-serif; font-size: 12px; font-weight: 600;' +
        'box-shadow: 0 4px 12px rgba(0,0,0,.2); z-index: 999; cursor: pointer;' +
        'border: 1px solid #f9ab00;';
    crumb.innerHTML = `← Forwarded from ${typeLabel} #${data.originDocId}`;
    if (pagePath) {
        crumb.onclick = () => window.location.href = `${pagePath}?id=${data.originDocId}`;
    }
    document.body.appendChild(crumb);
}

// ==========================================================================
// DUPLICATE-DETECTION PROMPT — call before save. If recent duplicates
// exist, shows a modal with "Open Existing" / "Save Anyway" / "Cancel"
// and returns the user's choice as a Promise<'open'|'save'|'cancel'>.
// If no duplicates, resolves to 'save' immediately.
// ==========================================================================

const DEDUPE_WINDOWS = {
    phone_messages:  1,   // 60 seconds — guards accidental double-click
    service_tickets: 5,
    work_orders:     5,
    quotes:          5,
    sales_leads:     5,
    invoices:        5
};

const DEDUPE_LABELS = {
    phone_messages:  { noun: 'phone message',  emoji: '📥', page: '/views/forms/phone_message.html' },
    service_tickets: { noun: 'service ticket', emoji: '🛠️', page: '/views/forms/service.html' },
    work_orders:     { noun: 'work order',     emoji: '🛠️', page: '/views/forms/work_order.html' },
    quotes:          { noun: 'quote',          emoji: '📝', page: '/views/forms/quote.html' },
    sales_leads:     { noun: 'sales lead',     emoji: '💼', page: '/views/forms/sales_call.html' },
    invoices:        { noun: 'invoice',        emoji: '💰', page: '/views/forms/invoice.html' }
};

export async function guardAgainstDuplicates(collectionName, identity, opts = {}) {
    const { DB } = await import('/js/db.js');
    const window_min = opts.windowMinutes || DEDUPE_WINDOWS[collectionName] || 5;
    const currentDocId = opts.currentDocId || null;

    const hits = (await DB.findRecentDuplicates(collectionName, identity, window_min))
        .filter(d => d.id !== currentDocId);

    if (hits.length === 0) return 'save';

    return new Promise((resolve) => {
        ensureModal();
        const label = DEDUPE_LABELS[collectionName] || { noun: 'record', emoji: '📋', page: '/' };
        const mins  = window_min;

        const list = hits.slice(0, 4).map(h => `
            <button class="rm-btn rm-blue" style="width:100%; margin-bottom:6px; text-align:left; text-transform:none;"
                    data-action="open-${h.id}">
                ${label.emoji} #${escapeHtml(h.ticketNumber || h.id)} — ${escapeHtml(h.customerName || 'Unknown')}
                ${h.phone ? `<span style="font-size:11px; opacity:.8; display:block;">📞 ${escapeHtml(h.phone)}</span>` : ''}
            </button>
        `).join('');

        showModal(`
            <h3>⚠️ A ${label.noun} for this customer was just created</h3>
            <p style="color:#5f6368; font-size:13px; margin: 0 0 14px 0;">
                Within the last <b>${mins} minute${mins !== 1 ? 's' : ''}</b>, ${hits.length === 1 ? 'a matching record was' : `${hits.length} matching records were`} saved for
                <b>${escapeHtml(identity.name || identity.phone || 'this customer')}</b>.
            </p>
            <div class="rm-label">Open one of these instead?</div>
            <div style="margin: 10px 0;">${list}</div>
            <div class="rm-actions">
                <button class="rm-btn rm-gray" data-action="cancel">CANCEL</button>
                <button class="rm-btn rm-green" data-action="save">SAVE ANYWAY</button>
            </div>
        `, Object.fromEntries([
            ...hits.map(h => [`open-${h.id}`, () => {
                window.location.href = `${label.page}?id=${h.id}`;
                resolve('open');
            }]),
            ['save',   () => resolve('save')],
            ['cancel', () => resolve('cancel')]
        ]));
    });
}

export function updateRolodexFromFields(ids) {
    const data = {
        name: document.getElementById(ids.name).value,
        phone: document.getElementById(ids.phone).value,
        address1: document.getElementById(ids.addr1).value,
        address2: document.getElementById(ids.addr2).value,
        id: document.getElementById(ids.acctId).value
    };
    if (data.phone) {
        DB.saveCustomer(data);
        alert("Rolodex Updated for: " + data.name);
    } else {
        alert("Phone number required to update Rolodex.");
    }
}
