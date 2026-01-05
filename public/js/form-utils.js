import { DB } from './db.js';

// --- 1. HELPERS ---
export function getUrlParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

export function autoGrow(element) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight) + "px";
}

export function setVal(id, val) { 
    if(val !== undefined && document.getElementById(id)) document.getElementById(id).value = val; 
}

export function setupInputHighlighting() {
    document.addEventListener('input', (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
             e.target.classList.add('input-changed');
        }
    });
    // Initialize existing textareas
    setTimeout(() => document.querySelectorAll("textarea").forEach(autoGrow), 100);
}

// --- 2. ROLODEX LOGIC ---
let searchTimeout;

export function setupRolodex(inputId, boxId, callback) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    
    if(!input || !box) return;

    input.addEventListener('keyup', () => {
        clearTimeout(searchTimeout);
        const val = input.value.trim();
        
        if (val.length < 3) { 
            box.style.display = 'none'; 
            return; 
        }

        searchTimeout = setTimeout(async () => {
            const client = await DB.findCustomerByPhone(val);
            if (client) {
                box.innerHTML = `<div class="suggestion-item">
                    <strong>${client.name}</strong><br>${client.address1}
                </div>`;
                
                // Add click listener to the item
                box.querySelector('.suggestion-item').onclick = () => {
                    callback(client);
                    box.style.display = 'none';
                };
                
                box.style.display = 'block';
            } else {
                box.style.display = 'none';
            }
        }, 500);
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            box.style.display = 'none';
        }
    });
}

// --- THIS IS THE FUNCTION THAT WAS MISSING ---
export function updateRolodexFromFields(ids) {
    const data = {
        name: document.getElementById(ids.name).value,
        phone: document.getElementById(ids.phone).value,
        address1: document.getElementById(ids.addr1).value,
        address2: document.getElementById(ids.addr2).value,
        id: document.getElementById(ids.acctId).value
    };

    if(data.phone) {
        DB.saveCustomer(data);
        alert("Rolodex Updated for: " + data.name);
    } else {
        alert("Phone number required to update Rolodex.");
    }
}