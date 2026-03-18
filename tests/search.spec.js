import { test, expect } from '@playwright/test';

const TREE = {
    'readme.md': '# Hello\nThis is a readme',
    'notes.md': '# Notes\nSearch target content here',
    'data.json': '[{"id":1,"name":"test"}]',
    'docs': {
        'guide.md': '# Guide\nSome documentation',
    }
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
    await page.goto('/');
    await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), { tree: TREE });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
});

test('search button is visible in sidebar toolbar', async ({ page }) => {
    await expect(page.locator('#search-btn')).toBeVisible();
});

test('clicking search button shows search panel and focuses input', async ({ page }) => {
    await expect(page.locator('#search-panel')).not.toBeVisible();
    await page.locator('#search-btn').click();
    await expect(page.locator('#search-panel')).toBeVisible();
    await expect(page.locator('#search-input')).toBeFocused();
});

test('filename search filters results correctly', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-input').fill('note');
    await page.locator('#file-list li.search-result').first().waitFor({ state: 'visible' });
    const results = await page.locator('#file-list li.search-result').allTextContents();
    expect(results.some(t => t.includes('notes.md'))).toBeTruthy();
    expect(results.every(t => !t.includes('readme.md'))).toBeTruthy();
});

test('shows all files when query matches multiple', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-input').fill('.md');
    await page.locator('#file-list li.search-result').first().waitFor({ state: 'visible' });
    const count = await page.locator('#file-list li.search-result').count();
    expect(count).toBeGreaterThanOrEqual(3); // readme.md, notes.md, docs/guide.md
});

test('shows no results message for unmatched query', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-input').fill('xyznotexist');
    await page.locator('.search-status').waitFor({ state: 'visible' });
    await expect(page.locator('.search-status')).toContainText('No results');
});

test('content search finds files by content', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-content-toggle').check();
    await page.locator('#search-input').fill('target content');
    await page.locator('#file-list li.search-result').first().waitFor({ state: 'visible' });
    const results = await page.locator('#file-list li.search-result .name').allTextContents();
    expect(results).toContain('notes.md');
});

test('clicking search icon again closes search and restores file tree', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-input').fill('notes');
    await page.locator('#file-list li.search-result').first().waitFor({ state: 'visible' });
    await page.locator('#search-btn').click(); // toggle closed
    await expect(page.locator('#search-panel')).not.toBeVisible();
    await expect(page.locator('#file-list li.search-result')).toHaveCount(0);
    await expect(page.locator('#file-list li.file-entry')).not.toHaveCount(0);
});

test('clicking search result opens file and closes search', async ({ page }) => {
    await page.locator('#search-btn').click();
    await page.locator('#search-input').fill('notes.md');
    await page.locator('#file-list li.search-result').first().waitFor({ state: 'visible' });
    await page.locator('#file-list li.search-result').first().click();
    await expect(page.locator('#search-panel')).not.toBeVisible();
    await expect(page.locator('#mode-toolbar')).toBeVisible();
});
