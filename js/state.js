// js/state.js
import { showToast } from './utils.js'; 

export const GRILL_LOCAL_STORAGE_KEY = 'grilovaniDennyStav_v8.0_offline';
export const THEME_STORAGE_KEY = 'grilovaniThemePreference_v2';
export const GAS_URL = "https://script.google.com/macros/s/AKfycbxnTrVOOjPDKiaHRuG9EAjeLt4R9UDiBXgZiGoyW9F1xD42U82RAeRarOywVm4VPJDH/exec";
export const PARDUBICE_COORDS = { lat: 50.043, lng: 15.795 };

// Hlavní stavový objekt
export let grillState = {
    paidCash: 0, 
    paidCard: 0, 
    paidQR: 0, 
    paidOnTheHouse: 0,
    tables: {}, 
    initialStock: {}, 
    paidAccounts: [],
    menuConfig: [], 
    syncQueue: [], 
    syncError: false
};

// Pomocné proměnné
export let isSyncing = false;
export let manualThemeOverride = false;
export let sunData = null;

// Settery
export function setIsSyncing(value) { isSyncing = value; }
export function setManualThemePreference(value) { manualThemeOverride = value; }
export function setSunData(value) { sunData = value; }
export function setGrillState(newState) { grillState = newState; } 

export function getDefaultMenuConfig() {
    return [
        { id: 'kureci', name: 'Kuřecí', type: 'grams', price: 89, category: 'food' },
        { id: 'veprove', name: 'Vepřové', type: 'grams', price: 89, category: 'food' },
        { id: 'camembert', name: 'Camembert', type: 'pieces', price: 129, category: 'food' },
        { id: 'brambora', name: 'Pečená brambora', type: 'pieces', price: 40, category: 'food' },
    ];
}

export function saveGrillState() {
    try {
        localStorage.setItem(GRILL_LOCAL_STORAGE_KEY, JSON.stringify(grillState));
    } catch (e) {
        console.error("Chyba ukládání:", e);
        showToast("Kritická chyba při ukládání dat!", 'error');
    }
}

export function performDataReset(fullReset = false) {
    const preservedMenuConfig = fullReset ? getDefaultMenuConfig() : grillState.menuConfig;
    const preservedSyncQueue = grillState.syncQueue || [];
    const preservedSyncError = grillState.syncError || false;
    
    grillState.paidCash = 0;
    grillState.paidCard = 0;
    grillState.paidQR = 0;
    grillState.paidOnTheHouse = 0;
    grillState.tables = {};
    grillState.initialStock = {};
    grillState.paidAccounts = [];
    grillState.menuConfig = preservedMenuConfig;
    grillState.syncQueue = preservedSyncQueue;
    grillState.syncError = preservedSyncError;

    saveGrillState();
}

export function loadGrillState() {
    try {
        const savedState = localStorage.getItem(GRILL_LOCAL_STORAGE_KEY);
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            grillState.paidCash = parsedState.paidCash || 0;
            grillState.paidCard = parsedState.paidCard || 0;
            grillState.paidQR = parsedState.paidQR || 0;
            grillState.paidOnTheHouse = parsedState.paidOnTheHouse || 0;
            grillState.tables = parsedState.tables || {};
            grillState.initialStock = parsedState.initialStock || {};
            grillState.paidAccounts = (parsedState.paidAccounts && Array.isArray(parsedState.paidAccounts)) ? parsedState.paidAccounts : [];
            grillState.syncQueue = (parsedState.syncQueue && Array.isArray(parsedState.syncQueue)) ? parsedState.syncQueue : [];
            grillState.syncError = parsedState.syncError || false;
            grillState.menuConfig = (parsedState.menuConfig && Array.isArray(parsedState.menuConfig) && parsedState.menuConfig.length > 0) 
                ? parsedState.menuConfig 
                : getDefaultMenuConfig();
        } else {
            grillState.menuConfig = getDefaultMenuConfig();
        }
    } catch (e) {
        console.error("Chyba načítání stavu:", e);
        showToast("Chyba při načítání dat. Resetuji na výchozí stav.", "error");
        performDataReset(true);
    }
}

export function addToSyncQueueState(payload) {
    grillState.syncQueue.push(payload);
    saveGrillState();
}