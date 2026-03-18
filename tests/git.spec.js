// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_FS = 'tests/helpers/mock-fs.js';
const MOCK_GIT = 'tests/helpers/mock-git.js';

async function openMockFolder(page, tree, rootName = 'my-notes') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), { tree, rootName });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

async function openFile(page, filename) {
    await page.locator('#file-list li.file-entry .file-entry-row', { hasText: filename }).click();
    await expect(page.locator('#mode-toolbar')).toBeVisible({ timeout: 5000 });
}

// ── No git repo ───────────────────────────────────────────────────────────────

test.describe('no git repo', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_FS });
        await page.addInitScript({ path: MOCK_GIT });
        await page.goto('/');
        // Set changedPaths to null = no git repo
        await page.evaluate(() => window.__mockGit.setChangedPaths(null));
    });

    test('git filter bar is hidden when no git repo', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await expect(page.locator('#git-filter-bar')).not.toBeVisible();
    });

    test('no Diff button when no git repo', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await expect(page.locator('#mode-diff')).not.toBeVisible();
    });

    test('no git dots on file entries', async ({ page }) => {
        await openMockFolder(page, { 'notes.md': '# Hello' });
        const dots = page.locator('#file-list .git-dot');
        await expect(dots).toHaveCount(0);
    });
});

// ── Git available with changed files ─────────────────────────────────────────

test.describe('git available', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_FS });
        await page.addInitScript({ path: MOCK_GIT });
        await page.goto('/');
    });

    test('git filter bar visible when there are changes', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['notes.md']));
        await openMockFolder(page, { 'notes.md': '# Hello', 'clean.md': '# Clean' });
        await expect(page.locator('#git-filter-bar')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.git-change-count')).toHaveText('1');
    });

    test('git dot appears on modified file', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['notes.md']));
        await openMockFolder(page, { 'notes.md': '# Hello', 'clean.md': '# Clean' });
        // notes.md should have a dot
        const notesRow = page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'notes.md' });
        await expect(notesRow.locator('.git-dot')).toBeVisible();
        // clean.md should NOT have a dot
        const cleanRow = page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'clean.md' });
        await expect(cleanRow.locator('.git-dot')).toHaveCount(0);
    });

    test('git dot appears on directory containing changed files', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['docs/guide.md']));
        await openMockFolder(page, { 'docs': { 'guide.md': '# Guide' } });
        const docsRow = page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'docs' });
        await expect(docsRow.locator('.git-dot')).toBeVisible();
    });

    test('filter toggle shows only changed files', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['notes.md']));
        await openMockFolder(page, { 'notes.md': '# Hello', 'clean.md': '# Clean' });
        await page.locator('#git-filter-bar').waitFor({ state: 'visible' });

        // Before filter: both files visible
        await expect(page.locator('#file-list li.file-entry')).toHaveCount(2);

        // Click filter button
        await page.locator('#git-filter-btn').click();

        // After filter: only notes.md visible
        await expect(page.locator('#file-list li.file-entry')).toHaveCount(1);
        await expect(page.locator('#file-list li.file-entry .name')).toHaveText('notes.md');
    });

    test('filter toggle deactivates on second click', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['notes.md']));
        await openMockFolder(page, { 'notes.md': '# Hello', 'clean.md': '# Clean' });
        await page.locator('#git-filter-bar').waitFor({ state: 'visible' });

        await page.locator('#git-filter-btn').click();
        await expect(page.locator('#file-list li.file-entry')).toHaveCount(1);

        await page.locator('#git-filter-btn').click();
        await expect(page.locator('#file-list li.file-entry')).toHaveCount(2);
    });
});

// ── Diff mode ─────────────────────────────────────────────────────────────────

test.describe('diff mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_FS });
        await page.addInitScript({ path: MOCK_GIT });
        await page.goto('/');
    });

    test('Diff button appears when git is available and file is open', async ({ page }) => {
        await page.evaluate(() => window.__mockGit.setChangedPaths(['notes.md']));
        await openMockFolder(page, { 'notes.md': '# Hello' });
        await openFile(page, 'notes.md');
        await expect(page.locator('#mode-diff')).toBeVisible();
    });

    test('diff view shows added lines for modified file', async ({ page }) => {
        await page.evaluate(() => {
            window.__mockGit.setChangedPaths(['notes.md']);
            window.__mockGit.setHeadBlob('notes.md', 'old line\n');
        });
        await openMockFolder(page, { 'notes.md': 'old line\nnew line\n' });
        await openFile(page, 'notes.md');
        await page.locator('#mode-diff').click();

        const diffView = page.locator('#diff-view');
        await expect(diffView).toBeVisible();
        // Should show an added line with + gutter
        await expect(diffView.locator('.diff-add')).toBeVisible();
        await expect(diffView.locator('.diff-add .diff-gutter')).toHaveText('+');
        await expect(diffView.locator('.diff-add code')).toContainText('new line');
    });

    test('diff view shows removed lines for modified file', async ({ page }) => {
        await page.evaluate(() => {
            window.__mockGit.setChangedPaths(['notes.md']);
            window.__mockGit.setHeadBlob('notes.md', 'old line\nremoved line\n');
        });
        await openMockFolder(page, { 'notes.md': 'old line\n' });
        await openFile(page, 'notes.md');
        await page.locator('#mode-diff').click();

        const diffView = page.locator('#diff-view');
        await expect(diffView.locator('.diff-del')).toBeVisible();
        await expect(diffView.locator('.diff-del code')).toContainText('removed line');
    });

    test('diff view shows "no changes" when content matches HEAD', async ({ page }) => {
        const content = 'same content\n';
        await page.evaluate((c) => {
            window.__mockGit.setChangedPaths(['notes.md']);
            window.__mockGit.setHeadBlob('notes.md', c);
        }, content);
        await openMockFolder(page, { 'notes.md': content });
        await openFile(page, 'notes.md');
        await page.locator('#mode-diff').click();

        await expect(page.locator('#diff-view .diff-clean')).toBeVisible();
    });

    test('diff view shows untracked file as fully added', async ({ page }) => {
        await page.evaluate(() => {
            window.__mockGit.setChangedPaths(['new-file.txt']);
            // headBlob is not set → null → untracked
        });
        await openMockFolder(page, { 'new-file.txt': 'hello\nworld\n' });
        await openFile(page, 'new-file.txt');
        await page.locator('#mode-diff').click();

        const diffView = page.locator('#diff-view');
        await expect(diffView.locator('.diff-untracked')).toBeVisible();
        // All lines should be additions
        const addLines = diffView.locator('.diff-add');
        await expect(addLines).toHaveCount(2);
    });

    test('diff view shows hunk header', async ({ page }) => {
        const oldContent = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
        const newContent = Array.from({ length: 20 }, (_, i) =>
            i === 10 ? 'modified line 11' : `line ${i + 1}`
        ).join('\n') + '\n';

        await page.evaluate(({ oldContent }) => {
            window.__mockGit.setChangedPaths(['notes.md']);
            window.__mockGit.setHeadBlob('notes.md', oldContent);
        }, { oldContent });
        await openMockFolder(page, { 'notes.md': newContent });
        await openFile(page, 'notes.md');
        await page.locator('#mode-diff').click();

        await expect(page.locator('#diff-view .diff-hunk')).toBeVisible();
        await expect(page.locator('#diff-view .diff-hunk')).toContainText('@@');
    });
});
