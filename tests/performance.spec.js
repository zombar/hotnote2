// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');

// =========================================================================
// Performance / large-repo guard tests
// =========================================================================

test.describe('getAllFiles limit', () => {
    test('returns at most `limit` files', async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');

        // Build a flat tree with 10 files
        const tree = {};
        for (let i = 1; i <= 10; i++) tree[`file${i}.md`] = `# File ${i}`;

        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), { tree });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        const count = await page.evaluate(async () => {
            const results = await getAllFiles(state.rootHandle, '', [], 5);
            return results.length;
        });
        expect(count).toBe(5);
    });
});

test.describe('search abort', () => {
    test('only shows results for the latest query', async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');

        const tree = {
            'alpha.md': '# Alpha document',
            'beta.md': '# Beta document',
            'gamma.md': '# Gamma document',
        };
        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), { tree });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        // Open search panel
        await page.locator('#search-btn').click();

        // Type "beta" — expect only beta.md to appear
        const input = page.locator('#search-input');
        await input.fill('beta');
        await input.dispatchEvent('input');

        // Wait for results to settle
        await page.waitForTimeout(600);
        const items = await page.locator('#file-list .file-entry').count();
        const names = await page.locator('#file-list .file-entry .name').allTextContents();
        expect(names.every(n => n.toLowerCase().includes('beta'))).toBe(true);
        expect(items).toBe(1);
    });
});

test.describe('fileHistory cap', () => {
    test('history length stays at or below FILE_HISTORY_MAX', async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');

        // Create 110 files
        const tree = {};
        for (let i = 1; i <= 110; i++) tree[`note${String(i).padStart(3, '0')}.md`] = `# Note ${i}`;

        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), { tree });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        // Open each file by clicking it in the sidebar
        const entries = await page.locator('#file-list .file-entry').all();
        for (const entry of entries) {
            await entry.click();
            await page.waitForTimeout(50);
        }

        const histLen = await page.evaluate(() => state.fileHistory.length);
        expect(histLen).toBeLessThanOrEqual(100);
    });
});

test.describe('gitChangedDirs pre-computation', () => {
    test('gitChangedDirs contains parent directories of changed files', async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.addInitScript(() => {
            window.__mockGit = {
                changedPathsOverride: new Set(['src/utils/helpers.js', 'docs/guide.md']),
            };
        });
        await page.goto('/');

        const tree = {
            'src': { 'utils': { 'helpers.js': 'export function foo() {}' } },
            'docs': { 'guide.md': '# Guide' },
        };
        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), { tree });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        // Trigger git refresh
        await page.evaluate(async () => { await refreshGitStatus({ force: true }); });

        const dirs = await page.evaluate(() => [...state.gitChangedDirs]);
        expect(dirs).toContain('src');
        expect(dirs).toContain('src/utils');
        expect(dirs).toContain('docs');
    });
});
