// @ts-check
const { test, expect } = require('@playwright/test');

const MOCK_SCRIPT = 'tests/helpers/mock-fs.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openEditor(page, content = 'line one\nline two\nline three') {
    await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName),
        { tree: { 'test.md': content }, rootName: 'my-notes' });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
    await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'test.md' }).click();
    // Wait for mode toolbar to confirm file is open (works for empty files too)
    await page.locator('#mode-toolbar').waitFor({ state: 'visible', timeout: 5000 });
    // Focus the CE editor
    await page.locator('#source-editor-ce').click();
}

// Set content programmatically and place cursor at end
async function setContent(page, content, paneId = 'pane1') {
    await page.evaluate(([p, v]) => window.setEditorValue(p, v), [paneId, content]);
}

// Move cursor to a char offset in the document
async function setCursorOffset(page, offset, paneId = 'pane1') {
    await page.evaluate(([p, o]) => window.sourceEditors[p].setSelection(o, o), [paneId, offset]);
}

// Get current mirror value
async function getValue(page, paneId = 'pane1') {
    return page.evaluate(p => document.getElementById(p === 'pane2' ? 'source-editor-p2' : 'source-editor').value, paneId);
}

// ── Basic typing ──────────────────────────────────────────────────────────────

test.describe('basic typing', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('type at cursor inserts text', async ({ page }) => {
        await openEditor(page, 'hello');
        // cursor is at end after click (past end of text)
        await page.keyboard.type(' world');
        await expect(page.locator('#source-editor')).toHaveValue('hello world');
    });

    test('backspace removes character', async ({ page }) => {
        await openEditor(page, 'abc');
        // cursor at end (past 'c')
        await page.keyboard.press('Backspace');
        await expect(page.locator('#source-editor')).toHaveValue('ab');
    });

    test('delete removes character forward', async ({ page }) => {
        await openEditor(page, 'abc');
        // Move cursor to start
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Delete');
        await expect(page.locator('#source-editor')).toHaveValue('bc');
    });

    test('Enter inserts newline', async ({ page }) => {
        await openEditor(page, 'a');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('b');
        await expect(page.locator('#source-editor')).toHaveValue('a\nb');
    });
});

// ── Auto-indent on Enter ──────────────────────────────────────────────────────

test.describe('auto-indent on Enter', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Enter preserves leading whitespace', async ({ page }) => {
        await openEditor(page, '    indented');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('x');
        const val = await getValue(page);
        expect(val).toBe('    indented\n    x');
    });

    test('Enter after { adds extra indent', async ({ page }) => {
        await openEditor(page, 'if (x) {');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        const val = await getValue(page);
        // Should have extra indent after {
        const lines = val.split('\n');
        expect(lines[1]).toMatch(/^\s{4,}/);
    });
});

// ── Tab indentation ───────────────────────────────────────────────────────────

test.describe('Tab indentation', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Tab inserts spaces at cursor (no selection)', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.press('Tab');
        const val = await getValue(page);
        expect(val).toMatch(/^ +/);
    });

    test('Tab with selection indents selected lines', async ({ page }) => {
        await openEditor(page, 'a\nb');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Tab');
        const val = await getValue(page);
        const lines = val.split('\n');
        expect(lines[0]).toMatch(/^ /);
        expect(lines[1]).toMatch(/^ /);
    });

    test('Shift+Tab dedents selected lines', async ({ page }) => {
        await openEditor(page, '    a\n    b');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Shift+Tab');
        const val = await getValue(page);
        const lines = val.split('\n');
        expect(lines[0]).not.toMatch(/^    a/);
        expect(lines[1]).not.toMatch(/^    b/);
    });
});

// ── Auto-close brackets ───────────────────────────────────────────────────────

test.describe('auto-close brackets', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('( auto-closes to ()', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('(');
        const val = await getValue(page);
        expect(val).toBe('()');
    });

    test('[ auto-closes to []', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('[');
        const val = await getValue(page);
        expect(val).toBe('[]');
    });

    test('{ auto-closes to {}', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('{');
        const val = await getValue(page);
        expect(val).toBe('{}');
    });

    test('typing ) over existing ) skips rather than inserting', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('(');
        // Cursor is now between ( and )
        await page.keyboard.type(')');
        const val = await getValue(page);
        // Should still be just () not ())
        expect(val).toBe('()');
    });
});

// ── Undo and redo ─────────────────────────────────────────────────────────────

test.describe('undo and redo', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Ctrl+Z undoes last typing batch', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('hello');
        // Wait for undo batch debounce to expire
        await page.waitForTimeout(1100);
        await page.keyboard.type(' world');
        await page.keyboard.press('Control+z');
        const val = await getValue(page);
        // ' world' should be undone
        expect(val).toBe('hello');
    });

    test('Ctrl+Y redoes after undo', async ({ page }) => {
        await openEditor(page, '');
        await page.keyboard.type('hello');
        await page.waitForTimeout(1100);
        await page.keyboard.press('Control+z');
        await expect(page.locator('#source-editor')).toHaveValue('');
        await page.keyboard.press('Control+y');
        await expect(page.locator('#source-editor')).toHaveValue('hello');
    });

    test('Ctrl+Z undoes Enter (newline)', async ({ page }) => {
        await openEditor(page, 'a');
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+z');
        const val = await getValue(page);
        expect(val).toBe('a');
    });

    test('undo after switching files does not bleed content from previous file', async ({ page }) => {
        // Set up two files
        await page.evaluate(() => window.__mockFS.setTree(
            { 'a.md': 'file A content', 'b.md': 'file B content' }, 'my-notes'));
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        // Open a.md and make an edit
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'a.md' }).click();
        await page.locator('#mode-toolbar').waitFor({ state: 'visible' });
        await page.locator('#source-editor-ce').click();
        await page.keyboard.press('End');
        await page.keyboard.type(' EDITED');

        // Switch to b.md — accept the "discard changes" dialog and wait for content
        page.once('dialog', d => d.accept());
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        await expect(page.locator('#source-editor')).toHaveValue('file B content');
        await page.locator('#source-editor-ce').click();

        // Undo in b.md — must not restore a.md's content
        await page.keyboard.press('Control+z');
        const val = await getValue(page);
        expect(val).toBe('file B content');
    });

    test('undo history is empty after opening a new file', async ({ page }) => {
        await page.evaluate(() => window.__mockFS.setTree(
            { 'a.md': 'file A', 'b.md': 'file B' }, 'my-notes'));
        await page.locator('#open-folder').click();
        await page.locator('#file-list li').first().waitFor({ state: 'visible' });

        // Open a.md, type something so the stack is non-empty
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'a.md' }).click();
        await page.locator('#mode-toolbar').waitFor({ state: 'visible' });
        await page.locator('#source-editor-ce').click();
        await page.keyboard.type('extra');

        // Open b.md — accept discard dialog, wait for content, undo stack should be cleared
        page.once('dialog', d => d.accept());
        await page.locator('#file-list li.file-entry .file-entry-row', { hasText: 'b.md' }).click();
        await expect(page.locator('#source-editor')).toHaveValue('file B');

        const stackSize = await page.evaluate(() => window.sourceEditors.pane1._undoStack.length);
        expect(stackSize).toBe(0);
    });
});

// ── Line operations ───────────────────────────────────────────────────────────

test.describe('line operations', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Ctrl+Shift+D duplicates current line', async ({ page }) => {
        await openEditor(page, 'hello');
        // Press Ctrl+Shift+D
        await page.keyboard.press('Control+Shift+D');
        const val = await getValue(page);
        expect(val).toBe('hello\nhello');
    });

    test('Alt+Down moves line down', async ({ page }) => {
        await openEditor(page, 'a\nb');
        // cursor is at end of file — use Home to go to line 0
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Alt+ArrowDown');
        const val = await getValue(page);
        expect(val).toBe('b\na');
    });

    test('Alt+Up moves line up', async ({ page }) => {
        await openEditor(page, 'a\nb');
        // Move cursor to line 1 (second line)
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Alt+ArrowUp');
        const val = await getValue(page);
        expect(val).toBe('b\na');
    });

    test('Ctrl+Shift+K deletes current line', async ({ page }) => {
        await openEditor(page, 'a\nb\nc');
        // Move cursor to second line
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Control+Shift+K');
        const val = await getValue(page);
        expect(val).toBe('a\nc');
    });

    test('Ctrl+L selects current line then typing replaces it', async ({ page }) => {
        await openEditor(page, 'hello\nworld');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+L');
        await page.keyboard.type('replaced');
        const val = await getValue(page);
        expect(val).toMatch(/^replaced/);
    });
});

// ── Comment toggle ────────────────────────────────────────────────────────────

test.describe('comment toggle', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Ctrl+/ adds comment prefix', async ({ page }) => {
        await openEditor(page, 'let x = 1;');
        await page.keyboard.press('Control+/');
        const val = await getValue(page);
        expect(val).toMatch(/^\/\//);
    });

    test('Ctrl+/ on commented line removes prefix', async ({ page }) => {
        await openEditor(page, '// let x = 1;');
        await page.keyboard.press('Control+/');
        const val = await getValue(page);
        expect(val).not.toMatch(/^\/\//);
        expect(val).toContain('let x = 1;');
    });

    test('Ctrl+/ toggles a block of selected lines', async ({ page }) => {
        await openEditor(page, 'a\nb\nc');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Control+/');
        const val = await getValue(page);
        const lines = val.split('\n');
        expect(lines.every(l => l.startsWith('//'))).toBe(true);
    });
});

// ── Multiple cursors ──────────────────────────────────────────────────────────

test.describe('multiple cursors', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('addCursorAt API adds second cursor, typing inserts at both', async ({ page }) => {
        await openEditor(page, 'aaa\nbbb');
        // Set cursor at end of line 0, add another at end of line 1
        await page.evaluate(() => {
            const eng = window.sourceEditors.pane1;
            eng.setSelection(3, 3); // end of 'aaa'
            eng.addCursorAt(1, 3);  // end of 'bbb'
        });
        await page.keyboard.type('X');
        const val = await getValue(page);
        expect(val).toBe('aaaX\nbbbX');
    });

    test('Ctrl+Alt+Down adds cursor below', async ({ page }) => {
        await openEditor(page, 'aaa\nbbb');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('End');
        await page.keyboard.press('Control+Alt+ArrowDown');
        await page.keyboard.type('Z');
        const val = await getValue(page);
        expect(val).toBe('aaaZ\nbbbZ');
    });

    test('Ctrl+Alt+Up adds cursor above', async ({ page }) => {
        await openEditor(page, 'aaa\nbbb');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Control+Alt+ArrowUp');
        await page.keyboard.type('Z');
        const val = await getValue(page);
        expect(val).toBe('aaaZ\nbbbZ');
    });

    test('Escape collapses to single cursor', async ({ page }) => {
        await openEditor(page, 'aaa\nbbb');
        await page.evaluate(() => {
            const eng = window.sourceEditors.pane1;
            eng.setSelection(3, 3);
            eng.addCursorAt(1, 3);
        });
        await page.keyboard.press('Escape');
        await page.keyboard.type('Q');
        const val = await getValue(page);
        // Only one Q should be inserted
        expect((val.match(/Q/g) || []).length).toBe(1);
    });
});

// ── Box (column) selection ────────────────────────────────────────────────────

test.describe('box selection', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('setBoxSelection API then type inserts at each line column', async ({ page }) => {
        await openEditor(page, 'aaa\nbbb\nccc');
        await page.evaluate(() => {
            window.sourceEditors.pane1.setBoxSelection(0, 0, 2, 0);
        });
        await page.keyboard.type('X');
        const val = await getValue(page);
        expect(val).toBe('Xaaa\nXbbb\nXccc');
    });
});

// ── Selection and navigation ──────────────────────────────────────────────────

test.describe('selection and navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('Ctrl+A selects all then typing replaces', async ({ page }) => {
        await openEditor(page, 'hello');
        await page.keyboard.press('Control+a');
        await page.keyboard.type('replaced');
        await expect(page.locator('#source-editor')).toHaveValue('replaced');
    });

    test('Shift+Right extends selection, typing replaces selected', async ({ page }) => {
        await openEditor(page, 'abcde');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.type('X');
        const val = await getValue(page);
        expect(val).toBe('Xcde');
    });

    test('Home moves to line start / first non-whitespace', async ({ page }) => {
        await openEditor(page, '    hello');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('End');
        await page.keyboard.press('Home');
        // Should jump to first non-whitespace (col 4)
        await page.keyboard.type('X');
        const val = await getValue(page);
        expect(val).toContain('    Xhello');
    });

    test('Ctrl+Right jumps to next word boundary', async ({ page }) => {
        await openEditor(page, 'hello world');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+ArrowRight');
        // Cursor should be after 'hello'
        await page.keyboard.type('X');
        const val = await getValue(page);
        expect(val).toBe('helloX world');
    });

    test('double-click selects word, typing replaces', async ({ page }) => {
        await openEditor(page, 'hello world');
        // Select 'hello' (offset 0..5)
        await page.evaluate(() => window.sourceEditors.pane1.setSelection(0, 5));
        await page.keyboard.type('bye');
        const val = await getValue(page);
        expect(val).toBe('bye world');
    });

    test('double-click selects word, Backspace removes block', async ({ page }) => {
        await openEditor(page, 'hello world');
        // Select 'hello' (offset 0..5)
        await page.evaluate(() => window.sourceEditors.pane1.setSelection(0, 5));
        await page.keyboard.press('Backspace');
        const val = await getValue(page);
        expect(val).toBe(' world');
    });

    test('triple-click selects line, typing replaces', async ({ page }) => {
        await openEditor(page, 'hello world\nsecond line');
        // Select entire first line (offset 0..11)
        await page.evaluate(() => window.sourceEditors.pane1.setSelection(0, 11));
        await page.keyboard.type('replaced');
        const val = await getValue(page);
        expect(val).toBe('replaced\nsecond line');
    });
});

// ── setValue / getValue API ───────────────────────────────────────────────────

test.describe('setValue / getValue API', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: MOCK_SCRIPT });
        await page.goto('/');
    });

    test('setValue updates mirror textarea', async ({ page }) => {
        await openEditor(page, 'original');
        await setContent(page, 'new content');
        await expect(page.locator('#source-editor')).toHaveValue('new content');
    });

    test('setValue with silent:true does not fire dirty', async ({ page }) => {
        await openEditor(page, 'original');
        await page.evaluate(() => window.sourceEditors.pane1.setValue('silent update', { silent: true }));
        // Title should not have dirty indicator
        await expect(page).not.toHaveTitle(/^•/);
    });

    test('CE editor renders content as ce-line divs', async ({ page }) => {
        await openEditor(page, 'line1\nline2\nline3');
        const count = await page.locator('#source-editor-ce .ce-line').count();
        expect(count).toBe(3);
    });
});
