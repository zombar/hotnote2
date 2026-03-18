// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ── Hidden elements on mobile ─────────────────────────────────────────────────

test.describe('mobile hidden elements', () => {
    test.use({ viewport: MOBILE });

    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('logo is hidden on mobile', async ({ page }) => {
        await expect(page.locator('.logo')).toBeHidden();
    });

    test('autosave toggle is hidden on mobile', async ({ page }) => {
        await expect(page.locator('.autosave-toggle')).toBeHidden();
    });

    test('GitHub icon link is hidden on mobile', async ({ page }) => {
        await expect(page.locator('.hide-mobile')).toBeHidden();
    });
});

// ── These same elements are visible on desktop ────────────────────────────────

test.describe('desktop visible elements', () => {
    test.use({ viewport: DESKTOP });

    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('logo is visible on desktop', async ({ page }) => {
        await expect(page.locator('.logo')).toBeVisible();
    });

    test('autosave toggle is visible on desktop', async ({ page }) => {
        await expect(page.locator('.autosave-toggle')).toBeVisible();
    });

    test('GitHub icon link is visible on desktop', async ({ page }) => {
        await expect(page.locator('.hide-mobile')).toBeVisible();
    });
});

// ── Sidebar auto-collapse on mobile ───────────────────────────────────────────

test.describe('sidebar auto-collapse on mobile', () => {
    test.use({ viewport: MOBILE });

    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('opening a folder shows sidebar uncollapsed on mobile', async ({ page }) => {
        // openFolder() always removes the collapsed class so the user can see the file list
        await openMockFolder(page, { 'notes.md': '# Hi' });
        await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    });

    test('sidebar collapses after opening a file on mobile', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hi' });
        // Sidebar is visible at this point — open a file
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    });

    test('sidebar can be manually expanded after auto-collapse via toggle', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hi' });
        // Open a file to trigger auto-collapse
        await page.locator('#file-list li.file-entry .file-entry-row').first().click();
        await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
        // Toggle it back open
        await page.locator('#sidebar-toggle').click();
        await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    });
});
