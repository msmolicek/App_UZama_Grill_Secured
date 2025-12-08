// js/templates.js
import { formatCurrency, formatTimestamp } from './utils.js';

// --- 1. GENERIC CONFIRMATION DIALOG (Vynulovat data, Uzávěrka) ---
export function getConfirmationDialogTemplate(title, message, isGreenAction = false) {
    // Pokud je vyžadována zelená akce (bod 6), přepíšeme barvu inline stylem, aby přebila CSS pro confirm dialog
    const colorStyle = isGreenAction ? 'background-color: var(--c-primary) !important; border-color: var(--c-primary) !important;' : '';
    
    return `
    <div class="dialog-overlay">
        <div class="confirm-dialog-box">
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="dialog-buttons">
                <button class="btn ok-button" style="${colorStyle}">Potvrdit</button>
                <button class="btn cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

// --- 2. WARNING DIALOGS (Stavy, Otevřené stoly) ---
export function getWarningDialogTemplate(message, buttonText = 'OK') {
    // Bod 5: Zúžení okna a zalomení textu
    return `
    <div class="dialog-overlay">
        <div class="dialog-box warning-dialog" style="max-width: 380px;">
            <p><strong>! POZOR !</strong><br>${message}</p>
            <div class="dialog-buttons" style="justify-content: center;">
                <button class="btn btn--primary ok-button">${buttonText}</button>
                </div>
        </div>
    </div>`;
}

export function getStockNotSetWarningTemplate() {
    // Bod 4: Zadat stavy vlevo
    return `
    <div class="dialog-overlay">
        <div class="dialog-box warning-dialog">
            <p><strong>! POZOR !</strong><br>Nejprve je nutné zadat počáteční stavy</p>
            <div class="dialog-buttons" style="justify-content: center;">
                <button class="btn btn--warning ok-button">Zadat stavy</button>
                <button class="btn btn--secondary cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

// --- 3. INPUT DIALOGS (Sklad, Zákazník, Gramáž) ---

export function getStockInputTemplate(itemsHTML) {
    // Bod 4: Potvrdit vlevo, Zrušit vpravo
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="stockInputDialog">
            <h3>Zadání počátečních stavů</h3>
            <form id="stockInputForm">${itemsHTML}</form>
            <div class="dialog-buttons">
                <button class="btn btn--primary ok-button">Potvrdit</button>
                <button class="btn btn--secondary cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

export function getCustomerDialogTemplate(tableText) {
    // Bod 1: Otevři účet vlevo (Primary), Zrušit vpravo (Secondary)
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="customerDialog">
            <h3>Otevřít první účet: ${tableText}</h3>
            <div>
                <label for="customerNameInput">Zadej hosta:</label>
                <input type="text" id="customerNameInput" placeholder="Např. Novákovi" autofocus>
            </div>
            <div class="dialog-buttons">
                <button class="btn btn--primary ok-button">Otevři účet</button>
                <button class="btn btn--secondary cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

export function getGramsDialogTemplate(itemName, steakCountHTML, potatoHTML) {
    // Bod 2: Potvrdit vlevo, Zrušit vpravo
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="gramsDialog">
            <h3>Zadejte gramáž pro: ${itemName}</h3>
            <div class="form-field">
                <label for="gramsInput">Celková gramáž (g):</label>
                <input type="text" inputmode="numeric" pattern="[0-9]*" id="gramsInput" autofocus>
            </div>
            ${steakCountHTML} 
            ${potatoHTML} 
            <div class="dialog-buttons">
                <button class="btn btn--primary ok-button">Potvrdit</button>
                <button class="btn btn--secondary cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

// --- 4. DISPATCH CONFIRM (Výdej) ---
export function getDispatchConfirmDialogTemplate(customerName, tableIdentifier, batchItemsHTML) {
    // Bod 3 & 7: Zelené tlačítko vlevo, Zarovnání textu
    const itemsContent = batchItemsHTML.length > 0 
        ? batchItemsHTML 
        : '<p style="color: var(--c-text-muted); font-style:italic;">(Žádné položky k výdeji)</p>';

    return `
    <div class="dialog-overlay">
        <div class="confirm-dialog-box">
            <p>Opravdu provést výdej pro:<br><strong>${customerName} ${tableIdentifier}</strong>?</p>
            
            <div class="confirmed-items">
                ${itemsContent}
            </div>
            
            <div class="dialog-buttons">
                <button class="btn ok-button" style="background-color: var(--c-primary) !important; border-color: var(--c-primary) !important;">Potvrdit výdej</button>
                <button class="btn cancel-button">Zrušit</button>
            </div>
        </div>
    </div>`;
}

// --- 5. COMPLEX DIALOGS (MultiAccount, Order, Payment, DailyClose, Admin) ---

export function getMultiAccountDialogTemplate(tableText, accountsCount, existingAccountsHTML) {
    return `
    <div class="dialog-overlay">
        <div class="dialog-box multi-account-dialog" id="multiAccountManagerDialog">
            <h3>Správa účtů pro stůl: ${tableText}</h3>
            <div class="multi-account-content">
                <div class="multi-account-new">
                    <h4 class="multi-account-title">Nový účet</h4>
                    <div>
                        <label for="newCustomerNameInput">Zadej hosta:</label>
                        <input type="text" id="newCustomerNameInput" placeholder="Např. Novákovi">
                    </div>
                    <div class="dialog-buttons" style="margin-top: 20px;">
                        <button class="btn btn--primary open-new-account-button">Otevřít nový účet</button>
                    </div>
                </div>
                <div class="multi-account-existing">
                    <h4 class="multi-account-title">Stávající účty (${accountsCount})</h4>
                    ${existingAccountsHTML}
                </div>
            </div>
            <button class="btn btn--secondary multi-account-close-button">Zavřít správu stolu</button>
        </div>
    </div>`;
}

export function getOrderDialogTemplate(tableText, customerName, formattedTime, orderButtonsHTML) {
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="orderDialog">
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
                <button class="btn btn--secondary order-dialog-action-button" id="sendToDispatchButton" disabled>Odeslat k výdeji</button>
                <button class="btn btn--secondary order-dialog-action-button" id="closeOrderDialogButton" disabled>Zavřít okno</button>
            </div>
        </div>
    </div>`;
}

export function getPaymentDialogTemplate(customerName, totalToPay, isPartial) {
    return `
    <div class="dialog-overlay">
        <div id="paymentDialog" class="dialog-box">
            <p>Účet: <strong>${customerName}</strong><br>Celkem k platbě: <strong>${formatCurrency(totalToPay)}</strong></p>
            <div class="payment-button-row">
                <button class="btn cash-button">Hotově</button>
                <button class="btn card-button">Kartou</button>
                <button class="btn qr-button">QR kódem</button>
            </div>
            <div class="payment-button-row">
                <button class="btn on-the-house-button">Na nás</button>
                <button class="btn rozuc-button" ${isPartial ? 'disabled title="Funkce není dostupná pro dílčí platbu"' : ''}>Rozúčtování</button>
            </div>
            <button class="btn btn--secondary back-button">Zpět</button>
        </div>
    </div>`;
}

export function getOnTheHouseSplitDialogTemplate(customerName, accountTotal, billItemsHTML) {
    return `
    <div class="dialog-overlay">
        <div id="onTheHouseSplitDialog" class="dialog-box">
            <div class="account-summary"><p>Účet: <strong>${customerName}</strong></p><p>Celkem: <strong>${formatCurrency(accountTotal)}</strong></p></div>
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
                <button class="btn btn--primary ok-button" id="confirmOnTheHouseFull" style="display: none; min-width: 140px;">Potvrdit</button>
                <button class="btn btn--secondary back-button" style="min-width: 140px;">Zpět</button>
            </div>
        </div>
    </div>`;
}

export function getSplitByItemDialogTemplate(customerName, itemsHTML) {
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="splitByItemDialog">
            <h3>Rozúčtování účtu: ${customerName}</h3>
            <p>Vyberte položky, které chcete nyní zaplatit:</p>
            <ul class="split-items-list">${itemsHTML}</ul>
            <div class="split-summary">
                <span class="split-summary-total" id="split-subtotal">Mezisoučet: 0 Kč</span>
            </div>
            <div class="dialog-buttons">
                <button class="btn btn--primary ok-button" id="pay-selected-items-button" disabled>Zaplatit vybrané</button>
                <button class="btn btn--secondary cancel-button">Zpět</button>
            </div>
        </div>
    </div>`;
}

export function getDailyCloseDialogTemplate(formattedDate, contentHTML) {
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="dailyCloseDialog">
            <h3>Denní uzávěrka</h3>
            <p>Opravdu chcete provést denní uzávěrku za den <strong>${formattedDate}</strong>?<br>
               <small>Tato akce zařadí uzávěrku do fronty na odeslání a vynuluje lokální data.</small>
            </p>
            <div class="daily-close-content-wrapper">${contentHTML}</div>
            <div class="dialog-buttons centered-buttons">
                <button class="btn btn--danger" id="confirm-daily-close">Provést uzávěrku a odeslat</button>
                <button class="btn btn--secondary" id="cancel-daily-close">Zrušit</button>
            </div>
        </div>
    </div>`;
}

export function getAdminDialogTemplate(menuItemsHTML) {
    return `
    <div class="dialog-overlay">
        <div class="dialog-box" id="adminDialog">
            <h3>Správa položek</h3>
            <ul class="admin-menu-list" style="max-height: 50vh; overflow-y: auto;">${menuItemsHTML}</ul>
            <div class="dialog-buttons" style="justify-content: center;">
                <button class="btn btn--secondary" id="closeAdminDialog" style="max-width: 200px;">Zavřít</button>
            </div>
        </div>
    </div>`;
}