'use strict';

// =========================================================================
// Open Folder
// =========================================================================

async function openFolder() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.rootHandle = handle;
        state.currentDirHandle = handle;
        state.pathStack = [{ handle, name: handle.name }];
        state.currentFileHandle = null;
        state.currentFilename = '';
        clearEditor();
        const sidebarEl = document.getElementById('sidebar');
        sidebarEl.style.display = '';
        sidebarEl.classList.remove('collapsed');
        document.getElementById('resize-handle').style.display = '';
        await renderSidebar();
        updateURL();
        dismissResumePrompt();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Failed to open folder:', err);
        }
    }
}

// =========================================================================
// Sidebar / File Browser
// =========================================================================

async function renderSidebar() {
    const list = document.getElementById('file-list');
    if (!list || !state.currentDirHandle) return;

    list.innerHTML = '<li style="color:var(--color-text-secondary);padding:.3rem .75rem;font-size:.8rem">Loading…</li>';
    let entries;
    try {
        entries = await listDirectory(state.currentDirHandle);
    } catch (err) {
        list.innerHTML = `<li style="color:var(--color-accent-red);padding:.3rem .75rem;font-size:.8rem">Error: ${escapeHtml(err.message)}</li>`;
        return;
    }

    // Git filter: only show files/folders that have changes
    if (state.gitFilterActive && state.gitChangedPaths.size > 0) {
        const baseDirRelPath = state.pathStack.slice(1).map(p => p.name).join('/');
        entries = entries.filter(e => {
            const rp = baseDirRelPath ? baseDirRelPath + '/' + e.name : e.name;
            if (e.kind === 'directory') {
                return [...state.gitChangedPaths].some(p => p.startsWith(rp + '/'));
            }
            return state.gitChangedPaths.has(rp);
        });
    }

    if (!entries.length) {
        list.innerHTML = '<li style="color:var(--color-text-tertiary);padding:.3rem .75rem;font-size:.8rem;font-style:italic">Empty folder</li>';
        return;
    }

    list.innerHTML = '';
    const baseDirRelPath = state.pathStack.slice(1).map(p => p.name).join('/');
    for (const entry of entries) {
        const li = renderFileEntry(entry, state.currentDirHandle, baseDirRelPath);
        list.appendChild(li);
    }
}

function updateGitFilterBar() {
    const bar = document.getElementById('git-filter-bar');
    if (!bar) return;
    const count = state.gitChangedPaths.size;
    if (!state.gitAvailable || count === 0) {
        bar.style.display = 'none';
        if (state.gitFilterActive) {
            state.gitFilterActive = false;
        }
        return;
    }
    bar.style.display = '';
    const countEl = bar.querySelector('.git-change-count');
    if (countEl) countEl.textContent = count;
    const btn = bar.querySelector('#git-filter-btn');
    if (btn) btn.classList.toggle('active', state.gitFilterActive);
}

const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
const DELETE_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function renderFileEntry(entry, parentHandle, dirRelPath) {
    if (dirRelPath === undefined) dirRelPath = '';
    const li = document.createElement('li');
    li.className = 'file-entry';
    const _entryRelPath = dirRelPath ? dirRelPath + '/' + entry.name : entry.name;
    if (entry.kind === 'file' && _entryRelPath === state.currentRelativePath) {
        li.classList.add('active');
    }

    const icon = getFileIconSvg(entry.name, entry.kind);
    const deleteBtn = `<button class="delete-btn" title="Delete ${escapeHtml(entry.name)}" aria-label="Delete ${escapeHtml(entry.name)}">${DELETE_SVG}</button>`;

    if (entry.kind === 'directory') {
        const folderRelPath = dirRelPath ? dirRelPath + '/' + entry.name : entry.name;
        const hasDirChange = state.gitAvailable &&
            [...state.gitChangedPaths].some(p => p.startsWith(folderRelPath + '/'));
        const gitDot = hasDirChange
            ? '<span class="git-dot" aria-label="modified"></span>'
            : '';

        li.innerHTML = `<div class="file-entry-row">
            <button class="folder-toggle" aria-label="Toggle ${escapeHtml(entry.name)}">${CHEVRON_SVG}</button>
            <span class="icon">${icon}</span>
            <span class="name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
            ${gitDot}
            ${deleteBtn}
        </div>`;

        // Store dir handle on the li for getTargetDir()
        li._dirHandle = entry.handle;
        li._dirRelPath = folderRelPath;
        li._relPath = folderRelPath;

        li.querySelector('.file-entry-row').addEventListener('click', async (e) => {
            if (e.target.closest('.delete-btn')) return;
            await toggleFolder(li, entry.handle, folderRelPath);
        });


    } else {
        const unopenable = isUnopenable(entry);
        if (unopenable) li.classList.add('disabled');

        const reason = BINARY_EXTENSIONS.has(getExtension(entry.name))
            ? 'Binary file'
            : `Large file (${formatSize(entry.size)})`;
        const tooltip = unopenable
            ? `${escapeHtml(entry.name)} — ${reason}`
            : escapeHtml(entry.name);

        const fileRelPath = dirRelPath ? dirRelPath + '/' + entry.name : entry.name;
        const hasFileChange = state.gitAvailable && state.gitChangedPaths.has(fileRelPath);
        const gitDotFile = hasFileChange
            ? '<span class="git-dot" aria-label="modified"></span>'
            : '';

        li.innerHTML = `<div class="file-entry-row" title="${tooltip}">
            <span class="toggle-spacer"></span>
            <span class="icon">${icon}</span>
            <span class="name">${escapeHtml(entry.name)}</span>
            ${gitDotFile}
            ${deleteBtn}
        </div>`;

        if (!unopenable) {
            li._relPath = fileRelPath;
            li.querySelector('.file-entry-row').addEventListener('click', async (e) => {
                if (e.target.closest('.delete-btn')) return;
                state.currentRelativePath = fileRelPath;
                await openFile(entry.handle, entry.name, true, state.activePaneId);
            });
        }
    }

    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${entry.name}"?`)) return;
        const dirHandle = parentHandle || state.currentDirHandle;
        try {
            await dirHandle.removeEntry(entry.name, { recursive: true });
            const isDirectory = entry.kind === 'directory';
            await _resolveAfterDelete('pane1', entry.handle, li._relPath, isDirectory);
            if (state.splitMode) await _resolveAfterDelete('pane2', entry.handle, li._relPath, isDirectory);
            // Remove the entry from DOM directly if it's a nested entry
            if (parentHandle) {
                li.remove();
            } else {
                await renderSidebar();
            }
        } catch (err) {
            alert(`Failed to delete: ${err.message}`);
        }
    });

    return li;
}

async function _updateSameFileFlag() {
    if (!state.splitMode || !state.currentFileHandle || !state.pane2.currentFileHandle) {
        state._panesHaveSameFile = false;
        return;
    }
    state._panesHaveSameFile = await state.currentFileHandle.isSameEntry(state.pane2.currentFileHandle);
}

async function _resolveAfterDelete(paneId, deletedHandle, deletedRelPath, isDirectory) {
    const ps = getPaneState(paneId);

    // 1. Check whether this pane's current file is the one being deleted
    let currentAffected = false;
    if (isDirectory) {
        currentAffected = !!(ps.currentRelativePath && (
            ps.currentRelativePath === deletedRelPath ||
            ps.currentRelativePath.startsWith(deletedRelPath + '/')
        ));
    } else {
        try {
            currentAffected = !!(ps.currentFileHandle &&
                await deletedHandle.isSameEntry(ps.currentFileHandle));
        } catch (_) { /* handle may be invalid after deletion */ }
        if (!currentAffected && deletedRelPath) {
            currentAffected = ps.currentRelativePath === deletedRelPath;
        }
    }

    // 2. Prune all affected entries from history, adjusting the index
    const oldIdx = ps.fileHistoryIndex;
    let prunedAtOrBefore = 0;
    ps.fileHistory = ps.fileHistory.filter((e, i) => {
        const affected = isDirectory
            ? (e.relPath && (e.relPath === deletedRelPath || e.relPath.startsWith(deletedRelPath + '/')))
            : (e.relPath === deletedRelPath);
        if (affected && i <= oldIdx) prunedAtOrBefore++;
        return !affected;
    });
    ps.fileHistoryIndex = Math.min(
        Math.max(-1, oldIdx - prunedAtOrBefore),
        ps.fileHistory.length - 1
    );

    if (!currentAffected) return;   // this pane wasn't showing the deleted item

    // 3. Open the new current history entry, or clear / close split
    const newIdx = ps.fileHistoryIndex;
    if (newIdx >= 0 && ps.fileHistory.length > 0) {
        const { handle, name, relPath } = ps.fileHistory[newIdx];
        if (paneId === 'pane1') state.currentRelativePath = relPath ?? null;
        else ps.currentRelativePath = relPath ?? null;
        await openFile(handle, name, false, paneId);
    } else {
        if (paneId === 'pane2' && state.splitMode) {
            toggleSplitPane();   // nothing left in pane2 → close split
        } else {
            clearEditor();       // nothing left in pane1 → empty state
        }
    }
    updateNavButtons();
}

async function toggleFolder(li, handle, dirRelPath) {
    if (dirRelPath === undefined) dirRelPath = '';
    const isExpanded = li.classList.contains('expanded');
    if (isExpanded) {
        li.querySelector('.folder-children')?.remove();
        li.classList.remove('expanded');
        if (state.lastExpandedRelPath === dirRelPath) {
            const parts = dirRelPath.split('/');
            parts.pop();
            state.lastExpandedRelPath = parts.length > 0 ? parts.join('/') : null;
        }
        return;
    }

    li.classList.add('expanded');
    state.lastExpandedRelPath = dirRelPath;
    let entries;
    try {
        entries = await listDirectory(handle);
    } catch (err) {
        li.classList.remove('expanded');
        alert(`Failed to read folder: ${err.message}`);
        return;
    }

    const childUl = document.createElement('ul');
    childUl.className = 'folder-children';
    if (!entries.length) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'folder-empty-placeholder';
        emptyLi.style.cssText = 'color:var(--color-text-tertiary);padding:0.2rem 0.75rem;font-size:0.75rem;font-style:italic';
        emptyLi.textContent = 'Empty folder';
        childUl.appendChild(emptyLi);
    } else {
        for (const child of entries) {
            childUl.appendChild(renderFileEntry(child, handle, dirRelPath));
        }
    }
    li.appendChild(childUl);
}

function getFileIconSvg(name, kind) {
    if (kind === 'directory') {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    }
    const ext = getExtension(name);
    // Code files
    if (['js','ts','jsx','tsx','go','py','rb','rs','sh','bash','zsh'].includes(ext)) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    }
    // Image files
    if (['png','jpg','jpeg','gif','svg','webp','ico'].includes(ext)) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    }
    // Data files
    if (['json','yaml','yml','csv','xml','toml'].includes(ext)) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
    }
    // Markdown
    if (ext === 'md') {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    }
    // Generic file
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
}

// =========================================================================
// Smart Target Folder
// =========================================================================

function getTargetDir() {
    const expandedList = [...document.querySelectorAll('#file-list .file-entry.expanded')];

    // Prefer the most recently expanded folder (explicit user intent)
    if (state.lastExpandedRelPath) {
        const lastLi = expandedList.find(li => li._dirRelPath === state.lastExpandedRelPath);
        if (lastLi) {
            return { handle: lastLi._dirHandle, relPath: lastLi._dirRelPath, li: lastLi };
        }
        state.lastExpandedRelPath = null; // stale, clear it
    }

    // Fall back to parent folder of the active pane's current file
    const ps = getPaneState(state.activePaneId);
    if (ps.currentRelativePath) {
        const parts = ps.currentRelativePath.split('/');
        parts.pop(); // drop filename
        if (parts.length > 0) {
            const parentRelPath = parts.join('/');
            const parentLi = expandedList.find(li => li._dirRelPath === parentRelPath);
            if (parentLi) {
                return { handle: parentLi._dirHandle, relPath: parentLi._dirRelPath, li: parentLi };
            }
        }
    }

    return {
        handle: state.currentDirHandle,
        relPath: state.pathStack.slice(1).map(p => p.name).join('/'),
        li: null,
    };
}

async function refreshTargetFolder(li) {
    if (!li || !li._dirHandle) {
        await renderSidebar();
        return;
    }
    // Re-populate just the folder's children without full sidebar refresh
    const childUl = li.querySelector('.folder-children');
    if (!childUl) {
        // folder was collapsed — nothing to refresh
        return;
    }
    let entries;
    try {
        entries = await listDirectory(li._dirHandle);
    } catch (_err) {
        await renderSidebar();
        return;
    }
    childUl.innerHTML = '';
    if (!entries.length) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'folder-empty-placeholder';
        emptyLi.style.cssText = 'color:var(--color-text-tertiary);padding:0.2rem 0.75rem;font-size:0.75rem;font-style:italic';
        emptyLi.textContent = 'Empty folder';
        childUl.appendChild(emptyLi);
    } else {
        for (const child of entries) {
            childUl.appendChild(renderFileEntry(child, li._dirHandle, li._dirRelPath || ''));
        }
    }
}

// =========================================================================
// New File / Folder
// =========================================================================

function _insertInputRow(id, placeholder, iconKind, onCommit) {
    const existing = document.getElementById(id);
    if (existing) { existing.querySelector('input')?.focus(); return; }

    // Dismiss the sibling input type if open
    const otherId = id === 'new-file-input-wrap' ? 'new-folder-input-wrap' : 'new-file-input-wrap';
    document.getElementById(otherId)?.remove();

    const target = getTargetDir();

    const li = document.createElement('li');
    li.id = id;
    li.className = 'file-entry new-item-input-row';
    li.innerHTML = `<div class="file-entry-row">
        <span class="toggle-spacer"></span>
        <span class="icon">${getFileIconSvg(iconKind === 'file' ? '' : '_dir', iconKind)}</span>
        <input type="text" class="new-item-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
    </div>`;

    let emptyPlaceholder = null;
    if (target.li) {
        const childUl = target.li.querySelector('.folder-children');
        if (childUl) {
            emptyPlaceholder = childUl.querySelector('.folder-empty-placeholder');
            if (emptyPlaceholder) emptyPlaceholder.style.display = 'none';
            childUl.appendChild(li);
        } else {
            document.getElementById('file-list')?.prepend(li);
        }
    } else {
        document.getElementById('file-list')?.prepend(li);
    }

    const input = li.querySelector('input');
    input.focus();

    const _cancel = () => {
        li.remove();
        if (emptyPlaceholder) emptyPlaceholder.style.display = '';
    };

    // Dynamically update file icon as user types (file inputs only)
    if (iconKind === 'file') {
        input.addEventListener('input', () => {
            const iconEl = li.querySelector('.icon');
            if (iconEl) iconEl.innerHTML = getFileIconSvg(input.value, 'file');
        });
    }

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (!name) { _cancel(); return; }
            li.remove();
            await onCommit(name, target);
        } else if (e.key === 'Escape') {
            _cancel();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(_cancel, 150);
    });
}

function showNewFileInput() {
    _insertInputRow('new-file-input-wrap', 'filename.md', 'file', async (name, target) => {
        try {
            const targetRelPath = target.relPath;
            const dirs = targetRelPath ? [targetRelPath] : state.pathStack.slice(1).map(p => p.name);
            state.currentRelativePath = dirs.length && dirs[0] ? dirs.join('/') + '/' + name : name;
            const handle = await createFile(name, target.handle);
            await refreshTargetFolder(target.li);
            await openFile(handle, name, true, state.activePaneId);
        } catch (err) {
            alert(`Failed to create file: ${err.message}`);
        }
    });
}

function showNewFolderInput() {
    _insertInputRow('new-folder-input-wrap', 'folder-name', 'directory', async (name, target) => {
        try {
            await createFolder(name, target.handle);
            await refreshTargetFolder(target.li);
        } catch (err) {
            alert(`Failed to create folder: ${err.message}`);
        }
    });
}

// =========================================================================
// Sidebar Resize
// =========================================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
}

function initResizeHandle() {
    const handle = document.getElementById('resize-handle');
    const sidebar = document.getElementById('sidebar');
    if (!handle || !sidebar) return;

    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });

    // Compute the minimum drag width from actual rendered button sizes (font-size agnostic)
    function _toolbarMinWidth() {
        const toolbar = document.getElementById('sidebar-toolbar');
        if (!toolbar) return 240;
        const buttons = toolbar.querySelectorAll('.btn-icon');
        if (!buttons.length) return 240;
        const btnWidth = buttons[0].getBoundingClientRect().width;
        const style = getComputedStyle(toolbar);
        const gap = parseFloat(style.gap) || parseFloat(style.columnGap) || 4;
        const pl = parseFloat(style.paddingLeft) || 10;
        const pr = parseFloat(style.paddingRight) || 10;
        return Math.ceil(buttons.length * btnWidth + (buttons.length - 1) * gap + pl + pr) + 1; // +1 for sidebar border
    }

    document.addEventListener('mousemove', (e) => {
        if (!handle.classList.contains('dragging')) return;
        const newWidth = Math.max(_toolbarMinWidth(), Math.min(720, startWidth + (e.clientX - startX)));
        sidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (handle.classList.contains('dragging')) {
            handle.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });
}

// =========================================================================
// Search
// =========================================================================

function toggleSearch() {
    if (state.searchActive) {
        clearSearch();
    } else {
        state.searchActive = true;
        document.getElementById('search-panel').classList.remove('hidden');
        document.getElementById('search-btn').classList.add('active');
        document.getElementById('search-input').focus();
    }
}

function clearSearch() {
    state.searchActive = false;
    state.searchQuery = '';
    document.getElementById('search-panel').classList.add('hidden');
    document.getElementById('search-btn').classList.remove('active');
    document.getElementById('search-input').value = '';
    document.getElementById('search-content-toggle').checked = false;
    document.getElementById('search-exclude').value = '';
    renderSidebar();
}

async function performSearch(query, includeContent, excludePatterns) {
    state.searchQuery = query;
    if (!state.rootHandle || !query.trim()) {
        renderSidebar();
        return;
    }
    const list = document.getElementById('file-list');
    list.innerHTML = '<li class="search-status">Searching…</li>';

    const allFiles = await getAllFiles(state.rootHandle, '');

    const nameMatches = allFiles.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) &&
        !isUnopenable(f) &&
        !shouldExclude(f.relPath, f.name, excludePatterns)
    );

    let results = nameMatches;

    if (includeContent) {
        const contentHits = new Set();
        await Promise.all(allFiles.map(async (f) => {
            if (isUnopenable(f) || f.size > MAX_OPENABLE_SIZE) return;
            if (shouldExclude(f.relPath, f.name, excludePatterns)) return;
            try {
                const text = await (await f.handle.getFile()).text();
                if (text.toLowerCase().includes(query.toLowerCase())) {
                    contentHits.add(f.relPath);
                }
            } catch (_e) { /* ignore unreadable files */ }
        }));
        const nameHitPaths = new Set(nameMatches.map(r => r.relPath));
        const contentOnly = allFiles.filter(f =>
            contentHits.has(f.relPath) && !nameHitPaths.has(f.relPath) && !isUnopenable(f)
        );
        results = [...nameMatches, ...contentOnly];
        results.sort((a, b) => a.relPath.localeCompare(b.relPath));
    }

    renderSearchResults(results);
}

function renderSearchResults(results) {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    if (!results.length) {
        list.innerHTML = '<li class="search-status">No results</li>';
        return;
    }
    for (const result of results) {
        const li = document.createElement('li');
        li.className = 'file-entry search-result';
        const icon = getFileIconSvg(result.name, 'file');
        const dirPath = result.relPath.includes('/')
            ? result.relPath.substring(0, result.relPath.lastIndexOf('/'))
            : '';
        li.innerHTML = `<div class="file-entry-row">
            <div class="result-name-row">
                <span class="icon">${icon}</span>
                <span class="name">${escapeHtml(result.name)}</span>
            </div>
            ${dirPath ? `<div class="result-path">${escapeHtml(dirPath)}</div>` : ''}
        </div>`;
        li.addEventListener('click', async () => {
            state.currentRelativePath = result.relPath;
            await openFile(result.handle, result.name, true, state.activePaneId);
        });
        if (result.relPath === state.currentRelativePath) li.classList.add('active');
        list.appendChild(li);
    }
}
