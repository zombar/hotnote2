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

// ── Table of Contents ─────────────────────────────────────────────────────────

test.describe('table of contents', () => {
    const MD_WITH_HEADINGS = '# Title\n\n## Section One\n\nSome text.\n\n## Section Two\n\nMore text.\n\n### Sub-section\n\nDeep.\n';

    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('TOC button appears in toolbar for .md files', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': MD_WITH_HEADINGS });
        await openFile(page, 'notes.md');
        await expect(page.locator('#toc-btn')).toBeVisible();
    });

    test('TOC button does not appear for non-markdown files', async ({ page }) => {
        await openMockFolder(page, { 'data.json': '{"a":1}' });
        await openFile(page, 'data.json');
        await expect(page.locator('#toc-btn')).not.toBeVisible();
    });

    test('clicking TOC button in source mode switches to wysiwyg and shows panel', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': MD_WITH_HEADINGS });
        await openFile(page, 'notes.md');
        // Start in source mode
        await expect(page.locator('#source-editor-wrap')).toBeVisible();

        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).toBeVisible();
        await expect(page.locator('#wysiwyg')).toBeVisible();
    });

    test('TOC panel lists document headings', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': MD_WITH_HEADINGS });
        await openFile(page, 'notes.md');
        await switchToWysiwyg(page);
        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).toBeVisible();

        const items = page.locator('#toc-panel .toc-item');
        await expect(items).toHaveCount(4); // Title, Section One, Section Two, Sub-section
        await expect(items.nth(0)).toContainText('Title');
        await expect(items.nth(1)).toContainText('Section One');
        await expect(items.nth(3)).toContainText('Sub-section');
    });

    test('TOC button toggles panel off', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': MD_WITH_HEADINGS });
        await openFile(page, 'notes.md');
        await switchToWysiwyg(page);

        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).toBeVisible();

        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).not.toBeVisible();
    });

    test('TOC panel hides when switching away from wysiwyg', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': MD_WITH_HEADINGS });
        await openFile(page, 'notes.md');
        await switchToWysiwyg(page);
        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).toBeVisible();

        await page.locator('#mode-source').click();
        await expect(page.locator('#toc-panel')).not.toBeVisible();
    });

    test('TOC is not shown for file without headings', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': 'Just a plain paragraph.\n' });
        await openFile(page, 'notes.md');
        await switchToWysiwyg(page);

        // Force tocVisible via button (clicking should not show panel if no headings)
        await page.locator('#toc-btn').click();
        await expect(page.locator('#toc-panel')).not.toBeVisible();
    });

    test('clicking TOC item scrolls the heading into view', async ({ page }) => {
        // Create a long document so scrolling is needed
        const longMd = '# Top\n\n' + 'paragraph\n\n'.repeat(30) + '## Far Down\n\nEnd.\n';
        await openMockFolder(page, { 'notes.md': longMd });
        await openFile(page, 'notes.md');
        await switchToWysiwyg(page);
        await page.locator('#toc-btn').click();

        const farDownItem = page.locator('#toc-panel .toc-item', { hasText: 'Far Down' });
        await expect(farDownItem).toBeVisible();
        await farDownItem.click();

        // After clicking, the h2 should be visible in the wysiwyg
        const heading = page.locator('#wysiwyg h2', { hasText: 'Far Down' });
        await expect(heading).toBeInViewport({ timeout: 2000 });
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
