// public/js/notification-bell.js
//
// Reusable top-bar notification bell.
// Mounts into any page and subscribes to Firestore for 'Attention'-status
// documents targeted at the current user. Badge count = how many of
// those attention items are mine.
//
// Usage:
//   import { mountNotificationBell } from '/js/notification-bell.js';
//   mountNotificationBell(document.getElementById('my-toolbar-right-slot'));
//
// The bell attaches its own styles + dropdown panel. It respects the
// @hamburgdoor.com domain gate (requires a signed-in user).

import { db, auth } from '/js/firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ATTENTION_COLLECTIONS = {
    service_tickets: '/views/forms/service.html',
    work_orders:     '/views/forms/work_order.html',
    quotes:          '/views/forms/quote.html',
    phone_messages:  '/views/forms/phone_message.html',
    sales_leads:     '/views/forms/sales_call.html',
    invoices:        '/views/forms/invoice.html'
};

let bellEl = null;
let badgeEl = null;
let panelEl = null;
let listEl = null;
let currentUserEmail = null;
const buckets = {};

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function relevantItems() {
    const all = Object.values(buckets).flat();
    // "Relevant to me" = my email matches attentionTargetEmail OR the
    // ticket has no specific target (everyone-visible).
    return all
        .filter(it => !it.attentionTargetEmail || it.attentionTargetEmail === currentUserEmail)
        .sort((a, b) => (b._ms || 0) - (a._ms || 0));
}

function render() {
    const items = relevantItems();
    const count = items.length;
    if (badgeEl) {
        if (count > 0) {
            badgeEl.textContent = count > 99 ? '99+' : String(count);
            badgeEl.style.display = 'inline-flex';
            bellEl.classList.add('hd-bell-has-items');
        } else {
            badgeEl.style.display = 'none';
            bellEl.classList.remove('hd-bell-has-items');
        }
    }
    if (listEl) {
        if (items.length === 0) {
            listEl.innerHTML = `<div class="hd-bell-empty">\u2728 Nothing needs your attention.</div>`;
        } else {
            listEl.innerHTML = items.slice(0, 20).map(it => `
                <a class="hd-bell-item" href="${it.page}?id=${encodeURIComponent(it.id)}">
                    <div class="hd-bell-item-head">
                        <span class="hd-bell-item-id">#${escapeHtml(it.ticketNumber || it.id)}</span>
                        <span class="hd-bell-item-cust">${escapeHtml(it.customerName || 'Unknown')}</span>
                    </div>
                    <div class="hd-bell-item-reason">${escapeHtml((it.attentionReason || '').slice(0, 140))}${(it.attentionReason || '').length > 140 ? '\u2026' : ''}</div>
                    <div class="hd-bell-item-meta">
                        rejected by ${escapeHtml((it.rejectedBy || '').split('@')[0] || 'unknown')}
                    </div>
                </a>
            `).join('');
        }
    }
}

function subscribe() {
    for (const [col, page] of Object.entries(ATTENTION_COLLECTIONS)) {
        const q = query(collection(db, col), where('status', '==', 'Attention'));
        onSnapshot(q, (snap) => {
            buckets[col] = snap.docs.map(d => {
                const data = d.data();
                const ts = data.rejectedAt || data.lastUpdated;
                const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
                return { id: d.id, page, _ms: ms, ...data };
            });
            render();
        }, (err) => console.warn('[bell]', col, err));
    }
}

export function mountNotificationBell(slot) {
    if (!slot) slot = document.body;
    if (document.getElementById('hd-bell')) return; // already mounted

    // CSS
    const style = document.createElement('style');
    style.textContent = `
        #hd-bell {
            position: relative; display: inline-flex; align-items: center;
            margin-right: 8px;
        }
        #hd-bell .hd-bell-btn {
            background: transparent; border: 1px solid #5f6368;
            color: #e8eaed; padding: 6px 10px; border-radius: 6px;
            font-size: 15px; cursor: pointer; line-height: 1;
            transition: all 0.15s;
        }
        #hd-bell .hd-bell-btn:hover { background: rgba(255,255,255,0.08); border-color: white; }
        #hd-bell.hd-bell-has-items .hd-bell-btn {
            border-color: #EF3340;
            color: #ff9a9a;
            animation: hd-bell-pulse 2.4s ease-in-out infinite;
        }
        @keyframes hd-bell-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,51,64,0); }
            50%      { box-shadow: 0 0 0 4px rgba(239,51,64,0.25); }
        }
        #hd-bell .hd-bell-badge {
            position: absolute; top: -6px; right: -6px;
            background: #EF3340; color: white;
            min-width: 18px; height: 18px; border-radius: 10px;
            display: none; align-items: center; justify-content: center;
            font-family: 'Inter', sans-serif;
            font-size: 10px; font-weight: 900;
            padding: 0 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            pointer-events: none;
        }
        #hd-bell .hd-bell-panel {
            display: none; position: absolute; top: 110%; right: 0;
            background: white; color: #202124; min-width: 340px; max-width: 420px;
            max-height: 480px; overflow-y: auto;
            border-radius: 10px; border: 1px solid #dadce0;
            box-shadow: 0 14px 40px rgba(0,0,0,0.25);
            z-index: 10000; font-family: 'Inter', sans-serif;
            text-align: left;
        }
        #hd-bell.open .hd-bell-panel { display: block; }
        #hd-bell .hd-bell-header {
            padding: 14px 16px; border-bottom: 2px solid #EF3340;
            font-weight: 900; font-size: 14px;
            display: flex; align-items: center; gap: 8px;
        }
        #hd-bell .hd-bell-empty {
            padding: 30px 20px; text-align: center; color: #5f6368;
            font-size: 13px;
        }
        #hd-bell .hd-bell-item {
            display: block; padding: 12px 14px;
            border-bottom: 1px solid #f1f3f4;
            text-decoration: none; color: inherit;
            transition: background 0.1s;
        }
        #hd-bell .hd-bell-item:hover { background: #fff3cd; }
        #hd-bell .hd-bell-item-head {
            display: flex; gap: 8px; align-items: baseline;
            font-size: 13px; margin-bottom: 4px;
        }
        #hd-bell .hd-bell-item-id {
            font-family: 'IBM Plex Mono', monospace;
            color: #b06000; font-weight: 700;
        }
        #hd-bell .hd-bell-item-cust { font-weight: 700; }
        #hd-bell .hd-bell-item-reason {
            font-size: 12px; color: #3c4043; line-height: 1.3;
        }
        #hd-bell .hd-bell-item-meta {
            font-size: 10px; color: #80868b; margin-top: 4px;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
    `;
    document.head.appendChild(style);

    // DOM
    bellEl = document.createElement('div');
    bellEl.id = 'hd-bell';
    bellEl.innerHTML = `
        <button class="hd-bell-btn" id="hd-bell-btn" title="Items needing attention">\ud83d\udd14</button>
        <span class="hd-bell-badge" id="hd-bell-badge" aria-hidden="true">0</span>
        <div class="hd-bell-panel" id="hd-bell-panel">
            <div class="hd-bell-header">\u26a0\ufe0f Requires Attention</div>
            <div id="hd-bell-list"></div>
        </div>
    `;
    slot.insertBefore(bellEl, slot.firstChild);

    badgeEl = document.getElementById('hd-bell-badge');
    panelEl = document.getElementById('hd-bell-panel');
    listEl  = document.getElementById('hd-bell-list');

    document.getElementById('hd-bell-btn').onclick = (e) => {
        e.stopPropagation();
        bellEl.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
        if (!bellEl.contains(e.target)) bellEl.classList.remove('open');
    });

    // Subscribe once we know who the user is
    onAuthStateChanged(auth, (user) => {
        if (!user) return;
        currentUserEmail = user.email;
        subscribe();
    });
}
