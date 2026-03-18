// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

async function openFile(page, filename) {
    const row = page.locator('#file-list li.file-entry .file-entry-row', { hasText: filename });
    await row.click();
    await expect(page.locator('#source-editor')).not.toHaveValue('');
}

// ── Source editing ───────────────────────────────────────────────────────────

test.describe('source editing', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('typing marks file as dirty (• prefix in title)', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await page.locator('#source-editor').click();
        await page.keyboard.type(' world');
        await expect(page.locator('#source-editor')).toHaveValue(/# Hello world/);
        const title = await page.title();
        expect(title).toMatch(/^•/);
    });

    test('save button is enabled when file is dirty', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await page.locator('#source-editor').click();
        await page.keyboard.type('x');
        await expect(page.locator('#save-btn')).toBeEnabled();
    });

    test('editing updates the source-editor value', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': 'original' });
        await openFile(page, 'notes.md');
        const editor = page.locator('#source-editor');
        await editor.fill('replaced content');
        await expect(editor).toHaveValue('replaced content');
    });
});

// ── Manual save ──────────────────────────────────────────────────────────────

test.describe('manual save', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('clicking save button writes content to mock FS', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        const editor = page.locator('#source-editor');
        await editor.click();
        await page.keyboard.type(' world');
        await page.locator('#save-btn').click();
        const written = await page.evaluate(() => window.__mockFS.written);
        expect(written['notes.md']).toContain('# Hello world');
    });

    test('Ctrl+S saves and removes dirty indicator', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await page.locator('#source-editor').click();
        await page.keyboard.type(' edited');
        await page.keyboard.press('Control+s');
        // After save title should not start with •
        await expect(page).not.toHaveTitle(/^•/);
        const written = await page.evaluate(() => window.__mockFS.written);
        expect(written['notes.md']).toContain('# Hello edited');
    });
});

// ── Autosave ─────────────────────────────────────────────────────────────────

test.describe('autosave', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('autosave checkbox is disabled when no file is open', async ({ page }) => {
        await expect(page.locator('#autosave-checkbox')).toBeDisabled();
    });

    test('autosave checkbox is enabled after opening a file', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await expect(page.locator('#autosave-checkbox')).toBeEnabled();
    });

    test('autosave fires and saves content after 2s inactivity', async ({ page }) => {
        // Install fake timers so we don't wait 2 real seconds
        await page.clock.install();
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');

        // Ensure autosave is enabled
        const checked = await page.locator('#autosave-checkbox').isChecked();
        if (!checked) await page.locator('#autosave-checkbox').click();

        await page.locator('#source-editor').click();
        await page.keyboard.type(' updated');

        // Advance clock by 2.5s to trigger autosave
        await page.clock.fastForward(2500);

        const written = await page.evaluate(() => window.__mockFS.written);
        expect(written['notes.md']).toContain('# Hello updated');
    });
});
