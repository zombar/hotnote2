'use strict';

const APP_VERSION = '0.9.8';

// =========================================================================
// File Opening & Editor
// =========================================================================

async function openFile(fileHandle, filename, pushHistory = true, paneId = 'pane1') {
    const ps = getPaneState(paneId);

    if (ps.isDirty) {
        if (!confirm('You have unsaved changes. Discard?')) return;
    }

    if (pushHistory) {
        const current = ps.fileHistory[ps.fileHistoryIndex];
        if (!current || current.handle !== fileHandle) {
            // Save cursor/scroll of the file we're leaving
            if (current) {
                const sourceEditor = getPaneEl('source-editor', paneId);
                const scrollEl = _scrollElForMode(ps.editorMode, paneId);
                current.pos = {
                    editorMode: ps.editorMode,
                    cursorStart: sourceEditor?.selectionStart ?? 0,
                    cursorEnd: sourceEditor?.selectionEnd ?? 0,
                    scrollPositions: {
                        ...ps.scrollPositions,
                        ...(scrollEl ? { [ps.editorMode]: scrollEl.scrollTop } : {}),
                    },
                };
                const _cacheKeyPos = current.relPath || current.name;
                if (ps.filePositionCache.size >= FILE_POS_CACHE_MAX) {
                    ps.filePositionCache.delete(ps.filePositionCache.keys().next().value);
                }
                ps.filePositionCache.set(_cacheKeyPos, current.pos);
            }
            ps.fileHistory = ps.fileHistory.slice(0, ps.fileHistoryIndex + 1);
            const relPath = paneId === 'pane1' ? state.currentRelativePath : ps.currentRelativePath;
            ps.fileHistory.push({ handle: fileHandle, name: filename, relPath });
            ps.fileHistoryIndex = ps.fileHistory.length - 1;
            if (ps.fileHistory.length > FILE_HISTORY_MAX) {
                ps.fileHistory.splice(0, ps.fileHistory.length - FILE_HISTORY_MAX);
                ps.fileHistoryIndex = ps.fileHistory.length - 1;
            }
        }
    }

    ps.currentFileHandle = fileHandle;
    ps.currentFilename = filename;
    ps.isDirty = false;
    ps.currentLine = 1;
    ps.currentChar = 1;

    if (paneId === 'pane1') {
        updateTitle();
    }

    // Update sidebar active state — only pane1 drives the sidebar highlight
    if (paneId === 'pane1') {
        document.querySelectorAll('.file-entry').forEach(li => {
            li.classList.toggle('active', !!li._relPath && li._relPath === state.currentRelativePath);
        });
    }

    // Restore cached positions if this file was visited before
    const _cacheKey = (paneId === 'pane1' ? state.currentRelativePath : ps.currentRelativePath) || filename;
    const _cachedPos = pushHistory ? (ps.filePositionCache.get(_cacheKey) || null) : null;
    ps.scrollPositions = _cachedPos?.scrollPositions ? { ..._cachedPos.scrollPositions } : {};

    let content = '';
    if (isImageFile(filename)) {
        if (ps.imageObjectUrl) {
            URL.revokeObjectURL(ps.imageObjectUrl);
            ps.imageObjectUrl = null;
        }
        try {
            const file = await fileHandle.getFile();
            ps.imageObjectUrl = URL.createObjectURL(file);
            ps.lastModifiedTime = file.lastModified;
        } catch (err) {
            alert(`Failed to read image: ${err.message}`);
            return;
        }
    } else {
        try {
            content = await readFile(fileHandle);
            const _fObj = await fileHandle.getFile();
            ps.lastModifiedTime = _fObj.lastModified;
        } catch (err) {
            alert(`Failed to read file: ${err.message}`);
            return;
        }
    }

    const ext = getExtension(filename);

    determineInitialMode(ext, content, ps);
    renderEditor(content, filename, paneId);

    // Restore cursor for previously-visited file (pane1 only for URL tracking)
    if (paneId === 'pane1' && _cachedPos && _cachedPos.cursorStart !== undefined) {
        setTimeout(() => {
            const sourceEditor = getPaneEl('source-editor', 'pane1');
            if (sourceEditor) {
                sourceEditor.selectionStart = _cachedPos.cursorStart;
                sourceEditor.selectionEnd   = _cachedPos.cursorEnd;
                const pos = _cachedPos.cursorStart;
                state.currentLine = (sourceEditor.value.substring(0, pos).match(/\n/g) || []).length + 1;
                const lastNl = sourceEditor.value.lastIndexOf('\n', pos - 1);
                state.currentChar = lastNl === -1 ? pos + 1 : pos - lastNl;
                updateURL();
            }
        }, 0);
    }

    // Enable autosave controls (reflect active pane)
    if (paneId === state.activePaneId) {
        const autosaveCheckbox = document.getElementById('autosave-checkbox');
        const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
        if (autosaveCheckbox) {
            autosaveCheckbox.disabled = false;
            autosaveCheckbox.checked = ps.autosaveEnabled;
        }
        if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '';
    }

    // On narrow viewports, collapse sidebar after picking a file
    if (window.innerWidth <= 720) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    if (paneId === 'pane1') {
        updateURL();
    }
    updateNavButtons();
    _updateSameFileFlag(); // fire-and-forget; updates state._panesHaveSameFile
}

function updateNavButtons() {
    const activePs = getPaneState(state.activePaneId);
    const backBtn = document.getElementById('back-btn');
    const fwdBtn = document.getElementById('forward-btn');
    if (backBtn) backBtn.disabled = activePs.fileHistoryIndex <= 0;
    if (fwdBtn)  fwdBtn.disabled = activePs.fileHistoryIndex >= activePs.fileHistory.length - 1;
}

async function navigateHistory(delta) {
    const paneId = state.activePaneId;
    const ps = getPaneState(paneId);
    const target = ps.fileHistoryIndex + delta;
    if (target < 0 || target >= ps.fileHistory.length) return;
    if (ps.isDirty) {
        if (!confirm('You have unsaved changes. Discard?')) return;
        ps.isDirty = false;
    }

    // Save cursor + scroll of current file before leaving
    const curEntry = ps.fileHistory[ps.fileHistoryIndex];
    if (curEntry) {
        const sourceEditor = getPaneEl('source-editor', paneId);
        const scrollEl = _scrollElForMode(ps.editorMode, paneId);
        curEntry.pos = {
            editorMode: ps.editorMode,
            cursorStart: sourceEditor?.selectionStart ?? 0,
            cursorEnd: sourceEditor?.selectionEnd ?? 0,
            scrollPositions: {
                ...ps.scrollPositions,
                ...(scrollEl ? { [ps.editorMode]: scrollEl.scrollTop } : {}),
            },
        };
        const _navCacheKey = curEntry.relPath || curEntry.name;
        if (ps.filePositionCache.size >= FILE_POS_CACHE_MAX) {
            ps.filePositionCache.delete(ps.filePositionCache.keys().next().value);
        }
        ps.filePositionCache.set(_navCacheKey, curEntry.pos);
    }

    ps.fileHistoryIndex = target;
    const { handle, name, pos, relPath } = ps.fileHistory[target];
    if (paneId === 'pane1') state.currentRelativePath = relPath || null;
    else ps.currentRelativePath = relPath || null;
    await openFile(handle, name, false, paneId);

    // Restore mode, cursor, and scroll for the target file
    if (pos) {
        if (pos.scrollPositions) {
            ps.scrollPositions = { ...pos.scrollPositions };
        }
        if (pos.editorMode && pos.editorMode !== ps.editorMode) {
            switchToMode(pos.editorMode, paneId);
        } else {
            const scrollEl = _scrollElForMode(ps.editorMode, paneId);
            if (scrollEl) scrollEl.scrollTop = (pos.scrollPositions?.[ps.editorMode]) || 0;
        }
        const sourceEditor = getPaneEl('source-editor', paneId);
        if (sourceEditor && pos.cursorStart !== undefined) {
            sourceEditor.selectionStart = pos.cursorStart;
            sourceEditor.selectionEnd = pos.cursorEnd;
            const cursorPos = pos.cursorStart;
            if (paneId === 'pane1') {
                state.currentLine = (sourceEditor.value.substring(0, cursorPos).match(/\n/g) || []).length + 1;
                const lastNl = sourceEditor.value.lastIndexOf('\n', cursorPos - 1);
                state.currentChar = lastNl === -1 ? cursorPos + 1 : cursorPos - lastNl;
            }
        }
    }
    if (paneId === 'pane1') updateURL();
}

function determineInitialMode(ext, content, paneState) {
    const ps = paneState || state;
    ps.nestedStack = [];

    // Image files
    if (IMAGE_EXTENSIONS.has(ext)) {
        ps.editorMode = 'image';
        return;
    }

    // CSV: always datasheet
    if (ext === 'csv') {
        const ds = parseCSV(content);
        if (ds.isDatasheet) {
            ps.editorMode = 'datasheet';
            ps.datasheetData = ds.data;
            ps.datasheetSchema = inferSchema(ds.data);
            ps.datasheetPage = 1;
        } else {
            ps.editorMode = 'source';
        }
        return;
    }

    // JSON: datasheet if array-of-objects, treeview if valid, else source
    if (ext === 'json') {
        const ds = detectDatasheetMode(content);
        if (ds.isDatasheet) {
            ps.editorMode = 'datasheet';
            ps.datasheetData = ds.data;
            ps.datasheetSchema = inferSchema(ds.data);
            ps.datasheetPage = 1;
        } else {
            const jt = detectJsonType(content);
            if (jt.isObject || jt.isArray) {
                ps.editorMode = 'treeview';
                ps.treeviewData = jt.parsed;
                ps.treeviewCollapsed = new Set();
            } else {
                ps.editorMode = 'source';
            }
        }
        return;
    }

    ps.editorMode = 'source';

    // Auto-switch to diff when git filter is active and file has uncommitted changes
    if (state.gitFilterActive && state.gitAvailable && ps.currentRelativePath &&
            state.gitChangedPaths.has(ps.currentRelativePath)) {
        ps.editorMode = 'diff';
    }
}

function applyWordWrap(paneId) {
    const ps = getPaneState(paneId);
    const wrapEl = getPaneEl('source-editor-wrap', paneId);
    if (wrapEl) wrapEl.classList.toggle('word-wrap-on', ps.wordWrap);
}

function renderEditor(content, filename, paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const paneEl = document.getElementById(paneId);

    // Remove empty state if present (pane1 only)
    if (paneId === 'pane1') {
        const emptyState = paneEl.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
    }

    // Show mode toolbar
    const toolbar = getPaneEl('mode-toolbar', paneId);
    if (toolbar) toolbar.style.display = 'flex';

    // Set textarea (mirror) content and sync CE engine
    const textarea = getPaneEl('source-editor', paneId);
    if (textarea) textarea.value = content;
    const _ceKey = paneId === 'pane2' ? 'pane2' : 'pane1';
    window.sourceEditors?.[_ceKey]?.setValue(content, { silent: true });

    updateModeToolbar(paneId);
    switchToMode(ps.editorMode, paneId, content);
    applyWordWrap(paneId);
}

function updateModeToolbar(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const ext = getExtension(ps.currentFilename);
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const isJson = ext === 'json';
    const isCsv = ext === 'csv';
    const isMd = ext === 'md';

    const textarea = getPaneEl('source-editor', paneId);
    const content = (isJson || isCsv) ? (textarea?.value || '') : '';
    const jt = isJson ? detectJsonType(content) : { isObject: false, isArray: false };
    const ds = isJson ? detectDatasheetMode(content) : isCsv ? parseCSV(content) : { isDatasheet: false };
    const hasDatasheet = ds.isDatasheet;
    const hasTree = isJson && !hasDatasheet && (jt.isObject || jt.isArray);

    const modeToolbar = getPaneEl('mode-toolbar', paneId);
    if (!modeToolbar) return;

    if (isImage) {
        modeToolbar.innerHTML = `<span id="filename-display${paneId === 'pane2' ? '-p2' : ''}" class="filename-display">${escapeHtml(ps.currentFilename)}</span>`;
        return;
    }

    const sfx = paneId === 'pane2' ? '-p2' : '';
    const showDiff = state.gitAvailable && !!ps.currentRelativePath;

    modeToolbar.innerHTML = `
        <button class="btn btn-sm${ps.editorMode === 'source' ? ' active' : ''}" id="mode-source${sfx}">Source</button>
        ${isMd ? `<button class="btn btn-sm${ps.editorMode === 'wysiwyg' ? ' active' : ''}" id="mode-wysiwyg${sfx}">Preview</button>` : ''}
        ${hasDatasheet ? `<button class="btn btn-sm${ps.editorMode === 'datasheet' ? ' active' : ''}" id="mode-datasheet${sfx}">Table</button>` : ''}
        ${hasTree ? `<button class="btn btn-sm${ps.editorMode === 'treeview' ? ' active' : ''}" id="mode-treeview${sfx}">Tree</button>` : ''}
        ${showDiff ? `<button class="btn btn-sm${ps.editorMode === 'diff' ? ' active' : ''}" id="mode-diff${sfx}">Diff</button>` : ''}
        <span id="filename-display${sfx}" class="filename-display">${escapeHtml(ps.currentFilename)}</span>
        <label class="wrap-toggle-label" title="Toggle word wrap">
            <input type="checkbox" id="wrap-toggle${sfx}" class="pill-toggle"${ps.wordWrap ? ' checked' : ''}>
            <span>wrap</span>
        </label>
    `;

    document.getElementById(`mode-source${sfx}`)?.addEventListener('click', () => switchToMode('source', paneId));
    document.getElementById(`mode-wysiwyg${sfx}`)?.addEventListener('click', () => switchToMode('wysiwyg', paneId));
    document.getElementById(`mode-datasheet${sfx}`)?.addEventListener('click', () => switchToMode('datasheet', paneId));
    document.getElementById(`mode-treeview${sfx}`)?.addEventListener('click', () => switchToMode('treeview', paneId));
    document.getElementById(`mode-diff${sfx}`)?.addEventListener('click', () => switchToMode('diff', paneId));
    document.getElementById(`wrap-toggle${sfx}`)?.addEventListener('change', (e) => {
        ps.wordWrap = e.target.checked;
        applyWordWrap(paneId);
    });
}

async function resolveLocalImages(container) {
    if (!state.currentDirHandle) return;
    const imgs = container.querySelectorAll('img');
    for (const img of imgs) {
        const src = img.getAttribute('src');
        if (!src || /^(https?|data:|blob:)/i.test(src)) continue;
        // relative path — resolve via File System API
        try {
            const parts = src.replace(/^\.\//, '').split('/').filter(Boolean);
            let dir = state.currentDirHandle;
            for (let i = 0; i < parts.length - 1; i++) {
                dir = await dir.getDirectoryHandle(parts[i]);
            }
            const fh = await dir.getFileHandle(parts[parts.length - 1]);
            const file = await fh.getFile();
            const prev = img.src;
            img.src = URL.createObjectURL(file);
            img.onload = () => {};
            // revoke old blob if any
            if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        } catch (_e) {
            // image not found; show alt text gracefully
            img.style.display = 'none';
            const placeholder = document.createElement('span');
            placeholder.className = 'img-placeholder';
            placeholder.textContent = img.alt ? `[img: ${img.alt}]` : '[img]';
            img.after(placeholder);
        }
    }
}

function switchToMode(mode, paneId = 'pane1', content) {
    const ps = getPaneState(paneId);

    // Clear nested navigation when user explicitly changes mode
    ps.nestedStack = [];

    // Save scroll position of current panel before switching
    const prevEl = _scrollElForMode(ps.editorMode, paneId);
    if (prevEl) ps.scrollPositions[ps.editorMode] = prevEl.scrollTop;

    ps.editorMode = mode;

    const wrap = getPaneEl('source-editor-wrap', paneId);
    const textarea = getPaneEl('source-editor', paneId);
    const wysiwyg = getPaneEl('wysiwyg', paneId);
    const datasheet = getPaneEl('s3-datasheet', paneId);
    const treeview = getPaneEl('s3-treeview', paneId);
    const imageViewer = getPaneEl('image-viewer', paneId);
    const diffView = getPaneEl('diff-view', paneId);

    // Hide all panels
    if (wrap) wrap.style.display = 'none';
    if (wysiwyg) wysiwyg.style.display = 'none';
    if (datasheet) datasheet.style.display = 'none';
    if (treeview) treeview.style.display = 'none';
    if (imageViewer) imageViewer.style.display = 'none';
    if (diffView) diffView.style.display = 'none';

    const currentContent = content !== undefined ? content : (textarea ? textarea.value : '');

    switch (mode) {
        case 'source':
            if (wrap) wrap.style.display = 'block';
            updateSourceHighlight(paneId);
            // Only auto-focus if this is the currently active pane
            if (textarea && paneId === state.activePaneId) textarea.focus();
            break;

        case 'wysiwyg':
            if (wysiwyg) {
                wysiwyg.style.display = 'block';
                wysiwyg.className = 's3-wysiwyg';
                wysiwyg.contentEditable = 'false';
                if (TM && TM.markdown) {
                    wysiwyg.innerHTML = TM.markdown.renderMarkdown(currentContent);
                } else {
                    wysiwyg.textContent = currentContent;
                }
                resolveLocalImages(wysiwyg).catch(console.error);
                applySyntaxHighlighting(wysiwyg);
            }
            break;

        case 'datasheet': {
            const ext = getExtension(ps.currentFilename);
            const ds = ext === 'csv' ? parseCSV(currentContent) : detectDatasheetMode(currentContent);
            if (ds.isDatasheet) {
                ps.datasheetData = ds.data;
                ps.datasheetSchema = inferSchema(ds.data);
                ps.datasheetPage = 1;
            }
            if (datasheet) {
                datasheet.style.display = 'flex';
                _renderDatasheet(paneId);
            }
            break;
        }

        case 'treeview': {
            const jt = detectJsonType(currentContent);
            ps.treeviewData = jt.parsed;
            ps.treeviewCollapsed = new Set();
            if (treeview) {
                treeview.style.display = 'block';
                renderTreeView(paneId);
            }
            break;
        }

        case 'image':
            if (imageViewer) {
                imageViewer.style.display = 'flex';
                imageViewer.innerHTML = ps.imageObjectUrl
                    ? `<img src="${ps.imageObjectUrl}" alt="${escapeHtml(ps.currentFilename)}">`
                    : `<p style="color:var(--color-text-tertiary)">Failed to load image</p>`;
            }
            break;

        case 'diff':
            if (diffView) {
                diffView.style.display = 'block';
                diffView.innerHTML = '<div class="diff-loading">Loading diff\u2026</div>';
                const _relPath = ps.currentRelativePath;
                const _currentContent = textarea ? textarea.value : '';
                const _lang = getExtension(ps.currentFilename);
                readHeadBlob(state.rootHandle, _relPath).then(headContent => {
                    if (ps.editorMode !== 'diff') return; // mode switched away
                    const status = headContent === null ? 'untracked' : 'modified';
                    diffView.innerHTML = renderDiff(headContent ?? '', _currentContent, status, _lang);
                }).catch(() => {
                    if (ps.editorMode === 'diff') {
                        diffView.innerHTML = '<div class="diff-clean">Could not load HEAD content</div>';
                    }
                });
            }
            break;
    }

    // Restore scroll position for this mode (0 = top if not previously saved)
    const newEl = _scrollElForMode(mode, paneId);
    if (newEl) newEl.scrollTop = ps.scrollPositions[mode] || 0;

    // Update toolbar buttons
    const toolbarId = paneId === 'pane1' ? 'mode-toolbar' : 'mode-toolbar-p2';
    document.querySelectorAll(`#${toolbarId} .btn`).forEach(btn => {
        const btnMode = btn.id?.replace('mode-', '').replace('-p2', '');
        btn.classList.toggle('active', btnMode === mode);
    });
}

// =========================================================================
// Wikilinks
// =========================================================================

async function openWikilink(target, paneId = 'pane1') {
    if (!state.rootHandle) return;
    const name = target.trim();
    try {
        const allFiles = await getAllFiles(state.rootHandle, '');
        let match = allFiles.find(f => f.name === name || f.relPath === name);
        if (!match && !name.includes('.')) {
            match = allFiles.find(f => f.name === name + '.md' || f.relPath === name + '.md');
        }
        if (match) {
            await openFile(match.handle, match.name, true, paneId);
            const ps = getPaneState(paneId);
            if (ps.editorMode !== 'wysiwyg' && getExtension(match.name) === 'md') {
                switchToMode('wysiwyg', paneId);
            }
        } else {
            showToast(`Note not found: ${name}`);
        }
    } catch (_e) {
        showToast('Failed to open note');
    }
}

function clearEditor() {
    if (state.imageObjectUrl) {
        URL.revokeObjectURL(state.imageObjectUrl);
        state.imageObjectUrl = null;
    }
    state.currentFileHandle = null;
    state.currentFilename = '';
    state.isDirty = false;
    state.editorMode = 'source';
    state._panesHaveSameFile = false;
    updateTitle();

    const wrap = document.getElementById('source-editor-wrap');
    const textarea = document.getElementById('source-editor');
    const wysiwyg = document.getElementById('wysiwyg');
    const datasheet = document.getElementById('s3-datasheet');
    const treeview = document.getElementById('s3-treeview');
    const toolbar = document.getElementById('mode-toolbar');

    if (wrap) wrap.style.display = 'none';
    if (textarea) textarea.value = '';
    window.sourceEditors?.pane1?.setValue('', { silent: true });
    if (wysiwyg) wysiwyg.style.display = 'none';
    if (datasheet) datasheet.style.display = 'none';
    if (treeview) treeview.style.display = 'none';
    if (toolbar) { toolbar.style.display = 'none'; toolbar.innerHTML = ''; }

    const pane1El = document.getElementById('pane1');
    if (pane1El) {
        pane1El.querySelector('.welcome-screen')?.remove();
        pane1El.querySelector('.empty-state')?.remove();
    }
    if (state.rootHandle === null) {
        renderWelcomeScreen();
    } else {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<h2>No file open</h2><p>Select a file from the sidebar.</p>';
        if (pane1El) pane1El.appendChild(emptyState);
    }

    // Disable autosave controls when no file is open
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
    if (autosaveCheckbox) autosaveCheckbox.disabled = true;
    if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '0.4';
}

async function renderWelcomeScreen() {
    const pane1El = document.getElementById('pane1');
    if (!pane1El) return;

    const el = document.createElement('div');
    el.className = 'welcome-screen';
    el.innerHTML = `
        <div class="welcome-hero">
            <p class="welcome-tagline">Local-first code &amp; markdown editor.<br>
            No backend, no account, no cloud. Works directly with your filesystem.</p>
            <ul class="welcome-features">
                <li>Open any local folder with <b>Open Folder</b> above</li>
                <li>Edit code, markdown and JSON — view images &amp; more</li>
                <li>Markdown preview, JSON/CSV table view, and JSON tree view</li>
                <li>Requires Chrome or Edge (File System Access API)</li>
            </ul>
        </div>
        <details class="cl-details">
            <summary class="cl-summary">Changelog</summary>
            <div class="cl-body" id="cl-body-content">
                <span class="cl-loading">Loading\u2026</span>
            </div>
        </details>
        <div class="welcome-footer">v${APP_VERSION} &nbsp;&middot;&nbsp; &copy; 2026 FORGE3D CYF</div>`;

    pane1El.appendChild(el);

    el.querySelector('.cl-details').addEventListener('toggle', function () {
        el.classList.toggle('cl-open', this.open);
    });

    try {
        const res = await fetch(
            'https://raw.githubusercontent.com/zombar/hotnote2/main/CHANGELOG.md'
        );
        if (res.ok) {
            const md = await res.text();
            const body = document.getElementById('cl-body-content');
            if (body) body.innerHTML = TM.markdown.renderMarkdown(md);
        }
    } catch (_) {
        const body = document.getElementById('cl-body-content');
        if (body) body.innerHTML = '<em class="cl-loading">Changelog unavailable offline.</em>';
    }
}
