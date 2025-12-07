// js/ui.js
import { grillState, THEME_STORAGE_KEY } from './state.js';
import { formatCurrency, formatElapsedTime } from './utils.js';
import { calculateAccountTotal, calculateCurrentSoldStock, calculateCurrentRemainingStock, getStockItems } from './calculations.js';

// Element References
export const elements = {
    paidCash: document.getElementById('paid-cash')?.querySelector('span:last-child'),
    paidCard: document.getElementById('paid-card')?.querySelector('span:last-child'),
    paidQR: document.getElementById('paid-qr')?.querySelector('span:last-child'),
    paidOnHouse: document.getElementById('paid-on-house')?.querySelector('span:last-child'),
    totalPaid: document.getElementById('total-paid')?.querySelector('span:last-child'),
    openTablesTotal: document.getElementById('open-tables-total')?.querySelector('.value'),
    soldTitle: document.getElementById('sold-title'),
    remainingTitle: document.getElementById('remaining-title'),
    remainingList: document.getElementById('remaining-items-list'),
    soldList: document.getElementById('sold-items-list'),
    dispatchArea: document.getElementById('dispatch-area'),
    fullscreenBtn: document.getElementById('fullscreen-toggle'),
    themeToggleBtn: document.getElementById('theme-toggle'),
    tables: document.querySelectorAll('.table')
};

let dispatchIntervalId = null;

// --- Stock UI ---
export function updateStockDisplay() {
    const soldStock = calculateCurrentSoldStock();
    const remainingStockCalculated = calculateCurrentRemainingStock();
    const stockItems = getStockItems();
    
    if (!elements.remainingList || !elements.soldList) return;
    
    elements.remainingList.innerHTML = ''; 
    elements.soldList.innerHTML = '';
    
    stockItems.forEach(item => {
        const soldInfo = soldStock[item.id] || { name: item.name, grams: 0, pieces: 0, count: 0 };
        const remaining = remainingStockCalculated[item.id] || 0;
        let remainingValueText = '', soldValueText = '', countText = '';
        
        if (item.type === 'grams') {
            const unit = 'g';
            remainingValueText = `${remaining} ${unit}`; 
            soldValueText = `${soldInfo.grams} ${unit}`;
            countText = soldInfo.count > 0 ? `${soldInfo.count}x` : ''; 
        } else {
            const unit = 'ks';
            remainingValueText = `${remaining} ${unit}`; 
            soldValueText = `${soldInfo.pieces} ${unit}`; 
            countText = '';
        }
        
        elements.remainingList.innerHTML += `<div class="info-item-row" data-stock-item="${item.id}"><span class="item-name">${item.name}</span><span class="item-value">${remainingValueText}</span></div>`;
        elements.soldList.innerHTML += `<div class="info-item-row" data-stock-item="${item.id}"><span class="item-name">${item.name}</span><span class="item-value-details"><span class="item-count" style="visibility: ${countText ? 'visible' : 'hidden'}; padding-right: 8px;">${countText}</span><span class="item-value">${soldValueText}</span></span></div>`;
    });
}

// --- Totals UI ---
export function updatePaidTotalsDisplay() {
    const totalRevenue = grillState.paidCash + grillState.paidCard + grillState.paidQR;
    if(elements.paidCash) elements.paidCash.textContent = formatCurrency(grillState.paidCash);
    if(elements.paidCard) elements.paidCard.textContent = formatCurrency(grillState.paidCard);
    if(elements.paidQR) elements.paidQR.textContent = formatCurrency(grillState.paidQR);
    if(elements.paidOnHouse) elements.paidOnHouse.textContent = formatCurrency(grillState.paidOnTheHouse);
    if(elements.totalPaid) elements.totalPaid.textContent = formatCurrency(totalRevenue);
}

export function updateOpenTablesTotalDisplay() { 
    let openTotal = 0; 
    Object.values(grillState.tables).forEach(accounts => { 
        if (Array.isArray(accounts)) { 
            accounts.forEach(account => { 
                openTotal += calculateAccountTotal(account); 
            }); 
        } 
    }); 
    if(elements.openTablesTotal) elements.openTablesTotal.textContent = formatCurrency(openTotal); 
}

// --- Table Visuals ---
export function updateTableVisuals() { 
    elements.tables.forEach(table => { 
        const tableId = table.id; 
        if (grillState.tables[tableId] && grillState.tables[tableId].length > 0) { 
            table.classList.add('occupied'); 
        } else { 
            table.classList.remove('occupied'); 
            table.classList.remove('selected'); 
        } 
    }); 
}

// --- Dispatch Area ---
export function renderDispatchArea() { 
    stopDispatchTimers(); 
    if (!elements.dispatchArea) return; 
    
    const batchesToDispatch = []; 
    Object.entries(grillState.tables).forEach(([tableId, accounts]) => { 
        if (Array.isArray(accounts)) { 
            accounts.forEach(account => { 
                if (Array.isArray(account.dispatchBatches)) { 
                    account.dispatchBatches.forEach(batch => { 
                        if (batch.status === 'ready') { 
                            // Filtrujeme jen jídlo pro výdej
                            if (batch.items.some(item => !item.isOther)) {
                                batchesToDispatch.push({ ...batch, tableId: tableId, accountId: account.accountId, customerName: account.customerName }); 
                            }
                        } 
                    }); 
                } 
            }); 
        } 
    }); 
    
    batchesToDispatch.sort((a, b) => (a.readyTimestamp || Infinity) - (b.readyTimestamp || Infinity)); 
    
    elements.dispatchArea.innerHTML = ''; 
    if (batchesToDispatch.length > 0) { 
        batchesToDispatch.forEach(batch => { 
            const card = document.createElement('div'); 
            card.className = 'dispatch-card'; 
            card.dataset.tableId = batch.tableId; 
            card.dataset.accountId = batch.accountId; 
            card.dataset.batchId = batch.batchId; 
            
            const tableElement = document.getElementById(batch.tableId); 
            const tableText = tableElement ? tableElement.textContent : batch.tableId; 
            
            const header = document.createElement('div'); 
            header.className = 'dispatch-card-header'; 
            header.innerHTML = `${batch.customerName} <span>(${tableText})</span>`; 
            
            const timerDiv = document.createElement('div'); 
            timerDiv.className = 'dispatch-timer'; 
            timerDiv.dataset.timestamp = batch.readyTimestamp; 
            timerDiv.textContent = formatElapsedTime(Date.now() - batch.readyTimestamp); 
            
            const itemsDiv = document.createElement('div'); 
            itemsDiv.className = 'dispatch-card-items'; 
            itemsDiv.innerHTML = batch.items.filter(item => !item.isOther).map(item => `<span>${item.quantity}x ${item.name}</span>`).join(''); 
            
            const dispatchButton = document.createElement('button'); 
            dispatchButton.className = 'dispatch-button'; 
            dispatchButton.textContent = 'Výdej'; 
            
            card.appendChild(header); 
            card.appendChild(timerDiv); 
            card.appendChild(itemsDiv); 
            card.appendChild(dispatchButton); 
            elements.dispatchArea.appendChild(card); 
        }); 
        startDispatchTimers(); 
    } 
}

function startDispatchTimers() { 
    stopDispatchTimers(); 
    dispatchIntervalId = setInterval(() => { 
        const now = Date.now(); 
        const twentyMinutes = 20 * 60 * 1000; 
        document.querySelectorAll('#dispatch-area .dispatch-timer').forEach(timerEl => { 
            const timestamp = parseInt(timerEl.dataset.timestamp); 
            const cardEl = timerEl.closest('.dispatch-card'); 
            if (!isNaN(timestamp) && cardEl) { 
                const elapsed = now - timestamp; 
                const isOverdue = elapsed > twentyMinutes; 
                timerEl.textContent = formatElapsedTime(elapsed); 
                timerEl.classList.toggle('overdue', isOverdue); 
                cardEl.classList.toggle('overdue', isOverdue); 
            } 
        }); 
    }, 1000); 
}

function stopDispatchTimers() { 
    if (dispatchIntervalId) { 
        clearInterval(dispatchIntervalId); 
        dispatchIntervalId = null; 
    } 
}

// --- Theme & Fullscreen ---
export function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('night-mode');
        if (elements.themeToggleBtn) elements.themeToggleBtn.textContent = 'Denní režim ☀️';
    } else {
        document.body.classList.remove('night-mode');
        if (elements.themeToggleBtn) elements.themeToggleBtn.textContent = 'Noční režim 🌜';
    }
}

export function cycleTheme() { 
    const isNight = document.body.classList.contains('night-mode'); 
    const newTheme = isNight ? 'light' : 'dark'; 
    // Poznámka: setManualThemePreference voláme z app.js nebo controlleru, zde jen UI update?
    // Pro jednoduchost vrátíme nový theme a app.js ho uloží.
    return newTheme;
}

export function toggleFullscreen() {
    const elem = document.documentElement;
    if (!document.fullscreenElement) { 
        elem.requestFullscreen().catch(err => { console.error(`Error enabling full-screen mode: ${err.message}`); }); 
    } else { 
        if (document.exitFullscreen) { document.exitFullscreen(); } 
    }
}

export function updateFullscreenButton() {
    const button = elements.fullscreenBtn;
    if (!button) return;
    const fsEnterIcon = button.querySelector('.fs-enter');
    const fsExitIcon = button.querySelector('.fs-exit');
    if (document.fullscreenElement) {
        if(fsEnterIcon) fsEnterIcon.style.display = 'none';
        if(fsExitIcon) fsExitIcon.style.display = 'block';
        button.title = 'Opustit celou obrazovku';
    } else {
        if(fsEnterIcon) fsEnterIcon.style.display = 'block';
        if(fsExitIcon) fsExitIcon.style.display = 'none';
        button.title = 'Celá obrazovka';
    }
}

// --- Master Update Function ---
export function updateAllDisplays() { 
    updatePaidTotalsDisplay(); 
    updateOpenTablesTotalDisplay(); 
    updateTableVisuals(); 
    renderDispatchArea(); 
    updateStockDisplay(); 
}

// Helper pro zavření dialog containeru (čisté DOM smazání)
export function clearDialogContainer() {
    const container = document.getElementById('dialogContainer');
    if (container) container.innerHTML = '';
}