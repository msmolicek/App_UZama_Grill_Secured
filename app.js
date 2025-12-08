// app.js (Main Entry Point)
import { loadGrillState, performDataReset, setManualThemePreference, setSunData, PARDUBICE_COORDS } from './js/state.js';
import { getCurrentDateFormatted, showToast } from './js/utils.js';
import { updateAllDisplays, applyTheme, cycleTheme, toggleFullscreen, updateFullscreenButton, elements } from './js/ui.js';
import { areInitialStocksSet } from './js/calculations.js';
import { processSyncQueue, updateSyncStatusIcon, fetchMenuConfigFromGAS } from './js/sync.js';
// Importujeme showConfirmationDialog
import { handleTableClick, showStockInputDialog, showDailyCloseDialog, showOpenTablesWarningDialog, hasOpenTables, showAdminDialog, showDispatchConfirmDialog, showStockNotSetWarningDialog, showConfirmationDialog } from './js/dialogs.js';

// Inicializace po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log("Grilování vNext (Audit Complete v3.0) startuje...");

    // 1. Načtení dat
    loadGrillState();
    
    // 2. Inicializace Téma (Slunce)
    initializeTheme();
    
    // 3. Inicializace Textů
    const formattedDate = getCurrentDateFormatted();
    if(elements.remainingTitle) elements.remainingTitle.textContent = `${formattedDate} zbývá:`;
    if(elements.soldTitle) elements.soldTitle.textContent = `${formattedDate} prodáno:`;

    // 4. Global Event Listeners
    if (elements.fullscreenBtn) {
        updateFullscreenButton();
        document.addEventListener('fullscreenchange', updateFullscreenButton);
        elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Listener pro nové tlačítko stažení konfigurace
    document.getElementById('config-fetch-trigger')?.addEventListener('click', () => {
        fetchMenuConfigFromGAS();
    });

    elements.tables.forEach(table => { 
        table.addEventListener('click', function() { handleTableClick(this.id, this.textContent); }); 
        table.addEventListener('keydown', function(e) { 
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTableClick(this.id, this.textContent); } 
        }); 
    });

    document.getElementById('daily-close')?.addEventListener('click', () => { 
        if (!areInitialStocksSet()) { 
            showStockNotSetWarningDialog();
            return;
        } 
        
        if (hasOpenTables()) { showOpenTablesWarningDialog(); } else { showDailyCloseDialog(); } 
    });

    document.getElementById('reset-local-data')?.addEventListener('click', () => {
        // ZMĚNA: Přidán nadpis "Vynulovat data?"
        showConfirmationDialog(
            'Vynulovat data?', 
            'Opravdu vynulovat všechna data (tržby, stoly, zásoby)?<br>Nastavení menu zůstane zachováno.',
            () => {
                performDataReset(false);
                updateAllDisplays();
                showToast('Lokální data byla úspěšně vynulována.', 'success');
            }
        );
    });

    document.getElementById('enter-stock-button')?.addEventListener('click', showStockInputDialog);
    
    elements.themeToggleBtn?.addEventListener('click', () => {
        const newTheme = cycleTheme();
        setManualThemePreference(newTheme);
        applyTheme(newTheme);
    });

    document.getElementById('admin-panel-trigger')?.addEventListener('click', showAdminDialog);
    
    const syncStatusIcon = document.getElementById('sync-status');
    syncStatusIcon?.addEventListener('click', processSyncQueue);
    window.addEventListener('online', processSyncQueue);
    window.addEventListener('offline', updateSyncStatusIcon);

    // Dispatch Area Events (Delegace)
    if (elements.dispatchArea) { 
        elements.dispatchArea.addEventListener('click', (e) => { 
            const button = e.target.closest('.dispatch-button'); 
            const card = e.target.closest('.dispatch-card'); 
            if (button && card) { 
                const { tableId, accountId, batchId } = card.dataset; 
                if (tableId && accountId && batchId) { 
                    showDispatchConfirmDialog(tableId, accountId, batchId); 
                } 
            } 
        }); 
    }

    // 5. První vykreslení a start sync
    updateAllDisplays();
    updateSyncStatusIcon();
    
    // Spuštění synchronizační fronty (odesílání)
    setTimeout(processSyncQueue, 2000);

    // Automatické stažení konfigurace při startu
    setTimeout(() => {
        console.log("Pokus o automatické stažení konfigurace...");
        fetchMenuConfigFromGAS();
    }, 1000);
});

// --- Theme Helpers ---
async function fetchSunData() {
    try {
        const response = await fetch(`https://api.sunrise-sunset.org/json?lat=${PARDUBICE_COORDS.lat}&lng=${PARDUBICE_COORDS.lng}&date=today&formatted=0`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.status === 'OK') { 
            setSunData({ sunrise: new Date(data.results.sunrise), sunset: new Date(data.results.sunset) }); 
            checkAndApplyAutoTheme(); 
        }
    } catch (error) { console.error("Chyba při načítání dat o slunci:", error); setSunData(null); }
}

function checkAndApplyAutoTheme() {
    if (localStorage.getItem('grilovaniThemePreference_v2')) return; 
    
    import('./js/state.js').then(({ sunData }) => {
        if (!sunData) return;
        const now = new Date(); 
        const isNightTime = now < sunData.sunrise || now > sunData.sunset;
        const newTheme = isNightTime ? 'dark' : 'light';
        const currentTheme = document.body.classList.contains('night-mode') ? 'dark' : 'light';
        if(newTheme !== currentTheme) { applyTheme(newTheme); localStorage.setItem('grilovaniThemePreference_v2', newTheme); }
    });
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('grilovaniThemePreference_v2');
    if (savedTheme) { applyTheme(savedTheme); } else { applyTheme('light'); }
    fetchSunData(); 
    setInterval(checkAndApplyAutoTheme, 5 * 60 * 1000);
}