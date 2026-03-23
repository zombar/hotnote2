// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

async function openFile(page, filename) {
    await page.locator('#file-list li.file-entry .file-entry-row', { hasText: filename }).click();
    await expect(page.locator('#mode-toolbar')).toBeVisible({ timeout: 5000 });
}

async function switchToWysiwyg(page) {
    await page.locator('#mode-wysiwyg').click();
    await expect(page.locator('#wysiwyg')).toBeVisible();
}

// ── Wikilinks ─────────────────────────────────────────────────────────────────

test.describe('wikilinks', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('[[note]] renders as a wikilink in wysiwyg', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Home\n\nSee [[other]].',
            'other.md': '# Other',
        });
        await openFile(page, 'index.md');
        await switchToWysiwyg(page);

        const wikilink = page.locator('#wysiwyg a.wikilink');
        await expect(wikilink).toBeVisible();
        await expect(wikilink).toHaveText('other');
    });

    test('[[note|display text]] renders with custom display text', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Home\n\nSee [[other|my other note]].',
            'other.md': '# Other',
        });
        await openFile(page, 'index.md');
        await switchToWysiwyg(page);

        const wikilink = page.locator('#wysiwyg a.wikilink');
        await expect(wikilink).toHaveText('my other note');
    });

    test('clicking a wikilink opens the target note', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Home\n\nSee [[other]].',
            'other.md': '# Other Note',
        });
        await openFile(page, 'index.md');
        await switchToWysiwyg(page);

        await page.locator('#wysiwyg a.wikilink').click();
        // Should navigate to other.md (filename shown in toolbar)
        await expect(page.locator('#mode-toolbar .filename-display')).toHaveText('other.md', { timeout: 5000 });
    });

    test('[[note]] without extension auto-appends .md', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Home\n\nSee [[readme]].',
            'readme.md': '# Readme',
        });
        await openFile(page, 'index.md');
        await switchToWysiwyg(page);

        await page.locator('#wysiwyg a.wikilink').click();
        await expect(page.locator('#mode-toolbar .filename-display')).toHaveText('readme.md', { timeout: 5000 });
    });

    test('wikilink for missing note shows a toast', async ({ page }) => {
        await openMockFolder(page, {
            'index.md': '# Home\n\nSee [[nonexistent]].',
        });
        await openFile(page, 'index.md');
        await switchToWysiwyg(page);

        await page.locator('#wysiwyg a.wikilink').click();
        await expect(page.locator('#toast-container')).toContainText('not found', { timeout: 3000 });
    });
});

// ── Scroll Sync ───────────────────────────────────────────────────────────────

test.describe('scroll sync', () => {
    const LONG_MD = '# Title\n\n' +
        Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of content here.\n`).join('\n') +
        '\n## Bottom Section\n\nEnd of document.\n';

    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('scrolling source syncs wysiwyg in split pane', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': LONG_MD });
        await openFile(page, 'notes.md');

        // Open split pane — pane2 shows wysiwyg
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await expect(page.locator('#wysiwyg-p2')).toBeVisible();

        const wysiwyg2 = page.locator('#wysiwyg-p2');
        const initialScroll = await wysiwyg2.evaluate(el => el.scrollTop);

        // Scroll the source editor
        await page.locator('#source-editor-ce').evaluate(el => { el.scrollTop = el.scrollHeight; });
        // Wait for RAF
        await page.waitForTimeout(100);

        const finalScroll = await wysiwyg2.evaluate(el => el.scrollTop);
        expect(finalScroll).toBeGreaterThan(initialScroll);
    });

    test('scroll sync does not fire when panes have different files', async ({ page }) => {
        await openMockFolder(page, {
            'a.md': LONG_MD,
            'b.md': '# Other file\n\nShort content.\n',
        });
        await openFile(page, 'a.md');
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();

        // Open a different file in pane2
        await page.locator('#pane2').click();
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        // pane2 opens b.md in source mode (default for .md)
        await expect(page.locator('#source-editor-wrap-p2')).toBeVisible();

        // Scroll source in pane1 — wysiwyg-p2 is not shown so no sync possible
        const sourceP2 = page.locator('#source-editor-ce-p2');
        const initialScroll = await sourceP2.evaluate(el => el.scrollTop);

        await page.locator('#source-editor-ce').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(100);

        // pane2 source should NOT have scrolled (different file, not wysiwyg)
        const finalScroll = await sourceP2.evaluate(el => el.scrollTop);
        expect(finalScroll).toBe(initialScroll);
    });
});
