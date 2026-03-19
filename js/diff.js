'use strict';

// =========================================================================
// Line-level Diff — Myers O(ND) algorithm + unified diff HTML renderer
// =========================================================================

// ---------------------------------------------------------------------------
// Myers diff — returns [{type: 'eq'|'add'|'del', text}]
// ---------------------------------------------------------------------------

function _myersDiff(a, b) {
    const N = a.length, M = b.length;
    if (N === 0 && M === 0) return [];
    if (N === 0) return b.map(t => ({ type: 'add', text: t }));
    if (M === 0) return a.map(t => ({ type: 'del', text: t }));

    const MAX = N + M;
    const V = new Array(2 * MAX + 1).fill(0);
    const trace = []; // V snapshots, trace[d] = V at START of step d

    outer: for (let d = 0; d <= MAX; d++) {
        trace.push(V.slice());
        for (let k = -d; k <= d; k += 2) {
            let x;
            if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
                x = V[k + 1 + MAX]; // insertion: move down from k+1
            } else {
                x = V[k - 1 + MAX] + 1; // deletion: move right from k-1
            }
            let y = x - k;
            while (x < N && y < M && a[x] === b[y]) { x++; y++; }
            V[k + MAX] = x;
            if (x >= N && y >= M) break outer;
        }
    }

    // Backtrack to recover the edit sequence
    const edits = [];
    let x = N, y = M;

    for (let d = trace.length - 1; d >= 0; d--) {
        if (d === 0) {
            // Only initial diagonals remain
            while (x > 0 && y > 0) { x--; y--; edits.push({ type: 'eq', text: a[x] }); }
            break;
        }

        const Vd = trace[d];
        const k = x - y;
        let prevK;
        if (k === -d || (k !== d && Vd[k - 1 + MAX] < Vd[k + 1 + MAX])) {
            prevK = k + 1; // insertion move
        } else {
            prevK = k - 1; // deletion move
        }
        const prevX = Vd[prevK + MAX];

        if (prevK === k + 1) {
            // Insertion: snake from (prevX, prevY+1) → (x, y)
            while (x > prevX) { x--; y--; edits.push({ type: 'eq', text: a[x] }); }
            y--;
            edits.push({ type: 'add', text: b[y] });
        } else {
            // Deletion: snake from (prevX+1, prevY) → (x, y)
            while (x > prevX + 1) { x--; y--; edits.push({ type: 'eq', text: a[x] }); }
            x--;
            edits.push({ type: 'del', text: a[x] });
        }
    }

    edits.reverse();
    return edits;
}

function computeLineDiff(oldText, newText) {
    const splitLines = t => {
        if (!t) return [];
        const lines = t.split('\n');
        // Remove trailing empty line from split (artifact of trailing newline)
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        return lines;
    };
    return _myersDiff(splitLines(oldText), splitLines(newText));
}

// ---------------------------------------------------------------------------
// HTML renderer — unified diff with 3-line context hunks
// ---------------------------------------------------------------------------

function _diffLineHtml(cls, gutter, oldN, newN, text, lang) {
    const o = oldN !== null ? oldN : '';
    const n = newN !== null ? newN : '';
    const highlighted = lang ? highlightCode(text, lang) : escapeHtml(text);
    return `<div class="diff-line ${cls}">` +
        `<span class="diff-ln diff-ln-old" aria-hidden="true">${o}</span>` +
        `<span class="diff-ln diff-ln-new" aria-hidden="true">${n}</span>` +
        `<span class="diff-gutter" aria-hidden="true">${gutter}</span>` +
        `<code>${highlighted}</code></div>`;
}

function renderDiff(oldText, newText, status, lang = '') {
    // status: 'untracked' | 'modified'
    if (status === 'untracked') {
        const lines = newText ? newText.split('\n') : [];
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        if (!lines.length) {
            return '<div class="diff-untracked">New untracked file (empty)</div>';
        }
        let html = '<div class="diff-untracked">New untracked file</div>';
        for (let i = 0; i < lines.length; i++) {
            html += _diffLineHtml('diff-add', '+', null, i + 1, lines[i], lang);
        }
        return html;
    }

    const diff = computeLineDiff(oldText, newText);
    if (!diff.some(d => d.type !== 'eq')) {
        return '<div class="diff-clean">No changes vs HEAD</div>';
    }

    // Assign per-line numbers
    let oldN = 1, newN = 1;
    const lines = diff.map(d => {
        const ol = d.type !== 'add' ? oldN : null;
        const nl = d.type !== 'del' ? newN : null;
        if (d.type !== 'add') oldN++;
        if (d.type !== 'del') newN++;
        return { ...d, ol, nl };
    });

    // Mark which lines belong to a hunk (changed ± 3 context)
    const CONTEXT = 3;
    const inHunk = new Array(lines.length).fill(false);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].type !== 'eq') {
            for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
                inHunk[j] = true;
            }
        }
    }

    let html = '';
    let i = 0;
    while (i < lines.length) {
        if (!inHunk[i]) { i++; continue; }

        // Find extent of this hunk
        let hunkEnd = i;
        while (hunkEnd < lines.length && inHunk[hunkEnd]) hunkEnd++;

        // Hunk header numbers
        const hunkLines = lines.slice(i, hunkEnd);
        const oldStart = hunkLines.find(l => l.ol !== null)?.ol ?? 1;
        const newStart = hunkLines.find(l => l.nl !== null)?.nl ?? 1;
        const oldCount = hunkLines.filter(l => l.type !== 'add').length;
        const newCount = hunkLines.filter(l => l.type !== 'del').length;
        html += `<div class="diff-hunk">@@ -${oldStart},${oldCount} +${newStart},${newCount} @@</div>`;

        for (const l of hunkLines) {
            if (l.type === 'eq') {
                html += _diffLineHtml('diff-eq', '\u00a0', null, l.nl, l.text, lang);
            } else if (l.type === 'add') {
                html += _diffLineHtml('diff-add', '+', null, l.nl, l.text, lang);
            } else {
                html += _diffLineHtml('diff-del', '-', l.ol, null, l.text, '');
            }
        }

        i = hunkEnd;
    }

    return html;
}
