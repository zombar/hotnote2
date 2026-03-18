// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ── Open folder ──────────────────────────────────────────────────────────────

test.describe('open folder', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('sidebar appears after opening folder', async ({ page }) => {
        await openMockFolder(page, { 'readme.md': '# Hello' });
        await expect(page.locator('#sidebar')).toBeVisible();
    });

    test('files are listed in sidebar', async ({ page }) => {
        await openMockFolder(page, {
            'alpha.md': '# Alpha',
            'beta.txt': 'Beta content',
        });
        await expect(page.locator('#file-list li')).toHaveCount(2);
        await expect(page.locator('#file-list .name').first()).toContainText('alpha.md');
        await expect(page.locator('#file-list .name').nth(1)).toContainText('beta.txt');
    });

    test('directories appear before files', async ({ page }) => {
        await openMockFolder(page, {
            'zfile.md': 'z',
            'afolder': { 'nested.md': 'nested' },
        });
        // First item should be the folder
        const names = await page.locator('#file-list > li .name').allTextContents();
        expect(names[0]).toBe('afolder');
        expect(names[1]).toBe('zfile.md');
    });
});

// ── Folder expand / collapse ─────────────────────────────────────────────────

test.describe('folder expand/collapse', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking a folder expands it showing children', async ({ page }) => {
        await openMockFolder(page, {
            'docs': { 'guide.md': '# Guide' },
        });
        // Click the folder row
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('.folder-children')).toBeVisible();
        await expect(page.locator('.folder-children .name')).toContainText('guide.md');
    });

    test('clicking an expanded folder collapses it', async ({ page }) => {
        await openMockFolder(page, {
            'docs': { 'guide.md': '# Guide' },
        });
        const folderRow = page.locator('#file-list li.file-entry .file-entry-row').first();
        await folderRow.click();
        await expect(page.locator('.folder-children')).toBeVisible();
        await folderRow.click();
        await expect(page.locator('.folder-children')).toBeHidden();
    });

    test('empty folder shows placeholder', async ({ page }) => {
        await openMockFolder(page, {
            'empty': {},
        });
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('.folder-empty-placeholder')).toBeVisible();
    });
});

// ── Clicking a file opens it ─────────────────────────────────────────────────

test.describe('open file', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking a file loads its content into the editor', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# My Note' });
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('#source-editor')).toHaveValue(/# My Note/);
    });

    test('opened file is highlighted as active in sidebar', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# My Note' });
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('#file-list li.file-entry.active')).toBeVisible();
    });
});

// ── New file ─────────────────────────────────────────────────────────────────

test.describe('new file', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('new file button shows inline input', async ({ page }) => {
        await openMockFolder(page, { 'existing.md': 'hi' });
        await page.locator('#new-file-btn').click();
        await expect(page.locator('#new-file-input-wrap input')).toBeVisible();
    });

    test('typing name and pressing Enter creates and opens file', async ({ page }) => {
        await openMockFolder(page, { 'existing.md': 'hi' });
        await page.locator('#new-file-btn').click();
        const input = page.locator('#new-file-input-wrap input');
        await input.fill('newfile.md');
        await input.press('Enter');
        // Mode toolbar appears when a file is open
        await expect(page.locator('#mode-toolbar')).toBeVisible({ timeout: 5000 });
        // Sidebar should list it eventually (after sidebar refresh)
        await expect(page.locator('#file-list .name').filter({ hasText: 'newfile.md' })).toBeVisible({ timeout: 5000 });
    });

    test('pressing Escape cancels new file input', async ({ page }) => {
        await openMockFolder(page, { 'existing.md': 'hi' });
        await page.locator('#new-file-btn').click();
        const input = page.locator('#new-file-input-wrap input');
        await input.press('Escape');
        await expect(page.locator('#new-file-input-wrap')).toBeHidden();
    });

    test('empty name dismisses without creating', async ({ page }) => {
        await openMockFolder(page, { 'existing.md': 'hi' });
        const countBefore = await page.locator('#file-list li.file-entry').count();
        await page.locator('#new-file-btn').click();
        await page.locator('#new-file-input-wrap input').press('Enter');
        const countAfter = await page.locator('#file-list li.file-entry').count();
        expect(countAfter).toBe(countBefore);
    });
});

// ── New folder ───────────────────────────────────────────────────────────────

test.describe('new folder', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('new folder button shows inline input', async ({ page }) => {
        await openMockFolder(page, { 'file.md': 'hi' });
        await page.locator('#new-folder-btn').click();
        await expect(page.locator('#new-folder-input-wrap input')).toBeVisible();
    });

    test('typing name and pressing Enter creates the folder', async ({ page }) => {
        await openMockFolder(page, { 'file.md': 'hi' });
        await page.locator('#new-folder-btn').click();
        const input = page.locator('#new-folder-input-wrap input');
        await input.fill('subfolder');
        await input.press('Enter');
        await expect(page.locator('#file-list .name').filter({ hasText: 'subfolder' })).toBeVisible({ timeout: 5000 });
    });

    test('pressing Escape cancels new folder input', async ({ page }) => {
        await openMockFolder(page, { 'file.md': 'hi' });
        await page.locator('#new-folder-btn').click();
        await page.locator('#new-folder-input-wrap input').press('Escape');
        await expect(page.locator('#new-folder-input-wrap')).toBeHidden();
    });
});

// ── Delete file ──────────────────────────────────────────────────────────────

test.describe('delete file', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('delete button with confirmation removes the file from sidebar', async ({ page }) => {
        await openMockFolder(page, { 'afile.md': 'to delete', 'bfile.md': 'keep' });
        page.on('dialog', d => d.accept());
        // Target 'afile.md' specifically (first alphabetically)
        const entry = page.locator('#file-list li.file-entry', { hasText: 'afile.md' });
        await entry.hover();
        await entry.locator('.delete-btn').click({ force: true });
        // After deletion sidebar refreshes — afile.md should be gone
        await expect(page.locator('#file-list .name').filter({ hasText: 'afile.md' })).toBeHidden({ timeout: 5000 });
        // bfile.md should still be there
        await expect(page.locator('#file-list .name').filter({ hasText: 'bfile.md' })).toBeVisible();
    });
});
