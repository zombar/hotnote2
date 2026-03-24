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
        // --- Per-pane file change detection ---
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
                    if (state._panesHaveSameFile) {
                        // Push the already-read content into pane2 immediately (no second file read)
                        const ps2 = getPaneState('pane2');
                        ps2.lastModifiedTime = file.lastModified;
                        const textarea2 = getPaneEl('source-editor', 'pane2');
                        if (textarea2) textarea2.value = content;
                        window.sourceEditors?.pane2?.setValue(content, { silent: true });
                        switchToMode(ps2.editorMode, 'pane2', content);
                        break;
                    }
                }
            } catch (_) {
                // file deleted or permissions revoked — ignore silently
            }
        }

        // --- Directory scan: detect externally added/removed files ---
        if (!state.rootHandle || state.searchActive) return;
        const sidebar = document.getElementById('sidebar');
        if (!sidebar || sidebar.classList.contains('collapsed')) return;
        const now = performance.now();
        if (now - state._lastDirScan < 5000) return;
        state._lastDirScan = now;

        const baseDirRelPath = state.pathStack.slice(1).map(p => p.name).join('/');
        const dirsToScan = [
            { handle: state.currentDirHandle, relPath: baseDirRelPath, ulEl: document.getElementById('file-list') },
        ];
        document.querySelectorAll('#file-list .file-entry.expanded').forEach(li => {
            if (li._dirHandle) {
                const childUl = li.querySelector('.folder-children');
                if (childUl) dirsToScan.push({ handle: li._dirHandle, relPath: li._dirRelPath, ulEl: childUl });
            }
        });

        for (const { handle, relPath, ulEl } of dirsToScan) {
            if (!ulEl) continue;
            try {
                const entries = await listDirectory(handle);
                const sig = entries.map(e => `${e.name}:${e.kind}`).join('|');
                const sigKey = relPath || '';
                const prevSig = state._dirSigs.get(sigKey);
                if (prevSig !== undefined && prevSig !== sig) {
                    _patchDirChildren(ulEl, entries, handle, relPath || '');
                }
                state._dirSigs.set(sigKey, sig);
            } catch (_) { /* ignore — handle revoked or dir deleted */ }
        }
    }, 3000);
}
