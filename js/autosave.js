'use strict';

// =========================================================================
// Autosave
// =========================================================================

function loadAutosavePref() {
    const saved = localStorage.getItem('hotnote2-autosave');
    return saved !== null ? saved === 'true' : true; // default enabled
}

function saveAutosavePref(enabled) {
    localStorage.setItem('hotnote2-autosave', String(enabled));
}

function startAutosaveTimer(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    if (ps.autosaveTimer) clearTimeout(ps.autosaveTimer);
    ps.autosaveTimer = setTimeout(() => {
        ps.autosaveTimer = null;
        if (ps.isDirty && ps.currentFileHandle && ps.autosaveEnabled) {
            saveFile(true, paneId);
        }
    }, 2000);
}

function animateAutosaveLabel() {
    const label = document.getElementById('autosave-label');
    if (!label) return;
    label.textContent = 'saved';
    label.classList.remove('fade-out', 'hidden');
    setTimeout(() => {
        label.classList.add('fade-out');
        setTimeout(() => {
            label.textContent = 'autosave';
            label.classList.remove('fade-out');
        }, 500);
    }, 1500);
}

function updateSourceHighlight(_paneId = 'pane1') {
    // No-op: syntax highlighting and line numbers are handled by the CE engine
}

function _scrollElForMode(mode, paneId = 'pane1') {
    if (mode === 'source') {
        const sfx = paneId === 'pane2' ? '-p2' : '';
        return document.getElementById(`source-editor-ce${sfx}`);
    }
    if (mode === 'wysiwyg') return getPaneEl('wysiwyg', paneId);
    if (mode === 'treeview') return getPaneEl('s3-treeview', paneId);
    if (mode === 'datasheet') return getPaneEl('s3-datasheet', paneId);
    if (mode === 'image') return getPaneEl('image-viewer', paneId);
    if (mode === 'diff') return getPaneEl('diff-view', paneId);
    return null;
}


// =========================================================================
// Save
// =========================================================================

async function saveFile(silent = false, paneId = null) {
    const pid = paneId || state.activePaneId;
    const ps = getPaneState(pid);
    if (!ps.currentFileHandle) return;
    const textarea = getPaneEl('source-editor', pid);
    try {
        await writeFile(ps.currentFileHandle, textarea ? textarea.value : '');
        const savedFile = await ps.currentFileHandle.getFile();
        ps.lastModifiedTime = savedFile.lastModified;
        ps.isDirty = false;
        if (pid === 'pane1') {
            updateTitle();
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn) { saveBtn.classList.remove('dirty'); saveBtn.disabled = true; }
        }
        if (silent) animateAutosaveLabel();
        // Refresh git status so dots update after save
        if (state.gitAvailable) refreshGitStatus();
    } catch (err) {
        if (!silent) alert(`Failed to save: ${err.message}`);
        else console.error('Autosave failed:', err);
    }
}

function setDirty(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    if (!ps.isDirty) {
        ps.isDirty = true;
        if (paneId === 'pane1') {
            updateTitle();
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn) { saveBtn.classList.add('dirty'); saveBtn.disabled = false; }
        }
    }
    startAutosaveTimer(paneId);
}

function updateTitle() {
    const prefix = state.isDirty ? '• ' : '';
    const filename = state.currentFilename ? ` — ${state.currentFilename}` : '';
    document.title = `${prefix}hotnote${filename}`;
}
