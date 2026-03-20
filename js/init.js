'use strict';

// =========================================================================
// Init
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Init source editors (contenteditable engine)
    window.sourceEditors = {};
    window.sourceEditors.pane1 = initSourceEditor(
        document.getElementById('source-editor-ce'),
        document.getElementById('source-editor'),
        document.getElementById('line-numbers'),
        document.getElementById('source-editor-overlay'),
        'pane1'
    );
    window.sourceEditors.pane2 = initSourceEditor(
        document.getElementById('source-editor-ce-p2'),
        document.getElementById('source-editor-p2'),
        document.getElementById('line-numbers-p2'),
        document.getElementById('source-editor-overlay-p2'),
        'pane2'
    );

    // Theme
    initTheme();
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Update checker
    initUpdateChecker();
    document.getElementById('update-banner-reload')?.addEventListener('click', async () => {
        localStorage.removeItem(UPDATE_CHECK_KEY);
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
        } catch (_) { /* ignore */ }
        window.location.reload();
    });
    document.getElementById('update-banner-dismiss')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
            const { sha } = await res.json();
            if (sha) localStorage.setItem(UPDATE_CHECK_KEY, sha);
        } catch (_) { /* ignore */ }
        dismissUpdateBanner();
    });

    // Open folder button
    document.getElementById('open-folder')?.addEventListener('click', async () => {
        await openFolder();
        await refreshGitStatus();
    });

    // Git changes filter checkbox
    document.getElementById('git-filter-checkbox')?.addEventListener('change', (e) => {
        state.gitFilterActive = e.target.checked;
        updateGitFilterBar();
        renderSidebar();
    });

    // Wysiwyg link clicks — open in new tab so we don't navigate away
    document.getElementById('wysiwyg')?.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            window.open(href, '_blank', 'noopener,noreferrer');
        }
    });
    document.getElementById('wysiwyg-p2')?.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            window.open(href, '_blank', 'noopener,noreferrer');
        }
    });

    // Save button
    const saveBtn = document.getElementById('save-btn');
    saveBtn?.addEventListener('click', () => saveFile());

    // Sidebar toolbar buttons
    document.getElementById('new-file-btn')?.addEventListener('click', showNewFileInput);
    document.getElementById('new-folder-btn')?.addEventListener('click', showNewFolderInput);
    document.getElementById('back-btn')?.addEventListener('click', () => navigateHistory(-1));
    document.getElementById('forward-btn')?.addEventListener('click', () => navigateHistory(1));
    document.getElementById('split-pane-btn')?.addEventListener('click', toggleSplitPane);
    document.getElementById('help-btn')?.addEventListener('click', () => {
        if (state.helpMode) closeHelpPane();
        else openHelpPane();
    });

    // Search
    function _getSearchParams() {
        const query = document.getElementById('search-input')?.value ?? '';
        const includeContent = document.getElementById('search-content-toggle')?.checked ?? false;
        const excludeRaw = document.getElementById('search-exclude')?.value ?? '';
        const excludePatterns = excludeRaw.split(',').map(s => s.trim()).filter(Boolean);
        return { query, includeContent, excludePatterns };
    }
    let searchDebounceTimer = null;
    document.getElementById('search-btn')?.addEventListener('click', toggleSearch);
    document.getElementById('search-input')?.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const { query, includeContent, excludePatterns } = _getSearchParams();
        const delay = includeContent ? 500 : 300;
        searchDebounceTimer = setTimeout(() => performSearch(query, includeContent, excludePatterns), delay);
    });
    document.getElementById('search-content-toggle')?.addEventListener('change', () => {
        const { query, includeContent, excludePatterns } = _getSearchParams();
        performSearch(query, includeContent, excludePatterns);
    });
    document.getElementById('search-exclude')?.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const { query, includeContent, excludePatterns } = _getSearchParams();
        searchDebounceTimer = setTimeout(() => performSearch(query, includeContent, excludePatterns), 400);
    });

    // Pane focus tracking
    function setupPaneFocus(paneId) {
        const paneEl = document.getElementById(paneId);
        if (!paneEl) return;
        paneEl.addEventListener('mousedown', () => {
            state.activePaneId = paneId;
            updateFocusRing();
            updateNavButtons();
            // Sync autosave checkbox to newly focused pane
            const ps = getPaneState(paneId);
            const autosaveCheckbox = document.getElementById('autosave-checkbox');
            if (autosaveCheckbox) {
                autosaveCheckbox.checked = ps.autosaveEnabled;
                autosaveCheckbox.disabled = !ps.currentFileHandle;
            }
            const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
            if (autosaveToggleLabel) {
                autosaveToggleLabel.style.opacity = ps.currentFileHandle ? '' : '0.4';
            }
        });
    }
    setupPaneFocus('pane1');
    setupPaneFocus('pane2');

    // Pane1 mirror dirty tracking (input fires when CE engine calls _syncMirror)
    const sourceEditor = document.getElementById('source-editor');
    sourceEditor?.addEventListener('input', () => {
        setDirty('pane1');
        updateSourceHighlight('pane1');

        // Same-file sync: if pane2 has the same file open, sync its CE engine content
        if (state.splitMode && state._panesHaveSameFile && !state.helpMode) {
            const textarea2 = document.getElementById('source-editor-p2');
            if (textarea2) textarea2.value = sourceEditor.value;
            window.sourceEditors.pane2?.setValue(sourceEditor.value, { silent: true });
            updateSourceHighlight('pane2');
            debouncedSyncPreview('pane2');
        }
    });

    // Pane2 mirror dirty tracking
    const sourceEditor2 = document.getElementById('source-editor-p2');
    sourceEditor2?.addEventListener('input', () => {
        setDirty('pane2');
        updateSourceHighlight('pane2');

        // Same-file sync: if pane1 has the same file open, sync its CE engine content
        if (state.splitMode && state._panesHaveSameFile && !state.helpMode) {
            const textarea1 = document.getElementById('source-editor');
            if (textarea1) textarea1.value = sourceEditor2.value;
            window.sourceEditors.pane1?.setValue(sourceEditor2.value, { silent: true });
            updateSourceHighlight('pane1');
            debouncedSyncPreview('pane1');
        }
    });

    // Ctrl+S / Cmd+S save
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    // Resize handle
    initResizeHandle();

    // Sidebar toggle
    document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);

    // Auto-collapse sidebar on narrow viewports
    const autoCollapseMQ = window.matchMedia('(max-width: 720px)');
    function handleAutoCollapse(mq) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (mq.matches) {
            sidebar.classList.add('collapsed');
        }
    }
    autoCollapseMQ.addEventListener('change', handleAutoCollapse);
    handleAutoCollapse(autoCollapseMQ);

    // Nested modal close / back
    document.getElementById('nested-modal-close')?.addEventListener('click', closeNestedModal);
    document.getElementById('nested-modal-back')?.addEventListener('click', () => {
        if (_nestedModalStack.length > 1) { _nestedModalStack.pop(); _renderNestedModalFrame(); }
    });
    document.getElementById('nested-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeNestedModal();
    });

    // Initial empty state — hide sidebar until a folder is opened
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('resize-handle').style.display = 'none';
    clearEditor();
    updateTitle();

    // URL-based folder/file restoration
    const _urlParams = new URLSearchParams(window.location.search);
    const _workdir = _urlParams.get('workdir');
    const _file = _urlParams.get('file');
    const _urlLine = parseInt(_urlParams.get('line') || '0', 10) || 0;
    const _urlChar = parseInt(_urlParams.get('char') || '0', 10) || 0;
    if (_workdir) {
        showResumePrompt(_workdir, _file, _urlLine, _urlChar);
    } else {
        const _lastFolder = localStorage.getItem('hotnote2-lastFolder');
        if (_lastFolder) {
            const _lastLine = parseInt(localStorage.getItem('hotnote2-lastLine') || '0', 10) || 0;
            const _lastChar = parseInt(localStorage.getItem('hotnote2-lastChar') || '0', 10) || 0;
            showResumePrompt(_lastFolder, localStorage.getItem('hotnote2-lastFile'), _lastLine, _lastChar);
        }
    }

    document.getElementById('resume-open-btn')?.addEventListener('click', async () => {
        const banner = document.getElementById('resume-prompt');
        const filePath = banner?.dataset.file || '';
        const lineNum = parseInt(banner?.dataset.line || '0', 10) || 0;
        const charNum = parseInt(banner?.dataset.char || '0', 10) || 0;
        dismissResumePrompt();
        await openFolder();
        await refreshGitStatus();
        if (filePath && state.rootHandle) {
            await openFileByPath(state.rootHandle, filePath, lineNum, charNum);
        }
    });
    document.getElementById('resume-dismiss-btn')?.addEventListener('click', () => {
        dismissResumePrompt();
        clearURL();
        localStorage.removeItem('hotnote2-lastFolder');
        localStorage.removeItem('hotnote2-lastFile');
        localStorage.removeItem('hotnote2-lastLine');
        localStorage.removeItem('hotnote2-lastChar');
    });

    // Track cursor line for URL/localStorage sync (pane1 only)
    // The CE engine dispatches synthetic keyup/mouseup on the mirror after cursor moves.
    let _lineDebounce = null;
    function _updateCursorPosition() {
        const pos = sourceEditor.selectionStart || 0;
        state.currentLine = (sourceEditor.value.substring(0, pos).match(/\n/g) || []).length + 1;
        const lastNewline = sourceEditor.value.lastIndexOf('\n', pos - 1);
        state.currentChar = lastNewline === -1 ? pos + 1 : pos - lastNewline;
        clearTimeout(_lineDebounce);
        _lineDebounce = setTimeout(updateURL, 600);
    }
    sourceEditor?.addEventListener('keyup',   _updateCursorPosition);
    sourceEditor?.addEventListener('mouseup', _updateCursorPosition);

    // Autosave init
    state.autosaveEnabled = loadAutosavePref();
    state.pane2.autosaveEnabled = state.autosaveEnabled;
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
    if (autosaveCheckbox) {
        autosaveCheckbox.addEventListener('change', (e) => {
            const ps = getPaneState(state.activePaneId);
            ps.autosaveEnabled = e.target.checked;
            saveAutosavePref(e.target.checked);
        });
    }
    // Initially disabled until a file is open (clearEditor will set these too, but explicit here)
    if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '0.4';
    if (autosaveCheckbox) autosaveCheckbox.disabled = true;

    // Check if File System Access API is available
    if (!window.showDirectoryPicker) {
        const warning = document.createElement('div');
        warning.style.cssText = 'position:fixed;bottom:1rem;right:1rem;left:1rem;background:#f85149;color:#fff;padding:.75rem 1rem;border-radius:6px;font-size:.875rem;z-index:9999;text-align:center;';
        warning.textContent = 'File System Access API not supported. Use Chrome or Edge.';
        document.body.appendChild(warning);
    }

    startFileWatcher();
});
