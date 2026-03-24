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

// ── Back / forward navigation ─────────────────────────────────────────────────

test.describe('back/forward navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('back and forward buttons are disabled initially', async ({ page }) => {
        await expect(page.locator('#back-btn')).toBeDisabled();
        await expect(page.locator('#forward-btn')).toBeDisabled();
    });

    test('back button enabled after opening a file', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await clickFile(page, 'a.md');
        // After first file, back should still be disabled (nothing to go back to)
        // After second file, back should be enabled
        await clickFile(page, 'b.md');
        await expect(page.locator('#back-btn')).toBeEnabled();
    });

    test('clicking back navigates to previous file', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await clickFile(page, 'a.md');
        await clickFile(page, 'b.md');
        await page.locator('#back-btn').click();
        await expect(page.locator('#source-editor')).toHaveValue(/# A/);
    });

    test('forward button enabled after going back', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await clickFile(page, 'a.md');
        await clickFile(page, 'b.md');
        await page.locator('#back-btn').click();
        await expect(page.locator('#forward-btn')).toBeEnabled();
    });

    test('clicking forward navigates to next file', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await clickFile(page, 'a.md');
        await clickFile(page, 'b.md');
        await page.locator('#back-btn').click();
        await page.locator('#forward-btn').click();
        await expect(page.locator('#source-editor')).toHaveValue(/# B/);
    });
});

// ── Reveal in sidebar ─────────────────────────────────────────────────────────

test.describe('reveal in sidebar', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('opening a nested file via wikilink expands parent folders', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Index\n\nSee [[guide]].',
            'docs': { 'guide.md': '# Guide' },
        });

        // Click index.md to open it, switch to wysiwyg so the wikilink is rendered
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'index.md' }).click();
        await expect(page.locator('#mode-toolbar')).toBeVisible();
        await page.locator('#mode-wysiwyg').click();
        await expect(page.locator('#wysiwyg')).toBeVisible();

        // Verify docs folder is collapsed before clicking wikilink
        await expect(page.locator('#file-list .file-entry.expanded')).toHaveCount(0);

        // Click the wikilink — this calls openWikilink → openFile → revealInSidebar
        await page.locator('#wysiwyg a.wikilink').click();
        await expect(page.locator('#source-editor')).toHaveValue(/# Guide/);

        // The docs folder should now be expanded in the sidebar
        await expect(page.locator('#file-list .file-entry.expanded')).toHaveCount(1);

        // guide.md should be the active entry
        const activeEntry = page.locator('#file-list .file-entry.active');
        await expect(activeEntry).toBeVisible();
        await expect(activeEntry).toContainText('guide.md');
    });

    test('opening a deeply nested file reveals all ancestor folders', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Index\n\nSee [[deep]].',
            'docs': { 'api': { 'deep.md': '# Deep' } },
        });

        // Open index and follow wikilink to the deeply nested file
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'index.md' }).click();
        await expect(page.locator('#mode-toolbar')).toBeVisible();
        await page.locator('#mode-wysiwyg').click();
        await page.locator('#wysiwyg a.wikilink').click();
        await expect(page.locator('#source-editor')).toHaveValue(/# Deep/);

        // Both docs and docs/api should be expanded
        await expect(page.locator('#file-list .file-entry.expanded')).toHaveCount(2);
        const activeEntry = page.locator('#file-list .file-entry.active');
        await expect(activeEntry).toContainText('deep.md');
    });
});
