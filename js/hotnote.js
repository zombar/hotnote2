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

// =========================================================================
// State
// =========================================================================

const state = {
    rootHandle: null,
    currentDirHandle: null,
    currentFileHandle: null,
    currentFilename: '',
    isDirty: false,
    editorMode: 'source', // 'source' | 'wysiwyg' | 'datasheet' | 'treeview'
    // JSON view state
    datasheetData: null,
    datasheetSchema: null,
    datasheetPage: 1,
    datasheetPageSize: DATASHEET_PAGE_SIZE,
    treeviewData: null,
    treeviewCollapsed: new Set(),
    // Navigation: [{handle, name}]
    pathStack: [],
    // Autosave
    autosaveEnabled: false,
    autosaveTimer: null,
};

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

function isTextFile(filename) {
    const ext = getExtension(filename);
    const name = filename.toLowerCase();
    return TEXT_EXTENSIONS.has(ext) || name === 'dockerfile' || name === 'makefile' || name.startsWith('.');
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
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
        if (name.startsWith('.')) continue; // skip hidden
        if (handle.kind === 'directory') {
            dirs.push({ name, handle, kind: 'directory' });
        } else {
            files.push({ name, handle, kind: 'file' });
        }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
}

async function createFile(name) {
    if (!state.currentDirHandle) return null;
    return state.currentDirHandle.getFileHandle(name, { create: true });
}

async function createFolder(name) {
    if (!state.currentDirHandle) return null;
    return state.currentDirHandle.getDirectoryHandle(name, { create: true });
}

async function deleteEntry(name) {
    if (!state.currentDirHandle) return;
    await state.currentDirHandle.removeEntry(name, { recursive: true });
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
        document.getElementById('sidebar').style.display = '';
        document.getElementById('resize-handle').style.display = '';
        await renderSidebar();
        renderBreadcrumb();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Failed to open folder:', err);
        }
    }
}

// =========================================================================
// Breadcrumb
// =========================================================================

function renderBreadcrumb() {
    const el = document.getElementById('breadcrumb');
    if (!el) return;
    if (!state.pathStack.length) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = state.pathStack.map((crumb, i) => {
        const isLast = i === state.pathStack.length - 1;
        return `<span class="crumb${isLast ? ' crumb-current' : ''}" data-idx="${i}">${escapeHtml(crumb.name)}</span>` +
               (isLast ? '' : '<span class="crumb-sep">/</span>');
    }).join('');
    el.querySelectorAll('.crumb:not(.crumb-current)').forEach(el => {
        el.addEventListener('click', async () => {
            const idx = parseInt(el.dataset.idx, 10);
            state.pathStack = state.pathStack.slice(0, idx + 1);
            state.currentDirHandle = state.pathStack[state.pathStack.length - 1].handle;
            await renderSidebar();
            renderBreadcrumb();
        });
    });
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
    for (const entry of entries) {
        const li = renderFileEntry(entry);
        list.appendChild(li);
    }
}

function renderFileEntry(entry) {
    const li = document.createElement('li');
    li.className = 'file-entry';
    if (entry.name === state.currentFilename && entry.kind === 'file') {
        li.classList.add('active');
    }

    const icon = getFileIconSvg(entry.name, entry.kind);
    li.innerHTML = `
        <span class="icon">${icon}</span>
        <span class="name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
        <button class="delete-btn" title="Delete">✕</button>
    `;

    // Click handler
    li.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        if (entry.kind === 'directory') {
            // Drill into folder
            state.pathStack.push({ handle: entry.handle, name: entry.name });
            state.currentDirHandle = entry.handle;
            await renderSidebar();
            renderBreadcrumb();
        } else {
            await openFile(entry.handle, entry.name);
        }
    });

    // Delete button
    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${entry.name}"?`)) return;
        try {
            await deleteEntry(entry.name);
            if (entry.name === state.currentFilename) {
                clearEditor();
            }
            await renderSidebar();
        } catch (err) {
            alert(`Failed to delete: ${err.message}`);
        }
    });

    return li;
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
// New File / Folder
// =========================================================================

function showNewFileInput() {
    const existing = document.getElementById('new-file-input-wrap');
    if (existing) { existing.querySelector('input')?.focus(); return; }

    const wrap = document.createElement('div');
    wrap.id = 'new-file-input-wrap';
    wrap.className = 'new-file-input-wrap';
    wrap.innerHTML = '<input type="text" placeholder="filename.md" autocomplete="off">';

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
                const handle = await createFile(name);
                await renderSidebar();
                await openFile(handle, name);
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

async function showNewFolderInput() {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    try {
        await createFolder(name.trim());
        await renderSidebar();
    } catch (err) {
        alert(`Failed to create folder: ${err.message}`);
    }
}

// =========================================================================
// File Opening & Editor
// =========================================================================

async function openFile(fileHandle, filename) {
    if (state.isDirty) {
        if (!confirm('You have unsaved changes. Discard?')) return;
    }

    state.currentFileHandle = fileHandle;
    state.currentFilename = filename;
    state.isDirty = false;
    updateTitle();

    // Update sidebar active state
    document.querySelectorAll('.file-entry').forEach(li => {
        li.classList.toggle('active', li.querySelector('.name')?.textContent === filename);
    });

    let content = '';
    if (isTextFile(filename)) {
        try {
            content = await readFile(fileHandle);
        } catch (err) {
            alert(`Failed to read file: ${err.message}`);
            return;
        }
    }

    const ext = getExtension(filename);
    determineInitialMode(ext, content);
    renderEditor(content, filename);

    // Enable autosave controls
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
    if (autosaveCheckbox) {
        autosaveCheckbox.disabled = false;
        autosaveCheckbox.checked = state.autosaveEnabled;
    }
    if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '';
}

function determineInitialMode(ext, content) {
    // JSON handling
    if (ext === 'json') {
        const ds = detectDatasheetMode(content);
        if (ds.isDatasheet) {
            state.editorMode = 'datasheet';
            state.datasheetData = ds.data;
            state.datasheetSchema = inferSchema(ds.data);
            state.datasheetPage = 1;
        } else {
            const jt = detectJsonType(content);
            if (jt.isObject || jt.isArray) {
                state.editorMode = 'treeview';
                state.treeviewData = jt.parsed;
                state.treeviewCollapsed = new Set();
            } else {
                state.editorMode = 'source';
            }
        }
        return;
    }

    // Markdown handling
    if (shouldUseWysiwygMode(ext, content)) {
        state.editorMode = 'wysiwyg';
    } else {
        state.editorMode = 'source';
    }
}

function renderEditor(content, filename) {
    const editorArea = document.getElementById('editor-area');
    // Remove empty state if present
    const emptyState = editorArea.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Show mode toolbar
    const toolbar = document.getElementById('mode-toolbar');
    toolbar.style.display = 'flex';

    // Update filename display
    const filenameDisplay = document.getElementById('filename-display');
    if (filenameDisplay) filenameDisplay.textContent = filename;

    // Set textarea content
    const textarea = document.getElementById('source-editor');
    textarea.value = content;

    updateModeToolbar();
    switchToMode(state.editorMode, content);
}

function updateModeToolbar() {
    const ext = getExtension(state.currentFilename);
    const isJson = ext === 'json';
    const isMd = ext === 'md';

    const ds = isJson ? detectDatasheetMode(document.getElementById('source-editor').value) : { isDatasheet: false };
    const jt = isJson ? detectJsonType(document.getElementById('source-editor').value) : { isObject: false, isArray: false };

    const modeToolbar = document.getElementById('mode-toolbar');
    modeToolbar.innerHTML = `
        <button class="btn btn-sm${state.editorMode === 'source' ? ' active' : ''}" id="mode-source">Source</button>
        ${isMd ? `<button class="btn btn-sm${state.editorMode === 'wysiwyg' ? ' active' : ''}" id="mode-wysiwyg">Preview</button>` : ''}
        ${(isJson && ds.isDatasheet) ? `<button class="btn btn-sm${state.editorMode === 'datasheet' ? ' active' : ''}" id="mode-datasheet">Datasheet</button>` : ''}
        ${(isJson && (jt.isObject || jt.isArray)) ? `<button class="btn btn-sm${state.editorMode === 'treeview' ? ' active' : ''}" id="mode-treeview">Tree</button>` : ''}
        <span id="filename-display" class="filename-display">${escapeHtml(state.currentFilename)}</span>
    `;

    document.getElementById('mode-source')?.addEventListener('click', () => switchToMode('source'));
    document.getElementById('mode-wysiwyg')?.addEventListener('click', () => switchToMode('wysiwyg'));
    document.getElementById('mode-datasheet')?.addEventListener('click', () => switchToMode('datasheet'));
    document.getElementById('mode-treeview')?.addEventListener('click', () => switchToMode('treeview'));
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

function startAutosaveTimer() {
    if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
        state.autosaveTimer = null;
        if (state.isDirty && state.currentFileHandle && state.autosaveEnabled) {
            saveFile(true);
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

function switchToMode(mode, content) {
    state.editorMode = mode;

    const textarea = document.getElementById('source-editor');
    const wysiwyg = document.getElementById('wysiwyg');
    const datasheet = document.getElementById('s3-datasheet');
    const treeview = document.getElementById('s3-treeview');

    // Hide all panels
    textarea.style.display = 'none';
    wysiwyg.style.display = 'none';
    datasheet.style.display = 'none';
    treeview.style.display = 'none';

    const currentContent = content !== undefined ? content : textarea.value;

    switch (mode) {
        case 'source':
            textarea.style.display = 'block';
            textarea.focus();
            break;

        case 'wysiwyg':
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
            break;

        case 'datasheet': {
            const parsed = JSON.parse(currentContent);
            state.datasheetData = parsed;
            state.datasheetSchema = inferSchema(parsed);
            state.datasheetPage = 1;
            datasheet.style.display = 'flex';
            renderDatasheet();
            break;
        }

        case 'treeview': {
            const jt = detectJsonType(currentContent);
            state.treeviewData = jt.parsed;
            state.treeviewCollapsed = new Set();
            treeview.style.display = 'block';
            renderTreeView();
            break;
        }
    }

    // Update toolbar buttons
    document.querySelectorAll('#mode-toolbar .btn').forEach(btn => {
        const btnMode = btn.id?.replace('mode-', '');
        btn.classList.toggle('active', btnMode === mode);
    });
}

function clearEditor() {
    state.currentFileHandle = null;
    state.currentFilename = '';
    state.isDirty = false;
    state.editorMode = 'source';
    updateTitle();

    const textarea = document.getElementById('source-editor');
    const wysiwyg = document.getElementById('wysiwyg');
    const datasheet = document.getElementById('s3-datasheet');
    const treeview = document.getElementById('s3-treeview');
    const toolbar = document.getElementById('mode-toolbar');

    textarea.style.display = 'none';
    textarea.value = '';
    wysiwyg.style.display = 'none';
    datasheet.style.display = 'none';
    treeview.style.display = 'none';
    toolbar.style.display = 'none';
    toolbar.innerHTML = '';

    const editorArea = document.getElementById('editor-area');
    if (!editorArea.querySelector('.empty-state')) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<h2>No file open</h2><p>Use <b>Open Folder</b> to browse local files.</p>';
        editorArea.appendChild(emptyState);
    }

    // Disable autosave controls when no file is open
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
    if (autosaveCheckbox) autosaveCheckbox.disabled = true;
    if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '0.4';
}

// =========================================================================
// Save
// =========================================================================

async function saveFile(silent = false) {
    if (!state.currentFileHandle) return;
    const textarea = document.getElementById('source-editor');
    try {
        await writeFile(state.currentFileHandle, textarea.value);
        state.isDirty = false;
        updateTitle();
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) { saveBtn.classList.remove('dirty'); saveBtn.disabled = true; }
        if (silent) animateAutosaveLabel();
    } catch (err) {
        if (!silent) alert(`Failed to save: ${err.message}`);
        else console.error('Autosave failed:', err);
    }
}

function setDirty() {
    if (!state.isDirty) {
        state.isDirty = true;
        updateTitle();
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) { saveBtn.classList.add('dirty'); saveBtn.disabled = false; }
    }
    startAutosaveTimer();
}

function updateTitle() {
    const prefix = state.isDirty ? '• ' : '';
    const filename = state.currentFilename ? ` — ${state.currentFilename}` : '';
    document.title = `${prefix}HotNote2${filename}`;
}

// =========================================================================
// Sidebar Resize
// =========================================================================

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
        const newWidth = Math.max(120, Math.min(600, startWidth + (e.clientX - startX)));
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

function shouldUseWysiwygMode(ext, content) {
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

function inferSchema(data) {
    if (!data || data.length === 0) return { columns: [] };

    const allKeys = new Set();
    data.forEach((obj) => Object.keys(obj).forEach((k) => allKeys.add(k)));

    const columns = Array.from(allKeys).map((key) => {
        const values = data.map((obj) => obj[key]).filter((v) => v != null);
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

function renderDatasheet() {
    const container = document.getElementById('s3-datasheet');
    if (!container || !state.datasheetData || !state.datasheetSchema) return;

    state.datasheetPageSize = calculateDatasheetPageSize();
    const { datasheetData: data, datasheetSchema: schema, datasheetPage: page, datasheetPageSize: pageSize } = state;

    const totalRows = data.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const startRow = (page - 1) * pageSize;
    const endRow = Math.min(startRow + pageSize, totalRows);
    const visibleRows = data.slice(startRow, endRow);

    container.innerHTML = `
        <div class="s3-datasheet-toolbar">
            <span class="s3-datasheet-info">
                <span><b id="s3-ds-row-count">${totalRows}</b> rows</span>
                <span><b id="s3-ds-col-count">${schema.columns.length}</b> cols</span>
            </span>
            <span>Page <b id="s3-ds-page-current">${page}</b> / <b id="s3-ds-page-total">${totalPages}</b></span>
        </div>
        <div class="s3-datasheet-container" id="s3-datasheet-container">
            <table class="s3-datasheet-table" id="s3-datasheet-table">
                <thead id="s3-ds-thead"></thead>
                <tbody id="s3-ds-tbody"></tbody>
                <tfoot id="s3-ds-tfoot"></tfoot>
            </table>
        </div>
        <div class="s3-datasheet-pagination">
            <button class="btn btn-sm" id="s3-ds-prev" ${page === 1 ? 'disabled' : ''}>← Prev</button>
            <span>${startRow + 1}–${endRow} of ${totalRows}</span>
            <button class="btn btn-sm" id="s3-ds-next" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
        </div>
    `;

    // Render header
    const thead = document.getElementById('s3-ds-thead');
    const headerRow = document.createElement('tr');
    schema.columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col.key;
        th.title = `Type: ${col.type}`;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Render body
    const tbody = document.getElementById('s3-ds-tbody');
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
    renderAggregations();

    // Pagination buttons
    document.getElementById('s3-ds-prev')?.addEventListener('click', () => {
        if (state.datasheetPage > 1) { state.datasheetPage--; renderDatasheet(); }
    });
    document.getElementById('s3-ds-next')?.addEventListener('click', () => {
        if (state.datasheetPage < totalPages) { state.datasheetPage++; renderDatasheet(); }
    });

    // Nested cell click handlers
    container.querySelectorAll('.s3-ds-nested').forEach(el => {
        el.addEventListener('click', () => {
            const rowIdx = parseInt(el.dataset.rowIdx, 10);
            const colKey = el.dataset.colKey;
            openNestedModal(rowIdx, colKey);
        });
    });
}

function renderAggregations() {
    const tfoot = document.getElementById('s3-ds-tfoot');
    if (!tfoot || !state.datasheetData || !state.datasheetSchema) return;

    const { datasheetData: data, datasheetSchema: schema } = state;
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

function renderTreeView() {
    const container = document.getElementById('s3-treeview');
    if (!container || !state.treeviewData) return;
    container.innerHTML = renderTreeNode(state.treeviewData, '', 'root');

    // Attach toggle handlers
    container.querySelectorAll('.tree-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTreeNode(el.dataset.treePath);
        });
    });

    // Attach datasheet link handlers
    container.querySelectorAll('.tree-datasheet-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            // Navigate data path to get the array
            const path = el.dataset.treePath;
            const arr = getValueAtPath(state.treeviewData, path);
            if (arr) {
                state.datasheetData = arr;
                state.datasheetSchema = inferSchema(arr);
                state.datasheetPage = 1;
                switchToMode('datasheet');
                updateModeToolbar();
            }
        });
    });
}

function getValueAtPath(root, path) {
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

function renderTreeNode(value, path, key) {
    const fullPath = path ? `${path}.${key}` : key;
    const isCollapsed = state.treeviewCollapsed.has(fullPath);

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
        const canShowDatasheet = value.length > 0 &&
            value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));

        let html = `<div class="tree-item tree-expandable">
            <span class="tree-toggle" data-tree-path="${escapeHtml(fullPath)}">${toggleIcon}</span>
            <span class="tree-key">${escapeHtml(String(key))}:</span>
            <span class="tree-bracket">[</span><span class="tree-count">${value.length} items</span><span class="tree-bracket">]</span>`;

        if (canShowDatasheet) {
            html += ` <a href="#" class="tree-datasheet-link" data-tree-path="${escapeHtml(fullPath)}">(datasheet)</a>`;
        }
        html += '</div>';

        if (!isCollapsed) {
            html += '<div class="tree-children">';
            value.forEach((item, index) => {
                html += renderTreeNode(item, fullPath, `[${index}]`);
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
            keys.forEach((k) => { html += renderTreeNode(value[k], fullPath, k); });
            html += '</div>';
        }
        return html;
    }

    return `<div class="tree-item"><span class="tree-key">${escapeHtml(String(key))}:</span> <span class="tree-unknown">${escapeHtml(String(value))}</span></div>`;
}

function toggleTreeNode(path) {
    if (state.treeviewCollapsed.has(path)) {
        state.treeviewCollapsed.delete(path);
    } else {
        state.treeviewCollapsed.add(path);
    }
    renderTreeView();
}

// =========================================================================
// Nested Data Modal
// =========================================================================

function openNestedModal(rowIdx, colKey) {
    if (!state.datasheetData) return;
    const row = state.datasheetData[rowIdx];
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
// Init
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Theme
    initTheme();
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Open folder button
    document.getElementById('open-folder')?.addEventListener('click', openFolder);

    // Save button
    const saveBtn = document.getElementById('save-btn');
    saveBtn?.addEventListener('click', saveFile);

    // Sidebar toolbar buttons
    document.getElementById('new-file-btn')?.addEventListener('click', showNewFileInput);
    document.getElementById('new-folder-btn')?.addEventListener('click', showNewFolderInput);

    // Textarea dirty tracking
    document.getElementById('source-editor')?.addEventListener('input', setDirty);

    // Ctrl+S / Cmd+S save
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });

    // Resize handle
    initResizeHandle();

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

    // Autosave init
    state.autosaveEnabled = loadAutosavePref();
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggleLabel = document.getElementById('autosave-toggle-label');
    if (autosaveCheckbox) {
        autosaveCheckbox.addEventListener('change', (e) => {
            state.autosaveEnabled = e.target.checked;
            saveAutosavePref(e.target.checked);
        });
    }
    // Initially disabled until a file is open (clearEditor will set these too, but explicit here)
    if (autosaveToggleLabel) autosaveToggleLabel.style.opacity = '0.4';
    if (autosaveCheckbox) autosaveCheckbox.disabled = true;

    // Check if File System Access API is available
    if (!window.showDirectoryPicker) {
        const warning = document.createElement('div');
        warning.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#f85149;color:#fff;padding:.5rem 1rem;border-radius:4px;font-size:.875rem;z-index:9999;';
        warning.textContent = 'File System Access API not supported. Use Chrome/Edge.';
        document.body.appendChild(warning);
    }
});
