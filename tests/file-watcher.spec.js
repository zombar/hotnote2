// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

// Clock must be installed BEFORE page.goto() so setInterval is intercepted.
// These tests use page.clock to control time without waiting in real time.

async function setup(page, tree) {
    await page.addInitScript({ path: MOCK_SCRIPT });
    await page.clock.install();
    await page.goto('/');
    await page.evaluate(({ tree }) => window.__mockFS.setTree(tree, 'my-notes'), { tree });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ── New file detection ────────────────────────────────────────────────────────

test.describe('file watcher — new file detection', () => {
    test('externally added file appears in sidebar within one scan cycle', async ({ page }) => {
        await setup(page, { 'readme.md': '# Hello' });

        // Advance past two watcher ticks (3 s each) so the initial dir scan runs
        // and stores the baseline signature (_lastDirScan check requires 5 s gap,
        // which is satisfied after 6 s total).
        await page.clock.fastForward(6100);

        // Add a new file to the mock FS tree
        await page.evaluate(() => window.__mockFS.addFile('notes.md', '# New note'));

        // Advance another 5+ s to satisfy the _lastDirScan rate-limit, then a
        // watcher tick at the 3 s interval fires the directory scan.
        await page.clock.fastForward(5100);

        // The new file should now appear in the sidebar
        await expect(page.locator('#file-list .file-entry .name', { hasText: 'notes.md' })).toBeVisible();
    });

    test('externally removed file disappears from sidebar within one scan cycle', async ({ page }) => {
        await setup(page, { 'readme.md': '# Hello', 'old.md': '# Old' });

        // Wait for initial baseline scan
        await page.clock.fastForward(6100);

        // Remove a file from the mock FS tree
        await page.evaluate(() => window.__mockFS.removeFile('old.md'));

        // Advance for the next scan
        await page.clock.fastForward(5100);

        // The removed file should no longer appear in the sidebar
        await expect(page.locator('#file-list .file-entry .name', { hasText: 'old.md' })).toHaveCount(0);
    });

    test('new file added inside expanded subfolder is detected', async ({ page }) => {
        await setup(page, { 'docs': { 'guide.md': '# Guide' } });

        // Expand the docs folder
        await page.locator('#file-list .file-entry .file-entry-row', { hasText: 'docs' }).click();
        await expect(page.locator('#file-list .folder-children .file-entry')).toBeVisible();

        // Wait for initial baseline scan
        await page.clock.fastForward(6100);

        // Add a new file inside docs/
        await page.evaluate(() => window.__mockFS.addFile('docs/api.md', '# API'));

        // Advance for next scan
        await page.clock.fastForward(5100);

        // The new file should appear inside the expanded docs folder
        await expect(page.locator('#file-list .folder-children .file-entry .name', { hasText: 'api.md' })).toBeVisible();
    });
});

// ── Same-file split pane reload ───────────────────────────────────────────────

test.describe('file watcher — split pane same-file reload', () => {
    test('external change updates both panes simultaneously when same file is open', async ({ page }) => {
        await setup(page, { 'notes.md': '# Original' });

        // Open the file in pane1
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'notes.md' }).click();
        await expect(page.locator('#source-editor')).not.toHaveValue('');

        // Open split pane and open the same file in pane2
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'notes.md' }).click();
        await expect(page.locator('#source-editor-p2')).not.toHaveValue('');

        // Advance slightly so the next touchFile gets a different timestamp
        await page.clock.fastForward(100);

        // Simulate an external edit: update content + bump lastModified
        await page.evaluate(() => window.__mockFS.setFileContent('notes.md', '# Updated'));

        // Advance past one watcher interval
        await page.clock.fastForward(3100);

        // Both panes should show the updated content
        await expect(page.locator('#source-editor')).toHaveValue(/# Updated/);
        await expect(page.locator('#source-editor-p2')).toHaveValue(/# Updated/);
    });
});
