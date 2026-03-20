/**
 * Mock File System Access API — injected via page.addInitScript()
 * Implements the subset used by hotnote2.
 */
(function () {
    'use strict';

    let _tree = {};
    let _rootName = 'my-notes';
    const _written = new Map(); // relPath → content string
    const _lastModified = new Map(); // relPath → timestamp

    function makeFileHandle(name, content, relPath) {
        return {
            kind: 'file',
            name,
            async getFile() {
                const c = _written.has(relPath) ? _written.get(relPath) : (content || '');
                const bytes = new TextEncoder().encode(c);
                if (!_lastModified.has(relPath)) _lastModified.set(relPath, Date.now());
                return {
                    name,
                    size: bytes.byteLength,
                    lastModified: _lastModified.get(relPath),
                    async text() { return c; },
                };
            },
            async createWritable() {
                const chunks = [];
                return {
                    async write(d) { chunks.push(String(d)); },
                    async close() {
                        _written.set(relPath, chunks.join(''));
                        _lastModified.set(relPath, Date.now());
                    },
                };
            },
            async isSameEntry(other) {
                return other != null && other._relPath === relPath;
            },
            _relPath: relPath,
        };
    }

    function makeDirectoryHandle(name, subtree, relPath) {
        return {
            kind: 'directory',
            name,
            entries() {
                // Returns an async iterator yielding [name, handle] pairs
                const keys = Object.keys(subtree);
                let index = 0;
                return {
                    [Symbol.asyncIterator]() { return this; },
                    async next() {
                        if (index >= keys.length) return { done: true, value: undefined };
                        const key = keys[index++];
                        const val = subtree[key];
                        const childRelPath = relPath ? relPath + '/' + key : key;
                        let handle;
                        if (typeof val === 'object' && val !== null && !('__content' in val)) {
                            // Directory
                            handle = makeDirectoryHandle(key, val, childRelPath);
                        } else {
                            // File: val is string content, or { __content: string }
                            const fileContent = typeof val === 'string' ? val : (val && val.__content) || '';
                            handle = makeFileHandle(key, fileContent, childRelPath);
                        }
                        return { done: false, value: [key, handle] };
                    },
                };
            },
            async getFileHandle(n, opts = {}) {
                if (subtree[n] !== undefined) {
                    const childRelPath = relPath ? relPath + '/' + n : n;
                    const val = subtree[n];
                    const fileContent = typeof val === 'string' ? val : (val && val.__content) || '';
                    return makeFileHandle(n, fileContent, childRelPath);
                }
                if (opts.create) {
                    subtree[n] = '';
                    _written.delete(relPath ? relPath + '/' + n : n);
                    const childRelPath = relPath ? relPath + '/' + n : n;
                    return makeFileHandle(n, '', childRelPath);
                }
                throw new DOMException(`File "${n}" not found`, 'NotFoundError');
            },
            async getDirectoryHandle(n, opts = {}) {
                if (subtree[n] !== undefined && typeof subtree[n] === 'object' && !('__content' in subtree[n])) {
                    const childRelPath = relPath ? relPath + '/' + n : n;
                    return makeDirectoryHandle(n, subtree[n], childRelPath);
                }
                if (opts.create) {
                    subtree[n] = {};
                    const childRelPath = relPath ? relPath + '/' + n : n;
                    return makeDirectoryHandle(n, subtree[n], childRelPath);
                }
                throw new DOMException(`Directory "${n}" not found`, 'NotFoundError');
            },
            async removeEntry(n) {
                delete subtree[n];
            },
            async isSameEntry(other) {
                return other != null && other._relPath === relPath;
            },
            _relPath: relPath,
        };
    }

    window.__mockFS = {
        _rootName: 'my-notes',
        setTree(tree, rootName) {
            _tree = tree || {};
            _rootName = rootName || 'my-notes';
            this._rootName = _rootName;
            _written.clear();
            _lastModified.clear();
        },
        touchFile(relPath) {
            _lastModified.set(relPath, Date.now());
        },
        get written() {
            const o = {};
            _written.forEach((v, k) => { o[k] = v; });
            return o;
        },
        makeRootHandle() {
            return makeDirectoryHandle(_rootName, _tree, '');
        },
    };

    window.showDirectoryPicker = async () => window.__mockFS.makeRootHandle();
})();
