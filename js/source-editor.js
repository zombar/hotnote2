'use strict';

// =========================================================================
// SourceEditor — contenteditable-based editor engine
// =========================================================================

class SourceEditor {
    constructor(ceEl, mirrorEl, lineNumEl, overlayEl, paneId) {
        this.ceEl      = ceEl;
        this.mirrorEl  = mirrorEl;
        this.lineNumEl = lineNumEl;
        this.overlayEl = overlayEl;
        this.paneId    = paneId;

        // Document model
        this._lines   = [''];
        // cursor: { line, col, selLine, selCol, wantCol }
        // line/col = head (caret); selLine/selCol = anchor (selection start)
        this._cursors = [this._mkCursor(0, 0)];
        this._undoStack = [];   // [{lines, cursors}]
        this._redoStack = [];
        this._undoTimer = null; // debounce for consecutive char inserts
        this._isComposing = false;

        // Rendering metrics (measured lazily)
        this._charW    = 8;
        this._lineH    = 19.5;
        this._padTop   = 12;
        this._padLeft  = 64;  // 3.25rem + 0.75rem ≈ 64px (measured in _measure)

        this._bindEvents();
        this._patchMirrorFocus();
        this._measure();
    }

    // ── Constructor helpers ───────────────────────────────────────────────────

    _mkCursor(line, col, selLine, selCol) {
        return {
            line, col,
            selLine: selLine !== undefined ? selLine : line,
            selCol:  selCol  !== undefined ? selCol  : col,
            wantCol: col
        };
    }

    _patchMirrorFocus() {
        const ceEl = this.ceEl;
        try {
            Object.defineProperty(this.mirrorEl, 'focus', {
                get() { return () => ceEl.focus(); },
                configurable: true,
            });
        } catch (_) { /* ignore */ }
    }

    _bindEvents() {
        this.ceEl.addEventListener('beforeinput',      (e) => this._onBeforeInput(e));
        this.ceEl.addEventListener('keydown',           (e) => this._onKeyDown(e));
        this.ceEl.addEventListener('mousedown',         (e) => this._onMouseDown(e));
        this.ceEl.addEventListener('dblclick',          (e) => this._onDblClick(e));
        this.ceEl.addEventListener('scroll',            ()  => { this._updateOverlay(); this._syncLineNumScroll(); });
        this.ceEl.addEventListener('compositionstart',  ()  => { this._isComposing = true; });
        this.ceEl.addEventListener('compositionend',    (e) => {
            this._isComposing = false;
            // Re-render to clear any browser-inserted composition text, then insert composed
            this._renderLines();
            if (e.data) this._insert(e.data);
            this._render(); this._syncMirror();
        });
    }

    _measure() {
        requestAnimationFrame(() => {
            const cs = getComputedStyle(this.ceEl);
            this._padTop  = parseFloat(cs.paddingTop)  || 12;
            this._padLeft = parseFloat(cs.paddingLeft) || 64;

            // Measure char width via temp span
            const span = document.createElement('span');
            span.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;` +
                `font-family:${cs.fontFamily};font-size:${cs.fontSize};white-space:pre;`;
            span.textContent = 'x'.repeat(80);
            document.body.appendChild(span);
            this._charW = span.offsetWidth / 80;
            document.body.removeChild(span);

            this._lineH = parseFloat(cs.lineHeight) || 19.5;
            this._render();
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    get lineHeight() { return this._lineH; }

    setValue(text, options = {}) {
        this._lines   = text === '' ? [''] : text.split('\n');
        this._cursors = [this._mkCursor(0, 0)];
        this._render();
        if (options.silent) {
            this.mirrorEl.value = text;
        } else {
            this._syncMirror();
        }
    }

    getValue() { return this._lines.join('\n'); }

    setSelection(from, to) {
        const s = this._offsetToPos(from);
        const e = this._offsetToPos(to !== undefined ? to : from);
        this._cursors = [{
            line: e.line, col: e.col,
            selLine: s.line, selCol: s.col,
            wantCol: e.col
        }];
        this._updateOverlay();
        this._scrollToCursor();
    }

    getSelectionStart() {
        const c = this._cursors[0];
        if (!c) return 0;
        const [sl, sc] = this._selStart(c);
        return this._posToOffset(sl, sc);
    }

    getSelectionEnd() {
        const c = this._cursors[0];
        if (!c) return 0;
        const [el, ec] = this._selEnd(c);
        return this._posToOffset(el, ec);
    }

    focus() { this.ceEl.focus(); }

    addCursorAt(line, col) {
        const l = Math.max(0, Math.min(line, this._lines.length - 1));
        const c = Math.max(0, Math.min(col, this._lines[l].length));
        this._cursors.push(this._mkCursor(l, c));
        this._mergeCursors();
        this._updateOverlay();
    }

    setBoxSelection(startLine, startCol, endLine, endCol) {
        const minL = Math.min(startLine, endLine);
        const maxL = Math.max(startLine, endLine);
        const minC = Math.min(startCol, endCol);
        const maxC = Math.max(startCol, endCol);
        this._cursors = [];
        for (let l = minL; l <= maxL; l++) {
            const ll = this._lines[l].length;
            this._cursors.push({
                line: l, col: Math.min(maxC, ll),
                selLine: l, selCol: Math.min(minC, ll),
                wantCol: maxC
            });
        }
        this._updateOverlay();
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    _saveUndo() {
        this._undoStack.push({
            lines:   [...this._lines],
            cursors: JSON.parse(JSON.stringify(this._cursors))
        });
        if (this._undoStack.length > 200) this._undoStack.shift();
        this._redoStack = [];
    }

    // Start a debounced undo batch (char-by-char typing). Saves once, then debounces.
    _startUndoBatch() {
        if (!this._undoTimer) this._saveUndo();
        clearTimeout(this._undoTimer);
        this._undoTimer = setTimeout(() => { this._undoTimer = null; }, 1000);
    }

    _flushUndoBatch() {
        clearTimeout(this._undoTimer);
        this._undoTimer = null;
    }

    _undo() {
        this._flushUndoBatch();
        if (!this._undoStack.length) return;
        this._redoStack.push({ lines: [...this._lines], cursors: JSON.parse(JSON.stringify(this._cursors)) });
        const s = this._undoStack.pop();
        this._lines = s.lines; this._cursors = s.cursors;
        this._render(); this._syncMirror();
    }

    _redo() {
        if (!this._redoStack.length) return;
        this._undoStack.push({ lines: [...this._lines], cursors: JSON.parse(JSON.stringify(this._cursors)) });
        const s = this._redoStack.pop();
        this._lines = s.lines; this._cursors = s.cursors;
        this._render(); this._syncMirror();
    }

    // ── Core text mutation ────────────────────────────────────────────────────

    // Sort cursors bottom-right to top-left so insertions don't shift later positions
    _sortedCursors() {
        return [...this._cursors].sort((a, b) =>
            b.line !== a.line ? b.line - a.line : b.col - a.col);
    }

    _insert(text) {
        this._startUndoBatch();
        for (const cur of this._sortedCursors()) {
            if (this._hasSel(cur)) this._delSel(cur);
            const line = this._lines[cur.line] || '';
            const before = line.slice(0, cur.col);
            const after  = line.slice(cur.col);
            const parts  = text.split('\n');
            if (parts.length === 1) {
                this._lines[cur.line] = before + text + after;
                cur.col += text.length;
            } else {
                const newLines = [before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after];
                this._lines.splice(cur.line, 1, ...newLines);
                // Adjust cursors ABOVE this one that are on the same or later lines
                const addedLines = parts.length - 1;
                for (const other of this._cursors) {
                    if (other === cur) continue;
                    if (other.line > cur.line) { other.line += addedLines; other.selLine += addedLines; }
                }
                cur.line += addedLines;
                cur.col = parts[parts.length - 1].length;
            }
            cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
        }
    }

    _insertNewline() {
        this._flushUndoBatch(); this._saveUndo();
        for (const cur of this._sortedCursors()) {
            if (this._hasSel(cur)) this._delSel(cur);
            const line   = this._lines[cur.line] || '';
            const indent = line.match(/^(\s*)/)?.[1] || '';
            const charBef = line.slice(0, cur.col).trimEnd().slice(-1);
            const extra  = ['{', '[', '('].includes(charBef) ? '    ' : '';
            this._lines[cur.line] = line.slice(0, cur.col);
            const newLine = indent + extra + line.slice(cur.col);
            this._lines.splice(cur.line + 1, 0, newLine);
            // Shift cursors below
            for (const o of this._cursors) {
                if (o !== cur && o.line > cur.line) { o.line++; o.selLine++; }
            }
            cur.line++; cur.col = (indent + extra).length;
            cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
        }
    }

    _deleteBackward() {
        this._flushUndoBatch(); this._saveUndo();
        for (const cur of this._sortedCursors()) {
            if (this._hasSel(cur)) { this._delSel(cur); continue; }
            if (cur.col > 0) {
                const l = this._lines[cur.line];
                this._lines[cur.line] = l.slice(0, cur.col - 1) + l.slice(cur.col);
                cur.col--;
                // Shift cursors on same line after this col
                for (const o of this._cursors) {
                    if (o !== cur && o.line === cur.line && o.col > cur.col) {
                        o.col--; o.selCol--;
                    }
                }
            } else if (cur.line > 0) {
                const prev = this._lines[cur.line - 1];
                const cur2 = this._lines[cur.line];
                cur.col = prev.length;
                this._lines[cur.line - 1] = prev + cur2;
                this._lines.splice(cur.line, 1);
                for (const o of this._cursors) {
                    if (o !== cur && o.line > cur.line) { o.line--; o.selLine--; }
                }
                cur.line--;
            }
            cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
        }
    }

    _deleteForward() {
        this._flushUndoBatch(); this._saveUndo();
        for (const cur of this._sortedCursors()) {
            if (this._hasSel(cur)) { this._delSel(cur); continue; }
            const l = this._lines[cur.line];
            if (cur.col < l.length) {
                this._lines[cur.line] = l.slice(0, cur.col) + l.slice(cur.col + 1);
                for (const o of this._cursors) {
                    if (o !== cur && o.line === cur.line && o.col > cur.col) {
                        o.col--; o.selCol--;
                    }
                }
            } else if (cur.line < this._lines.length - 1) {
                this._lines[cur.line] = l + this._lines[cur.line + 1];
                this._lines.splice(cur.line + 1, 1);
                for (const o of this._cursors) {
                    if (o !== cur && o.line > cur.line) { o.line--; o.selLine--; }
                }
            }
            cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
        }
    }

    async _paste(dataTransfer) {
        let text = '';
        if (dataTransfer) {
            try { text = dataTransfer.getData('text/plain') || ''; } catch (_) { /* ignore */ }
        }
        if (!text) {
            try { text = await navigator.clipboard.readText(); } catch (_) { /* ignore */ }
        }
        if (!text) return;
        this._flushUndoBatch(); this._saveUndo();
        this._insert(text);
        this._render(); this._syncMirror(); this._scrollToCursor();
    }

    _cut() {
        const sorted = [...this._cursors].sort((a, b) => a.line !== b.line ? a.line - b.line : a.col - b.col);
        const parts = sorted.filter(c => this._hasSel(c)).map(c => this._selText(c));
        if (parts.length) navigator.clipboard.writeText(parts.join('\n')).catch(() => {});
        this._flushUndoBatch(); this._saveUndo();
        for (const cur of this._sortedCursors()) {
            if (this._hasSel(cur)) this._delSel(cur);
        }
    }

    _copy() {
        const sorted = [...this._cursors].sort((a, b) => a.line !== b.line ? a.line - b.line : a.col - b.col);
        const parts = sorted.filter(c => this._hasSel(c)).map(c => this._selText(c));
        if (parts.length) navigator.clipboard.writeText(parts.join('\n')).catch(() => {});
    }

    // ── Selection helpers ─────────────────────────────────────────────────────

    _hasSel(cur) { return cur.line !== cur.selLine || cur.col !== cur.selCol; }

    _selStart(cur) {
        const before = cur.selLine < cur.line || (cur.selLine === cur.line && cur.selCol < cur.col);
        return before ? [cur.selLine, cur.selCol] : [cur.line, cur.col];
    }

    _selEnd(cur) {
        const before = cur.selLine < cur.line || (cur.selLine === cur.line && cur.selCol < cur.col);
        return before ? [cur.line, cur.col] : [cur.selLine, cur.selCol];
    }

    _delSel(cur) {
        const [sl, sc] = this._selStart(cur);
        const [el, ec] = this._selEnd(cur);
        if (sl === el) {
            this._lines[sl] = this._lines[sl].slice(0, sc) + this._lines[sl].slice(ec);
            // Shift other cursors on same line
            for (const o of this._cursors) {
                if (o !== cur && o.line === sl && o.col >= ec) { o.col -= (ec - sc); o.selCol -= (ec - sc); }
                else if (o !== cur && o.line === sl && o.col > sc) { o.col = sc; o.selCol = sc; }
            }
        } else {
            const newLine = this._lines[sl].slice(0, sc) + this._lines[el].slice(ec);
            this._lines.splice(sl, el - sl + 1, newLine);
            const removed = el - sl;
            for (const o of this._cursors) {
                if (o === cur) continue;
                if (o.line > el) { o.line -= removed; o.selLine -= removed; }
                else if (o.line >= sl) { o.line = sl; o.col = sc; o.selLine = sl; o.selCol = sc; }
            }
        }
        cur.line = sl; cur.col = sc; cur.selLine = sl; cur.selCol = sc; cur.wantCol = sc;
    }

    _selText(cur) {
        const [sl, sc] = this._selStart(cur);
        const [el, ec] = this._selEnd(cur);
        if (sl === el) return this._lines[sl].slice(sc, ec);
        const parts = [this._lines[sl].slice(sc)];
        for (let l = sl + 1; l < el; l++) parts.push(this._lines[l]);
        parts.push(this._lines[el].slice(0, ec));
        return parts.join('\n');
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    _moveCursors(dir, select, ctrl) {
        this._flushUndoBatch();
        for (const cur of this._cursors) this._moveCursor(cur, dir, select, ctrl);
        this._mergeCursors();
    }

    _moveCursor(cur, dir, select, ctrl) {
        const maxLine = this._lines.length - 1;
        if (dir === 'left') {
            if (!select && this._hasSel(cur)) {
                const [sl, sc] = this._selStart(cur);
                cur.line = sl; cur.col = sc;
            } else if (ctrl) {
                let l = cur.line, c = cur.col;
                if (c === 0 && l > 0) { l--; c = this._lines[l].length; }
                else { while (c > 0 && !/\w/.test(this._lines[l][c-1])) c--;
                       while (c > 0 && /\w/.test(this._lines[l][c-1])) c--; }
                cur.line = l; cur.col = c;
            } else {
                if (cur.col > 0) cur.col--;
                else if (cur.line > 0) { cur.line--; cur.col = this._lines[cur.line].length; }
            }
            cur.wantCol = cur.col;
        } else if (dir === 'right') {
            if (!select && this._hasSel(cur)) {
                const [el, ec] = this._selEnd(cur);
                cur.line = el; cur.col = ec;
            } else if (ctrl) {
                let l = cur.line, c = cur.col;
                const ll = this._lines[l].length;
                if (c === ll && l < maxLine) { l++; c = 0; }
                else { while (c < this._lines[l].length && !/\w/.test(this._lines[l][c])) c++;
                       while (c < this._lines[l].length && /\w/.test(this._lines[l][c])) c++; }
                cur.line = l; cur.col = c;
            } else {
                if (cur.col < this._lines[cur.line].length) cur.col++;
                else if (cur.line < maxLine) { cur.line++; cur.col = 0; }
            }
            cur.wantCol = cur.col;
        } else if (dir === 'up') {
            if (cur.line > 0) { cur.line--; cur.col = Math.min(cur.wantCol, this._lines[cur.line].length); }
        } else if (dir === 'down') {
            if (cur.line < maxLine) { cur.line++; cur.col = Math.min(cur.wantCol, this._lines[cur.line].length); }
        } else if (dir === 'home') {
            const indent = (this._lines[cur.line].match(/^(\s*)/)?.[1] || '').length;
            cur.col = cur.col > indent ? indent : 0;
            cur.wantCol = cur.col;
        } else if (dir === 'end') {
            cur.col = this._lines[cur.line].length;
            cur.wantCol = cur.col;
        } else if (dir === 'docStart') {
            cur.line = 0; cur.col = 0; cur.wantCol = 0;
        } else if (dir === 'docEnd') {
            cur.line = maxLine; cur.col = this._lines[maxLine].length; cur.wantCol = cur.col;
        }
        if (!select) { cur.selLine = cur.line; cur.selCol = cur.col; }
    }

    _selectAll() {
        const last = this._lines.length - 1;
        this._cursors = [{ line: last, col: this._lines[last].length, selLine: 0, selCol: 0, wantCol: this._lines[last].length }];
    }

    // ── Line operations ───────────────────────────────────────────────────────

    _duplicateLine() {
        this._flushUndoBatch(); this._saveUndo();
        const lineNums = [...new Set(this._cursors.map(c => c.line))].sort((a, b) => b - a);
        for (const l of lineNums) {
            this._lines.splice(l + 1, 0, this._lines[l]);
            for (const cur of this._cursors) {
                if (cur.line > l) { cur.line++; cur.selLine++; }
            }
        }
    }

    _moveLine(dir) {
        this._flushUndoBatch(); this._saveUndo();
        const lineNums = [...new Set(this._cursors.map(c => c.line))].sort(dir === 'up' ? (a,b)=>a-b : (a,b)=>b-a);
        for (const l of lineNums) {
            if (dir === 'up' && l > 0) {
                [this._lines[l-1], this._lines[l]] = [this._lines[l], this._lines[l-1]];
                for (const cur of this._cursors) {
                    if (cur.line === l) { cur.line--; cur.selLine = cur.line; }
                    else if (cur.line === l - 1) { cur.line++; cur.selLine = cur.line; }
                }
            } else if (dir === 'down' && l < this._lines.length - 1) {
                [this._lines[l], this._lines[l+1]] = [this._lines[l+1], this._lines[l]];
                for (const cur of this._cursors) {
                    if (cur.line === l) { cur.line++; cur.selLine = cur.line; }
                    else if (cur.line === l + 1) { cur.line--; cur.selLine = cur.line; }
                }
            }
        }
    }

    _deleteLine() {
        this._flushUndoBatch(); this._saveUndo();
        const lineNums = [...new Set(this._cursors.map(c => c.line))].sort((a, b) => b - a);
        for (const l of lineNums) {
            if (this._lines.length === 1) { this._lines[0] = ''; }
            else { this._lines.splice(l, 1); }
            const maxL = this._lines.length - 1;
            for (const cur of this._cursors) {
                if (cur.line === l) { cur.line = Math.min(l, maxL); cur.col = Math.min(cur.col, this._lines[cur.line].length); }
                else if (cur.line > l) { cur.line--; }
                cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
            }
        }
    }

    _selectLine() {
        for (const cur of this._cursors) {
            cur.selLine = cur.line; cur.selCol = 0;
            cur.col = this._lines[cur.line].length;
            cur.wantCol = cur.col;
        }
    }

    _toggleComment() {
        this._flushUndoBatch(); this._saveUndo();
        const lineSet = new Set();
        for (const cur of this._cursors) {
            const [sl] = this._selStart(cur); const [el] = this._selEnd(cur);
            for (let l = sl; l <= el; l++) lineSet.add(l);
        }
        const lines = [...lineSet];
        const allCommented = lines.every(l => /^\s*\/\//.test(this._lines[l]));
        for (const l of lines) {
            if (allCommented) {
                this._lines[l] = this._lines[l].replace(/^(\s*)\/\/\s?/, '$1');
            } else {
                const ind = this._lines[l].match(/^(\s*)/)?.[1] || '';
                this._lines[l] = ind + '// ' + this._lines[l].slice(ind.length);
            }
        }
    }

    _indent(shift = false) {
        const SPACES = '    ';
        this._flushUndoBatch(); this._saveUndo();
        const hasAnySel = this._cursors.some(c => this._hasSel(c));
        if (!shift && !hasAnySel) { this._insert(SPACES); return; }

        const lineSet = new Set();
        for (const cur of this._cursors) {
            const [sl] = this._selStart(cur); const [el] = this._selEnd(cur);
            for (let l = sl; l <= el; l++) lineSet.add(l);
            if (!hasAnySel) lineSet.add(cur.line);
        }
        for (const l of [...lineSet]) {
            if (shift) {
                let removed = 0;
                if (this._lines[l].startsWith(SPACES)) { this._lines[l] = this._lines[l].slice(4); removed = 4; }
                else if (this._lines[l].startsWith('\t')) { this._lines[l] = this._lines[l].slice(1); removed = 1; }
                else { const m = this._lines[l].match(/^ {1,3}/); if (m) { this._lines[l] = this._lines[l].slice(m[0].length); removed = m[0].length; } }
                if (removed) {
                    for (const cur of this._cursors) {
                        if (cur.line === l) { cur.col = Math.max(0, cur.col - removed); cur.selCol = Math.max(0, cur.selCol - removed); }
                    }
                }
            } else {
                this._lines[l] = SPACES + this._lines[l];
                for (const cur of this._cursors) {
                    if (cur.line === l) { cur.col += SPACES.length; cur.selCol += SPACES.length; }
                }
            }
        }
    }

    _autoCloseOrInsert(char) {
        const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
        const CLOSERS = new Set(Object.values(PAIRS));
        // Skip over closing char if already present
        if (CLOSERS.has(char) && this._cursors.length === 1) {
            const cur = this._cursors[0];
            if (!this._hasSel(cur) && this._lines[cur.line]?.[cur.col] === char) {
                cur.col++; cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
                return;
            }
        }
        // Auto-close pairs for single cursor with no selection
        if (PAIRS[char] && this._cursors.length === 1 && !this._hasSel(this._cursors[0])) {
            this._insert(char + PAIRS[char]);
            const cur = this._cursors[0];
            cur.col--; cur.selLine = cur.line; cur.selCol = cur.col; cur.wantCol = cur.col;
        } else {
            this._insert(char);
        }
    }

    // ── Cursor management ─────────────────────────────────────────────────────

    _addCursorAbove() {
        const top = this._cursors.reduce((a, b) => a.line <= b.line ? a : b);
        if (top.line > 0) {
            const l = top.line - 1;
            const c = Math.min(top.wantCol, this._lines[l].length);
            const nc = this._mkCursor(l, c);
            nc.wantCol = top.wantCol;
            this._cursors.push(nc);
            this._mergeCursors();
        }
    }

    _addCursorBelow() {
        const bot = this._cursors.reduce((a, b) => a.line >= b.line ? a : b);
        if (bot.line < this._lines.length - 1) {
            const l = bot.line + 1;
            const c = Math.min(bot.wantCol, this._lines[l].length);
            const nc = this._mkCursor(l, c);
            nc.wantCol = bot.wantCol;
            this._cursors.push(nc);
            this._mergeCursors();
        }
    }

    _mergeCursors() {
        this._cursors.sort((a, b) => a.line !== b.line ? a.line - b.line : a.col - b.col);
        const merged = [this._cursors[0]];
        for (let i = 1; i < this._cursors.length; i++) {
            const p = merged[merged.length - 1], c = this._cursors[i];
            if (c.line !== p.line || c.col !== p.col) merged.push(c);
        }
        this._cursors = merged;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    _render() {
        this._renderLines();
        this._updateLineNumbers();
        this._updateOverlay();
    }

    _renderLines() {
        const ps   = typeof getPaneState === 'function' ? getPaneState(this.paneId) : null;
        const lang = ps ? (typeof getExtension === 'function' ? getExtension(ps.currentFilename || '') : '') : '';
        const kids = this.ceEl.children;

        for (let i = 0; i < this._lines.length; i++) {
            const text = this._lines[i];
            const html = text === '' ? '<br>' :
                (typeof highlightCode === 'function' ? highlightCode(text, lang) : _ceEscHtml(text));

            if (i < kids.length) {
                if (kids[i].dataset.srcHash !== text) {
                    kids[i].innerHTML  = html;
                    kids[i].dataset.srcHash = text;
                }
            } else {
                const d = document.createElement('div');
                d.className = 'ce-line';
                d.innerHTML = html;
                d.dataset.srcHash = text;
                this.ceEl.appendChild(d);
            }
        }
        while (this.ceEl.children.length > this._lines.length) {
            this.ceEl.removeChild(this.ceEl.lastChild);
        }
    }

    _updateLineNumbers() {
        if (!this.lineNumEl) return;
        const n = this._lines.length;
        const nums = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        if (this.lineNumEl.textContent !== nums) this.lineNumEl.textContent = nums;
        this._syncLineNumScroll();
    }

    _syncLineNumScroll() {
        if (this.lineNumEl) this.lineNumEl.scrollTop = this.ceEl.scrollTop;
    }

    _updateOverlay() {
        if (!this.overlayEl) return;
        if (this._charW < 1) return;

        this.overlayEl.innerHTML = '';
        const pT = this._padTop, pL = this._padLeft, lH = this._lineH, cW = this._charW;
        const sT = this.ceEl.scrollTop, sL = this.ceEl.scrollLeft;

        for (const cur of this._cursors) {
            // Draw selection
            if (this._hasSel(cur)) {
                const [sl, sc] = this._selStart(cur);
                const [el, ec] = this._selEnd(cur);
                for (let l = sl; l <= el; l++) {
                    const lineLen = this._lines[l].length;
                    const c0 = l === sl ? sc : 0;
                    const c1 = l === el ? ec : lineLen;
                    const x = pL + c0 * cW - sL;
                    const y = pT + l * lH - sT;
                    const w = Math.max(2, (c1 - c0) * cW);
                    const sel = document.createElement('div');
                    sel.className = 'ce-sel';
                    sel.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${lH}px;`;
                    this.overlayEl.appendChild(sel);
                }
            }
            // Draw cursor (blinking caret)
            const cx = pL + cur.col * cW - sL;
            const cy = pT + cur.line * lH - sT;
            const ce = document.createElement('div');
            ce.className = 'ce-cursor';
            ce.style.cssText = `left:${cx}px;top:${cy}px;height:${lH}px;`;
            this.overlayEl.appendChild(ce);
        }
    }

    _syncMirror() {
        const val = this.getValue();
        this.mirrorEl.value = val;
        this.mirrorEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Sync cursor position to mirror selectionStart/End (for URL tracking)
    _syncCursorToMirror() {
        const start = this.getSelectionStart();
        const end   = this.getSelectionEnd();
        try { this.mirrorEl.selectionStart = start; this.mirrorEl.selectionEnd = end; } catch (_) { /* ignore */ }
    }

    _scrollToCursor() {
        const cur = this._cursors[0]; if (!cur) return;
        const cTop    = this._padTop  + cur.line * this._lineH;
        const cBottom = cTop + this._lineH;
        const cLeft   = this._padLeft + cur.col  * this._charW;
        const cRight  = cLeft + this._charW;
        const vT = this.ceEl.scrollTop, vB = vT + this.ceEl.clientHeight;
        const vL = this.ceEl.scrollLeft, vR = vL + this.ceEl.clientWidth;
        if (cTop    < vT) this.ceEl.scrollTop  = cTop - this._padTop;
        else if (cBottom > vB) this.ceEl.scrollTop  = cBottom - this.ceEl.clientHeight + 4;
        if (cLeft   < vL + this._padLeft) this.ceEl.scrollLeft = Math.max(0, cLeft - this._padLeft - 20);
        else if (cRight  > vR) this.ceEl.scrollLeft = cRight  - this.ceEl.clientWidth + 20;
    }

    // ── Position helpers ──────────────────────────────────────────────────────

    _posToOffset(line, col) {
        let off = 0;
        for (let i = 0; i < Math.min(line, this._lines.length); i++) off += this._lines[i].length + 1;
        return off + Math.min(col, (this._lines[line] || '').length);
    }

    _offsetToPos(offset) {
        let rem = Math.max(0, offset);
        for (let l = 0; l < this._lines.length; l++) {
            const ll = this._lines[l].length;
            if (rem <= ll) return { line: l, col: rem };
            rem -= ll + 1;
        }
        const last = this._lines.length - 1;
        return { line: last, col: this._lines[last].length };
    }

    _pointToPos(clientX, clientY) {
        const rect = this.ceEl.getBoundingClientRect();
        const x = clientX - rect.left + this.ceEl.scrollLeft - this._padLeft;
        const y = clientY - rect.top  + this.ceEl.scrollTop  - this._padTop;
        let line = Math.floor(y / this._lineH);
        line = Math.max(0, Math.min(line, this._lines.length - 1));
        let col = Math.round(x / this._charW);
        col = Math.max(0, Math.min(col, this._lines[line].length));
        return { line, col };
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    _onBeforeInput(e) {
        if (this._isComposing) return;
        e.preventDefault();
        switch (e.inputType) {
            case 'insertText':
                if (e.data) this._autoCloseOrInsert(e.data);
                break;
            case 'insertParagraph':
            case 'insertLineBreak':
                this._insertNewline();
                break;
            case 'deleteContentBackward':
                this._deleteBackward();
                break;
            case 'deleteContentForward':
                this._deleteForward();
                break;
            case 'insertFromPaste':
                this._paste(e.dataTransfer);
                return; // async — skip immediate render+sync below
            case 'deleteByCut':
                this._cut();
                break;
            case 'historyUndo':
                this._undo(); return;
            case 'historyRedo':
                this._redo(); return;
            default: return;
        }
        this._render(); this._syncMirror(); this._scrollToCursor();
    }

    _onKeyDown(e) {
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const alt = e.altKey;

        const _nav = (dir, sel) => {
            e.preventDefault();
            this._moveCursors(dir, sel, ctrl);
            this._updateOverlay(); this._scrollToCursor();
            this._syncCursorToMirror();
            this.mirrorEl.dispatchEvent(new Event('keyup', { bubbles: true }));
        };

        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                this._indent(shift);
                this._render(); this._syncMirror(); this._scrollToCursor();
                break;

            case 'ArrowLeft':  _nav('left',  shift); break;
            case 'ArrowRight': _nav('right', shift); break;

            case 'ArrowUp':
                if (alt && !ctrl)       { e.preventDefault(); this._moveLine('up');  this._render(); this._syncMirror(); this._scrollToCursor(); }
                else if (ctrl && alt)   { e.preventDefault(); this._addCursorAbove(); this._updateOverlay(); }
                else                    _nav('up', shift);
                break;

            case 'ArrowDown':
                if (alt && !ctrl)       { e.preventDefault(); this._moveLine('down'); this._render(); this._syncMirror(); this._scrollToCursor(); }
                else if (ctrl && alt)   { e.preventDefault(); this._addCursorBelow(); this._updateOverlay(); }
                else                    _nav('down', shift);
                break;

            case 'Home':
                e.preventDefault();
                this._moveCursors(ctrl ? 'docStart' : 'home', shift, false);
                this._updateOverlay(); this._scrollToCursor();
                this._syncCursorToMirror();
                this.mirrorEl.dispatchEvent(new Event('keyup', { bubbles: true }));
                break;
            case 'End':
                e.preventDefault();
                this._moveCursors(ctrl ? 'docEnd' : 'end', shift, false);
                this._updateOverlay(); this._scrollToCursor();
                this._syncCursorToMirror();
                this.mirrorEl.dispatchEvent(new Event('keyup', { bubbles: true }));
                break;

            case 'PageUp':
                e.preventDefault();
                this.ceEl.scrollTop = Math.max(0, this.ceEl.scrollTop - this.ceEl.clientHeight);
                this._updateOverlay();
                break;
            case 'PageDown':
                e.preventDefault();
                this.ceEl.scrollTop += this.ceEl.clientHeight;
                this._updateOverlay();
                break;

            case 'a':
                if (ctrl) { e.preventDefault(); this._selectAll(); this._updateOverlay(); }
                break;
            case 'z':
                if (ctrl && !shift) { e.preventDefault(); this._undo(); }
                break;
            case 'Z': case 'y':
                if (ctrl) { e.preventDefault(); this._redo(); }
                break;
            case 'D': case 'd':
                if (ctrl && shift) { e.preventDefault(); this._duplicateLine(); this._render(); this._syncMirror(); this._scrollToCursor(); }
                break;
            case 'K': case 'k':
                if (ctrl && shift) { e.preventDefault(); this._deleteLine(); this._render(); this._syncMirror(); this._scrollToCursor(); }
                break;
            case 'l':
                if (ctrl) { e.preventDefault(); this._selectLine(); this._updateOverlay(); }
                break;
            case '/':
                if (ctrl) { e.preventDefault(); this._toggleComment(); this._render(); this._syncMirror(); this._scrollToCursor(); }
                break;
            case 'c':
                if (ctrl) { e.preventDefault(); this._copy(); }
                break;
            case 'x':
                if (ctrl) {
                    e.preventDefault();
                    const hasAnySelection = this._cursors.some(c => this._hasSel(c));
                    if (hasAnySelection) {
                        this._cut(); this._render(); this._syncMirror(); this._scrollToCursor();
                    } else {
                        // Cut line: copy then delete
                        const lines = [...new Set(this._cursors.map(c => c.line))].sort((a, b) => a - b);
                        navigator.clipboard.writeText(lines.map(l => this._lines[l]).join('\n')).catch(() => {});
                        this._deleteLine(); this._render(); this._syncMirror(); this._scrollToCursor();
                    }
                }
                break;
            case 'Escape':
                if (this._cursors.length > 1) {
                    e.preventDefault();
                    this._cursors = [this._cursors[this._cursors.length - 1]];
                    const c = this._cursors[0];
                    c.selLine = c.line; c.selCol = c.col;
                    this._updateOverlay();
                }
                break;
        }
    }

    _onMouseDown(e) {
        const pos = this._pointToPos(e.clientX, e.clientY);
        if (!pos) return;

        if (e.altKey) {
            e.preventDefault();
            this._cursors.push(this._mkCursor(pos.line, pos.col));
            this._mergeCursors();
            this._updateOverlay();
            return;
        }

        if (e.shiftKey && this._cursors.length === 1) {
            const cur = this._cursors[0];
            cur.line = pos.line; cur.col = pos.col; cur.wantCol = pos.col;
        } else {
            this._cursors = [this._mkCursor(pos.line, pos.col)];
        }

        const cur = this._cursors[this._cursors.length - 1];
        // Save anchor for drag selection
        const anchorLine = cur.selLine, anchorCol = cur.selCol;

        const onMove = (me) => {
            const mp = this._pointToPos(me.clientX, me.clientY);
            if (!mp) return;
            cur.line = mp.line; cur.col = mp.col; cur.wantCol = mp.col;
            // Keep anchor
            cur.selLine = anchorLine; cur.selCol = anchorCol;
            this._updateOverlay();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this._syncCursorToMirror();
            this.mirrorEl.dispatchEvent(new Event('mouseup', { bubbles: true }));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        this._updateOverlay();
    }

    _onDblClick(e) {
        const pos = this._pointToPos(e.clientX, e.clientY);
        if (!pos) return;
        const line = this._lines[pos.line] || '';
        let start = pos.col;
        let end = pos.col;
        while (start > 0 && /\w/.test(line[start - 1])) start--;
        while (end < line.length && /\w/.test(line[end])) end++;
        if (start === end && end < line.length) end++;
        this._cursors = [{
            line: pos.line, col: end,
            selLine: pos.line, selCol: start,
            wantCol: end
        }];
        this._updateOverlay();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _ceEscHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initSourceEditor(ceEl, mirrorEl, lineNumEl, overlayEl, paneId) {
    if (!ceEl || !mirrorEl) return null;
    return new SourceEditor(ceEl, mirrorEl, lineNumEl, overlayEl, paneId);
}

// ── Global test helper ────────────────────────────────────────────────────────

window.setEditorValue = function(paneId, value) {
    const eng = window.sourceEditors && window.sourceEditors[paneId];
    if (eng) eng.setValue(value); // setValue fires _syncMirror which fires input
};
