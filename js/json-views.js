'use strict';

// =========================================================================
// JSON detection (from tunnelmesh s3explorer)
// =========================================================================


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
            if (Array.isArray(value)) {
                return `<span class="s3-ds-nested" data-row-idx="${rowIdx}" data-col-key="${escapeHtml(colKey)}" title="Click to view">
                    <span class="s3-ds-nested-text">${value.length} items</span></span>`;
            }
            if (typeof value === 'object' && value !== null) {
                return `<span class="s3-ds-nested" data-row-idx="${rowIdx}" data-col-key="${escapeHtml(colKey)}" title="Click to view">
                    <span class="s3-ds-nested-text">{…}</span></span>`;
            }
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
    const backEntry = ps.nestedStack && ps.nestedStack.length > 0
        ? ps.nestedStack[ps.nestedStack.length - 1] : null;
    container.innerHTML = `
        <div class="s3-datasheet-toolbar">
            ${backEntry ? `<button class="btn btn-sm s3-ds-back" id="s3-ds-back${sfx}">← ${escapeHtml(backEntry.title)}</button>` : ''}
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

    // Back button (nested drill-in navigation)
    document.getElementById(`s3-ds-back${sfx}`)?.addEventListener('click', () => nestedBack(paneId));

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
            const val = ps.datasheetData?.[rowIdx]?.[colKey];
            if (Array.isArray(val) && detectDatasheetMode(JSON.stringify(val)).isDatasheet) {
                drillIntoNested(val, `${colKey} [Row ${rowIdx + 1}]`, paneId);
            } else {
                openNestedModalValue(val, `${colKey} [Row ${rowIdx + 1}]`);
            }
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

    // Attach array-link handlers — drill in-pane for tables, modal for raw values
    container.querySelectorAll('.tree-array-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = el.dataset.treePath;
            const val = _getValueAtPath(ps.treeviewData, path);
            const label = path.replace(/^root\.?/, '').split(/\.|\[|\]/).filter(Boolean).pop() || 'root';
            if (Array.isArray(val) && detectDatasheetMode(JSON.stringify(val)).isDatasheet) {
                drillIntoNested(val, label, paneId);
            } else {
                openNestedModalValue(val, label);
            }
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
            <span class="tree-bracket">[</span><span class="tree-count tree-array-link" data-tree-path="${escapeHtml(fullPath)}">${value.length} items</span><span class="tree-bracket">]</span>`;

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

let _nestedModalStack = [];

function openNestedModalValue(value, title) {
    _nestedModalStack = [{ value, title }];
    _renderNestedModalFrame();
    document.getElementById('nested-modal')?.classList.add('open');
}

function _renderNestedModalFrame() {
    const { value, title } = _nestedModalStack[_nestedModalStack.length - 1];
    const body = document.getElementById('nested-body');
    const titleEl = document.getElementById('nested-title');
    const backBtn = document.getElementById('nested-modal-back');
    if (!body) return;
    if (titleEl) titleEl.textContent = title;
    if (backBtn) backBtn.style.display = _nestedModalStack.length > 1 ? '' : 'none';
    body.innerHTML = `<pre class="s3-nested-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function closeNestedModal() {
    const modal = document.getElementById('nested-modal');
    if (modal) modal.classList.remove('open');
    _nestedModalStack = [];
}

// =========================================================================
// In-pane nested table navigation
// =========================================================================

function drillIntoNested(value, title, paneId = 'pane1') {
    const ps = getPaneState(paneId);
    ps.nestedStack.push({
        title,
        mode: ps.editorMode,
        datasheetData: ps.datasheetData,
        datasheetSchema: ps.datasheetSchema,
        datasheetPage: ps.datasheetPage,
        treeviewData: ps.treeviewData,
        treeviewCollapsed: ps.treeviewCollapsed,
    });
    ps.datasheetData = value;
    ps.datasheetSchema = inferSchema(value);
    ps.datasheetPage = 1;
    ps.editorMode = 'datasheet';

    const wrap = getPaneEl('source-editor-wrap', paneId);
    const wysiwyg = getPaneEl('wysiwyg', paneId);
    const datasheet = getPaneEl('s3-datasheet', paneId);
    const treeview = getPaneEl('s3-treeview', paneId);
    const imageViewer = getPaneEl('image-viewer', paneId);
    if (wrap) wrap.style.display = 'none';
    if (wysiwyg) wysiwyg.style.display = 'none';
    if (treeview) treeview.style.display = 'none';
    if (imageViewer) imageViewer.style.display = 'none';
    if (datasheet) { datasheet.style.display = 'flex'; _renderDatasheet(paneId); }
}

function nestedBack(paneId = 'pane1') {
    const ps = getPaneState(paneId);
    if (!ps.nestedStack.length) return;
    const entry = ps.nestedStack.pop();
    ps.datasheetData = entry.datasheetData;
    ps.datasheetSchema = entry.datasheetSchema;
    ps.datasheetPage = entry.datasheetPage;
    ps.treeviewData = entry.treeviewData;
    ps.treeviewCollapsed = entry.treeviewCollapsed;
    ps.editorMode = entry.mode;

    const wrap = getPaneEl('source-editor-wrap', paneId);
    const wysiwyg = getPaneEl('wysiwyg', paneId);
    const datasheet = getPaneEl('s3-datasheet', paneId);
    const treeview = getPaneEl('s3-treeview', paneId);
    const imageViewer = getPaneEl('image-viewer', paneId);
    if (wrap) wrap.style.display = 'none';
    if (wysiwyg) wysiwyg.style.display = 'none';
    if (datasheet) datasheet.style.display = 'none';
    if (treeview) treeview.style.display = 'none';
    if (imageViewer) imageViewer.style.display = 'none';

    if (entry.mode === 'treeview') {
        if (treeview) { treeview.style.display = 'block'; renderTreeView(paneId); }
    } else if (entry.mode === 'datasheet') {
        if (datasheet) { datasheet.style.display = 'flex'; _renderDatasheet(paneId); }
    }
}

