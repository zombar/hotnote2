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
