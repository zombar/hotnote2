'use strict';

// =========================================================================
// Split Pane
// =========================================================================

let _splitResizeInit = false;

function toggleSplitPane() {
    if (state.helpMode) { closeHelpPane(); return; }
    const btn = document.getElementById('split-pane-btn');
    if (state.splitMode) {
        // Close split pane
        state.splitMode = false;
        const pane2El = document.getElementById('pane2');
        const splitHandle = document.getElementById('split-resize-handle');
        if (pane2El) pane2El.style.display = 'none';
        if (splitHandle) splitHandle.style.display = 'none';
        if (btn) btn.classList.remove('active');
        // Reset pane1 flex so it expands to fill the full container again
        const pane1El = document.getElementById('pane1');
        if (pane1El) { pane1El.style.flexBasis = ''; pane1El.style.flexGrow = ''; pane1El.style.flexShrink = ''; }
        // Reset pane2 state
        if (state.pane2.imageObjectUrl) {
            URL.revokeObjectURL(state.pane2.imageObjectUrl);
            state.pane2.imageObjectUrl = null;
        }
        if (state.pane2.autosaveTimer) {
            clearTimeout(state.pane2.autosaveTimer);
            state.pane2.autosaveTimer = null;
        }
        state.pane2.currentFileHandle = null;
        state.pane2.currentFilename = '';
        state.pane2.isDirty = false;
        state._panesHaveSameFile = false;
        state.activePaneId = 'pane1';
        updateFocusRing();
    } else {
        // Open split pane
        state.splitMode = true;
        const pane2El = document.getElementById('pane2');
        const splitHandle = document.getElementById('split-resize-handle');
        if (pane2El) pane2El.style.display = '';
        if (splitHandle) splitHandle.style.display = '';
        if (btn) btn.classList.add('active');

        if (!_splitResizeInit) {
            initSplitResizeHandle();
            _splitResizeInit = true;
        }

        // Mirror pane1 content into pane2
        const ps1 = state;
        if (ps1.currentFileHandle && ps1.currentFilename) {
            const ext = getExtension(ps1.currentFilename);
            const isImage = IMAGE_EXTENSIONS.has(ext);
            const textarea1 = document.getElementById('source-editor');
            const content = textarea1 ? textarea1.value : '';

            state.pane2.currentFileHandle = ps1.currentFileHandle;
            state.pane2.currentFilename = ps1.currentFilename;
            state.pane2.currentRelativePath = ps1.currentRelativePath;
            state.pane2.autosaveEnabled = ps1.autosaveEnabled;
            state._panesHaveSameFile = true;

            const isPreviewable = ['md', 'json', 'csv'].includes(ext) || isImage;
            if (isPreviewable) {
                if (!isImage) {
                    // Force pane1 to source for text-based previewable files
                    ps1.editorMode = 'source';
                    renderEditor(content, ps1.currentFilename, 'pane1');
                }
                // Set up pane2 preview
                if (isImage) state.pane2.imageObjectUrl = ps1.imageObjectUrl;
                determineInitialMode(ext, content, state.pane2);
                // markdown: determineInitialMode leaves mode as 'source'; force wysiwyg
                if (ext === 'md') state.pane2.editorMode = 'wysiwyg';
                renderEditor(content, ps1.currentFilename, 'pane2');
            } else {
                // Both panes show source
                state.pane2.editorMode = 'source';
                renderEditor(content, ps1.currentFilename, 'pane2');
            }
        } else {
            // Show empty state in pane2
            const toolbar2 = document.getElementById('mode-toolbar-p2');
            if (toolbar2) toolbar2.style.display = 'none';
        }

        state.activePaneId = 'pane1';
        updateFocusRing();
    }
}

function updateFocusRing() {
    document.getElementById('pane1')?.classList.toggle('focused', state.activePaneId === 'pane1' && state.splitMode);
    document.getElementById('pane2')?.classList.toggle('focused', state.activePaneId === 'pane2' && state.splitMode);
}

function initSplitResizeHandle() {
    const handle = document.getElementById('split-resize-handle');
    const pane1El = document.getElementById('pane1');
    const pane2El = document.getElementById('pane2');
    if (!handle || !pane1El || !pane2El) return;

    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = pane1El.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!handle.classList.contains('dragging')) return;
        const container = document.getElementById('editor-container');
        const containerWidth = container ? container.offsetWidth : window.innerWidth;
        const minWidth = 200;
        const maxWidth = containerWidth - 200;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + (e.clientX - startX)));
        pane1El.style.flexBasis = `${newWidth}px`;
        pane1El.style.flexGrow = '0';
        pane1El.style.flexShrink = '0';
        pane2El.style.flex = '1';
    });

    document.addEventListener('mouseup', () => {
        if (handle.classList.contains('dragging')) {
            handle.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });
}

// Debounced sync preview for same-file sync
let _syncPreviewTimer = null;
function debouncedSyncPreview(paneId) {
    clearTimeout(_syncPreviewTimer);
    _syncPreviewTimer = setTimeout(() => {
        const ps = getPaneState(paneId);
        if (ps.editorMode !== 'source') {
            const textarea = getPaneEl('source-editor', paneId);
            const content = textarea ? textarea.value : '';
            switchToMode(ps.editorMode, paneId, content);
        }
    }, 300);
}
