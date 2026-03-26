'use strict';

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

async function getAllFiles(dirHandle, basePath, results = [], limit = MAX_SEARCH_FILES) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (results.length >= limit) return results;
        const relPath = basePath ? basePath + '/' + name : name;
        if (handle.kind === 'directory') {
            await getAllFiles(handle, relPath, results, limit);
        } else {
            let size = 0;
            try { size = (await handle.getFile()).size; } catch (_e) { /* ignore */ }
            results.push({ name, handle, kind: 'file', relPath, size });
        }
    }
    return results;
}

// =========================================================================
// Glob / Exclusion Matching
// =========================================================================

function _globToRegex(pattern) {
    let out = '';
    let i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];
        if (ch === '*' && pattern[i + 1] === '*') {
            out += '.*';
            i += 2;
            if (pattern[i] === '/') i++; // consume separator after **
        } else if (ch === '*') {
            out += '[^/]*';
            i++;
        } else if (ch === '?') {
            out += '[^/]';
            i++;
        } else {
            out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
            i++;
        }
    }
    return new RegExp('^' + out + '$', 'i');
}

function _matchesExcludePattern(pattern, relPath, name) {
    pattern = pattern.trim();
    if (!pattern) return false;
    const hasSlash = pattern.includes('/');
    const hasGlob = pattern.includes('*') || pattern.includes('?');
    if (!hasSlash && !hasGlob) {
        // Bare name: match any path segment exactly (catches dirs and files by name)
        return relPath.split('/').some(seg => seg.toLowerCase() === pattern.toLowerCase());
    }
    if (!hasSlash) {
        // Glob without slash: test against filename only
        return _globToRegex(pattern).test(name);
    }
    // Pattern with slash: test against full relPath
    if (_globToRegex(pattern).test(relPath)) return true;
    // Strip leading **/ so "**/*.snap" also matches root-level "foo.snap"
    if (pattern.startsWith('**/')) {
        return _globToRegex(pattern.slice(3)).test(relPath);
    }
    return false;
}

function shouldExclude(relPath, name, patterns) {
    if (!patterns || !patterns.length) return false;
    return patterns.some(p => _matchesExcludePattern(p, relPath, name));
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
