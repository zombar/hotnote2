import { test, expect } from '@playwright/test';

test.describe('Help Panel', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');
    });

    test('#help-btn is visible in the header', async ({ page }) => {
        await expect(page.locator('#help-btn')).toBeVisible();
    });

    test('clicking ? shows pane2 and makes #help-btn active', async ({ page }) => {
        await expect(page.locator('#pane2')).not.toBeVisible();
        await page.locator('#help-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await expect(page.locator('#help-btn')).toHaveClass(/active/);
    });

    test('help toolbar has both tab buttons and close button', async ({ page }) => {
        await page.locator('#help-btn').click();
        await expect(page.locator('#help-tab-markdown')).toBeVisible();
        await expect(page.locator('#help-tab-shortcuts')).toBeVisible();
        await expect(page.locator('#help-close-btn')).toBeVisible();
    });

    test('Shortcuts tab shows keyboard shortcuts content', async ({ page }) => {
        await page.locator('#help-btn').click();
        await page.locator('#help-tab-shortcuts').click();
        const wysiwyg = page.locator('#wysiwyg-p2');
        await expect(wysiwyg).toContainText('Keyboard Shortcuts');
    });

    test('Markdown Guide tab shows markdown guide content', async ({ page }) => {
        await page.locator('#help-btn').click();
        await page.locator('#help-tab-shortcuts').click();
        await page.locator('#help-tab-markdown').click();
        const wysiwyg = page.locator('#wysiwyg-p2');
        await expect(wysiwyg).toContainText('Markdown Guide');
    });

    test('close button hides pane2', async ({ page }) => {
        await page.locator('#help-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await page.locator('#help-close-btn').click();
        await expect(page.locator('#pane2')).not.toBeVisible();
    });

    test('clicking ? again when open closes it', async ({ page }) => {
        await page.locator('#help-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await page.locator('#help-btn').click();
        await expect(page.locator('#pane2')).not.toBeVisible();
        await expect(page.locator('#help-btn')).not.toHaveClass(/active/);
    });

    test('with split pane open: ? shows help toolbar; closing restores split pane2', async ({ page }) => {
        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), {
            tree: { 'notes.md': '# Hello world' },
        });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });
        await page.locator('#file-list li').first().click();

        // Open split pane
        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();

        // Open help
        await page.locator('#help-btn').click();
        await expect(page.locator('#help-tab-markdown')).toBeVisible();
        await expect(page.locator('#help-tab-shortcuts')).toBeVisible();

        // Close help — split pane should still be visible with normal toolbar
        await page.locator('#help-close-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();
        await expect(page.locator('#help-tab-markdown')).not.toBeVisible();
    });

    test('split-pane-btn click while help open closes help (pane2 hides since split was not active)', async ({ page }) => {
        await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), {
            tree: { 'notes.md': '# Hello' },
        });
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        await page.locator('#help-btn').click();
        await expect(page.locator('#pane2')).toBeVisible();

        await page.locator('#split-pane-btn').click();
        await expect(page.locator('#pane2')).not.toBeVisible();
        await expect(page.locator('#help-btn')).not.toHaveClass(/active/);
    });
});
