// js/calculations.js
import { grillState } from './state.js';

export function getStockItems() {
    return grillState.menuConfig.filter(item => item.category === 'food');
}

export function areInitialStocksSet() { 
    const stockItems = getStockItems(); 
    if (!grillState.initialStock || Object.keys(grillState.initialStock).length < stockItems.length) { return false; } 
    return stockItems.every(item => typeof grillState.initialStock[item.id] === 'number' && !isNaN(grillState.initialStock[item.id]) && grillState.initialStock[item.id] >= 0 ); 
}

export function parseItemDetailsFromBillName(billItemName) {
    if (!billItemName) return null;
    
    const countMatch = billItemName.match(/^(\d+)\s*x\s/);
    let baseItemName = billItemName;
    if (countMatch) {
        baseItemName = billItemName.substring(countMatch[0].length); 
    }

    const gramMatch = baseItemName.match(/\((\d+)\s*g\)$/i);
    const isGramsType = !!gramMatch;
    const grams = isGramsType ? parseInt(gramMatch[1], 10) : 0;
    
    let baseName = isGramsType ? baseItemName.substring(0, gramMatch.index).trim() : baseItemName; 
    baseName = baseName.replace(' (Z)', '').trim();

    const menuItem = grillState.menuConfig.find(item => item.name === baseName);
    if (!menuItem) return null;

    return { baseItemId: menuItem.id, grams: isGramsType ? grams : 0, pieces: isGramsType ? 0 : 1 };
}

export function calculateCurrentSoldStock() {
    const soldStock = {};
    const stockItems = getStockItems();
    stockItems.forEach(item => { soldStock[item.id] = { name: item.name, type: item.type, grams: 0, pieces: 0, count: 0 }; });

    const processItems = (items) => {
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                const parsed = parseItemDetailsFromBillName(item.name); 
                if (parsed && soldStock[parsed.baseItemId]) {
                    const itemQuantityFactor = item.quantity || 1; 
                    if (item.unit === 'grams') { 
                        soldStock[parsed.baseItemId].grams += (item.value || 0); 
                        soldStock[parsed.baseItemId].count += itemQuantityFactor; 
                    } else if (item.unit === 'pieces') {
                         soldStock[parsed.baseItemId].pieces += itemQuantityFactor; 
                    }
                }
            });
        }
    };

    Object.values(grillState.tables).forEach(accounts => {
        if (Array.isArray(accounts)) {
            accounts.forEach(account => {
                if(account.dispatchBatches && Array.isArray(account.dispatchBatches)) {
                    account.dispatchBatches.forEach(batch => processItems(batch.items));
                }
            });
        }
    });

    if (Array.isArray(grillState.paidAccounts)) {
        grillState.paidAccounts.forEach(paidAccount => {
            if(paidAccount.dispatchBatches && Array.isArray(paidAccount.dispatchBatches)) {
                paidAccount.dispatchBatches.forEach(batch => processItems(batch.items));
            }
        });
    }
    return soldStock;
}

export function calculateCurrentRemainingStock() {
    const soldStock = calculateCurrentSoldStock();
    const initialStock = grillState.initialStock || {};
    const remainingStock = {};
    const stockItems = getStockItems();
    
    stockItems.forEach(item => {
        const initial = initialStock[item.id] || 0;
        const soldInfo = soldStock[item.id] || { grams: 0, pieces: 0 };
        let remaining = (item.type === 'grams') ? (initial - soldInfo.grams) : (initial - soldInfo.pieces);
        remainingStock[item.id] = Math.max(0, remaining);
    });
    return remainingStock;
}

export function calculateAccountTotal(account) {
    if (!account || !Array.isArray(account.dispatchBatches)) return 0;
    return account.dispatchBatches.reduce((totalSum, batch) => {
        const batchSum = batch.items.reduce((sum, item) => {
            let itemTotal = 0;
            if (item.unit === 'grams') { itemTotal = item.price; } 
            else { itemTotal = item.price * item.quantity; }
            return sum + itemTotal;
        }, 0);
        return totalSum + batchSum;
    }, 0);
}