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

    const obj = await readGitObject(rootHandle, treeSha); // throws on pack error
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
// Pack file support (for cloned repos where all objects are in pack files)
// ---------------------------------------------------------------------------

async function _decompressBytes(bytes, format = 'deflate') {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.byteLength; }
    return out;
}

// Parse pack index v2 to find byte offset of a SHA in the corresponding .pack file.
// Returns {offset, allOffsets} or null if not found / wrong version.
function _parsePackIndexEntry(idxBuf, targetSha) {
    const bytes = new Uint8Array(idxBuf);
    const view = new DataView(idxBuf);

    // Magic: FF 74 4F 63
    if (bytes[0] !== 0xFF || bytes[1] !== 0x74 || bytes[2] !== 0x4F || bytes[3] !== 0x63) return null;
    if (view.getUint32(4) !== 2) return null; // only v2 supported

    const N = view.getUint32(8 + 255 * 4); // fanout[255] = total object count

    const targetBytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
        targetBytes[i] = parseInt(targetSha.slice(i * 2, i * 2 + 2), 16);
    }

    const firstByte = targetBytes[0];
    const lo = firstByte === 0 ? 0 : view.getUint32(8 + (firstByte - 1) * 4);
    const hi = view.getUint32(8 + firstByte * 4);

    // Binary-search the sorted SHA table for targetSha
    const shaBase = 1032; // 8 (hdr) + 1024 (fanout)
    let left = lo, right = hi, foundIdx = -1;
    while (left < right) {
        const mid = (left + right) >>> 1;
        const off = shaBase + mid * 20;
        let cmp = 0;
        for (let i = 0; i < 20; i++) {
            cmp = bytes[off + i] - targetBytes[i];
            if (cmp !== 0) break;
        }
        if (cmp === 0) { foundIdx = mid; break; }
        if (cmp < 0) left = mid + 1; else right = mid;
    }
    if (foundIdx === -1) return null;

    // Offset table: after SHA table (N*20) + CRC32 table (N*4)
    const offsetBase = 1032 + N * 24;
    const largeBase  = 1032 + N * 28; // after 4-byte offset table

    function readOffset(i) {
        const raw = view.getUint32(offsetBase + i * 4);
        if (raw & 0x80000000) {
            const idx = raw & 0x7FFFFFFF;
            const hi32 = view.getUint32(largeBase + idx * 8);
            const lo32 = view.getUint32(largeBase + idx * 8 + 4);
            return hi32 * 0x100000000 + lo32;
        }
        return raw;
    }

    const offset = readOffset(foundIdx);
    const allOffsets = [];
    for (let i = 0; i < N; i++) allOffsets.push(readOffset(i));

    return { offset, allOffsets };
}

// Parse variable-length pack object header at data[0].
// Returns {type, headerEnd} where type: 1=commit 2=tree 3=blob 4=tag 6=OFS_DELTA 7=REF_DELTA
function _parsePackObjectHeader(data) {
    const type = (data[0] >> 4) & 7;
    let pos = 1;
    while (data[pos - 1] & 0x80) pos++;
    return { type, headerEnd: pos };
}

// Parse the negative-offset field of an OFS_DELTA object (git's +1-adjusted MSB encoding).
function _parseOfsNegOffset(data, pos) {
    let b = data[pos++];
    let offset = b & 0x7F;
    while (b & 0x80) {
        b = data[pos++];
        offset = ((offset + 1) << 7) | (b & 0x7F);
    }
    return { negOffset: offset, pos };
}

// Apply git pack delta instructions to produce the target object.
function _applyDelta(source, delta) {
    let pos = 0;

    // Skip source-size (variable-length LE)
    while (delta[pos++] & 0x80) { /* consume */ }

    // Read target-size (variable-length LE)
    let tgtSize = 0, shift = 0, b;
    do { b = delta[pos++]; tgtSize |= (b & 0x7F) << shift; shift += 7; } while (b & 0x80);

    const output = new Uint8Array(tgtSize);
    let outPos = 0;

    while (pos < delta.length) {
        const cmd = delta[pos++];
        if (cmd & 0x80) {
            // COPY: read offset and size from following bytes per bitmask
            let cpOffset = 0, cpSize = 0;
            if (cmd & 0x01) cpOffset  |= delta[pos++];
            if (cmd & 0x02) cpOffset  |= delta[pos++] << 8;
            if (cmd & 0x04) cpOffset  |= delta[pos++] << 16;
            if (cmd & 0x08) cpOffset  |= delta[pos++] << 24;
            if (cmd & 0x10) cpSize    |= delta[pos++];
            if (cmd & 0x20) cpSize    |= delta[pos++] << 8;
            if (cmd & 0x40) cpSize    |= delta[pos++] << 16;
            if (cpSize === 0) cpSize = 0x10000;
            output.set(source.slice(cpOffset, cpOffset + cpSize), outPos);
            outPos += cpSize;
        } else if (cmd) {
            // INSERT: next cmd bytes are literal data
            output.set(delta.slice(pos, pos + cmd), outPos);
            pos += cmd;
            outPos += cmd;
        }
    }
    return output;
}

// Read a single object from an open pack File at the given byte offset.
// allOffsets is the full list of object offsets (used to determine slice end).
async function _readPackObjectAt(rootHandle, packFile, targetOffset, allOffsets, packFileSize) {
    const sorted = [...new Set(allOffsets)].sort((a, b) => a - b);
    const idx = sorted.indexOf(targetOffset);
    const nextOffset = (idx + 1 < sorted.length) ? sorted[idx + 1] : packFileSize - 20;

    const data = new Uint8Array(await packFile.slice(targetOffset, nextOffset).arrayBuffer());
    const { type, headerEnd } = _parsePackObjectHeader(data);
    const TYPE_NAMES = ['', 'commit', 'tree', 'blob', 'tag', '', 'ofs_delta', 'ref_delta'];

    if (type >= 1 && type <= 4) {
        const raw = await _decompressBytes(data.slice(headerEnd), 'deflate-raw');
        return { type: TYPE_NAMES[type], raw };
    } else if (type === 6) { // OFS_DELTA
        const { negOffset, pos } = _parseOfsNegOffset(data, headerEnd);
        const base = await _readPackObjectAt(rootHandle, packFile, targetOffset - negOffset, allOffsets, packFileSize);
        const deltaRaw = await _decompressBytes(data.slice(pos), 'deflate-raw');
        return { type: base.type, raw: _applyDelta(base.raw, deltaRaw) };
    } else if (type === 7) { // REF_DELTA
        const baseSha = Array.from(data.slice(headerEnd, headerEnd + 20))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        const base = await readGitObject(rootHandle, baseSha);
        const deltaRaw = await _decompressBytes(data.slice(headerEnd + 20), 'deflate-raw');
        return { type: base.type, raw: _applyDelta(base.raw, deltaRaw) };
    }
    throw new Error(`Unknown pack object type: ${type}`);
}

// Search all .idx/.pack pairs under .git/objects/pack/ for the given SHA.
async function _readObjectFromPacks(rootHandle, sha) {
    try {
        const gitDir = await _getGitDir(rootHandle);
        const packDir = await (await gitDir.getDirectoryHandle('objects')).getDirectoryHandle('pack');
        for await (const [name, handle] of packDir.entries()) {
            if (!name.endsWith('.idx')) continue;
            const idxBuf = await (await handle.getFile()).arrayBuffer();
            const parsed = _parsePackIndexEntry(idxBuf, sha);
            if (!parsed) continue;
            const packFile = await (await packDir.getFileHandle(name.slice(0, -4) + '.pack')).getFile();
            return await _readPackObjectAt(rootHandle, packFile, parsed.offset, parsed.allOffsets, packFile.size);
        }
    } catch (_) { /* pack dir absent or unreadable */ }
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function readGitObject(rootHandle, sha) {
    // 1. Try loose object (.git/objects/XX/YYYYYYYY)
    try {
        const gitDir = await _getGitDir(rootHandle);
        const objectsDir = await gitDir.getDirectoryHandle('objects');
        const subdir = await objectsDir.getDirectoryHandle(sha.slice(0, 2));
        const file = await subdir.getFileHandle(sha.slice(2));
        const compressed = await (await file.getFile()).arrayBuffer();
        // Loose objects use zlib (RFC 1950) wrapping
        const raw = await _decompressBytes(new Uint8Array(compressed), 'deflate');
        let nul = 0;
        while (nul < raw.length && raw[nul] !== 0) nul++;
        return { type: new TextDecoder().decode(raw.slice(0, nul)).split(' ')[0], raw: raw.slice(nul + 1) };
    } catch (_) { /* fall through to pack files */ }

    // 2. Search pack files (cloned repos store all objects here)
    const result = await _readObjectFromPacks(rootHandle, sha);
    if (result) return result;
    throw new Error(`Object not found: ${sha}`);
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

    // Iterate index entries (tracked files only) — avoids scanning node_modules and other
    // untracked directories which would be incorrectly flagged as "changed".
    const changedPaths = new Set();
    await Promise.all([...indexMap.entries()].map(async ([relPath, indexSha]) => {
        try {
            const parts = relPath.split('/');
            let dir = rootHandle;
            for (let i = 0; i < parts.length - 1; i++) {
                dir = await dir.getDirectoryHandle(parts[i]);
            }
            const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
            if (file.size > 10 * 1024 * 1024) return; // skip large files
            const sha = await computeFileSha1(await file.text());
            if (sha !== indexSha) changedPaths.add(relPath);
        } catch (_) {
            changedPaths.add(relPath); // deleted file = changed
        }
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

    // Phase 1: resolve commitSha from HEAD/packed-refs — return null on infra failure
    let commitSha;
    try {
        const gitDir = await _getGitDir(rootHandle);

        // 1. Read HEAD → branch ref or detached SHA
        const headFile = await gitDir.getFileHandle('HEAD');
        const headText = (await (await headFile.getFile()).text()).trim();

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
    } catch (_) {
        return null; // .git/ inaccessible or not a git repo
    }

    if (!commitSha || commitSha.length !== 40) return null;

    // Phase 2: read objects — errors propagate (not caught here)
    const commitObj = await readGitObject(rootHandle, commitSha);
    if (commitObj.type !== 'commit') return null;
    const commitText = new TextDecoder().decode(commitObj.raw);
    const treeMatch = commitText.match(/^tree ([0-9a-f]{40})/m);
    if (!treeMatch) return null;

    // Walk tree to find blob SHA
    const blobSha = await _walkTree(rootHandle, treeMatch[1], relPath.split('/'));
    if (!blobSha) return null; // path genuinely not in HEAD = new/untracked file

    const blobObj = await readGitObject(rootHandle, blobSha);
    if (blobObj.type !== 'blob') return null;
    return new TextDecoder().decode(blobObj.raw);
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
            li.querySelector('.icon')?.insertAdjacentHTML(
                'beforebegin',
                '<span class="git-dot" aria-label="modified"></span>'
            );
        }
    });
}
