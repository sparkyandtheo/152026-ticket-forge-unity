import { db } from '/js/firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATION ---
const TECHS = {
    service: ["Mario", "Don Fike", "Dustin B"],
    install: ["William", "Bob", "Team A"],
    sales:   ["Jim", "Kathy"]
};

const HOURS = ["8:00", "9:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00"];
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

// Start
window.onload = () => switchView('service');

// --- 2. RENDER THE GRID ---
function renderBoard() {
    const container = document.getElementById('calendar-mount');
    container.innerHTML = ''; // Clear

    const table = document.createElement('div');
    table.className = 'schedule-grid';

    // SETUP COLUMNS & ROWS
    let colHeaders = currentView === 'service' ? HOURS : DAYS;
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
    
    div.innerHTML = `
        <div class="card-id">#${data.ticketNumber || id.substring(0,4)}</div>
        <div class="card-title">${data.customerName || 'Unknown'}</div>
        <div class="card-loc">${data.address || data.siteAddress || ''}</div>
    `;

    // Drag Start: Store ID and Collection in the event
    div.ondragstart = (e) => {
        e.dataTransfer.setData("text/id", id);
        e.dataTransfer.setData("text/collection", type);
    };

    // Double Click to Open
    div.ondblclick = () => {
        let page = type === 'service_tickets' ? 'service.html' : 
                   (type === 'work_orders' ? 'work_order.html' : 'sales_call.html');
        window.open(`../forms/${page}?id=${id}`, '_blank');
    };

    return div;
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