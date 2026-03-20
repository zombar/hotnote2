'use strict';

// =========================================================================
// Theme Toggle
// =========================================================================

function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hotnote2-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

function initTheme() {
    const saved = localStorage.getItem('hotnote2-theme');
    applyTheme(saved || getSystemTheme());
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getSystemTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// =========================================================================
// Update Notifications
// =========================================================================

const UPDATE_CHECK_KEY = 'hotnote2-known-sha';
const UPDATE_POLL_MS   = 30 * 60 * 1000;

function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (!banner || banner.style.display !== 'none') return;
    dismissResumePrompt(); // update takes priority over resume prompt
    banner.style.display = '';
}

function dismissUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
}

async function checkForUpdate() {
    try {
        const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { sha } = await res.json();
        if (!sha) return;
        const known = localStorage.getItem(UPDATE_CHECK_KEY);
        if (!known) { localStorage.setItem(UPDATE_CHECK_KEY, sha); return; }
        if (sha !== known) showUpdateBanner();
    } catch (_) { /* ignore */ }
}

function initUpdateChecker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'APP_UPDATED') showUpdateBanner();
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
    });
    setInterval(checkForUpdate, UPDATE_POLL_MS);
    checkForUpdate();
}

// =========================================================================
// Toast Notifications
// =========================================================================

function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => { el.classList.add('show'); });
    setTimeout(() => {
        el.classList.remove('show');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
}

// =========================================================================
// File Watcher
// =========================================================================

function startFileWatcher() {
    setInterval(async () => {
        for (const paneId of ['pane1', 'pane2']) {
            const ps = getPaneState(paneId);
            if (!ps.currentFileHandle || ps.isDirty) continue;
            if (paneId === 'pane2' && (!state.splitMode || state.helpMode)) continue;
            try {
                const file = await ps.currentFileHandle.getFile();
                if (ps.lastModifiedTime !== null && file.lastModified !== ps.lastModifiedTime) {
                    ps.lastModifiedTime = file.lastModified;
                    const content = await file.text();
                    const textarea = getPaneEl('source-editor', paneId);
                    if (textarea) textarea.value = content;
                    window.sourceEditors?.[paneId === 'pane2' ? 'pane2' : 'pane1']?.setValue(content, { silent: true });
                    switchToMode(ps.editorMode, paneId, content);
                    showToast(`Reloaded: ${ps.currentFilename}`);
                    if (state._panesHaveSameFile) break;
                }
            } catch (_) {
                // file deleted or permissions revoked — ignore silently
            }
        }
    }, 3000);
}
