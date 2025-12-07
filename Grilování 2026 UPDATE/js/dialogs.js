// js/dialogs.js
import { grillState, saveGrillState } from './state.js';
import { generateId, formatTimestamp, formatCurrency, getCurrentDateFormatted, showToast } from './utils.js';
import { calculateAccountTotal, calculateCurrentSoldStock, calculateCurrentRemainingStock, getStockItems, areInitialStocksSet } from './calculations.js';
import { updateAllDisplays, renderDispatchArea, updateStockDisplay, updateTableVisuals, updateOpenTablesTotalDisplay, updatePaidTotalsDisplay, clearDialogContainer } from './ui.js';
import { addToSyncQueue, processSyncQueue } from './sync.js';
import { performDataReset } from './state.js';

const dialogContainerElement = document.getElementById('dialogContainer');

// --- Helper Functions ---
function closeDialog() {
    clearDialogContainer();
}

// ZMĚNA: Přidán export, aby tuto funkci viděl app.js
export function hasOpenTables() { 
    return Object.keys(grillState.tables).length > 0 && Object.values(grillState.tables).some(accounts => accounts.length > 0); 
}

// --- Logic Functions (Business Logic) ---

export function handleTableClick(tableId, tableText) {
    // areInitialStocksSet se nyní importuje z calculations.js
    if (!areInitialStocksSet()) { showStockNotSetWarningDialog(); return; } 
    
    document.querySelectorAll('.table').forEach(t => t.classList.remove('selected'));
    document.getElementById(tableId)?.classList.add('selected');
    
    closeDialog();
    
    const accountsOnTable = grillState.tables[tableId] || [];
    const isOccupied = accountsOnTable.length > 0;
    
    if (isOccupied) { showMultiAccountDialog(tableId); } 
    else { showCustomerDialog(tableId, tableText); }
}

function addItemToBill(tableId, accountId, itemId, quantity = 1, customGrams = null, isFreeAccessory = false) {
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    const menuItem = grillState.menuConfig.find(item => item.id === itemId);
    if (!account || !menuItem) { showToast("Chyba: Účet nebo položka menu nenalezena.", 'error'); return; }
    
    let itemName = menuItem.name;
    let itemPrice = menuItem.price;
    let itemUnit = menuItem.type;

    if (menuItem.type === 'grams' && customGrams !== null) {
        itemPrice = Math.round(customGrams * menuItem.price / 100);
        itemName = `${menuItem.name} (${customGrams}g)`;
    }

    if (isFreeAccessory) {
        itemPrice = 0;
        itemName = `${menuItem.name} (Z)`;
    }

    if (!Array.isArray(account.dispatchBatches)) account.dispatchBatches = [];
    let pendingBatch = account.dispatchBatches.find(batch => batch.status === 'pending');
    if (!pendingBatch) { 
        pendingBatch = { batchId: generateId(), items: [], status: 'pending', readyTimestamp: null }; 
        account.dispatchBatches.push(pendingBatch); 
    }
    
    const newBillItemId = generateId();
    const newItem = {
        id: newBillItemId,
        name: itemName,
        price: itemPrice, 
        quantity: quantity, 
        isOther: menuItem.category === 'other',
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        unit: itemUnit, 
        value: (menuItem.type === 'grams') ? customGrams : quantity 
    };
    pendingBatch.items.push(newItem);
    account.lastAddedItemIdToPendingBatch = newBillItemId;
    
    saveGrillState();
    updateBillDisplay(tableId, accountId);
    updateOpenTablesTotalDisplay();
    updateStockDisplay(); 
    updateOrderDialogButtonStates(tableId, accountId);
}

function undoLastItem(tableId, accountId) { 
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId); 
    if (!account || !Array.isArray(account.dispatchBatches)) { showToast("Účet nebo dávky nenalezeny.", 'error'); return; } 
    const pendingBatchIndex = account.dispatchBatches.findIndex(batch => batch.status === 'pending'); 
    if (pendingBatchIndex === -1) { showToast("Není žádná otevřená objednávka (dávka) k úpravě.", 'info'); return; } 
    const pendingBatch = account.dispatchBatches[pendingBatchIndex]; 
    if (!pendingBatch.items || pendingBatch.items.length === 0) { showToast("V otevřené objednávce nejsou žádné položky k vrácení.", 'info'); return; } 
    
    const lastItemId = account.lastAddedItemIdToPendingBatch; 
    let itemIndexToRemove = -1; 
    if (lastItemId) { itemIndexToRemove = pendingBatch.items.findIndex(item => item.id === lastItemId); } 
    if (itemIndexToRemove === -1 && pendingBatch.items.length > 0) { itemIndexToRemove = pendingBatch.items.length - 1; } 
    
    if (itemIndexToRemove > -1) { 
        pendingBatch.items.splice(itemIndexToRemove, 1); 
        account.lastAddedItemIdToPendingBatch = (pendingBatch.items.length > 0) ? pendingBatch.items[pendingBatch.items.length - 1].id : null; 
    } else { account.lastAddedItemIdToPendingBatch = null; } 
    
    saveGrillState(); 
    updateBillDisplay(tableId, accountId); 
    updateOpenTablesTotalDisplay(); 
    updateStockDisplay(); 
    updateOrderDialogButtonStates(tableId, accountId); 
}

function processAccountPayment(tableId, accountId, paymentDetails) {
    const accountIndex = grillState.tables[tableId]?.findIndex(acc => acc.accountId === accountId);
    if (accountIndex === -1 || !grillState.tables[tableId]?.[accountIndex]) return;
    
    const account = grillState.tables[tableId][accountIndex];
    const cashAmount = paymentDetails.cash || 0;
    const cardAmount = paymentDetails.card || 0;
    const qrAmount = paymentDetails.qr || 0;
    const onTheHouseAmount = paymentDetails.onTheHouse || 0;
    const totalPaidForRevenue = cashAmount + cardAmount + qrAmount;
    
    grillState.paidCash += cashAmount; 
    grillState.paidCard += cardAmount; 
    grillState.paidQR += qrAmount; 
    grillState.paidOnTheHouse += onTheHouseAmount;
    
    const allItemsForLog = account.dispatchBatches.reduce((accItems, batch) => accItems.concat(batch.items.map(item => ({ ...item }))), []);
    const transactionTimestamp = new Date();
    const transactionData = { 
        timestamp: transactionTimestamp.toISOString(), 
        customerName: account.customerName, 
        bill: allItemsForLog, 
        payment: { method: paymentDetails.method, cash: cashAmount, card: cardAmount, qr: qrAmount, onTheHouseAmount: onTheHouseAmount, total: totalPaidForRevenue } 
    };
    
    addToSyncQueue({ action: "logTransaction", transactionData: transactionData });
    
    if (!grillState.paidAccounts) grillState.paidAccounts = [];
    account.dispatchBatches.forEach(batch => batch.status = 'dispatched');
    grillState.paidAccounts.push({...account, paymentInfo: transactionData.payment });
    
    grillState.tables[tableId].splice(accountIndex, 1);
    if (grillState.tables[tableId]?.length === 0) delete grillState.tables[tableId];
    
    saveGrillState(); 
    updateAllDisplays(); 
    closeDialog();
    showToast(`Účet ${account.customerName} zaplacen.`, 'success');
}

function processPartialPayment(tableId, accountId, itemsToPay, paymentDetails) {
    const accountIndex = grillState.tables[tableId]?.findIndex(acc => acc.accountId === accountId);
    if (accountIndex === -1 || !grillState.tables[tableId]?.[accountIndex]) return;

    const account = grillState.tables[tableId][accountIndex];
    const cashAmount = paymentDetails.cash || 0; 
    const cardAmount = paymentDetails.card || 0; 
    const qrAmount = paymentDetails.qr || 0; 
    const onTheHouseAmount = paymentDetails.onTheHouse || 0;
    const totalPaidForRevenue = cashAmount + cardAmount + qrAmount;

    grillState.paidCash += cashAmount; 
    grillState.paidCard += cardAmount; 
    grillState.paidQR += qrAmount; 
    grillState.paidOnTheHouse += onTheHouseAmount;

    const transactionTimestamp = new Date();
    const paidItemsForBill = itemsToPay.map(item => ({ ...item, quantity: item.payQuantity }));

    const transactionData = {
        timestamp: transactionTimestamp.toISOString(), 
        customerName: `${account.customerName} (část)`, 
        bill: paidItemsForBill,
        payment: { method: paymentDetails.method, cash: cashAmount, card: cardAmount, qr: qrAmount, onTheHouseAmount: onTheHouseAmount, total: totalPaidForRevenue }
    };

    addToSyncQueue({ action: "logTransaction", transactionData: transactionData });

    if (!grillState.paidAccounts) { grillState.paidAccounts = []; }
    
    const partialPaidAccount = {
        accountId: generateId() + '_partial', 
        customerName: `${account.customerName} (část)`,
        dispatchBatches: [{ batchId: generateId(), items: paidItemsForBill, status: 'dispatched' }],
        paymentInfo: transactionData.payment
    };
    grillState.paidAccounts.push(partialPaidAccount);

    itemsToPay.forEach(itemPaid => {
        let remainingToDeduct = itemPaid.payQuantity;
        for (const batch of account.dispatchBatches) {
            if (remainingToDeduct <= 0) break;
            const itemInBill = batch.items.find(i => i.id === itemPaid.originalId);
            if (itemInBill) {
                const deductAmount = Math.min(remainingToDeduct, itemInBill.quantity);
                itemInBill.quantity -= deductAmount;
                remainingToDeduct -= deductAmount;
            }
        }
    });

    account.dispatchBatches.forEach(batch => { batch.items = batch.items.filter(item => item.quantity > 0); });
    account.dispatchBatches = account.dispatchBatches.filter(batch => batch.items.length > 0);

    saveGrillState();
    
    const remainingTotal = calculateAccountTotal(account);
    if (remainingTotal < 0.01) {
        grillState.tables[tableId].splice(accountIndex, 1);
        if (grillState.tables[tableId]?.length === 0) delete grillState.tables[tableId];
        showToast(`Poslední položky uhrazeny. Účet ${account.customerName} je uzavřen.`, 'success');
        closeDialog();
    } else {
        showToast(`Část účtu uhrazena. Zbývá ${formatCurrency(remainingTotal)}.`, 'info');
        setTimeout(() => showSplitByItemDialog(tableId, accountId), 50);
    }
    
    saveGrillState();
    updateAllDisplays();
}

// --- Dialog Display Functions ---

export function showStockNotSetWarningDialog() {
    closeDialog();
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box warning-dialog">
        <p><strong>! POZOR !</strong><br>Nejprve je nutné zadat počáteční stavy</p>
        <div class="dialog-buttons" style="justify-content: center;">
            <button class="btn btn--warning ok-button">Zadat stavy</button>
            <button class="btn btn--secondary cancel-button">Zrušit</button>
        </div></div></div>`;
    dialogContainerElement.innerHTML = dialogHTML;
    dialogContainerElement.querySelector('.ok-button').addEventListener('click', () => { closeDialog(); showStockInputDialog(); });
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

export function showOpenTablesWarningDialog() {
    closeDialog();
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box warning-dialog">
        <p><strong>! POZOR !</strong><br>Nelze provést uzávěrku, dokud jsou otevřené účty na stolech.</p>
        <div class="dialog-buttons" style="justify-content: center;">
            <button class="btn btn--primary ok-button">OK</button>
        </div></div></div>`;
    dialogContainerElement.innerHTML = dialogHTML;
    dialogContainerElement.querySelector('.ok-button').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

export function showStockInputDialog() {
    closeDialog();
    let formContentHTML = ''; 
    const stockItems = getStockItems();
    stockItems.forEach(item => { 
        const currentStock = grillState.initialStock[item.id] || ''; 
        const inputId = `stock-input-${item.id}`; 
        const unit = item.type === 'grams' ? 'g' : 'ks'; 
        let labelHTML = item.name; 
        if (item.name === "Pečená brambora") { labelHTML = "Pečená<br>brambora"; } 
        formContentHTML += `<div class="stock-item-row"><label for="${inputId}">${labelHTML}:</label><input type="text" inputmode="numeric" pattern="[0-9]*" id="${inputId}" name="${item.id}" value="${currentStock}"><span class="unit-span">${unit}</span></div>`; 
    });
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="stockInputDialog">
        <h3>Zadání počátečních stavů</h3>
        <form id="stockInputForm">${formContentHTML}</form>
        <div class="dialog-buttons">
            <button class="btn btn--secondary cancel-button">Zrušit</button>
            <button class="btn btn--primary ok-button">Potvrdit</button>
        </div></div></div>`;
    dialogContainerElement.innerHTML = dialogHTML;
    const formElement = document.getElementById('stockInputForm');
    const confirmButton = dialogContainerElement.querySelector('.ok-button');
    
    const handleConfirm = () => { 
        const formData = new FormData(formElement); 
        const newStock = {}; 
        let allValid = true; 
        for (const [id, value] of formData.entries()) { 
            const parsedValue = parseInt(value); 
            if (value === '' || (!isNaN(parsedValue) && parsedValue >= 0)) { newStock[id] = parsedValue || 0; } 
            else { allValid = false; break; } 
        } 
        if (allValid) { 
            grillState.initialStock = newStock; 
            saveGrillState(); 
            showToast("Počáteční stavy uloženy.", 'success'); 
            closeDialog(); 
            updateStockDisplay(); 
        } else { showToast("Zadejte platná nezáporná čísla.", 'error'); } 
    };
    
    confirmButton.addEventListener('click', handleConfirm);
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
    
    const inputs = formElement.querySelectorAll('input[type=text]');
    inputs.forEach((input, index) => { 
        input.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter') { e.preventDefault(); if (index === inputs.length - 1) confirmButton.focus(); else inputs[index + 1].focus(); } 
            else if (e.key === 'Escape') closeDialog(); 
        }); 
    });
    formElement.querySelector('input[type=text]')?.focus();
}

export function showCustomerDialog(tableId, tableText) {
    closeDialog();
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="customerDialog">
        <h3>Otevřít první účet: ${tableText}</h3>
        <div><label for="customerNameInput">Zadej hosta:</label>
             <input type="text" id="customerNameInput" placeholder="Např. Novákovi" autofocus>
        </div>
        <div class="dialog-buttons">
            <button class="btn btn--secondary cancel-button">Zrušit</button>
            <button class="btn btn--primary ok-button">Otevři účet</button>
        </div></div></div>`;
    dialogContainerElement.innerHTML = dialogHTML;
    const inputElement = dialogContainerElement.querySelector('#customerNameInput');
    
    dialogContainerElement.querySelector('.ok-button').addEventListener('click', () => { 
        const customerName = inputElement.value.trim(); 
        if (!customerName) { showToast("Zadejte jméno nebo identifikaci zákazníka.", 'info'); inputElement.focus(); return; } 
        const accountId = generateId(); 
        const newAccount = { accountId: accountId, customerName: customerName, dispatchBatches: [], lastAddedItemIdToPendingBatch: null }; 
        if (!grillState.tables[tableId]) { grillState.tables[tableId] = []; } 
        grillState.tables[tableId].push(newAccount); 
        saveGrillState(); 
        updateTableVisuals(); 
        updateOpenTablesTotalDisplay(); 
        closeDialog(); 
        showOrderDialog(tableId, accountId, customerName); 
    });
    
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', closeDialog);
    inputElement.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialogContainerElement.querySelector('.ok-button').click(); });
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

export function showMultiAccountDialog(tableId) {
    closeDialog();
    const tableText = document.getElementById(tableId)?.textContent || tableId;
    const accounts = grillState.tables[tableId] || [];
    let existingAccountsHTML = '<div class="existing-accounts-list">';
    if (accounts.length > 0) {
        accounts.sort((a, b) => (parseInt(a.accountId.substring(0, 8), 36) || 0) - (parseInt(b.accountId.substring(0, 8), 36) || 0));
        accounts.forEach(acc => {
            const accountTotal = calculateAccountTotal(acc);
            const formattedTime = formatTimestamp(parseInt(acc.accountId.substring(0, 8), 36));
            const hasReadyBatch = acc.dispatchBatches?.some(batch => batch.status === 'ready');
            let indicatorHTML = hasReadyBatch ? '<span class="dispatch-pending-indicator">!</span>' : '';
            existingAccountsHTML += `<div class="existing-account-item">${indicatorHTML}
                <div class="account-card-header">
                    <div class="existing-account-name">${acc.customerName}<span class="timestamp">${formattedTime}</span></div>
                    <div class="account-preview-total">Celkem: ${formatCurrency(accountTotal)}</div>
                </div>
                <div class="account-card-actions">
                    <button class="btn btn--warning view-account-button" data-account-id="${acc.accountId}">Zobrazit</button>
                    <button class="btn btn--primary pay-account-button" data-account-id="${acc.accountId}" ${accountTotal <= 0 ? 'disabled' : ''}>Zaplatit</button>
                </div></div>`;
        });
    } else { existingAccountsHTML += '<p style="text-align: center; color: var(--c-text-muted); padding: 20px 0;">Na tomto stole nejsou žádné otevřené účty.</p>'; }
    existingAccountsHTML += '</div>';

    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box multi-account-dialog" id="multiAccountManagerDialog">
        <h3>Správa účtů pro stůl: ${tableText}</h3>
        <div class="multi-account-content">
            <div class="multi-account-new">
                <h4 class="multi-account-title">Nový účet</h4>
                <div><label for="newCustomerNameInput">Zadej hosta:</label>
                     <input type="text" id="newCustomerNameInput" placeholder="Např. Novákovi">
                </div>
                <div class="dialog-buttons" style="margin-top: 20px;">
                    <button class="btn btn--primary open-new-account-button">Otevřít nový účet</button>
                </div>
            </div>
            <div class="multi-account-existing">
                <h4 class="multi-account-title">Stávající účty (${accounts.length})</h4>
                ${existingAccountsHTML}
            </div>
        </div>
        <button class="btn btn--secondary multi-account-close-button">Zavřít správu stolu</button>
    </div></div>`;

    dialogContainerElement.innerHTML = dialogHTML;
    const newNameInput = dialogContainerElement.querySelector('#newCustomerNameInput');
    
    dialogContainerElement.querySelector('.open-new-account-button').addEventListener('click', () => {
        const customerName = newNameInput.value.trim(); if (!customerName) { showToast("Zadejte jméno nebo identifikaci pro nový účet.", 'info'); newNameInput.focus(); return; }
        const accountId = generateId(); const newAccount = { accountId: accountId, customerName: customerName, dispatchBatches: [], lastAddedItemIdToPendingBatch: null };
        if (!grillState.tables[tableId]) grillState.tables[tableId] = [];
        grillState.tables[tableId].push(newAccount); saveGrillState(); updateTableVisuals(); updateOpenTablesTotalDisplay(); closeDialog(); showOrderDialog(tableId, accountId, customerName, 'multiAccountDialog');
    });
    
    dialogContainerElement.querySelectorAll('.view-account-button').forEach(button => { button.addEventListener('click', (e) => { const accountIdToView = e.target.dataset.accountId; const accountToView = accounts.find(acc => acc.accountId === accountIdToView); if (accountToView) { closeDialog(); showOrderDialog(tableId, accountIdToView, accountToView.customerName, 'multiAccountDialog'); } }); });
    dialogContainerElement.querySelectorAll('.pay-account-button').forEach(button => { button.addEventListener('click', (e) => { if(button.disabled) return; const accountIdToPay = e.target.dataset.accountId; const accountToPay = accounts.find(acc => acc.accountId === accountIdToPay); if (accountToPay) { showPaymentDialog(tableId, accountIdToPay); } }); });
    dialogContainerElement.querySelector('.multi-account-close-button').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
    newNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialogContainerElement.querySelector('.open-new-account-button').click(); });
    newNameInput.focus();
}

export function showOrderDialog(tableId, accountId, customerName, origin = 'unknown') {
    closeDialog();
    const tableText = document.getElementById(tableId)?.textContent || tableId;
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    const formattedTime = account ? formatTimestamp(parseInt(account.accountId.substring(0, 8), 36)) : 'N/A';
    let orderButtonsHTML = '';
    grillState.menuConfig.forEach(item => { orderButtonsHTML += `<button class="order-item-button category-${item.category}" data-item-id="${item.id}">${item.name} <span class="secondary-text">${item.price} Kč / ${item.type === 'grams' ? '100g' : 'ks'}</span></button>`; });

    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="orderDialog">
        <h3>Účet: ${tableText} - ${customerName} (${formattedTime})</h3>
        <div class="order-items-grid">${orderButtonsHTML}</div>
        <div id="current-bill">
            <div class="bill-header">
                <h4>Položky na tomto účtu:</h4>
                <button class="btn btn--danger undo-bill-item-button" id="undoLastItemButton">↶ Smazat poslední</button>
            </div>
            <div id="bill-items-list"></div>
            <div id="bill-total">Celkem: 0 Kč</div>
        </div>
        <div class="dialog-buttons order-dialog-buttons">
            <button class="btn btn--secondary order-dialog-action-button" id="closeOrderDialogButton" disabled>Zavřít okno</button>
            <button class="btn btn--secondary order-dialog-action-button" id="sendToDispatchButton" disabled>Odeslat k výdeji</button>
        </div></div></div>`;

    dialogContainerElement.innerHTML = dialogHTML;
    if (account) { updateBillDisplay(tableId, accountId); updateOrderDialogButtonStates(tableId, accountId); } else { closeDialog(); return; }
    
    const closeTheDialog = () => { if (origin === 'multiAccountDialog') showMultiAccountDialog(tableId); else closeDialog(); };
    
    dialogContainerElement.querySelectorAll('.order-item-button').forEach(button => {
        button.addEventListener('click', () => {
            const itemId = button.dataset.itemId;
            const menuItem = grillState.menuConfig.find(item => item.id === itemId);
            if (!menuItem) return;
            if (menuItem.type === 'grams') {
                showGramsInputDialog(tableId, accountId, itemId, customerName, origin);
            } else {
                addItemToBill(tableId, accountId, itemId, 1, null, false); 
            }
        });
    });
    
    dialogContainerElement.querySelector('#undoLastItemButton').addEventListener('click', () => undoLastItem(tableId, accountId));
    
    const closeButtonEl = document.getElementById('closeOrderDialogButton');
    closeButtonEl.addEventListener('click', () => { if (!closeButtonEl.disabled) closeTheDialog(); });
    
    const sendButtonEl = document.getElementById('sendToDispatchButton');
    sendButtonEl.addEventListener('click', () => { 
        if (sendButtonEl.disabled) return; 
        const accountToMark = grillState.tables[tableId]?.find(acc => acc.accountId === accountId); 
        if (accountToMark && Array.isArray(accountToMark.dispatchBatches)) { 
            const pendingBatch = accountToMark.dispatchBatches.find(batch => batch.status === 'pending'); 
            if (pendingBatch && pendingBatch.items.length > 0) { 
                if (pendingBatch.items.some(item => !item.isOther)) { 
                    pendingBatch.status = 'ready'; 
                    pendingBatch.readyTimestamp = Date.now(); 
                    accountToMark.lastAddedItemIdToPendingBatch = null; 
                    saveGrillState(); 
                    renderDispatchArea(); 
                    updateStockDisplay(); 
                    closeTheDialog(); 
                } 
            } 
        } 
    });
    
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTheDialog(); });
}

function updateBillDisplay(tableId, accountId) {
    const billListElement = document.getElementById('bill-items-list');
    const billTotalElement = document.getElementById('bill-total');
    if (!billListElement || !billTotalElement) return;
    
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    if (!account || !Array.isArray(account.dispatchBatches) || account.dispatchBatches.length === 0) {
        billListElement.innerHTML = '<ul></ul>';
        billTotalElement.textContent = 'Celkem: 0 Kč';
        return;
    }
    let billHTML = '<ul>';
    let currentTotal = 0;
    account.dispatchBatches.forEach(batch => {
        batch.items.forEach((item, index) => {
            let itemTotal = 0;
            if (item.unit === 'grams') { itemTotal = item.price; } 
            else { itemTotal = item.price * item.quantity; }
            
            const priceDisplay = item.price === 0 ? '' : formatCurrency(itemTotal);
            billHTML += `<li data-item-id="${item.id || `fallback-${batch.batchId}-${index}`}"><span>${item.quantity}x ${item.name}</span><span>${priceDisplay}</span></li>`;
            currentTotal += itemTotal;
        });
    });
    billHTML += '</ul>';
    billListElement.innerHTML = billHTML;
    billTotalElement.textContent = `Celkem: ${formatCurrency(currentTotal)}`;
}

function updateOrderDialogButtonStates(tableId, accountId) {
    const closeButton = document.getElementById('closeOrderDialogButton');
    const sendButton = document.getElementById('sendToDispatchButton');
    if (!closeButton || !sendButton) return;
    
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    const pendingBatch = account?.dispatchBatches?.find(batch => batch.status === 'pending');
    let hasFoodItem = false;
    if (pendingBatch && Array.isArray(pendingBatch.items) && pendingBatch.items.length > 0) {
        hasFoodItem = pendingBatch.items.some(item => !item.isOther);
    }
    
    if (hasFoodItem) {
        sendButton.classList.remove('btn--secondary'); sendButton.classList.add('btn--primary'); sendButton.disabled = false;
        closeButton.classList.remove('btn--primary'); closeButton.classList.add('btn--secondary'); closeButton.disabled = false;
    } else {
        sendButton.classList.remove('btn--primary'); sendButton.classList.add('btn--secondary'); sendButton.disabled = true;
        closeButton.classList.remove('btn--secondary'); closeButton.classList.add('btn--primary'); closeButton.disabled = false;
    }
}

export function showGramsInputDialog(tableId, accountId, itemId, customerName, origin) {
    const menuItem = grillState.menuConfig.find(item => item.id === itemId); if (!menuItem) return;

    const potatoItem = grillState.menuConfig.find(item => item.id === 'brambora');
    const isMeat = (itemId === 'kureci' || itemId === 'veprove');
    let potatoHTML = '';
    
    let steakCountHTML = `
        <div class="form-field" style="margin-top: 15px; border-top: 1px solid var(--c-border); padding-top: 15px;">
            <label for="steakCountInput">Počet ks steaků:</label>
            <input type="text" inputmode="numeric" pattern="[0-9]*" id="steakCountInput" value="1">
        </div>`;

    if (isMeat && potatoItem) {
        potatoHTML = `
            <div class="form-field" style="margin-top: 15px; border-top: 1px solid var(--c-border); padding-top: 15px;">
                <label for="potatoInput">Počet ks (${potatoItem.name}):</label>
                <input type="text" inputmode="numeric" pattern="[0-9]*" id="potatoInput" value="0">
            </div>`;
    } else { steakCountHTML = ''; }

    closeDialog();
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="gramsDialog">
        <h3>Zadejte gramáž pro: ${menuItem.name}</h3>
        <div class="form-field">
            <label for="gramsInput">Celková gramáž (g):</label>
             <input type="text" inputmode="numeric" pattern="[0-9]*" id="gramsInput" autofocus>
        </div>
        ${steakCountHTML} 
        ${potatoHTML} 
        <div class="dialog-buttons">
            <button class="btn btn--secondary cancel-button">Zrušit</button>
            <button class="btn btn--primary ok-button">OK</button>
        </div></div></div>`;
        
    dialogContainerElement.innerHTML = dialogHTML;
    
    const gramsInputElement = document.getElementById('gramsInput');
    const steakCountInputElement = document.getElementById('steakCountInput'); 
    const potatoInputElement = document.getElementById('potatoInput');
    
    const returnToOrderDialog = () => showOrderDialog(tableId, accountId, customerName, origin);

    dialogContainerElement.querySelector('.ok-button').addEventListener('click', () => {
        const grams = parseInt(gramsInputElement.value);
        const steakCount = steakCountInputElement ? parseInt(steakCountInputElement.value) : 1;
        const potatoCount = potatoInputElement ? parseInt(potatoInputElement.value) : 0;

        if (isNaN(grams) || grams <= 0) { showToast('Zadejte platnou celkovou gramáž (větší než 0).', 'error'); gramsInputElement.focus(); return; }
        if (isNaN(steakCount) || steakCount <= 0) { showToast('Zadejte platný počet steaků (větší než 0).', 'error'); steakCountInputElement.focus(); return; }

        addItemToBill(tableId, accountId, itemId, steakCount, grams, false);
        
        if (isMeat && potatoItem && !isNaN(potatoCount) && potatoCount > 0) {
            addItemToBill(tableId, accountId, potatoItem.id, potatoCount, null, true); 
        }
        returnToOrderDialog();
    });
    
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', returnToOrderDialog);
    
    // Keydown handlers
    gramsInputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (steakCountInputElement) { steakCountInputElement.focus(); steakCountInputElement.select(); } 
            else if (potatoInputElement) { potatoInputElement.focus(); potatoInputElement.select(); } 
            else { dialogContainerElement.querySelector('.ok-button').click(); }
        } else if (e.key === 'Escape') { returnToOrderDialog(); }
    });

    if (steakCountInputElement) {
        steakCountInputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (potatoInputElement) { potatoInputElement.focus(); potatoInputElement.select(); } 
                else { dialogContainerElement.querySelector('.ok-button').click(); }
            } else if (e.key === 'Escape') { returnToOrderDialog(); }
        });
    }

    if (potatoInputElement) {
        potatoInputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { dialogContainerElement.querySelector('.ok-button').click(); } 
            else if (e.key === 'Escape') { returnToOrderDialog(); }
        });
    }

    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) returnToOrderDialog(); });
    gramsInputElement.focus(); gramsInputElement.select();
}

export function showPaymentDialog(tableId, accountId, partialPaymentInfo = null) {
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    if (!account) return;
    const isPartialPayment = partialPaymentInfo && partialPaymentInfo.itemsToPay && partialPaymentInfo.total > 0;
    const totalToPay = isPartialPayment ? partialPaymentInfo.total : calculateAccountTotal(account);
    const customerName = isPartialPayment ? `${account.customerName} (výběr)` : account.customerName;
    
    if (totalToPay <= 0 && !isPartialPayment) { showToast('Nelze platit účet s nulovou hodnotou.', 'info'); return; }
    closeDialog();
    
    const dialogHTML = `<div class="dialog-overlay">
        <div id="paymentDialog" class="dialog-box">
            <p>Účet: <strong>${customerName}</strong><br>Celkem k platbě: <strong>${formatCurrency(totalToPay)}</strong></p>
            <div class="payment-button-row">
                <button class="btn cash-button">Hotově</button>
                <button class="btn card-button">Kartou</button>
                <button class="btn qr-button">QR kódem</button>
            </div>
            <div class="payment-button-row">
                <button class="btn on-the-house-button">Na nás</button>
                <button class="btn rozuc-button" ${isPartialPayment ? 'disabled title="Funkce není dostupná pro dílčí platbu"' : ''}>Rozúčtování</button>
            </div>
            <button class="btn btn--secondary back-button">Zpět</button>
        </div>
    </div>`;

    dialogContainerElement.innerHTML = dialogHTML;
    
    const processPaymentMethod = (method, paymentData = {}) => {
        const paymentDetails = {
            method: method,
            cash: paymentData.cash || (method === 'hotove' ? totalToPay : 0),
            card: paymentData.card || (method === 'kartou' ? totalToPay : 0),
            qr: paymentData.qr || (method === 'qr_kodem' ? totalToPay : 0),
            onTheHouse: paymentData.onTheHouse || 0,
        };
        if (isPartialPayment) { 
             processPartialPayment(tableId, accountId, partialPaymentInfo.itemsToPay, paymentDetails);
        }
        else { processAccountPayment(tableId, accountId, paymentDetails); }
    };
    
    const dialogElement = document.getElementById('paymentDialog');
    dialogElement.querySelector('.cash-button').addEventListener('click', () => processPaymentMethod('hotove'));
    dialogElement.querySelector('.card-button').addEventListener('click', () => processPaymentMethod('kartou'));
    dialogElement.querySelector('.qr-button').addEventListener('click', () => processPaymentMethod('qr_kodem'));
    
    const onTheHouseButton = dialogElement.querySelector('.on-the-house-button');
    onTheHouseButton.addEventListener('click', () => {
        if (isPartialPayment) { processPaymentMethod('na_nas_cast', { onTheHouse: totalToPay }); }
        else { showOnTheHouseSplitDialog(tableId, accountId); }
    });
    
    dialogElement.querySelector('.rozuc-button:not([disabled])')?.addEventListener('click', () => showSplitByItemDialog(tableId, accountId));
    
    dialogElement.querySelector('.back-button').addEventListener('click', () => {
         if (isPartialPayment) showSplitByItemDialog(tableId, accountId);
         else showMultiAccountDialog(tableId);
    });
    
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            if (isPartialPayment) showSplitByItemDialog(tableId, accountId);
            else showMultiAccountDialog(tableId);
        }
    });
}

export function showOnTheHouseSplitDialog(tableId, accountId) {
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId); if (!account) return;
    const accountTotal = calculateAccountTotal(account); if (accountTotal <= 0) return;
    
    closeDialog();
    
    let billItemsHTML = '<ul>';
    account.dispatchBatches.forEach(batch => { batch.items.forEach(item => { 
        let itemTotal = 0;
        if (item.unit === 'grams') { itemTotal = item.price; } 
        else { itemTotal = item.price * item.quantity; }
        billItemsHTML += `<li><span>${item.quantity}x ${item.name}</span><span>${item.price === 0 ? '' : formatCurrency(itemTotal)}</span></li>`; 
    }); });
    billItemsHTML += '</ul>';
    
    const dialogHTML = `<div class="dialog-overlay">
        <div id="onTheHouseSplitDialog" class="dialog-box">
            <div class="account-summary"><p>Účet: <strong>${account.customerName}</strong></p><p>Celkem: <strong>${formatCurrency(accountTotal)}</strong></p></div>
            <div class="bill-items-summary">${billItemsHTML}</div>
            <div class="payment-division">
                <div class="division-row"><label for="onTheHouseAmountInput">Částka "Na nás":</label><input type="text" inputmode="numeric" pattern="[0-9]*" id="onTheHouseAmountInput" class="split-payment-input" value="${accountTotal}" autofocus></div>
                <div class="remaining-payment-display">Zbývá zaplatit: <strong id="remainingToPayDisplay">0 Kč</strong></div>
            </div>
            <div class="dialog-buttons remaining-payment-actions">
                <button class="btn cash-button" id="pay-remaining-cash">Hotově</button>
                <button class="btn card-button" id="pay-remaining-card">Kartou</button>
                <button class="btn qr-button" id="pay-remaining-qr">QR kódem</button>
            </div>
            <div class="dialog-buttons" style="justify-content:center; gap: 15px;">
                <button class="btn btn--secondary back-button" style="min-width: 140px;">Zpět</button>
                <button class="btn btn--primary ok-button" id="confirmOnTheHouseFull" style="display: none; min-width: 140px;">Potvrdit</button>
            </div>
        </div>
    </div>`;
    
    dialogContainerElement.innerHTML = dialogHTML;
    
    const onTheHouseInput = document.getElementById('onTheHouseAmountInput');
    const remainingDisplay = document.getElementById('remainingToPayDisplay');
    const payCashBtn = document.getElementById('pay-remaining-cash');
    const payCardBtn = document.getElementById('pay-remaining-card');
    const payQrBtn = document.getElementById('pay-remaining-qr');
    const confirmFullBtn = document.getElementById('confirmOnTheHouseFull');
    
    function updateRemaining() {
        let onTheHouseValue = parseFloat(onTheHouseInput.value) || 0;
        if (onTheHouseValue > accountTotal) { onTheHouseValue = accountTotal; onTheHouseInput.value = accountTotal; }
        if (onTheHouseValue < 0) { onTheHouseValue = 0; onTheHouseInput.value = 0; }
        
        const remaining = accountTotal - onTheHouseValue;
        remainingDisplay.textContent = formatCurrency(remaining);
        
        const isFullyOnTheHouse = Math.abs(remaining) < 0.01;
        payCashBtn.disabled = remaining <= 0; 
        payCardBtn.disabled = remaining <= 0; 
        payQrBtn.disabled = remaining <= 0;
        confirmFullBtn.style.display = isFullyOnTheHouse ? 'inline-flex' : 'none';
    }
    
    const handleRemainingPayment = (method, amount) => {
        if(amount <= 0) return;
        const onTheHouseAmount = parseFloat(onTheHouseInput.value) || 0;
        const paymentData = {
            onTheHouse: onTheHouseAmount,
            cash: method === 'cash' ? amount : 0, 
            card: method === 'card' ? amount : 0, 
            qr: method === 'qr' ? amount : 0,
            method: `na_nas_${method}`
        };
        processAccountPayment(tableId, accountId, paymentData);
    };
    
    onTheHouseInput.addEventListener('input', updateRemaining);
    payCashBtn.addEventListener('click', () => { if(!payCashBtn.disabled) handleRemainingPayment('cash', accountTotal - (parseFloat(onTheHouseInput.value) || 0)); });
    payCardBtn.addEventListener('click', () => { if(!payCardBtn.disabled) handleRemainingPayment('card', accountTotal - (parseFloat(onTheHouseInput.value) || 0)); });
    payQrBtn.addEventListener('click', () => { if(!payQrBtn.disabled) handleRemainingPayment('qr', accountTotal - (parseFloat(onTheHouseInput.value) || 0)); });
    confirmFullBtn.addEventListener('click', () => { processAccountPayment(tableId, accountId, { method: 'na_nas_cele', onTheHouse: accountTotal, cash: 0, card: 0, qr: 0 }); });
    
    dialogContainerElement.querySelector('.back-button').addEventListener('click', () => showPaymentDialog(tableId, accountId));
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) showPaymentDialog(tableId, accountId); });
    
    updateRemaining(); 
    onTheHouseInput.select();
}

export function showSplitByItemDialog(tableId, accountId) {
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    if (!account) { showToast('Účet nenalezen.', 'error'); return; }
    
    closeDialog();
    
    let allItems = [];
    account.dispatchBatches.forEach(batch => {
        batch.items.forEach(item => {
            if (item.quantity > 1 && item.unit === 'pieces') { 
                for (let i = 0; i < item.quantity; i++) {
                    allItems.push({ ...item, quantity: 1, price: item.price, originalId: item.id, uniqueSplitId: `${item.id}-${i}` });
                }
            } else { 
                allItems.push({ ...item, originalId: item.id, uniqueSplitId: item.id }); 
            }
        });
    });
    
    let itemsHTML = '';
    allItems.forEach((item) => {
        if (item.price === 0) return; 

        let itemDisplayPrice = 0;
        if (item.unit === 'grams') { itemDisplayPrice = item.price; } 
        else { itemDisplayPrice = item.price * item.quantity; }

        itemsHTML += `<li class="split-item">
            <input type="checkbox" class="split-item-checkbox" data-item-unique-id="${item.uniqueSplitId}" data-item-original-id="${item.originalId}" data-item-price="${itemDisplayPrice}" id="split-item-${item.uniqueSplitId}">
            <label for="split-item-${item.uniqueSplitId}" class="split-item-details" style="cursor: pointer; width: 100%;">
                <span class="split-item-name">${item.quantity}x ${item.name}</span>
                <span class="split-item-price">${formatCurrency(itemDisplayPrice)}</span>
            </label>
        </li>`;
    });
    
    const dialogHTML = `<div class="dialog-overlay">
        <div class="dialog-box" id="splitByItemDialog">
            <h3>Rozúčtování účtu: ${account.customerName}</h3>
            <p>Vyberte položky, které chcete nyní zaplatit:</p>
            <ul class="split-items-list">${itemsHTML}</ul>
            <div class="split-summary">
                <span class="split-summary-total" id="split-subtotal">Mezisoučet: 0 Kč</span>
            </div>
            <div class="dialog-buttons">
                <button class="btn btn--secondary cancel-button">Zpět</button>
                <button class="btn btn--primary ok-button" id="pay-selected-items-button" disabled>Zaplatit vybrané</button>
            </div>
        </div>
    </div>`;
    
    dialogContainerElement.innerHTML = dialogHTML;
    
    const subtotalEl = document.getElementById('split-subtotal');
    const payButton = document.getElementById('pay-selected-items-button');
    const checkboxes = dialogContainerElement.querySelectorAll('.split-item-checkbox');
    
    const updateSubtotal = () => {
        let subtotal = 0;
        checkboxes.forEach(checkbox => { if (checkbox.checked) { subtotal += parseFloat(checkbox.dataset.itemPrice || 0); } });
        subtotalEl.textContent = `Mezisoučet: ${formatCurrency(subtotal)}`; 
        payButton.disabled = subtotal <= 0;
    };
    
    checkboxes.forEach(checkbox => checkbox.addEventListener('change', updateSubtotal));
    dialogContainerElement.querySelectorAll('.split-item-details').forEach(label => {
        label.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = document.getElementById(label.getAttribute('for'));
                if (checkbox) { checkbox.checked = !checkbox.checked; updateSubtotal(); }
            }
        });
    });
    
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', () => showPaymentDialog(tableId, accountId));
    payButton.addEventListener('click', () => {
        if (payButton.disabled) return;
        let subtotal = 0; const itemsToPayAggregated = {};
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const originalId = checkbox.dataset.itemOriginalId; 
                const price = parseFloat(checkbox.dataset.itemPrice || 0); 
                subtotal += price;
                const originalItemDetails = allItems.find(item => item.uniqueSplitId === checkbox.dataset.itemUniqueId);
                
                if (!itemsToPayAggregated[originalId]) { 
                    itemsToPayAggregated[originalId] = { ...originalItemDetails, payQuantity: 0, price: price }; 
                }
                itemsToPayAggregated[originalId].payQuantity += 1;
            }
        });
        const itemsToPay = Object.values(itemsToPayAggregated);
        showPaymentDialog(tableId, accountId, { itemsToPay: itemsToPay, total: subtotal });
    });
    
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { showPaymentDialog(tableId, accountId); } });
}

export function showDispatchConfirmDialog(tableId, accountId, batchId) {
    closeDialog();
    const account = grillState.tables[tableId]?.find(acc => acc.accountId === accountId);
    const batch = account?.dispatchBatches?.find(b => b.batchId === batchId);
    if (!account || !batch) { renderDispatchArea(); return; }
    
    const customerName = account.customerName || 'Neznámý';
    const tableElement = document.getElementById(tableId);
    const tableText = tableElement ? tableElement.textContent?.trim() : '';
    const tableIdentifierDisplay = tableText ? `(${tableText})` : '';
    const batchItemsHTML = batch.items.filter(item => !item.isOther).map(item => `<div class="confirmed-item-row"><span class="confirmed-item-quantity">${item.quantity}x</span><span class="confirmed-item-name">${item.name}</span></div>`).join('');
    
    const dialogHTML = `<div class="dialog-overlay"><div class="confirm-dialog-box">
        <p>Opravdu provést výdej pro:<br><strong>${customerName} ${tableIdentifierDisplay}</strong>?</p>
        <div class="confirmed-items">${batchItemsHTML.length > 0 ? batchItemsHTML : '<p style="color: var(--c-text-muted); font-style:italic;">(Žádné položky k výdeji)</p>'}</div>
        <div class="dialog-buttons">
            <button class="btn btn--secondary cancel-button">Zrušit</button>
            <button class="btn btn--primary ok-button">Potvrdit výdej</button>
        </div></div></div>`;
        
    dialogContainerElement.innerHTML = dialogHTML;
    
    dialogContainerElement.querySelector('.ok-button').addEventListener('click', () => { 
        const finalBatch = grillState.tables[tableId]?.find(acc => acc.accountId === accountId)?.dispatchBatches?.find(b => b.batchId === batchId); 
        if (finalBatch) { 
            finalBatch.status = 'dispatched'; 
            saveGrillState(); 
            renderDispatchArea(); 
            closeDialog(); 
            updateStockDisplay(); 
        } else { closeDialog(); renderDispatchArea(); } 
    });
    
    dialogContainerElement.querySelector('.cancel-button').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

export function showDailyCloseDialog() {
    closeDialog();
    const formattedDate = getCurrentDateFormatted();
    const soldStockDetailed = calculateCurrentSoldStock();
    const remainingStock = calculateCurrentRemainingStock();
    
    const totalCashFromState = grillState.paidCash;
    const totalCardFromState = grillState.paidCard;
    const totalQRFromState = grillState.paidQR;
    const totalOnHouseFromState = grillState.paidOnTheHouse;
    const totalRevenueFromState = totalCashFromState + totalCardFromState + totalQRFromState;
    
    const stockItems = getStockItems();
    
    const soldStockForGAS = {}; 
    stockItems.forEach(item => { 
        const soldInfo = soldStockDetailed[item.id] || {}; 
        soldStockForGAS[item.name] = { grams: soldInfo.grams || 0, pieces: soldInfo.pieces || 0 }; 
    });
    
    const remainingStockForGAS = {}; 
    stockItems.forEach(item => { 
        const remainingValue = remainingStock[item.id] || 0; 
        remainingStockForGAS[item.name] = { value: remainingValue, type: item.type }; 
    });
    
    const stockDataForServer = { remainingStock: remainingStockForGAS, soldStock: soldStockForGAS };
    
    let remainingItemsHTML = ''; 
    stockItems.forEach(item => { 
        const value = remainingStock[item.id] || 0; 
        const unit = item.type === 'grams' ? 'g' : 'ks'; 
        remainingItemsHTML += `<div class="info-item-row"><span class="item-name">${item.name}</span><span class="item-value">${value} ${unit}</span></div>`; 
    });
    
    let soldItemsHTML = ''; 
    stockItems.forEach(item => { 
        const soldInfo = soldStockDetailed[item.id] || { grams: 0, pieces: 0, count: 0 }; 
        let itemNameDisplay = item.name; 
        let valueText = ''; 
        if (item.type === 'grams') { 
            valueText = `${soldInfo.grams} g`; 
            if (soldInfo.count > 0) itemNameDisplay = `${item.name} (${soldInfo.count}x)`; 
        } else { valueText = `${soldInfo.pieces} ks`; } 
        soldItemsHTML += `<div class="info-item-row"><span class="item-name">${itemNameDisplay}</span><span class="item-value">${valueText}</span></div>`; 
    });
    
    const remainingSectionHTML = `<div class="daily-close-section remaining-stock-summary"><h4>Zbývající zásoby</h4><div class="daily-close-summary-items">${remainingItemsHTML}</div></div>`;
    const soldSectionHTML = `<div class="daily-close-section sold-items-summary"><h4>Prodané položky</h4><div class="daily-close-summary-items">${soldItemsHTML}</div></div>`;
    
    const revenueItemsHTML = ` 
        <p class="revenue-line"><span>Hotově:</span> <strong>${formatCurrency(totalCashFromState)}</strong></p> 
        <p class="revenue-line"><span>Kartou:</span> <strong>${formatCurrency(totalCardFromState)}</strong></p> 
        <p class="revenue-line"><span>QR kódem:</span> <strong>${formatCurrency(totalQRFromState)}</strong></p> 
        <p class="revenue-line on-house-total"><span>Na nás:</span> <strong>${formatCurrency(totalOnHouseFromState)}</strong></p> 
    `;
    const revenueTotalHTML = `<p class="total-revenue-line"><span>Celkem:</span> <strong>${formatCurrency(totalRevenueFromState)}</strong></p>`;
    const revenueSectionHTML = `<div class="daily-close-section revenue-summary"><h4>Tržba</h4><div class="daily-close-summary-items">${revenueItemsHTML}</div>${revenueTotalHTML}</div>`;
    
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="dailyCloseDialog">
        <h3>Denní uzávěrka</h3>
        <p>Opravdu chcete provést denní uzávěrku za den <strong>${formattedDate}</strong>?<br>
           <small>Tato akce zařadí uzávěrku do fronty na odeslání a vynuluje lokální data.</small>
        </p>
        <div class="daily-close-content-wrapper">${remainingSectionHTML}${soldSectionHTML}${revenueSectionHTML}</div>
        <div class="dialog-buttons centered-buttons">
            <button class="btn btn--secondary" id="cancel-daily-close">Zrušit</button>
            <button class="btn btn--danger" id="confirm-daily-close">Provést uzávěrku a odeslat</button>
        </div></div></div>`;
        
    dialogContainerElement.innerHTML = dialogHTML;
    
    dialogContainerElement.querySelector('#confirm-daily-close').addEventListener('click', () => {
        if (confirm('Opravdu zařadit uzávěrku do fronty? Tato akce je nevratná a vymaže lokální data.')) {
             const payload = { 
                 action: "performDailyClose", 
                 date: formattedDate, 
                 totals: { cash: totalCashFromState, card: totalCardFromState, qr: totalQRFromState, onHouse: totalOnHouseFromState, totalRevenue: totalRevenueFromState }, 
                 ...stockDataForServer 
             };
             addToSyncQueue(payload); 
             closeDialog(); 
             performDataReset(false);
             showToast('Denní uzávěrka byla zařazena do fronty k odeslání. Lokální data byla vynulována.', 'success');
             updateAllDisplays();
        }
    });
    
    dialogContainerElement.querySelector('#cancel-daily-close').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

export function showAdminDialog() {
    closeDialog();
    let menuItemsHTML = '';
    grillState.menuConfig.forEach(item => { 
        let itemNameHTML = item.name; 
        if (item.name === "Pečená brambora") { itemNameHTML = "Pečená<br>brambora"; } 
        menuItemsHTML += `<li class="admin-menu-item" data-item-id="${item.id}"><div class="admin-item-info"><span class="admin-item-name">${itemNameHTML}</span><span class="admin-item-details">${item.price} Kč / ${item.type === 'grams' ? '100g' : 'ks'} (${item.category === 'food' ? 'Jídlo' : 'Ostatní'})</span></div><div class="admin-item-actions"><button class="btn btn--warning admin-edit-button">Upravit</button><button class="btn btn--danger admin-delete-button">Smazat</button></div></li>`; 
    });
    
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="adminDialog">
        <h3>Správa menu a cen</h3>
        <ul class="admin-menu-list">${menuItemsHTML}</ul>
        <div class="dialog-buttons">
            <button class="btn btn--secondary" id="closeAdminDialog">Zavřít</button>
            <button class="btn btn--primary" id="addNewMenuItem">Přidat novou položku</button>
        </div></div></div>`;
        
    dialogContainerElement.innerHTML = dialogHTML;
    
    dialogContainerElement.querySelector('#closeAdminDialog').addEventListener('click', closeDialog);
    dialogContainerElement.querySelector('#addNewMenuItem').addEventListener('click', () => showMenuItemEditDialog(null));
    
    dialogContainerElement.querySelectorAll('.admin-edit-button').forEach(btn => btn.addEventListener('click', (e) => { 
        const itemId = e.target.closest('.admin-menu-item').dataset.itemId; 
        showMenuItemEditDialog(itemId); 
    }));
    
    dialogContainerElement.querySelectorAll('.admin-delete-button').forEach(btn => btn.addEventListener('click', (e) => { 
        const itemId = e.target.closest('.admin-menu-item').dataset.itemId; 
        const item = grillState.menuConfig.find(i => i.id === itemId); 
        
        if(confirm(`Opravdu chcete smazat položku "${item.name}"?`)) {
             grillState.menuConfig = grillState.menuConfig.filter(i => i.id !== itemId); 
             saveGrillState(); 
             updateAllDisplays(); 
             showAdminDialog(); 
             showToast(`Položka "${item.name}" byla smazána.`, 'success');
        }
    }));
    
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
}

function showMenuItemEditDialog(itemId = null) {
    const isEditing = itemId !== null; 
    const item = isEditing ? grillState.menuConfig.find(i => i.id === itemId) : {};
    const title = isEditing ? 'Upravit položku' : 'Přidat novou položku';
    
    const dialogHTML = `<div class="dialog-overlay"><div class="dialog-box" id="menuItemEditDialog">
        <h3>${title}</h3>
        <form id="menuItemForm">
            <div class="form-field"><label for="itemName">Název položky:</label><input type="text" id="itemName" value="${item.name || ''}" required></div>
            <div class="form-field"><label for="itemPrice">Cena (v Kč):</label><input type="text" inputmode="numeric" pattern="[0-9]*" id="itemPrice" value="${item.price || ''}" required></div>
            <div class="form-field"><label for="itemType">Typ jednotky:</label><select id="itemType"><option value="grams" ${item.type === 'grams' ? 'selected' : ''}>Cena za 100g</option><option value="pieces" ${item.type === 'pieces' ? 'selected' : ''}>Cena za kus</option></select></div>
            <div class="form-field"><label for="itemCategory">Kategorie:</label><select id="itemCategory"><option value="food" ${item.category === 'food' ? 'selected' : ''}>Jídlo z grilu (sledovat zásoby)</option><option value="other" ${item.category === 'other' ? 'selected' : ''}>Ostatní (nesledovat zásoby)</option></select></div>
            <div class="dialog-buttons">
                <button type="button" class="btn btn--secondary cancel-button">Zrušit</button>
                <button type="submit" class="btn btn--primary ok-button">Uložit</button>
            </div>
        </form></div></div>`;
        
    dialogContainerElement.innerHTML = dialogHTML;
    const form = document.getElementById('menuItemForm');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const updatedItem = { 
            id: isEditing ? itemId : generateId(), 
            name: document.getElementById('itemName').value.trim(), 
            price: parseFloat(document.getElementById('itemPrice').value), 
            type: document.getElementById('itemType').value, 
            category: document.getElementById('itemCategory').value, 
        };
        
        if (!updatedItem.name || isNaN(updatedItem.price) || updatedItem.price < 0) { showToast("Zadejte prosím platný název a nezápornou cenu.", 'error'); return; }
        
        if (isEditing) { 
            const index = grillState.menuConfig.findIndex(i => i.id === itemId); 
            grillState.menuConfig[index] = updatedItem; 
        } else { 
            grillState.menuConfig.push(updatedItem); 
        }
        
        saveGrillState(); 
        updateAllDisplays(); 
        showAdminDialog(); 
        showToast(`Položka "${updatedItem.name}" byla uložena.`, 'success');
    });
    
    form.querySelector('.cancel-button').addEventListener('click', showAdminDialog);
    dialogContainerElement.querySelector('.dialog-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) showAdminDialog(); });
    document.getElementById('itemName').focus();
}