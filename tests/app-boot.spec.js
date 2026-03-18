// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ── Boot / Welcome screen ────────────────────────────────────────────────────

test.describe('boot / welcome screen', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('shows logo and open folder button', async ({ page }) => {
        await expect(page.locator('.logo')).toContainText('hotnote');
        await expect(page.locator('#open-folder')).toBeVisible();
    });

    test('sidebar is hidden before a folder is opened', async ({ page }) => {
        await expect(page.locator('#sidebar')).toBeHidden();
        await expect(page.locator('#file-list li')).toHaveCount(0);
    });
});

// ── Session restore ──────────────────────────────────────────────────────────

test.describe('session restore', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('shows resume prompt when localStorage has lastFolder', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('hotnote2-lastFolder', 'my-notes'));
        await page.reload();
        await expect(page.locator('#resume-prompt')).toBeVisible();
        await expect(page.locator('.resume-folder-name')).toContainText('my-notes');
    });

    test('dismissing resume prompt hides it and clears localStorage', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('hotnote2-lastFolder', 'my-notes'));
        await page.reload();
        await page.locator('#resume-dismiss-btn').click();
        await expect(page.locator('#resume-prompt')).toBeHidden();
        const lastFolder = await page.evaluate(() => localStorage.getItem('hotnote2-lastFolder'));
        expect(lastFolder).toBeNull();
    });

    test('resume open button opens folder picker', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('hotnote2-lastFolder', 'my-notes'));
        await page.reload();
        await page.evaluate(() => window.__mockFS.setTree({ 'readme.md': '# Hello' }));
        await page.locator('#resume-open-btn').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });
        await expect(page.locator('#resume-prompt')).toBeHidden();
        await expect(page.locator('#sidebar')).toBeVisible();
    });

    test('shows resume prompt from URL workdir param', async ({ page }) => {
        await page.goto('/?workdir=my-notes');
        await expect(page.locator('#resume-prompt')).toBeVisible();
        await expect(page.locator('.resume-folder-name')).toContainText('my-notes');
    });
});

// ── Sidebar toggle ───────────────────────────────────────────────────────────

test.describe('sidebar toggle', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking sidebar toggle collapses the sidebar', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hi' });
        await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
        await page.locator('#sidebar-toggle').click();
        await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    });

    test('clicking sidebar toggle again expands the sidebar', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hi' });
        await page.locator('#sidebar-toggle').click();
        await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
        await page.locator('#sidebar-toggle').click();
        await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    });
});
