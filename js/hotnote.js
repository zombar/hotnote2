// HotNote2 - Pure JS Notes App
'use strict';

// =========================================================================
// Constants
// =========================================================================

const DATASHEET_PAGE_SIZE = 50;
const DEFAULT_COLUMN_WIDTH = 150;
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx',
    'go', 'py', 'rb', 'rs', 'css', 'scss', 'html', 'htm', 'xml',
    'sh', 'bash', 'zsh', 'conf', 'ini', 'env', 'toml', 'cfg', 'sql',
    'graphql', 'proto', 'tf', 'hcl', 'log', 'csv',
]);

const _CODE_EXTENSIONS = new Set([
    'js', 'ts', 'jsx', 'tsx', 'go', 'py', 'rb', 'rs', 'css', 'scss',
    'html', 'htm', 'xml', 'sh', 'bash', 'zsh', 'yaml', 'yml',
    'toml', 'sql', 'graphql', 'proto', 'tf', 'hcl', 'conf', 'ini', 'cfg',
]);

const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif',
]);

const BINARY_EXTENSIONS = new Set([
    // Executables & compiled
    'exe', 'dll', 'so', 'dylib', 'bin', 'out', 'class', 'pyc', 'pyo', 'pyd',
    'o', 'a', 'lib', 'wasm', 'app',
    // Archives
    'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst', 'lz4', 'lzma',
    'pkg', 'deb', 'rpm', 'dmg', 'msi', 'apk', 'ipa',
    // Documents (binary)
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    // Fonts
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    // Audio
    'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'aiff',
    // Video
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'm4v', 'wmv', 'flv',
    // Database
    'sqlite', 'sqlite3', 'db',
]);

const MAX_OPENABLE_SIZE = 10 * 1024 * 1024; // 10 MB

// =========================================================================
// State
// =========================================================================

const state = {
    rootHandle: null,
    currentDirHandle: null,
    currentFileHandle: null,
    currentFilename: '',
    isDirty: false,
    editorMode: 'source', // 'source' | 'wysiwyg' | 'highlight' | 'datasheet' | 'treeview' | 'image'
    imageObjectUrl: null,
    scrollPositions: {},
    // JSON view state
    datasheetData: null,
    datasheetSchema: null,
    datasheetPage: 1,
    datasheetPageSize: DATASHEET_PAGE_SIZE,
    treeviewData: null,
    treeviewCollapsed: new Set(),
    // Navigation: [{handle, name}]
    pathStack: [],
    // File history for back/forward navigation
    fileHistory: [],       // [{handle, name}, …]
    fileHistoryIndex: -1,  // pointer into fileHistory; -1 = nothing open
    filePositionCache: {},  // keyed by relPath (or name); last-known pos per file
    // Autosave
    autosaveEnabled: false,
    autosaveTimer: null,
    // Relative path from root to current file (tracks subdirs opened via sidebar tree)
    currentRelativePath: null,
    currentLine: 1,
    currentChar: 1,
    // Split pane state
    splitMode: false,
    activePaneId: 'pane1',
    // Pane 2 state (pane 1 uses the flat state fields above)
    pane2: {
        currentFileHandle: null,
        currentFilename: '',
        isDirty: false,
        editorMode: 'source',
        imageObjectUrl: null,
        scrollPositions: {},
        datasheetData: null,
        datasheetSchema: null,
        datasheetPage: 1,
        datasheetPageSize: DATASHEET_PAGE_SIZE,
        treeviewData: null,
        treeviewCollapsed: new Set(),
        fileHistory: [],
        fileHistoryIndex: -1,
        filePositionCache: {},
        autosaveEnabled: false,
        autosaveTimer: null,
        currentRelativePath: null,
        currentLine: 1,
        currentChar: 1,
    },
};

const dragState = { handle: null, parentHandle: null };

// =========================================================================
// Pane Helpers
// =========================================================================

function getPaneEl(baseId, paneId) {
    return document.getElementById(paneId === 'pane1' ? baseId : baseId + '-p2');
}

function getPaneState(paneId) {
    return paneId === 'pane1' ? state : state.pane2;
}

// =========================================================================
// URL State Management
// =========================================================================

function getRelativeFilePath() {
    return state.currentRelativePath || null;
}

function updateURL() {
    if (!state.rootHandle) return;
    let qs = '?workdir=' + encodeURIComponent(state.rootHandle.name);
    const filePath = getRelativeFilePath();
    if (filePath) qs += '&file=' + filePath.split('/').map(encodeURIComponent).join('/');
    if (state.currentLine > 1) qs += '&line=' + state.currentLine;
    if (state.currentChar > 1) qs += '&char=' + state.currentChar;
    history.replaceState(null, '', qs);
    localStorage.setItem('hotnote2-lastFolder', state.rootHandle.name);
    if (filePath) localStorage.setItem('hotnote2-lastFile', filePath);
    else localStorage.removeItem('hotnote2-lastFile');
    if (state.currentLine > 1) localStorage.setItem('hotnote2-lastLine', state.currentLine);
    else localStorage.removeItem('hotnote2-lastLine');
    if (state.currentChar > 1) localStorage.setItem('hotnote2-lastChar', state.currentChar);
    else localStorage.removeItem('hotnote2-lastChar');
}

function clearURL() {
    history.replaceState(null, '', window.location.pathname);
}

function scrollEditorToPosition(lineNum, charNum) {
    const editor = document.getElementById('source-editor');
    if (!editor || lineNum <= 1) return;
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
        pos += lines[i].length + 1;
    }
    if (charNum > 1) {
        const lineLen = (lines[lineNum - 1] || '').length;
        pos += Math.min(charNum - 1, lineLen);
    }
    editor.selectionStart = editor.selectionEnd = pos;
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    editor.scrollTop = Math.max(0, (lineNum - 1) * lineHeight - editor.clientHeight / 2);
    state.currentLine = lineNum;
    state.currentChar = charNum || 1;
}


async function openFileByPath(rootHandle, relativePath, lineNum, charNum) {
    try {
        const parts = relativePath.split('/').filter(Boolean);
        const filename = parts.pop();
        let dir = rootHandle;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }
        const fileHandle = await dir.getFileHandle(filename);
        state.currentRelativePath = relativePath;
        await openFile(fileHandle, filename);
        if (lineNum && lineNum > 1) {
            scrollEditorToPosition(lineNum, charNum || 1);
            updateURL();
        }
    } catch (err) {
        console.warn('Could not restore file from URL:', relativePath, err);
    }
}

function showResumePrompt(folderName, filePath, lineNum, charNum) {
    const banner = document.getElementById('resume-prompt');
    if (!banner) return;
    banner.querySelector('.resume-folder-name').textContent = folderName;
    banner.dataset.file = filePath || '';
    banner.dataset.line = lineNum && lineNum > 1 ? String(lineNum) : '';
    banner.dataset.char = charNum && charNum > 1 ? String(charNum) : '';
    banner.style.display = '';
}

function dismissResumePrompt() {
    const banner = document.getElementById('resume-prompt');
    if (banner) banner.style.display = 'none';
}

// =========================================================================
// Utility
// =========================================================================

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function getExtension(filename) {
    const parts = filename.split('.');
    if (parts.length < 2) return '';
    return parts[parts.length - 1].toLowerCase();
}

function _isTextFile(filename) {
    const ext = getExtension(filename);
    const name = filename.toLowerCase();
    return TEXT_EXTENSIONS.has(ext) || name === 'dockerfile' || name === 'makefile' || name.startsWith('.');
}

function isImageFile(filename) {
    return IMAGE_EXTENSIONS.has(getExtension(filename));
}

function isUnopenable(entry) {
    if (entry.kind !== 'file') return false;
    if (IMAGE_EXTENSIONS.has(getExtension(entry.name))) return false; // images are viewable
    if (BINARY_EXTENSIONS.has(getExtension(entry.name))) return true;
    if (entry.size !== null && entry.size !== undefined && entry.size > MAX_OPENABLE_SIZE) return true;
    return false;
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =========================================================================
// File System Helpers
// =========================================================================

async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return file.text();
}

async function writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

async function listDirectory(dirHandle) {
    const dirs = [];
    const fileHandles = [];
    for await (const [name, handle] of dirHandle.entries()) {
        if (name.startsWith('.')) continue; // skip hidden
        if (handle.kind === 'directory') {
            dirs.push({ name, handle, kind: 'directory' });
        } else {
            fileHandles.push({ name, handle });
        }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch file sizes in parallel to determine openability
    const files = await Promise.all(fileHandles.map(async ({ name, handle }) => {
        let size = 0;
        try { size = (await handle.getFile()).size; } catch (_) { /* ignore */ }
        return { name, handle, kind: 'file', size };
    }));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files];
}

async function createFile(name, dirHandle) {
    const dh = dirHandle || state.currentDirHandle;
    if (!dh) return null;
    return dh.getFileHandle(name, { create: true });
}

async function createFolder(name, dirHandle) {
    const dh = dirHandle || state.currentDirHandle;
    if (!dh) return null;
    return dh.getDirectoryHandle(name, { create: true });
}

async function _deleteEntry(name) {
    if (!state.currentDirHandle) return;
    await state.currentDirHandle.removeEntry(name, { recursive: true });
}

async function copyDirInto(srcDir, destParent) {
    const newDir = await destParent.getDirectoryHandle(srcDir.name, { create: true });
    for await (const [, handle] of srcDir.entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const dh = await newDir.getFileHandle(handle.name, { create: true });
            const w = await dh.createWritable();
            await w.write(await file.arrayBuffer());
            await w.close();
        } else {
            await copyDirInto(handle, newDir);
        }
    }
}

async function moveEntry(sourceParentHandle, entryHandle, destDirHandle) {
    const name = entryHandle.name;
    try {
        if (entryHandle.kind === 'file') {
            const file = await entryHandle.getFile();
            const dh = await destDirHandle.getFileHandle(name, { create: true });
            const w = await dh.createWritable();
            await w.write(await file.arrayBuffer());
            await w.close();
        } else {
            await copyDirInto(entryHandle, destDirHandle);
        }
        await sourceParentHandle.removeEntry(name, { recursive: true });
        if (entryHandle === state.currentFileHandle) clearEditor();
        await renderSidebar();
    } catch (err) {
        alert(`Failed to move: ${err.message}`);
    }
}

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

const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
const DELETE_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function renderFileEntry(entry, parentHandle, dirRelPath) {
    if (dirRelPath === undefined) dirRelPath = '';
    const li = document.createElement('li');
    li.className = 'file-entry';
    if (entry.kind === 'file' && entry.name === state.currentFilename) {
        li.classList.add('active');
    }

    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => {
        dragState.handle = entry.handle;
        dragState.parentHandle = parentHandle;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', entry.name);
        requestAnimationFrame(() => li.classList.add('dragging'));
    });
    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.getElementById('file-list')?.classList.remove('drag-over-list');
    });

    const icon = getFileIconSvg(entry.name, entry.kind);
    const deleteBtn = `<button class="delete-btn" title="Delete ${escapeHtml(entry.name)}" aria-label="Delete ${escapeHtml(entry.name)}">${DELETE_SVG}</button>`;

    if (entry.kind === 'directory') {
        li.innerHTML = `<div class="file-entry-row">
            <button class="folder-toggle" aria-label="Toggle ${escapeHtml(entry.name)}">${CHEVRON_SVG}</button>
            <span class="icon">${icon}</span>
            <span class="name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
            ${deleteBtn}
        </div>`;

        const folderRelPath = dirRelPath ? dirRelPath + '/' + entry.name : entry.name;
        // Store dir handle on the li for getTargetDir()
        li._dirHandle = entry.handle;
        li._dirRelPath = folderRelPath;

        li.querySelector('.file-entry-row').addEventListener('click', async (e) => {
            if (e.target.closest('.delete-btn')) return;
            await toggleFolder(li, entry.handle, folderRelPath);
        });

        li.addEventListener('dragover', (e) => {
            if (!dragState.handle || dragState.handle === entry.handle) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', (e) => {
            if (!li.contains(e.relatedTarget)) li.classList.remove('drag-over');
        });
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            li.classList.remove('drag-over');
            if (!dragState.handle || dragState.handle === entry.handle) return;
            const { handle, parentHandle: srcParent } = dragState;
            dragState.handle = null;
            dragState.parentHandle = null;
            await moveEntry(srcParent, handle, entry.handle);
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

        li.innerHTML = `<div class="file-entry-row" title="${tooltip}">
            <span class="toggle-spacer"></span>
            <span class="icon">${icon}</span>
            <span class="name">${escapeHtml(entry.name)}</span>
            ${deleteBtn}
        </div>`;

        if (!unopenable) {
            const fileRelPath = dirRelPath ? dirRelPath + '/' + entry.name : entry.name;
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
            if (entry.kind === 'file' && entry.name === state.currentFilename) {
                clearEditor();
            }
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

async function toggleFolder(li, handle, dirRelPath) {
    if (dirRelPath === undefined) dirRelPath = '';
    const isExpanded = li.classList.contains('expanded');
    if (isExpanded) {
        li.querySelector('.folder-children')?.remove();
        li.classList.remove('expanded');
        return;
    }

    li.classList.add('expanded');
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
    const expanded = [...document.querySelectorAll('#file-list .file-entry.expanded')];
    if (expanded.length) {
        const last = expanded[expanded.length - 1];
        if (last._dirHandle) {
            return { handle: last._dirHandle, relPath: last._dirRelPath || '', li: last };
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

function showNewFileInput() {
    const existing = document.getElementById('new-file-input-wrap');
    if (existing) { existing.querySelector('input')?.focus(); return; }

    const target = getTargetDir();

    const wrap = document.createElement('div');
    wrap.id = 'new-file-input-wrap';
    wrap.className = 'new-file-input-wrap';

    const hintText = target.li ? `in: ${target.li.querySelector('.name')?.textContent || target.relPath}` : '';
    wrap.innerHTML = `<input type="text" placeholder="filename.md" autocomplete="off">${hintText ? `<span class="input-target-hint">${escapeHtml(hintText)}</span>` : ''}`;

    const toolbar = document.getElementById('sidebar-toolbar');
    toolbar.insertAdjacentElement('afterend', wrap);

    const input = wrap.querySelector('input');
    input.focus();

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (!name) { wrap.remove(); return; }
            wrap.remove();
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
        } else if (e.key === 'Escape') {
            wrap.remove();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => wrap.remove(), 150);
    });
}

function showNewFolderInput() {
    const existing = document.getElementById('new-folder-input-wrap');
    if (existing) { existing.querySelector('input')?.focus(); return; }

    const target = getTargetDir();

    const wrap = document.createElement('div');
    wrap.id = 'new-folder-input-wrap';
    wrap.className = 'new-folder-input-wrap';

    const hintText = target.li ? `in: ${target.li.querySelector('.name')?.textContent || target.relPath}` : '';
    wrap.innerHTML = `<input type="text" placeholder="folder-name" autocomplete="off">${hintText ? `<span class="input-target-hint">${escapeHtml(hintText)}</span>` : ''}`;

    const toolbar = document.getElementById('sidebar-toolbar');
    toolbar.insertAdjacentElement('afterend', wrap);

    const input = wrap.querySelector('input');
    input.focus();

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (!name) { wrap.remove(); return; }
            wrap.remove();
            try {
                await createFolder(name, target.handle);
                await refreshTargetFolder(target.li);
            } catch (err) {
                alert(`Failed to create folder: ${err.message}`);
            }
        } else if (e.key === 'Escape') {
            wrap.remove();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => wrap.remove(), 150);
    });
}

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
                ps.filePositionCache[current.relPath || current.name] = current.pos;
            }
            ps.fileHistory = ps.fileHistory.slice(0, ps.fileHistoryIndex + 1);
            const relPath = paneId === 'pane1' ? state.currentRelativePath : ps.currentRelativePath;
            ps.fileHistory.push({ handle: fileHandle, name: filename, relPath });
            ps.fileHistoryIndex = ps.fileHistory.length - 1;
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

    // Update sidebar active state
    document.querySelectorAll('.file-entry').forEach(li => {
        li.classList.toggle('active', li.querySelector('.name')?.textContent === filename);
    });

    // Restore cached positions if this file was visited before
    const _cacheKey = (paneId === 'pane1' ? state.currentRelativePath : ps.currentRelativePath) || filename;
    const _cachedPos = pushHistory ? (ps.filePositionCache[_cacheKey] || null) : null;
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
        } catch (err) {
            alert(`Failed to read image: ${err.message}`);
            return;
        }
    } else {
        try {
            content = await readFile(fileHandle);
        } catch (err) {
            alert(`Failed to read file: ${err.message}`);
            return;
        }
    }

    const ext = getExtension(filename);

    // In split mode: when opening in pane1, force source mode and mirror preview to pane2
    if (state.splitMode && paneId === 'pane1') {
        const isImage = IMAGE_EXTENSIONS.has(ext);
        const isPreviewable = ['md', 'json', 'csv'].includes(ext) || isImage;
        determineInitialMode(ext, content, ps);
        if (isPreviewable) {
            if (!isImage) {
                // Force pane1 to source for text-based previewable files
                ps.editorMode = 'source';
            }
            renderEditor(content, filename, 'pane1');
            // Mirror same file to pane2 in preview mode
            state.pane2.currentFileHandle = fileHandle;
            state.pane2.currentFilename = filename;
            state.pane2.currentRelativePath = state.currentRelativePath;
            if (isImage) state.pane2.imageObjectUrl = ps.imageObjectUrl;
            determineInitialMode(ext, content, state.pane2);
            // markdown: determineInitialMode leaves mode as 'source'; force wysiwyg
            if (ext === 'md') state.pane2.editorMode = 'wysiwyg';
            renderEditor(content, filename, 'pane2');
        } else {
            renderEditor(content, filename, 'pane1');
        }
    } else {
        determineInitialMode(ext, content, ps);
        renderEditor(content, filename, paneId);
    }

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
        ps.filePositionCache[curEntry.relPath || curEntry.name] = curEntry.pos;
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

    // Set textarea content
    const textarea = getPaneEl('source-editor', paneId);
    if (textarea) textarea.value = content;

    updateModeToolbar(paneId);
    switchToMode(ps.editorMode, paneId, content);
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
    modeToolbar.innerHTML = `
        <button class="btn btn-sm${ps.editorMode === 'source' ? ' active' : ''}" id="mode-source${sfx}">Source</button>
        ${isMd ? `<button class="btn btn-sm${ps.editorMode === 'wysiwyg' ? ' active' : ''}" id="mode-wysiwyg${sfx}">Preview</button>` : ''}
        ${hasDatasheet ? `<button class="btn btn-sm${ps.editorMode === 'datasheet' ? ' active' : ''}" id="mode-datasheet${sfx}">Table</button>` : ''}
        ${hasTree ? `<button class="btn btn-sm${ps.editorMode === 'treeview' ? ' active' : ''}" id="mode-treeview${sfx}">Tree</button>` : ''}
        <span id="filename-display${sfx}" class="filename-display">${escapeHtml(ps.currentFilename)}</span>
    `;

    document.getElementById(`mode-source${sfx}`)?.addEventListener('click', () => switchToMode('source', paneId));
    document.getElementById(`mode-wysiwyg${sfx}`)?.addEventListener('click', () => switchToMode('wysiwyg', paneId));
    document.getElementById(`mode-datasheet${sfx}`)?.addEventListener('click', () => switchToMode('datasheet', paneId));
    document.getElementById(`mode-treeview${sfx}`)?.addEventListener('click', () => switchToMode('treeview', paneId));
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

// =========================================================================
// Syntax Highlighting
// =========================================================================

function getCodeLang(pre) {
    const md = pre.getAttribute('data-md') || '';
    const match = md.match(/^```(\w+)/);
    return match ? match[1].toLowerCase() : '';
}

function getHighlightRules(lang) {
    const comment = (pattern) => ({ regex: pattern, type: 'comment' });
    const str = (pattern) => ({ regex: pattern, type: 'string' });
    const num = { regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/y, type: 'number' };
    const op = { regex: /[+\-*/%&|^~<>!=?:;,.()[\]{}]+/y, type: 'operator' };

    switch (lang) {
        case 'js': case 'javascript': case 'ts': case 'typescript': case 'jsx': case 'tsx':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/`(?:[^`\\]|\\.)*`/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await)\b/y, type: 'keyword' },
                { regex: /\b(Array|Boolean|Date|Error|Function|Map|Number|Object|Promise|RegExp|Set|String|Symbol|WeakMap|WeakSet|JSON|Math|console|document|window|undefined|null|true|false|NaN|Infinity)\b/y, type: 'type' },
                num, op,
            ];
        case 'go':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/`(?:[^`])*`/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/y, type: 'keyword' },
                { regex: /\b(bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr|true|false|nil|iota|append|cap|close|copy|delete|len|make|new|panic|print|println|recover)\b/y, type: 'type' },
                num, op,
            ];
        case 'py': case 'python':
            return [
                comment(/#[^\n]*/y),
                str(/"""[\s\S]*?"""/y),
                str(/'''[\s\S]*?'''/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/y, type: 'keyword' },
                { regex: /\b(True|False|None|int|float|str|list|dict|set|tuple|bool|type|object|super|print|len|range|enumerate|zip|map|filter|sorted|reversed|open|input)\b/y, type: 'builtin' },
                num, op,
            ];
        case 'rs': case 'rust':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                { regex: /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/y, type: 'keyword' },
                { regex: /\b(bool|char|f32|f64|i8|i16|i32|i64|i128|isize|str|u8|u16|u32|u64|u128|usize|String|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet)\b/y, type: 'type' },
                num, op,
            ];
        case 'sh': case 'bash': case 'shell': case 'zsh':
            return [
                comment(/#[^\n]*/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'[^']*'/y),
                { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|export|source|local|readonly|shift|unset|set|trap)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'json':
            return [
                str(/"(?:[^"\\]|\\.)*"/y),
                { regex: /\b(true|false|null)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'css':
            return [
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(important|auto|none|inherit|initial|unset|normal|bold|italic|solid|dashed|dotted|left|right|center|top|bottom|flex|grid|block|inline|absolute|relative|fixed|sticky|hidden|visible)\b/y, type: 'keyword' },
                { regex: /\b\d+(\.\d+)?(px|em|rem|vh|vw|%|pt|cm|mm|s|ms)?\b/y, type: 'number' },
                { regex: /#[0-9a-fA-F]{3,6}\b/y, type: 'string' },
                op,
            ];
        case 'html': case 'xml':
            return [
                comment(/<!--[\s\S]*?-->/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /<\/?[a-zA-Z][a-zA-Z0-9-]*/y, type: 'keyword' },
                op,
            ];
        case 'yaml': case 'yml':
            return [
                comment(/#[^\n]*/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'[^']*'/y),
                { regex: /\b(true|false|null|yes|no|on|off)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'md': case 'markdown':
            return [
                // Fenced code blocks
                { regex: /```[\s\S]*?```/y, type: 'comment' },
                // Inline code
                str(/`[^`\n]+`/y),
                // Headers
                { regex: /^#{1,6} [^\n]*/my, type: 'keyword' },
                // Blockquotes
                { regex: /^> [^\n]*/my, type: 'comment' },
                // Bold
                { regex: /\*\*[^*\n]+\*\*/y, type: 'type' },
                { regex: /__[^_\n]+__/y, type: 'type' },
                // Italic
                { regex: /\*[^*\n]+\*/y, type: 'string' },
                { regex: /_[^_\n]+_/y, type: 'string' },
                // Links and images
                { regex: /!?\[[^\]\n]*\]\([^)\n]*\)/y, type: 'builtin' },
                // List markers
                { regex: /^[-*+] /my, type: 'operator' },
                { regex: /^\d+\. /my, type: 'number' },
                // Horizontal rules
                { regex: /^[-*]{3,}$/my, type: 'operator' },
            ];
        default:
            return [
                comment(/\/\/[^\n]*/y),
                comment(/#[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                num, op,
            ];
    }
}

function tokenize(code, rules) {
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
        let matched = false;
        for (const rule of rules) {
            rule.regex.lastIndex = i;
            const m = rule.regex.exec(code);
            if (m && m.index === i) {
                tokens.push({ type: rule.type, value: m[0] });
                i += m[0].length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            const last = tokens[tokens.length - 1];
            if (last && last.type === 'plain') {
                last.value += code[i];
            } else {
                tokens.push({ type: 'plain', value: code[i] });
            }
            i++;
        }
    }
    return tokens;
}

function highlightCode(text, lang) {
    const rules = getHighlightRules(lang);
    const tokens = tokenize(text, rules);
    return tokens.map(t => {
        const escaped = t.value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (t.type === 'plain') return escaped;
        return `<span class="tok-${t.type}">${escaped}</span>`;
    }).join('');
}

function applySyntaxHighlighting(container) {
    container.querySelectorAll('pre > code').forEach(code => {
        try {
            const pre = code.parentElement;
            const lang = getCodeLang(pre);
            const text = code.textContent;
            code.innerHTML = highlightCode(text, lang);
        } catch (e) {
            console.error('Syntax highlight error:', e);
        }
    });
}

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

function updateSourceHighlight(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const codeEl = getPaneEl('source-highlight-code', paneId);
    if (!codeEl) return;
    const textarea = getPaneEl('source-editor', paneId);
    if (!textarea) return;
    const content = textarea.value;
    const lang = getExtension(ps.currentFilename);

    // Trailing newline prevents last-line clipping
    codeEl.innerHTML = highlightCode(content + '\n', lang);

    // Update line numbers
    const lineNumEl = getPaneEl('line-numbers', paneId);
    if (lineNumEl) {
        const lineCount = (content.match(/\n/g) || []).length + 1;
        lineNumEl.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
    }
}

function _scrollElForMode(mode, paneId = 'pane1') {
    if (mode === 'source') return getPaneEl('source-editor', paneId);
    if (mode === 'wysiwyg') return getPaneEl('wysiwyg', paneId);
    if (mode === 'treeview') return getPaneEl('s3-treeview', paneId);
    if (mode === 'datasheet') return getPaneEl('s3-datasheet', paneId);
    if (mode === 'image') return getPaneEl('image-viewer', paneId);
    return null;
}

function switchToMode(mode, paneId = 'pane1', content) {
    const ps = getPaneState(paneId);

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

    // Hide all panels
    if (wrap) wrap.style.display = 'none';
    if (wysiwyg) wysiwyg.style.display = 'none';
    if (datasheet) datasheet.style.display = 'none';
    if (treeview) treeview.style.display = 'none';
    if (imageViewer) imageViewer.style.display = 'none';

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

                // Wire up link clicks for this wysiwyg element (pane2 needs its own listener)
                if (paneId === 'pane2') {
                    wysiwyg.addEventListener('click', (e) => {
                        const link = e.target.closest('a[href]');
                        if (!link) return;
                        e.preventDefault();
                        const href = link.getAttribute('href');
                        if (href && href !== '#') {
                            window.open(href, '_blank', 'noopener,noreferrer');
                        }
                    }, { once: false });
                }
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

function clearEditor() {
    state.currentFileHandle = null;
    state.currentFilename = '';
    state.isDirty = false;
    state.editorMode = 'source';
    updateTitle();

    const wrap = document.getElementById('source-editor-wrap');
    const textarea = document.getElementById('source-editor');
    const wysiwyg = document.getElementById('wysiwyg');
    const datasheet = document.getElementById('s3-datasheet');
    const treeview = document.getElementById('s3-treeview');
    const toolbar = document.getElementById('mode-toolbar');

    if (wrap) wrap.style.display = 'none';
    if (textarea) textarea.value = '';
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
            No backend. No build step. Files stay on your machine.</p>
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
        </details>`;

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
        ps.isDirty = false;
        if (pid === 'pane1') {
            updateTitle();
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn) { saveBtn.classList.remove('dirty'); saveBtn.disabled = true; }
        }
        if (silent) animateAutosaveLabel();
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

// =========================================================================
// Split Pane
// =========================================================================

let _splitResizeInit = false;

function toggleSplitPane() {
    const btn = document.getElementById('split-pane-btn');
    if (state.splitMode) {
        // Close split pane
        state.splitMode = false;
        const pane2El = document.getElementById('pane2');
        const splitHandle = document.getElementById('split-resize-handle');
        if (pane2El) pane2El.style.display = 'none';
        if (splitHandle) splitHandle.style.display = 'none';
        if (btn) btn.classList.remove('active');
        // Reset pane2 state
        state.pane2.currentFileHandle = null;
        state.pane2.currentFilename = '';
        state.pane2.isDirty = false;
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

    document.addEventListener('mousemove', (e) => {
        if (!handle.classList.contains('dragging')) return;
        const minWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 288;
        const newWidth = Math.max(minWidth, Math.min(720, startWidth + (e.clientX - startX)));
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
// JSON detection (from tunnelmesh s3explorer)
// =========================================================================

function _shouldUseWysiwygMode(ext, content) {
    if (ext !== 'md') return false;
    if (!content || content.trim().length === 0) return false;
    return true;
}

function detectJsonType(content) {
    try {
        const parsed = JSON.parse(content);
        return {
            isObject: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
            isArray: Array.isArray(parsed),
            parsed,
        };
    } catch (_e) {
        return { isObject: false, isArray: false, parsed: null };
    }
}

function detectDatasheetMode(content) {
    try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) return { isDatasheet: false, data: null };
        if (parsed.length === 0) return { isDatasheet: false, data: null };
        const allObjects = parsed.every(
            (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
        );
        if (!allObjects) return { isDatasheet: false, data: null };
        return { isDatasheet: true, data: parsed };
    } catch (_e) {
        return { isDatasheet: false, data: null };
    }
}

function parseCSV(content) {
    const rows = [];
    let i = 0;
    const n = content.length;

    while (i < n) {
        const row = [];
        while (i < n) {
            if (content[i] === '"') {
                i++;
                let field = '';
                while (i < n) {
                    if (content[i] === '"') {
                        if (i + 1 < n && content[i + 1] === '"') { field += '"'; i += 2; }
                        else { i++; break; }
                    } else { field += content[i++]; }
                }
                row.push(field);
            } else {
                let field = '';
                while (i < n && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') {
                    field += content[i++];
                }
                row.push(field.trim());
            }
            if (i < n && content[i] === ',') { i++; continue; }
            break;
        }
        if (i < n && content[i] === '\r') i++;
        if (i < n && content[i] === '\n') i++;
        if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
    }

    if (rows.length < 2) return { isDatasheet: false, data: null };

    const headers = rows[0];
    const data = rows.slice(1).map((row) => {
        const obj = {};
        headers.forEach((h, idx) => {
            const val = row[idx] ?? '';
            obj[h] = val !== '' && val.trim() !== '' && !isNaN(val) ? Number(val) : val;
        });
        return obj;
    });

    return { isDatasheet: true, data };
}

function inferSchema(data) {
    if (!data || data.length === 0) return { columns: [] };

    const allKeys = new Set();
    data.forEach((obj) => Object.keys(obj).forEach((k) => allKeys.add(k)));

    const columns = Array.from(allKeys).map((key) => {
        const values = data.map((obj) => obj[key]).filter((v) => v !== null && v !== undefined);
        let type = 'string';

        if (values.length > 0) {
            if (values.every((v) => typeof v === 'number')) type = 'number';
            else if (values.every((v) => typeof v === 'boolean')) type = 'boolean';
            else if (values.every((v) => Array.isArray(v))) type = 'nested-array';
            else if (values.every((v) => typeof v === 'object' && !Array.isArray(v))) type = 'nested-object';
            else if (values.every((v) => typeof v === 'string' && /^https?:\/\//.test(v))) type = 'url';
            else if (values.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))) type = 'date';
        }

        return { key, type, width: DEFAULT_COLUMN_WIDTH };
    });

    return { columns };
}

function renderCell(value, type, rowIdx, colKey) {
    if (value === null || value === undefined) {
        return '<span class="s3-ds-null">null</span>';
    }

    switch (type) {
        case 'number':
            return `<span class="s3-ds-number">${value.toLocaleString()}</span>`;
        case 'boolean':
            return value
                ? '<span class="s3-ds-badge s3-ds-badge-true">true</span>'
                : '<span class="s3-ds-badge s3-ds-badge-false">false</span>';
        case 'date':
            return new Date(value).toLocaleString();
        case 'url':
            return `<a href="${encodeURI(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
        case 'nested-array':
            return `<span class="s3-ds-nested" data-row-idx="${rowIdx}" data-col-key="${escapeHtml(colKey)}" title="Click to view">
                <span class="s3-ds-nested-text">${Array.isArray(value) ? value.length : 0} items</span></span>`;
        case 'nested-object':
            return `<span class="s3-ds-nested" data-row-idx="${rowIdx}" data-col-key="${escapeHtml(colKey)}" title="Click to view">
                <span class="s3-ds-nested-text">{…}</span></span>`;
        default:
            return escapeHtml(String(value));
    }
}

function calculateDatasheetPageSize() {
    const container = document.getElementById('s3-datasheet-container');
    if (!container) return DATASHEET_PAGE_SIZE;
    const available = container.clientHeight - 40;
    return Math.max(DATASHEET_PAGE_SIZE, Math.floor(available / 36));
}

function _renderDatasheet(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const container = getPaneEl('s3-datasheet', paneId);
    if (!container || !ps.datasheetData || !ps.datasheetSchema) return;

    ps.datasheetPageSize = calculateDatasheetPageSize();
    const { datasheetData: data, datasheetSchema: schema, datasheetPage: page, datasheetPageSize: pageSize } = ps;

    const totalRows = data.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const startRow = (page - 1) * pageSize;
    const endRow = Math.min(startRow + pageSize, totalRows);
    const visibleRows = data.slice(startRow, endRow);

    const sfx = paneId === 'pane2' ? '-p2' : '';
    container.innerHTML = `
        <div class="s3-datasheet-toolbar">
            <span class="s3-datasheet-info">
                <span><b id="s3-ds-row-count${sfx}">${totalRows}</b> rows</span>
                <span><b id="s3-ds-col-count${sfx}">${schema.columns.length}</b> cols</span>
            </span>
            <span>Page <b id="s3-ds-page-current${sfx}">${page}</b> / <b id="s3-ds-page-total${sfx}">${totalPages}</b></span>
        </div>
        <div class="s3-datasheet-container" id="s3-datasheet-container${sfx}">
            <table class="s3-datasheet-table" id="s3-datasheet-table${sfx}">
                <thead id="s3-ds-thead${sfx}"></thead>
                <tbody id="s3-ds-tbody${sfx}"></tbody>
                <tfoot id="s3-ds-tfoot${sfx}"></tfoot>
            </table>
        </div>
        <div class="s3-datasheet-pagination">
            <button class="btn btn-sm" id="s3-ds-prev${sfx}" ${page === 1 ? 'disabled' : ''}>← Prev</button>
            <span>${startRow + 1}–${endRow} of ${totalRows}</span>
            <button class="btn btn-sm" id="s3-ds-next${sfx}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
        </div>
    `;

    // Render header
    const thead = document.getElementById(`s3-ds-thead${sfx}`);
    const headerRow = document.createElement('tr');
    schema.columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col.key;
        th.title = `Type: ${col.type}`;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Render body
    const tbody = document.getElementById(`s3-ds-tbody${sfx}`);
    visibleRows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const actualRowIdx = startRow + idx;
        schema.columns.forEach((col) => {
            const td = document.createElement('td');
            td.innerHTML = renderCell(row[col.key], col.type, actualRowIdx, col.key);
            td.className = `s3-ds-cell s3-ds-type-${col.type}`;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    // Render aggregations
    renderAggregations(paneId);

    // Pagination buttons
    document.getElementById(`s3-ds-prev${sfx}`)?.addEventListener('click', () => {
        if (ps.datasheetPage > 1) { ps.datasheetPage--; _renderDatasheet(paneId); }
    });
    document.getElementById(`s3-ds-next${sfx}`)?.addEventListener('click', () => {
        if (ps.datasheetPage < totalPages) { ps.datasheetPage++; _renderDatasheet(paneId); }
    });

    // Nested cell click handlers
    container.querySelectorAll('.s3-ds-nested').forEach(el => {
        el.addEventListener('click', () => {
            const rowIdx = parseInt(el.dataset.rowIdx, 10);
            const colKey = el.dataset.colKey;
            openNestedModal(rowIdx, colKey, paneId);
        });
    });
}

function renderAggregations(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const sfx = paneId === 'pane2' ? '-p2' : '';
    const tfoot = document.getElementById(`s3-ds-tfoot${sfx}`);
    if (!tfoot || !ps.datasheetData || !ps.datasheetSchema) return;

    const { datasheetData: data, datasheetSchema: schema } = ps;
    const tr = document.createElement('tr');
    tr.className = 's3-ds-agg-row';

    schema.columns.forEach((col) => {
        const td = document.createElement('td');
        td.className = 's3-ds-agg-cell';

        if (col.type === 'number') {
            const values = data.map((row) => row[col.key]).filter((v) => typeof v === 'number');
            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                const avg = sum / values.length;
                td.innerHTML = `
                    <div class="s3-ds-agg">
                        <span title="Sum">Σ ${sum.toLocaleString()}</span>
                        <span title="Average">μ ${parseFloat(avg.toFixed(2)).toLocaleString()}</span>
                        <span title="Count">n=${values.length}</span>
                    </div>`;
            }
        }

        tr.appendChild(td);
    });

    tfoot.innerHTML = '';
    tfoot.appendChild(tr);
}

// =========================================================================
// Tree View (from tunnelmesh s3explorer)
// =========================================================================

function renderTreeView(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const container = getPaneEl('s3-treeview', paneId);
    if (!container || !ps.treeviewData) return;
    container.innerHTML = renderTreeNode(ps.treeviewData, '', 'root', paneId);

    // Attach toggle handlers
    container.querySelectorAll('.tree-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTreeNode(el.dataset.treePath, paneId);
        });
    });
}

function _getValueAtPath(root, path) {
    // path is like 'root.key[0].subkey'
    // Strip 'root.' prefix
    const clean = path.replace(/^root\.?/, '');
    if (!clean) return root;

    const parts = clean.split(/\.|\[|\]/).filter(Boolean);
    let current = root;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

function renderTreeNode(value, path, key, paneId = 'pane1') {
    const ps = getPaneState(paneId);
    const fullPath = path ? `${path}.${key}` : key;
    const isCollapsed = ps.treeviewCollapsed.has(fullPath);

    if (value === null) {
        return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-null">null</span></div>`;
    }
    if (value === undefined) {
        return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-undefined">undefined</span></div>`;
    }

    const type = typeof value;

    if (type === 'boolean') {
        return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-boolean">${value}</span></div>`;
    }
    if (type === 'number') {
        return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-number">${value}</span></div>`;
    }
    if (type === 'string') {
        return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-string">"${escapeHtml(value)}"</span></div>`;
    }

    if (Array.isArray(value)) {
        const toggleIcon = isCollapsed ? '▶' : '▼';

        let html = `<div class="tree-item tree-expandable">
            <span class="tree-toggle" data-tree-path="${escapeHtml(fullPath)}">${toggleIcon}</span>
            <span class="tree-key">${escapeHtml(String(key))}:</span>
            <span class="tree-bracket">[</span><span class="tree-count">${value.length} items</span><span class="tree-bracket">]</span>`;

        html += '</div>';

        if (!isCollapsed) {
            html += '<div class="tree-children">';
            value.forEach((item, index) => {
                html += renderTreeNode(item, fullPath, `[${index}]`, paneId);
            });
            html += '</div>';
        }
        return html;
    }

    if (type === 'object') {
        const toggleIcon = isCollapsed ? '▶' : '▼';
        const keys = Object.keys(value);

        let html = `<div class="tree-item tree-expandable">
            <span class="tree-toggle" data-tree-path="${escapeHtml(fullPath)}">${toggleIcon}</span>
            <span class="tree-key">${escapeHtml(String(key))}:</span>
            <span class="tree-bracket">{</span><span class="tree-count">${keys.length} keys</span><span class="tree-bracket">}</span>
        </div>`;

        if (!isCollapsed) {
            html += '<div class="tree-children">';
            keys.forEach((k) => { html += renderTreeNode(value[k], fullPath, k, paneId); });
            html += '</div>';
        }
        return html;
    }

    return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-unknown">${escapeHtml(String(value))}</span></div>`;
}

function toggleTreeNode(path, paneId = 'pane1') {
    const ps = getPaneState(paneId);
    if (ps.treeviewCollapsed.has(path)) {
        ps.treeviewCollapsed.delete(path);
    } else {
        ps.treeviewCollapsed.add(path);
    }
    renderTreeView(paneId);
}

// =========================================================================
// Nested Data Modal
// =========================================================================

function openNestedModal(rowIdx, colKey, paneId = 'pane1') {
    const ps = getPaneState(paneId);
    if (!ps.datasheetData) return;
    const row = ps.datasheetData[rowIdx];
    if (!row || !(colKey in row)) return;

    const value = row[colKey];
    const modal = document.getElementById('nested-modal');
    const body = document.getElementById('nested-body');
    const title = document.getElementById('nested-title');

    if (!modal || !body) return;
    if (title) title.textContent = `${colKey} [Row ${rowIdx + 1}]`;

    if (Array.isArray(value) && value.length > 0) {
        const detect = detectDatasheetMode(JSON.stringify(value));
        if (detect.isDatasheet) {
            const schema = inferSchema(value);
            let html = '<table class="s3-datasheet-table"><thead><tr>';
            schema.columns.forEach((col) => { html += `<th>${escapeHtml(col.key)}</th>`; });
            html += '</tr></thead><tbody>';
            value.forEach((r, idx) => {
                html += '<tr>';
                schema.columns.forEach((col) => { html += `<td>${renderCell(r[col.key], col.type, idx, col.key)}</td>`; });
                html += '</tr>';
            });
            html += '</tbody></table>';
            body.innerHTML = html;
        } else {
            body.innerHTML = `<pre class="s3-nested-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
    } else {
        body.innerHTML = `<pre class="s3-nested-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }

    modal.classList.add('open');
}

function closeNestedModal() {
    const modal = document.getElementById('nested-modal');
    if (modal) modal.classList.remove('open');
}

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
// Init
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Theme
    initTheme();
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Update checker
    initUpdateChecker();
    document.getElementById('update-banner-reload')?.addEventListener('click', () => {
        localStorage.removeItem(UPDATE_CHECK_KEY);
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
    document.getElementById('open-folder')?.addEventListener('click', openFolder);

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

    // Save button
    const saveBtn = document.getElementById('save-btn');
    saveBtn?.addEventListener('click', () => saveFile());

    // Sidebar toolbar buttons
    document.getElementById('new-file-btn')?.addEventListener('click', showNewFileInput);
    document.getElementById('new-folder-btn')?.addEventListener('click', showNewFolderInput);
    document.getElementById('back-btn')?.addEventListener('click', () => navigateHistory(-1));
    document.getElementById('forward-btn')?.addEventListener('click', () => navigateHistory(1));
    document.getElementById('split-pane-btn')?.addEventListener('click', toggleSplitPane);

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

    // Pane1 textarea dirty tracking + highlight sync
    const sourceEditor = document.getElementById('source-editor');
    sourceEditor?.addEventListener('input', () => {
        setDirty('pane1');
        updateSourceHighlight('pane1');

        // Same-file sync: if pane2 has the same file open, sync its content
        if (state.splitMode && state.pane2.currentFilename === state.currentFilename) {
            const textarea2 = document.getElementById('source-editor-p2');
            if (textarea2) textarea2.value = sourceEditor.value;
            debouncedSyncPreview('pane2');
        }
    });

    // Pane2 textarea dirty tracking + highlight sync
    const sourceEditor2 = document.getElementById('source-editor-p2');
    sourceEditor2?.addEventListener('input', () => {
        setDirty('pane2');
        updateSourceHighlight('pane2');

        // Same-file sync: if pane1 has the same file open, sync its content
        if (state.splitMode && state.currentFilename === state.pane2.currentFilename) {
            const textarea1 = document.getElementById('source-editor');
            if (textarea1) textarea1.value = sourceEditor2.value;
            updateSourceHighlight('pane1');
            debouncedSyncPreview('pane1');
        }
    });

    // Scroll sync: keep highlight backdrop and line numbers aligned with pane1 textarea
    sourceEditor?.addEventListener('scroll', () => {
        const backdrop = document.getElementById('source-highlight-backdrop');
        const lineNums = document.getElementById('line-numbers');
        if (backdrop) {
            backdrop.scrollTop = sourceEditor.scrollTop;
            backdrop.scrollLeft = sourceEditor.scrollLeft;
        }
        if (lineNums) {
            lineNums.scrollTop = sourceEditor.scrollTop;
        }
    });

    // Scroll sync for pane2
    sourceEditor2?.addEventListener('scroll', () => {
        const backdrop2 = document.getElementById('source-highlight-backdrop-p2');
        const lineNums2 = document.getElementById('line-numbers-p2');
        if (backdrop2) {
            backdrop2.scrollTop = sourceEditor2.scrollTop;
            backdrop2.scrollLeft = sourceEditor2.scrollLeft;
        }
        if (lineNums2) {
            lineNums2.scrollTop = sourceEditor2.scrollTop;
        }
    });

    // Ctrl+S / Cmd+S save
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    // Drag-to-move: drop onto file-list background → move to current dir
    const fileList = document.getElementById('file-list');
    fileList?.addEventListener('dragover', (e) => {
        if (!dragState.handle || dragState.parentHandle === state.currentDirHandle) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        fileList.classList.add('drag-over-list');
    });
    fileList?.addEventListener('dragleave', (e) => {
        if (!fileList.contains(e.relatedTarget)) fileList.classList.remove('drag-over-list');
    });
    fileList?.addEventListener('drop', async (e) => {
        e.preventDefault();
        fileList.classList.remove('drag-over-list');
        if (!dragState.handle || dragState.parentHandle === state.currentDirHandle) return;
        const { handle, parentHandle: srcParent } = dragState;
        dragState.handle = null;
        dragState.parentHandle = null;
        await moveEntry(srcParent, handle, state.currentDirHandle);
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

    // Nested modal close
    document.getElementById('nested-modal-close')?.addEventListener('click', closeNestedModal);
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
    let _lineDebounce = null;
    sourceEditor?.addEventListener('keyup', () => {
        const pos = sourceEditor.selectionStart || 0;
        state.currentLine = (sourceEditor.value.substring(0, pos).match(/\n/g) || []).length + 1;
        const lastNewline = sourceEditor.value.lastIndexOf('\n', pos - 1);
        state.currentChar = lastNewline === -1 ? pos + 1 : pos - lastNewline;
        clearTimeout(_lineDebounce);
        _lineDebounce = setTimeout(updateURL, 600);
    });
    sourceEditor?.addEventListener('mouseup', () => {
        const pos = sourceEditor.selectionStart || 0;
        state.currentLine = (sourceEditor.value.substring(0, pos).match(/\n/g) || []).length + 1;
        const lastNewline = sourceEditor.value.lastIndexOf('\n', pos - 1);
        state.currentChar = lastNewline === -1 ? pos + 1 : pos - lastNewline;
        clearTimeout(_lineDebounce);
        _lineDebounce = setTimeout(updateURL, 600);
    });

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
});
