// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

async function clickFile(page, filename) {
    await page.locator('#file-list li.file-entry .file-entry-row', { hasText: filename }).click();
    await expect(page.locator('#source-editor')).not.toHaveValue('');
}

// ── Split pane toggle ─────────────────────────────────────────────────────────

test.describe('split pane toggle', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('pane2 is hidden initially', async ({ page }) => {
        await expect(page.locator('#pane2')).toBeHidden();
        await expect(page.locator('#split-resize-handle')).toBeHidden();
    });

    test('clicking split pane button shows pane2', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await clickFile(page, 'notes.md');
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await expect(page.locator('#split-resize-handle')).toBeVisible();
    });

    test('split pane button gets active class when split is open', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await clickFile(page, 'notes.md');
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#split-pane-btn')).toHaveClass(/active/);
    });

    test('clicking split pane button again hides pane2', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await clickFile(page, 'notes.md');
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeHidden();
    });
});

// ── Split pane content ────────────────────────────────────────────────────────

test.describe('split pane content', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('opening split on .md file mirrors content to pane2 in wysiwyg mode', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello World' });
        await clickFile(page, 'notes.md');
        await page.locator('#split-pane-btn').click();
        // pane2 should show wysiwyg for .md files
        const wysiwyg2 = page.locator('#wysiwyg-p2');
        await expect(wysiwyg2).toBeVisible({ timeout: 5000 });
        await expect(wysiwyg2.locator('h1')).toContainText('Hello World');
    });

    test('editing source in pane1 syncs to pane2 wysiwyg preview', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await clickFile(page, 'notes.md');
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#wysiwyg-p2 h1')).toContainText('Hello');
        // Edit pane1 source; debouncedSyncPreview re-renders pane2 wysiwyg after 300ms
        await page.locator('#source-editor').fill('# Updated');
        await expect(page.locator('#wysiwyg-p2 h1')).toContainText('Updated', { timeout: 2000 });
    });

    test('pane2 editor can open a different file independently', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# File A', 'b.md': '# File B' });
        await clickFile(page, 'a.md');
        await page.locator('#split-pane-btn').click();
        // Click pane2 to make it active, then open b.md
        await page.locator('#pane2').click();
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        // pane2 source editor should have b.md content
        await expect(page.locator('#source-editor-p2')).toHaveValue(/# File B/, { timeout: 5000 });
        // pane1 should still have a.md
        await expect(page.locator('#source-editor')).toHaveValue(/# File A/);
    });
});

// ── Folder re-open resets state ───────────────────────────────────────────────

test.describe('folder re-open resets state', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('pane2 is hidden after opening a new folder', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A' });
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();

        // Open a second folder
        await page.evaluate(() => window.__mockFS.setTree({ 'b.md': '# B' }, 'folder-b'));
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        await expect(page.locator('#pane2')).toBeHidden();
    });

    test('split button loses active class after opening a new folder', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A' });
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#split-pane-btn')).toHaveClass(/active/);

        await page.evaluate(() => window.__mockFS.setTree({ 'b.md': '# B' }, 'folder-b'));
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        await expect(page.locator('#split-pane-btn')).not.toHaveClass(/active/);
    });

    test('back button is disabled after opening a new folder', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'a.md' }).click();
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        await expect(page.locator('#back-btn')).toBeEnabled();

        await page.evaluate(() => window.__mockFS.setTree({ 'c.md': '# C' }, 'folder-c'));
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        await expect(page.locator('#back-btn')).toBeDisabled();
    });
});
