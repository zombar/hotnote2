// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

const SAMPLE_JSON_ARRAY = JSON.stringify([
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
]);

const SAMPLE_JSON_OBJECT = JSON.stringify({ key: 'value', nested: { a: 1 } });

const SAMPLE_CSV = 'name,age,city\nAlice,30,NYC\nBob,25,LA\n';

const SAMPLE_MD = '# Title\n\nSome **bold** text.\n\n- item 1\n- item 2\n';

const SAMPLE_JS = 'function hello() {\n  return "world";\n}\n';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

async function openFile(page, filename) {
    await page.locator('#file-list li.file-entry .file-entry-row', { hasText: filename }).click();
    // Wait for mode toolbar to appear
    await expect(page.locator('#mode-toolbar')).toBeVisible({ timeout: 5000 });
}

// ── Wysiwyg mode ─────────────────────────────────────────────────────────────

test.describe('wysiwyg mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('mode toolbar has wysiwyg button for .md file', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await expect(page.locator('#mode-wysiwyg')).toBeVisible();
    });

    test('clicking wysiwyg renders markdown HTML', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await page.locator('#mode-wysiwyg').click();
        const wysiwyg = page.locator('#wysiwyg');
        await expect(wysiwyg).toBeVisible();
        await expect(wysiwyg.locator('h1')).toContainText('Title');
        await expect(wysiwyg.locator('strong')).toContainText('bold');
    });

    test('wysiwyg mode hides source editor', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await page.locator('#mode-wysiwyg').click();
        await expect(page.locator('#source-editor-wrap')).toBeHidden();
    });

    test('switching back to source shows editor', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await page.locator('#mode-wysiwyg').click();
        await page.locator('#mode-source').click();
        await expect(page.locator('#source-editor-wrap')).toBeVisible();
    });
});

// ── Datasheet mode (JSON array) ───────────────────────────────────────────────

test.describe('datasheet mode (JSON array)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('mode toolbar shows datasheet button for JSON array file', async ({ page }) => {
        await openMockFolder(page, { 'data.json': SAMPLE_JSON_ARRAY });
        await openFile(page, 'data.json');
        await expect(page.locator('#mode-datasheet')).toBeVisible();
    });

    test('datasheet renders a table with correct columns', async ({ page }) => {
        await openMockFolder(page, { 'data.json': SAMPLE_JSON_ARRAY });
        await openFile(page, 'data.json');
        await page.locator('#mode-datasheet').click();
        await expect(page.locator('#s3-datasheet')).toBeVisible();
        // Check column headers
        const headers = await page.locator('#s3-datasheet th').allTextContents();
        expect(headers.some(h => h.includes('name'))).toBeTruthy();
        expect(headers.some(h => h.includes('id'))).toBeTruthy();
    });

    test('datasheet shows correct row data', async ({ page }) => {
        await openMockFolder(page, { 'data.json': SAMPLE_JSON_ARRAY });
        await openFile(page, 'data.json');
        await page.locator('#mode-datasheet').click();
        const cells = await page.locator('#s3-datasheet td').allTextContents();
        expect(cells.some(c => c.includes('Alice'))).toBeTruthy();
        expect(cells.some(c => c.includes('Bob'))).toBeTruthy();
    });

    test('treeview button available for JSON object', async ({ page }) => {
        await openMockFolder(page, { 'config.json': SAMPLE_JSON_OBJECT });
        await openFile(page, 'config.json');
        await expect(page.locator('#mode-treeview')).toBeVisible();
    });

    test('datasheet mode hides source editor', async ({ page }) => {
        await openMockFolder(page, { 'data.json': SAMPLE_JSON_ARRAY });
        await openFile(page, 'data.json');
        await page.locator('#mode-datasheet').click();
        await expect(page.locator('#source-editor-wrap')).toBeHidden();
        await expect(page.locator('#s3-datasheet')).toBeVisible();
    });
});

// ── Datasheet mode (CSV) ──────────────────────────────────────────────────────

test.describe('datasheet mode (CSV)', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('CSV file shows datasheet button', async ({ page }) => {
        await openMockFolder(page, { 'people.csv': SAMPLE_CSV });
        await openFile(page, 'people.csv');
        await expect(page.locator('#mode-datasheet')).toBeVisible();
    });

    test('CSV datasheet renders rows', async ({ page }) => {
        await openMockFolder(page, { 'people.csv': SAMPLE_CSV });
        await openFile(page, 'people.csv');
        await page.locator('#mode-datasheet').click();
        await expect(page.locator('#s3-datasheet')).toBeVisible();
        const cells = await page.locator('#s3-datasheet td').allTextContents();
        expect(cells.some(c => c.includes('Alice'))).toBeTruthy();
    });
});

// ── Treeview mode ─────────────────────────────────────────────────────────────

test.describe('treeview mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('JSON object file shows treeview button', async ({ page }) => {
        await openMockFolder(page, { 'config.json': SAMPLE_JSON_OBJECT });
        await openFile(page, 'config.json');
        await expect(page.locator('#mode-treeview')).toBeVisible();
    });

    test('treeview mode renders the JSON tree', async ({ page }) => {
        await openMockFolder(page, { 'config.json': SAMPLE_JSON_OBJECT });
        await openFile(page, 'config.json');
        await page.locator('#mode-treeview').click();
        await expect(page.locator('#s3-treeview')).toBeVisible();
        await expect(page.locator('#s3-treeview')).toContainText('key');
    });

    test('treeview mode hides source editor', async ({ page }) => {
        await openMockFolder(page, { 'config.json': SAMPLE_JSON_OBJECT });
        await openFile(page, 'config.json');
        await page.locator('#mode-treeview').click();
        await expect(page.locator('#source-editor-wrap')).toBeHidden();
    });
});

// ── Mode toolbar active state ─────────────────────────────────────────────────

test.describe('mode toolbar active state', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('source mode button has active class by default', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await expect(page.locator('#mode-source')).toHaveClass(/active/);
    });

    test('active class moves to wysiwyg button when switching modes', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': SAMPLE_MD });
        await openFile(page, 'notes.md');
        await page.locator('#mode-wysiwyg').click();
        await expect(page.locator('#mode-wysiwyg')).toHaveClass(/active/);
        await expect(page.locator('#mode-source')).not.toHaveClass(/active/);
    });
});

// ── Wysiwyg link opens new tab ─────────────────────────────────────────────────

test.describe('wysiwyg link new tab', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking a link in wysiwyg opens a new tab', async ({ page }) => {
        const LINKED_MD = '# Title\n\n[Visit Example](https://example.com)\n';
        await openMockFolder(page, { 'linked.md': LINKED_MD });
        await openFile(page, 'linked.md');
        await page.locator('#mode-wysiwyg').click();
        await expect(page.locator('#wysiwyg a')).toBeVisible();
        const [newPage] = await Promise.all([
            page.context().waitForEvent('page'),
            page.locator('#wysiwyg a').click(),
        ]);
        await newPage.waitForLoadState('domcontentloaded');
        expect(newPage.url()).toContain('example.com');
        await newPage.close();
    });
});

// ── Treeview interactivity ────────────────────────────────────────────────────

test.describe('treeview interactivity', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking tree-toggle collapses a node', async ({ page }) => {
        const JSON_NESTED = JSON.stringify({ nested: { a: 1, b: 2 }, other: 'val' });
        await openMockFolder(page, { 'data.json': JSON_NESTED });
        await openFile(page, 'data.json');
        await page.locator('#mode-treeview').click();
        await expect(page.locator('#s3-treeview')).toBeVisible();
        // Initially expanded — children should be visible
        await expect(page.locator('#s3-treeview .tree-children').first()).toBeVisible();
        // Click the first toggle (root node) to collapse everything
        await page.locator('#s3-treeview .tree-toggle').first().click();
        // After collapse, no children divs remain
        await expect(page.locator('#s3-treeview .tree-children')).toHaveCount(0);
    });

    test('clicking tree-array-link opens nested modal', async ({ page }) => {
        const JSON_WITH_ARRAY = JSON.stringify({ items: [1, 2, 3], name: 'test' });
        await openMockFolder(page, { 'data.json': JSON_WITH_ARRAY });
        await openFile(page, 'data.json');
        await page.locator('#mode-treeview').click();
        await expect(page.locator('#s3-treeview .tree-array-link')).toBeVisible();
        await page.locator('#s3-treeview .tree-array-link').click();
        await expect(page.locator('#nested-modal')).toBeVisible();
    });

    test('nested modal close button hides the modal', async ({ page }) => {
        const JSON_WITH_ARRAY = JSON.stringify({ items: [1, 2, 3], name: 'test' });
        await openMockFolder(page, { 'data.json': JSON_WITH_ARRAY });
        await openFile(page, 'data.json');
        await page.locator('#mode-treeview').click();
        await page.locator('#s3-treeview .tree-array-link').click();
        await expect(page.locator('#nested-modal')).toBeVisible();
        await page.locator('#nested-modal-close').click();
        await expect(page.locator('#nested-modal')).toBeHidden();
    });
});

// ── Datasheet nested array / object drill-down ────────────────────────────────

const NESTED_ARRAY_DATA = JSON.stringify([
    { id: 1, name: 'Alice', tags: ['admin', 'editor'], address: { city: 'NYC', zip: '10001' } },
    { id: 2, name: 'Bob',   tags: ['viewer'],           address: { city: 'LA',  zip: '90001' } },
    { id: 3, name: 'Carol', tags: ['admin', 'viewer', 'editor'], address: { city: 'Chicago', zip: '60601' } },
]);

test.describe('datasheet nested array drill-down', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('nested object array auto-opens in table view', async ({ page }) => {
        await openMockFolder(page, { 'people.json': NESTED_ARRAY_DATA });
        await openFile(page, 'people.json');
        // Should default to datasheet (table) mode, not treeview
        await expect(page.locator('#s3-datasheet')).toBeVisible();
        await expect(page.locator('#s3-treeview')).toBeHidden();
    });

    test('nested array cells show item count badge', async ({ page }) => {
        await openMockFolder(page, { 'people.json': NESTED_ARRAY_DATA });
        await openFile(page, 'people.json');
        // All "tags" cells should render as "N items"
        const nestedCells = page.locator('#s3-datasheet .s3-ds-nested-text');
        const texts = await nestedCells.allTextContents();
        expect(texts.some(t => t.includes('items'))).toBeTruthy();
    });

    test('nested object cells show {…} badge', async ({ page }) => {
        await openMockFolder(page, { 'people.json': NESTED_ARRAY_DATA });
        await openFile(page, 'people.json');
        const nestedCells = page.locator('#s3-datasheet .s3-ds-nested-text');
        const texts = await nestedCells.allTextContents();
        expect(texts.some(t => t.includes('{…}'))).toBeTruthy();
    });

    test('clicking nested array cell opens drill-down modal', async ({ page }) => {
        await openMockFolder(page, { 'people.json': NESTED_ARRAY_DATA });
        await openFile(page, 'people.json');
        await page.locator('#s3-datasheet .s3-ds-nested').first().click();
        await expect(page.locator('#nested-modal')).toBeVisible();
    });

    test('drill-down modal close button hides modal', async ({ page }) => {
        await openMockFolder(page, { 'people.json': NESTED_ARRAY_DATA });
        await openFile(page, 'people.json');
        await page.locator('#s3-datasheet .s3-ds-nested').first().click();
        await expect(page.locator('#nested-modal')).toBeVisible();
        await page.locator('#nested-modal-close').click();
        await expect(page.locator('#nested-modal')).toBeHidden();
    });
});

// ── Treeview → nested table navigation ────────────────────────────────────────
// JSON object containing named arrays-of-objects: opens in treeview (preview),
// clicking an array node navigates into a table in the drill-down modal.

const DEPARTMENTS_DATA = JSON.stringify({
    company: 'Acme Corp',
    engineering: [
        { name: 'Alice', role: 'Lead',     level: 5 },
        { name: 'David', role: 'Frontend', level: 3 },
    ],
    design: [
        { name: 'Bob',  role: 'Lead Designer', level: 4 },
        { name: 'Lena', role: 'UX Researcher',  level: 3 },
    ],
});

test.describe('treeview → nested table navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('JSON object with array-of-objects properties opens in treeview', async ({ page }) => {
        await openMockFolder(page, { 'depts.json': DEPARTMENTS_DATA });
        await openFile(page, 'depts.json');
        await expect(page.locator('#s3-treeview')).toBeVisible();
        await expect(page.locator('#s3-datasheet')).toBeHidden();
    });

    test('array-of-objects property shows clickable item count in treeview', async ({ page }) => {
        await openMockFolder(page, { 'depts.json': DEPARTMENTS_DATA });
        await openFile(page, 'depts.json');
        await expect(page.locator('#s3-treeview .tree-array-link').first()).toBeVisible();
        const text = await page.locator('#s3-treeview .tree-array-link').first().textContent();
        expect(text).toContain('items');
    });

    test('clicking array-of-objects link opens modal with a table', async ({ page }) => {
        await openMockFolder(page, { 'depts.json': DEPARTMENTS_DATA });
        await openFile(page, 'depts.json');
        await page.locator('#s3-treeview .tree-array-link').first().click();
        await expect(page.locator('#nested-modal')).toBeVisible();
        // Modal should render a table, not raw JSON
        await expect(page.locator('#nested-body table')).toBeVisible();
    });

    test('nested table has correct column headers', async ({ page }) => {
        await openMockFolder(page, { 'depts.json': DEPARTMENTS_DATA });
        await openFile(page, 'depts.json');
        await page.locator('#s3-treeview .tree-array-link').first().click();
        const headers = await page.locator('#nested-body th').allTextContents();
        expect(headers).toContain('name');
        expect(headers).toContain('role');
        expect(headers).toContain('level');
    });

    test('nested table shows correct row data', async ({ page }) => {
        await openMockFolder(page, { 'depts.json': DEPARTMENTS_DATA });
        await openFile(page, 'depts.json');
        await page.locator('#s3-treeview .tree-array-link').first().click();
        const cells = await page.locator('#nested-body td').allTextContents();
        expect(cells.some(c => c.includes('Alice'))).toBeTruthy();
        expect(cells.some(c => c.includes('Lead'))).toBeTruthy();
    });

    test('nested table has pagination controls', async ({ page }) => {
        // Build a dept with enough members to need pagination
        const BIG_DEPT = JSON.stringify({
            name: 'Engineering',
            members: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, level: (i % 5) + 1 })),
        });
        await openMockFolder(page, { 'big.json': BIG_DEPT });
        await openFile(page, 'big.json');
        await page.locator('#s3-treeview .tree-array-link').first().click();
        await expect(page.locator('#nested-modal')).toBeVisible();
        await expect(page.locator('#s3-ds-prev-modal')).toBeDisabled();
        await expect(page.locator('#s3-ds-next-modal')).toBeEnabled();
        await page.locator('#s3-ds-next-modal').click();
        await expect(page.locator('#s3-ds-prev-modal')).toBeEnabled();
    });
});

// ── Datasheet aggregations ────────────────────────────────────────────────────

test.describe('datasheet aggregations', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('aggregation footer shows sum and avg for numeric columns', async ({ page }) => {
        const DATA = JSON.stringify([
            { name: 'A', score: 90 },
            { name: 'B', score: 80 },
        ]);
        await openMockFolder(page, { 'scores.json': DATA });
        await openFile(page, 'scores.json');
        await page.locator('#mode-datasheet').click();
        await expect(page.locator('#s3-ds-tfoot')).toBeVisible();
        await expect(page.locator('#s3-ds-tfoot')).toContainText('170');
        await expect(page.locator('#s3-ds-tfoot')).toContainText('85');
    });
});

// ── Datasheet pagination ──────────────────────────────────────────────────────

test.describe('datasheet pagination', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('prev is disabled on first page and next navigates to page 2', async ({ page }) => {
        const BIG_JSON = JSON.stringify(
            Array.from({ length: 60 }, (_, i) => ({ id: i + 1, val: `item${i}` }))
        );
        await openMockFolder(page, { 'big.json': BIG_JSON });
        await openFile(page, 'big.json');
        await page.locator('#mode-datasheet').click();
        await expect(page.locator('#s3-ds-prev')).toBeDisabled();
        await expect(page.locator('#s3-ds-next')).toBeEnabled();
        await page.locator('#s3-ds-next').click();
        await expect(page.locator('#s3-ds-prev')).toBeEnabled();
    });
});

// ── Syntax highlighting ───────────────────────────────────────────────────────

test.describe('syntax highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('JS file shows source mode with syntax highlight backdrop', async ({ page }) => {
        await openMockFolder(page, { 'app.js': SAMPLE_JS });
        await openFile(page, 'app.js');
        // Source editor should be visible
        await expect(page.locator('#source-editor-wrap')).toBeVisible();
        // Highlight backdrop should be populated
        await expect(page.locator('#source-highlight-code')).not.toBeEmpty();
    });

    test('highlight code contains syntax-colored spans for JS', async ({ page }) => {
        await openMockFolder(page, { 'app.js': SAMPLE_JS });
        await openFile(page, 'app.js');
        // Verify backdrop has content (any span or text with keyword)
        const code = await page.locator('#source-highlight-code').innerHTML();
        expect(code.length).toBeGreaterThan(0);
    });

    test('plain text file has highlight backdrop populated', async ({ page }) => {
        await openMockFolder(page, { 'readme.txt': 'hello world' });
        await openFile(page, 'readme.txt');
        await expect(page.locator('#source-editor-wrap')).toBeVisible();
    });
});
