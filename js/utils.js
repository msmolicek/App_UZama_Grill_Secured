// js/utils.js

export function formatCurrency(value) {
    return `${Math.round(value)} Kč`;
}

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function formatTimestamp(timestampStringOrNumber) {
    try {
        let timestamp;
        if (typeof timestampStringOrNumber === 'string') {
            timestamp = parseInt(timestampStringOrNumber.substring(0, 13));
        } else if (typeof timestampStringOrNumber === 'number') {
            timestamp = timestampStringOrNumber;
        } else {
            return 'Neplatné ID/Čas';
        }
        
        if (isNaN(timestamp)) return 'Neplatné ID/Čas';
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Chyba data';
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error("Chyba formátování timestampu:", timestampStringOrNumber, error);
        return 'Chyba data';
    }
}

export function formatElapsedTime(ms) {
    if (ms < 0) ms = 0;
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    
    seconds = seconds % 60;
    minutes = minutes % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getCurrentDateFormatted() {
    const t = new Date();
    return `${String(t.getDate()).padStart(2,'0')}.${String(t.getMonth()+1).padStart(2,'0')}.${t.getFullYear()}`;
}

export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'i';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '×';

    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span><button class="toast-close-btn">&times;</button>`;
    container.appendChild(toast);

    const hide = () => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    };

    const hideTimeout = setTimeout(hide, duration);

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
        clearTimeout(hideTimeout);
        hide();
    });

    setTimeout(() => { toast.classList.add('show'); }, 100);
}