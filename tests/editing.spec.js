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

    test('autosave label shows "saved" briefly after autosave triggers', async ({ page }) => {
        await page.clock.install();
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');

        // Autosave is enabled by default; ensure checkbox is checked
        const checked = await page.locator('#autosave-checkbox').isChecked();
        if (!checked) await page.locator('#autosave-checkbox').click();

        await page.locator('#source-editor').fill('# Hello updated');

        // Advance clock past the 2s autosave debounce
        await page.clock.fastForward(2500);

        await expect(page.locator('#autosave-label')).toHaveText('saved');
    });
});

// ── Discard changes ───────────────────────────────────────────────────────────

test.describe('discard changes', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('accepting discard opens the new file', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await openFile(page, 'a.md');
        await page.locator('#source-editor').fill('# A modified');
        page.once('dialog', d => d.accept());
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        await expect(page.locator('#source-editor')).toHaveValue(/# B/, { timeout: 5000 });
    });

    test('dismissing discard stays on current file with edits', async ({ page }) => {
        await openMockFolder(page, { 'a.md': '# A', 'b.md': '# B' });
        await openFile(page, 'a.md');
        await page.locator('#source-editor').fill('# A modified');
        page.once('dialog', d => d.dismiss());
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        await expect(page.locator('#source-editor')).toHaveValue('# A modified');
    });
});

// ── File watcher ──────────────────────────────────────────────────────────────

test.describe('file watcher', () => {
    test('file watcher shows toast when file changes externally', async ({ page }) => {
        // Clock must be installed BEFORE goto to intercept setInterval in startFileWatcher
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.clock.install();
        await page.goto('/');
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'notes.md' }).click();
        await expect(page.locator('#source-editor')).not.toHaveValue('');
        // Advance clock slightly, then simulate an external file change, then advance past watcher interval
        await page.clock.fastForward(100);
        await page.evaluate(() => window.__mockFS.touchFile('notes.md'));
        await page.clock.fastForward(3001);
        await expect(page.locator('#toast-container .toast')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#toast-container .toast')).toContainText('Reloaded: notes.md');
    });

    test('file watcher does not show toast after saving', async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.clock.install();
        await page.goto('/');
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'notes.md' }).click();
        await expect(page.locator('#source-editor')).not.toHaveValue('');
        // Edit and save
        await page.locator('#source-editor').fill('# Changed');
        await page.locator('#save-btn').click();
        // Advance past watcher interval — should NOT show a toast
        await page.clock.fastForward(3001);
        await expect(page.locator('#toast-container .toast')).not.toBeVisible();
    });
});
