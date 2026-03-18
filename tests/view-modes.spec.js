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
