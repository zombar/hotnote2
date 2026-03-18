'use strict';

// =========================================================================
// Git Integration — reads .git/ via File System Access API
// =========================================================================

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _getGitDir(rootHandle) {
    return rootHandle.getDirectoryHandle('.git');
}

async function _readGitIndex(rootHandle) {
    try {
        const gitDir = await _getGitDir(rootHandle);
        const indexFile = await gitDir.getFileHandle('index');
        const buf = await (await indexFile.getFile()).arrayBuffer();
        const view = new DataView(buf);
        const bytes = new Uint8Array(buf);

        // Verify "DIRC" magic
        if (
            String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'DIRC'
        ) return null;

        const version = view.getUint32(4);
        if (version < 2 || version > 4) return null;

        const count = view.getUint32(8);
        const result = new Map();
        let offset = 12; // past 12-byte header

        for (let i = 0; i < count; i++) {
            const entryStart = offset;
            // SHA-1 at bytes 40–59 of entry
            const shaBytes = bytes.slice(entryStart + 40, entryStart + 60);
            const sha = Array.from(shaBytes)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            // Flags at bytes 60–61
            const flags = view.getUint16(entryStart + 60);
            // Version 3+: if extended flag bit set, there's an extra 2 bytes
            const extendedFlagBytes = (version >= 3 && (flags & 0x4000)) ? 2 : 0;
            const pathStart = entryStart + 62 + extendedFlagBytes;

            const nameLen = flags & 0x0fff;
            let pathEnd;
            if (nameLen < 0x0fff) {
                pathEnd = pathStart + nameLen;
            } else {
                // Long name: find null terminator
                pathEnd = pathStart;
                while (pathEnd < bytes.length && bytes[pathEnd] !== 0) pathEnd++;
            }

            const path = new TextDecoder().decode(bytes.slice(pathStart, pathEnd));
            result.set(path, sha);

            // Entry size: 62 + extendedFlagBytes + nameLen + 1 (null), padded to 8-byte boundary
            const rawSize = 62 + extendedFlagBytes + (pathEnd - pathStart) + 1;
            const paddedSize = Math.ceil(rawSize / 8) * 8;
            offset = entryStart + paddedSize;
        }

        return result;
    } catch (_) {
        return null;
    }
}

async function _findPackedRef(gitDir, ref) {
    try {
        const packedRefsFile = await gitDir.getFileHandle('packed-refs');
        const text = await (await packedRefsFile.getFile()).text();
        for (const line of text.split('\n')) {
            if (!line || line.startsWith('#') || line.startsWith('^')) continue;
            const [sha, name] = line.trim().split(' ');
            if (name === ref) return sha;
        }
    } catch (_) { /* packed-refs not found or unreadable */ }
    return null;
}

async function _parseTreeRaw(raw) {
    // Binary tree format: "MODE FILENAME\0SHA(20 bytes)" repeating
    const entries = new Map();
    let i = 0;
    while (i < raw.length) {
        // Mode (e.g. "100644") up to space
        let spaceIdx = i;
        while (spaceIdx < raw.length && raw[spaceIdx] !== 0x20) spaceIdx++;
        const mode = new TextDecoder().decode(raw.slice(i, spaceIdx));
        i = spaceIdx + 1;

        // Name up to null byte
        let nullIdx = i;
        while (nullIdx < raw.length && raw[nullIdx] !== 0) nullIdx++;
        const name = new TextDecoder().decode(raw.slice(i, nullIdx));
        i = nullIdx + 1;

        // 20-byte SHA
        if (i + 20 > raw.length) break;
        const shaBytes = raw.slice(i, i + 20);
        const sha = Array.from(shaBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        i += 20;

        entries.set(name, { mode, sha });
    }
    return entries;
}

async function _walkTree(rootHandle, treeSha, pathParts) {
    if (!pathParts.length) return null;

    let obj;
    try {
        obj = await readGitObject(rootHandle, treeSha);
    } catch (_) {
        return null;
    }
    if (obj.type !== 'tree') return null;

    const entries = await _parseTreeRaw(obj.raw);
    const part = pathParts[0];
    const entry = entries.get(part);
    if (!entry) return null;

    if (pathParts.length === 1) {
        return entry.sha; // this is the blob SHA
    }
    return _walkTree(rootHandle, entry.sha, pathParts.slice(1));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function readGitObject(rootHandle, sha) {
    const gitDir = await _getGitDir(rootHandle);
    const subdir = await gitDir.getDirectoryHandle(sha.slice(0, 2));
    const file = await subdir.getFileHandle(sha.slice(2));
    const compressed = await (await file.getFile()).arrayBuffer();

    // Git objects use zlib (RFC 1950) wrapping around deflate
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(new Uint8Array(compressed));
    writer.close();

    const chunks = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
    const raw = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) { raw.set(chunk, pos); pos += chunk.byteLength; }

    // Header format: "TYPE SIZE\0"
    let nul = 0;
    while (nul < raw.length && raw[nul] !== 0) nul++;
    const header = new TextDecoder().decode(raw.slice(0, nul));
    const [type] = header.split(' ');

    return { type, raw: raw.slice(nul + 1) };
}

async function computeFileSha1(content) {
    const enc = new TextEncoder();
    const body = enc.encode(content);
    const header = enc.encode(`blob ${body.byteLength}\0`);
    const buf = new Uint8Array(header.byteLength + body.byteLength);
    buf.set(header);
    buf.set(body, header.byteLength);
    const hash = await crypto.subtle.digest('SHA-1', buf);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function detectChangedFiles(rootHandle) {
    // Test hook — allows Playwright tests to inject mock git state
    if (typeof window !== 'undefined' && window.__mockGit?.changedPathsOverride !== undefined) {
        return window.__mockGit.changedPathsOverride; // Set or null
    }

    if (!rootHandle) return null;

    const indexMap = await _readGitIndex(rootHandle);
    if (!indexMap) return null; // not a git repo or unreadable

    let allFiles;
    try {
        allFiles = await getAllFiles(rootHandle, '');
    } catch (_) {
        return new Set();
    }

    const changedPaths = new Set();
    await Promise.all(allFiles.map(async (file) => {
        if (file.size > 10 * 1024 * 1024) return; // skip large files
        try {
            const content = await (await file.handle.getFile()).text();
            const sha = await computeFileSha1(content);
            const indexSha = indexMap.get(file.relPath);
            if (!indexSha || sha !== indexSha) {
                changedPaths.add(file.relPath);
            }
        } catch (_) { /* ignore unreadable files */ }
    }));

    return changedPaths;
}

async function readHeadBlob(rootHandle, relPath) {
    // Test hook
    if (typeof window !== 'undefined' && window.__mockGit?.headBlobs) {
        const blobs = window.__mockGit.headBlobs;
        if (relPath in blobs) return blobs[relPath];
    }

    if (!rootHandle || !relPath) return null;

    try {
        const gitDir = await _getGitDir(rootHandle);

        // 1. Read HEAD → branch ref or detached SHA
        const headFile = await gitDir.getFileHandle('HEAD');
        const headText = (await (await headFile.getFile()).text()).trim();

        let commitSha;
        if (headText.startsWith('ref: ')) {
            const ref = headText.slice(5).trim(); // e.g. "refs/heads/main"
            // Try loose ref first
            try {
                const parts = ref.split('/');
                let dir = gitDir;
                for (let i = 0; i < parts.length - 1; i++) {
                    dir = await dir.getDirectoryHandle(parts[i]);
                }
                const refFile = await dir.getFileHandle(parts[parts.length - 1]);
                commitSha = (await (await refFile.getFile()).text()).trim();
            } catch (_) {
                // Fall back to packed-refs
                commitSha = await _findPackedRef(gitDir, ref);
            }
        } else {
            commitSha = headText; // detached HEAD
        }

        if (!commitSha || commitSha.length !== 40) return null;

        // 2. Read commit → get tree SHA
        const commitObj = await readGitObject(rootHandle, commitSha);
        if (commitObj.type !== 'commit') return null;
        const commitText = new TextDecoder().decode(commitObj.raw);
        const treeMatch = commitText.match(/^tree ([0-9a-f]{40})/m);
        if (!treeMatch) return null;

        // 3. Walk tree to find blob SHA
        const blobSha = await _walkTree(rootHandle, treeMatch[1], relPath.split('/'));
        if (!blobSha) return null;

        // 4. Read and return blob content
        const blobObj = await readGitObject(rootHandle, blobSha);
        if (blobObj.type !== 'blob') return null;
        return new TextDecoder().decode(blobObj.raw);
    } catch (_) {
        return null;
    }
}

async function refreshGitStatus() {
    const changedPaths = await detectChangedFiles(state.rootHandle);
    state.gitAvailable = changedPaths !== null;
    state.gitChangedPaths = changedPaths ?? new Set();
    updateGitFilterBar();
    _reAnnotateSidebarDots();
}

function _reAnnotateSidebarDots() {
    // Remove all existing git dots
    document.querySelectorAll('#file-list .git-dot').forEach(d => d.remove());
    // Re-annotate visible file entries
    document.querySelectorAll('#file-list .file-entry').forEach(li => {
        if (!li._relPath) return;
        const hasChange = li._dirHandle
            ? [...state.gitChangedPaths].some(p => p.startsWith(li._relPath + '/'))
            : state.gitChangedPaths.has(li._relPath);
        if (hasChange) {
            li.querySelector('.name')?.insertAdjacentHTML(
                'afterend',
                '<span class="git-dot" aria-label="modified"></span>'
            );
        }
    });
}
