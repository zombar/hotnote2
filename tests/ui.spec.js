// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ── Theme toggle ─────────────────────────────────────────────────────────────

test.describe('theme toggle', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('page starts with a theme attribute on <html>', async ({ page }) => {
        const theme = await page.locator('html').getAttribute('data-theme');
        expect(['dark', 'light']).toContain(theme);
    });

    test('clicking theme toggle switches the theme', async ({ page }) => {
        const before = await page.locator('html').getAttribute('data-theme');
        await page.locator('#theme-toggle').click();
        const after = await page.locator('html').getAttribute('data-theme');
        expect(after).not.toBe(before);
    });

    test('theme is persisted in localStorage after toggle', async ({ page }) => {
        await page.locator('#theme-toggle').click();
        const stored = await page.evaluate(() => localStorage.getItem('hotnote2-theme'));
        expect(['dark', 'light']).toContain(stored);
    });
});

test.describe('theme persistence across reload', () => {
    test('theme is restored from localStorage on next load', async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
        // Set a known theme explicitly
        await page.evaluate(() => localStorage.setItem('hotnote2-theme', 'dark'));
        // Reload — the inline script applies saved theme before any JS
        await page.reload();
        const reloadedTheme = await page.locator('html').getAttribute('data-theme');
        expect(reloadedTheme).toBe('dark');
    });
});

// ── Sidebar resize ────────────────────────────────────────────────────────────

test.describe('sidebar resize', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('resize handle is visible after opening a folder', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await expect(page.locator('#resize-handle')).toBeVisible();
    });

    test('dragging resize handle changes sidebar width', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        const sidebar = page.locator('#sidebar');
        const handle = page.locator('#resize-handle');

        const initialWidth = await sidebar.evaluate(el => el.offsetWidth);
        const handleBox = await handle.boundingBox();

        if (!handleBox) throw new Error('Resize handle not found');

        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;

        // Simulate a drag 120px to the right with intermediate steps
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Move in steps to ensure mousemove events fire
        for (let i = 1; i <= 12; i++) {
            await page.mouse.move(startX + i * 10, startY);
        }
        await page.mouse.up();

        const newWidth = await sidebar.evaluate(el => el.offsetWidth);
        expect(newWidth).toBeGreaterThan(initialWidth);
    });
});
