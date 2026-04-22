import { db } from '/js/firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATION ---
// Fallback tech list used when the 'employees' Firestore collection is empty.
// As soon as staff is added via the Admin Console, that list takes over.
const FALLBACK_TECHS = {
    service: ["Mario", "Don Fike", "Dustin B"],
    install: ["William", "Bob", "Team A"],
    sales:   ["Jim", "Kathy"]
};
let TECHS = { ...FALLBACK_TECHS };

// Load techs from 'employees' Firestore collection. If it's empty or blocked,
// keep the fallback so an unconfigured shop still has a working board.
async function loadTechsFromFirestore() {
    try {
        const snap = await getDocs(collection(db, 'employees'));
        if (snap.empty) return; // keep fallback
        const grouped = { service: [], install: [], sales: [] };
        snap.forEach(d => {
            const e = d.data();
            if (e && e.name && grouped[e.role]) grouped[e.role].push(e.name);
        });
        // Only overwrite a role if we actually found staff for it.
        for (const r of Object.keys(grouped)) {
            if (grouped[r].length) TECHS[r] = grouped[r];
        }
    } catch (err) {
        console.warn('[dispatch] Could not load employees from Firestore, using fallback:', err.message);
    }
}

// Service view uses abstract 'slots' instead of hard hours — a slot is
// 'Mario's 3rd call of the day', not 'the 10am appointment'. Avoids false
// precision (traffic, job length, etc).
const SERVICE_SLOTS = ["SLOT 1", "SLOT 2", "SLOT 3", "SLOT 4", "SLOT 5"];
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

let currentView = 'service'; // 'service', 'install', 'sales'
let currentDate = new Date(); // Default to today

// --- 1. INITIALIZATION ---
window.switchView = (viewName) => {
    currentView = viewName;
    
    // Update Buttons
    document.querySelectorAll('.view-switcher button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${viewName}`).classList.add('active');
    
    // Re-render
    renderBoard();
    subscribeToUnscheduled();
    subscribeToScheduled();
};

// Start — load staff from Firestore first, then render.
window.onload = async () => {
    await loadTechsFromFirestore();
    switchView('service');
};

// --- 2. RENDER THE GRID ---
function renderBoard() {
    const container = document.getElementById('calendar-mount');
    container.innerHTML = ''; // Clear

    const table = document.createElement('div');
    table.className = 'schedule-grid';

    // SETUP COLUMNS & ROWS
    let colHeaders = currentView === 'service' ? SERVICE_SLOTS : DAYS;
    let rowHeaders = TECHS[currentView];

    // CSS Grid Template
    // First column is 150px (Tech Name), rest are auto
    table.style.gridTemplateColumns = `150px repeat(${colHeaders.length}, 1fr)`;

    // A. Header Row
    const corner = document.createElement('div');
    corner.className = 'grid-header-cell';
    corner.innerText = "TECH / TIME";
    table.appendChild(corner);

    colHeaders.forEach(header => {
        const div = document.createElement('div');
        div.className = 'grid-header-cell';
        div.innerText = header;
        table.appendChild(div);
    });

    // B. Rows (Techs)
    rowHeaders.forEach(tech => {
        // Tech Name Label
        const label = document.createElement('div');
        label.className = 'grid-row-header';
        label.innerText = tech;
        table.appendChild(label);

        // Cells
        colHeaders.forEach((col, index) => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            
            // Set Data Attributes for Drop
            cell.dataset.tech = tech;
            cell.dataset.slot = col; // Either "9:00" or "MONDAY"
            
            // Drag Events
            cell.ondragover = (e) => { e.preventDefault(); cell.classList.add('drag-over'); };
            cell.ondragleave = () => cell.classList.remove('drag-over');
            cell.ondrop = (e) => handleDrop(e, cell);
            
            // ID for rendering scheduled cards later
            // Format: "Mario_9:00" or "William_MONDAY"
            cell.id = `cell_${tech.replace(/\s/g, '')}_${col}`;
            
            table.appendChild(cell);
        });
    });

    container.appendChild(table);
}

// --- 3. FIRESTORE LISTENERS ---

// A. UNSCHEDULED ("Parking Lot")
function subscribeToUnscheduled() {
    // Logic: If Service view, show Service tickets. If Install, show Work Orders.
    const collectionName = currentView === 'sales' ? 'sales_leads' : 
                          (currentView === 'install' ? 'work_orders' : 'service_tickets');

    const q = query(collection(db, collectionName), where("status", "==", "Open"));

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('parking-lot');
        container.innerHTML = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const card = createCardDOM(doc.id, data, collectionName);
            container.appendChild(card);
        });

        if(snapshot.empty) container.innerHTML = '<div style="padding:10px;color:#999;text-align:center;">All Clear!</div>';
    });
}

// B. SCHEDULED (The Board)
function subscribeToScheduled() {
    const collectionName = currentView === 'sales' ? 'sales_leads' : 
                          (currentView === 'install' ? 'work_orders' : 'service_tickets');
    
    // In production, query by Date Range. For now, just get "Scheduled" status.
    const q = query(collection(db, collectionName), where("status", "==", "Scheduled"));

    onSnapshot(q, (snapshot) => {
        // Clear all cells first (simplistic approach)
        document.querySelectorAll('.grid-cell').forEach(c => c.innerHTML = '');

        snapshot.forEach(doc => {
            const data = doc.data();
            // Find the cell this belongs to
            // Note: data.tech and data.slot must match our Grid IDs
            if (data.assignedTech && data.scheduledSlot) {
                const safeTech = data.assignedTech.replace(/\s/g, '');
                const cellId = `cell_${safeTech}_${data.scheduledSlot}`;
                const cell = document.getElementById(cellId);
                
                if (cell) {
                    const card = createCardDOM(doc.id, data, collectionName, true);
                    cell.appendChild(card);
                }
            }
        });
    });
}

// --- 4. CARD DOM GENERATOR ---
function createCardDOM(id, data, type, isScheduled = false) {
    const div = document.createElement('div');
    div.className = `job-card type-${currentView}`; // service, install, or sales
    div.draggable = true;

    // Unscheduled cards get a ⛔ REJECT button; scheduled cards don't
    // (rejecting an already-dispatched ticket is a different workflow).
    const rejectBtn = isScheduled ? '' : `
        <button class="card-reject-btn" title="Reject this ticket with a reason">⛔ REJECT</button>
    `;

    div.innerHTML = `
        <div class="card-id">#${escapeAttr(data.ticketNumber || id.substring(0,4))}</div>
        <div class="card-title">${escapeAttr(data.customerName || 'Unknown')}</div>
        <div class="card-loc">${escapeAttr(data.address || data.siteAddress1 || data.siteAddress || '')}</div>
        ${rejectBtn}
    `;

    div.ondragstart = (e) => {
        e.dataTransfer.setData("text/id", id);
        e.dataTransfer.setData("text/collection", type);
    };

    // Double Click to Open
    div.ondblclick = () => {
        let page = type === 'service_tickets' ? 'service.html' :
                   (type === 'work_orders' ? 'work_order.html' : 'sales_call.html');
        window.open(`/views/forms/${page}?id=${id}`, '_blank');
    };

    // Wire reject button (stop propagation so it doesn't trigger drag)
    const btn = div.querySelector('.card-reject-btn');
    if (btn) {
        btn.onmousedown = (e) => e.stopPropagation();
        btn.onclick = (e) => {
            e.stopPropagation();
            openRejectModal(id, type, data);
        };
    }

    return div;
}

function escapeAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================================
// REJECT MODAL — mandatory comment, marks ticket status=Attention
// ============================================================
function openRejectModal(id, collectionName, data) {
    ensureRejectModalMounted();
    const wrap = document.getElementById('reject-modal');
    document.getElementById('reject-modal-doc').innerHTML =
        `<b>${escapeAttr(data.customerName || 'Unknown')}</b> · #${escapeAttr(data.ticketNumber || id.substring(0,4))}` +
        (data.address || data.siteAddress1 ? `<br><span style="font-size:12px; color:#666;">📍 ${escapeAttr(data.address || data.siteAddress1)}</span>` : '');
    document.getElementById('reject-modal-reason').value = '';
    document.getElementById('reject-modal-submit').onclick = async () => {
        const reason = document.getElementById('reject-modal-reason').value.trim();
        if (!reason) {
            const err = document.getElementById('reject-modal-err');
            err.textContent = 'A reason is required.';
            err.style.display = 'block';
            return;
        }
        try {
            const me = (await import('/js/firebase-config.js')).auth.currentUser;
            await updateDoc(doc(db, collectionName, id), {
                previousStatus: data.status || 'Open',
                status: 'Attention',
                attentionReason: reason,
                rejectedBy: me ? me.email : null,
                rejectedAt: serverTimestamp(),
                // Who should see this in the notification bell. Prefer the
                // ticket's creator, falling back to null (everyone sees).
                attentionTargetEmail: data.createdByEmail || null
            });
            wrap.classList.remove('open');
        } catch (e) {
            console.error('reject failed', e);
            const err = document.getElementById('reject-modal-err');
            err.textContent = 'Save failed: ' + e.message;
            err.style.display = 'block';
        }
    };
    document.getElementById('reject-modal-cancel').onclick = () => wrap.classList.remove('open');
    wrap.classList.add('open');
    setTimeout(() => document.getElementById('reject-modal-reason').focus(), 100);
}

function ensureRejectModalMounted() {
    if (document.getElementById('reject-modal')) return;
    const el = document.createElement('div');
    el.id = 'reject-modal';
    el.innerHTML = `
        <style>
            #reject-modal {
                position: fixed; inset: 0; background: rgba(0,0,0,0.65);
                display: none; align-items: center; justify-content: center;
                z-index: 5000; padding: 20px;
                font-family: 'Inter', sans-serif;
            }
            #reject-modal.open { display: flex; }
            #reject-modal .rj-card {
                background: white; color: #202124; border-radius: 10px;
                padding: 26px 28px; width: 100%; max-width: 480px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                animation: rj-pop 0.18s ease-out;
            }
            @keyframes rj-pop { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
            #reject-modal h3 {
                margin: 0 0 14px 0; font-weight: 900; font-size: 18px;
                border-bottom: 3px solid #EF3340; padding-bottom: 10px;
                display: flex; align-items: center; gap: 8px;
            }
            #reject-modal .rj-doc {
                background: #f8f9fa; padding: 10px 14px; border-radius: 6px;
                margin-bottom: 14px; font-size: 14px;
                border-left: 3px solid #5f6368;
            }
            #reject-modal label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #5f6368; display: block; margin-bottom: 4px; }
            #reject-modal textarea {
                width: 100%; min-height: 120px; padding: 10px; border: 2px solid #dadce0;
                border-radius: 6px; font-family: inherit; font-size: 14px; box-sizing: border-box;
                resize: vertical;
            }
            #reject-modal textarea:focus { outline: none; border-color: #EF3340; }
            #reject-modal .rj-err {
                display: none; color: #d93025; font-size: 12px; margin-top: 6px;
                font-weight: 600;
            }
            #reject-modal .rj-actions {
                display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;
            }
            #reject-modal button {
                padding: 10px 18px; border: none; border-radius: 6px;
                font-family: inherit; font-weight: 700; font-size: 13px;
                cursor: pointer; text-transform: uppercase; letter-spacing: 0.03em;
            }
            #reject-modal .rj-cancel { background: #f1f3f4; color: #5f6368; }
            #reject-modal .rj-submit { background: #EF3340; color: white; }
            #reject-modal .rj-submit:hover { filter: brightness(1.1); }
        </style>
        <div class="rj-card">
            <h3>⛔ Reject Ticket</h3>
            <div class="rj-doc" id="reject-modal-doc"></div>
            <label for="reject-modal-reason">Why is this being rejected? (required)</label>
            <textarea id="reject-modal-reason" placeholder="e.g. Missing address, customer unreachable, wrong ticket type…"></textarea>
            <div class="rj-err" id="reject-modal-err"></div>
            <div class="rj-actions">
                <button class="rj-cancel" id="reject-modal-cancel">Cancel</button>
                <button class="rj-submit" id="reject-modal-submit">Reject Ticket</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.classList.contains('open')) el.classList.remove('open');
    });
}

// --- 5. DRAG & DROP LOGIC ---
async function handleDrop(e, cell) {
    e.preventDefault();
    cell.classList.remove('drag-over');

    const docId = e.dataTransfer.getData("text/id");
    const colName = e.dataTransfer.getData("text/collection");
    const tech = cell.dataset.tech;
    const slot = cell.dataset.slot;

    if (!docId || !colName) return;

    // UPDATE FIRESTORE
    try {
        const docRef = doc(db, colName, docId);
        await updateDoc(docRef, {
            status: "Scheduled",
            assignedTech: tech,
            scheduledSlot: slot,
            lastUpdated: serverTimestamp()
        });
        // Snapshot listener will automatically move the card visually
    } catch (err) {
        console.error("Drop failed:", err);
        alert("Failed to schedule: " + err.message);
    }
}