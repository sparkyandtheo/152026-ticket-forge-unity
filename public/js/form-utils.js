import { DB } from './db.js';

// --- 1. COMMON UI HELPERS ---
export function autoGrow(element) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight) + "px";
}

export function setVal(id, val) { 
    if(val && document.getElementById(id)) document.getElementById(id).value = val; 
}

export function setChk(id, val) { 
    if(val && document.getElementById(id)) document.getElementById(id).checked = true; 
}

export function getUrlParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

export function setupInputHighlighting() {
    document.addEventListener('input', (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
             e.target.classList.add('input-changed');
        }
    });
    // Initialize textareas
    document.querySelectorAll("textarea").forEach(autoGrow);
}

// --- 2. ROLODEX LOGIC ---
let searchTimeout;
export function setupRolodex(phoneInputId, suggestionsBoxId, fillCallback) {
    const input = document.getElementById(phoneInputId);
    const box = document.getElementById(suggestionsBoxId);
    
    if(!input || !box) return;

    // Search Trigger
    input.addEventListener('keyup', () => {
        clearTimeout(searchTimeout);
        const val = input.value.trim();
        if (val.length < 3) { box.style.display = 'none'; return; }

        searchTimeout = setTimeout(async () => {
            const client = await DB.findCustomerByPhone(val);
            if (client) {
                box.innerHTML = `<div class="suggestion-item"><strong>${client.name}</strong><br>${client.address1}</div>`;
                box.querySelector('.suggestion-item').onclick = () => {
                    fillCallback(client);
                    box.style.display = 'none';
                };
                box.style.display = 'block';
            } else {
                box.style.display = 'none';
            }
        }, 500);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) box.style.display = 'none';
    });
}

export function updateRolodexFromForm(nameId, phoneId, addr1Id, addr2Id, acctId) {
    const data = {
        name: document.getElementById(nameId).value,
        phone: document.getElementById(phoneId).value,
        address1: document.getElementById(addr1Id).value,
        address2: document.getElementById(addr2Id).value,
        id: document.getElementById(acctId).value
    };
    if(data.phone) {
        DB.saveCustomer(data);
        alert("Rolodex Updated for: " + data.name);
    } else {
        alert("Phone number required.");
    }
}