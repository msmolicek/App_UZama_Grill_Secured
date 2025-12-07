// js/sync.js
import { grillState, saveGrillState, isSyncing, setIsSyncing, GAS_URL } from './state.js';
import { generateId, showToast } from './utils.js';

export function updateSyncStatusIcon() {
    const icon = document.getElementById('sync-status');
    if (!icon) return;
    
    icon.classList.remove('syncing', 'synced', 'sync-error');
    
    if (isSyncing) { 
        icon.classList.add('syncing'); 
        icon.title = "Probíhá synchronizace..."; 
    }
    else if (grillState.syncError) { 
        icon.classList.add('sync-error'); 
        icon.title = `Chyba synchronizace. Nesynchronizováno: ${grillState.syncQueue.length}. Klikněte pro opakování.`; 
    }
    else if (grillState.syncQueue.length > 0) { 
        icon.classList.add('syncing'); 
        icon.title = `Čeká na odeslání: ${grillState.syncQueue.length} položek.`; 
    }
    else { 
        icon.classList.add('synced'); 
        icon.title = "Všechna data jsou synchronizována."; 
    }
}

export async function processSyncQueue() {
    if (isSyncing || !navigator.onLine || grillState.syncQueue.length === 0) {
        if (!navigator.onLine) console.log("Offline, synchronizace se neprovádí.");
        updateSyncStatusIcon(); 
        return;
    }

    setIsSyncing(true);
    grillState.syncError = false;
    updateSyncStatusIcon();

    // Zpracování fronty jeden po druhém (FIFO)
    while(grillState.syncQueue.length > 0) {
        const task = grillState.syncQueue[0];
        try {
            await fetch(GAS_URL, {
                method: 'POST', 
                mode: 'no-cors', 
                cache: 'no-cache',
                headers: { 'Content-Type': 'text/plain;charset=utf-8', },
                redirect: 'follow', 
                body: JSON.stringify(task.payload)
            });
            
            console.log("Sync task odeslán:", task.id);
            grillState.syncQueue.shift(); // Odstranit úspěšně odeslanou položku
            saveGrillState();
        } catch (error) {
            console.error("Chyba synchronizace (fetch selhal):", error);
            showToast('Chyba synchronizace. Pokuste se prosím později.', 'error');
            
            grillState.syncError = true; 
            setIsSyncing(false); 
            saveGrillState();
            updateSyncStatusIcon(); 
            return; // Ukončit smyčku při chybě
        }
    }

    setIsSyncing(false);
    updateSyncStatusIcon();
    
    if (!grillState.syncError && grillState.syncQueue.length === 0) {
        console.log("Sync fronta úspěšně zpracována.");
    }
}

export function addToSyncQueue(payload) { 
    grillState.syncQueue.push({ id: generateId(), payload: payload }); 
    saveGrillState(); 
    updateSyncStatusIcon(); 
    setTimeout(processSyncQueue, 1500); 
}