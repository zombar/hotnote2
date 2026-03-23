'use strict';

// =========================================================================
// Help Panel
// =========================================================================

const HELP_MARKDOWN_GUIDE = `# Markdown Guide

## Headings

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
\`\`\`

## Emphasis

| Syntax | Result |
|---|---|
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |
| \`~~strikethrough~~\` | ~~strikethrough~~ |
| \`` + '`' + `inline code\`` + '`' + ` | \`inline code\` |

## Links & Images

\`\`\`
[Link text](https://example.com)
![Alt text](image.png)
\`\`\`

## Lists

**Unordered:**
\`\`\`
- Item one
- Item two
  - Nested item
\`\`\`

**Ordered:**
\`\`\`
1. First
2. Second
3. Third
\`\`\`

**Task list:**
\`\`\`
- [x] Done
- [ ] To do
\`\`\`

## Blockquotes

\`\`\`
> This is a blockquote.
> It can span multiple lines.
\`\`\`

## Code Blocks

\`\`\`
\\\`\\\`\\\`javascript
const x = 42;
console.log(x);
\\\`\\\`\\\`
\`\`\`

## Tables

\`\`\`
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell     | Cell     | Cell     |
| Cell     | Cell     | Cell     |
\`\`\`

## Horizontal Rule

\`\`\`
---
\`\`\`

## Wikilinks

Link to another note in your folder by name:

\`\`\`
[[my-note]]
[[my-note.md]]
[[my-note|Custom display text]]
\`\`\`

Clicking a wikilink in Preview mode opens that note. If no extension is given, \`.md\` is tried automatically.
`;

const HELP_SHORTCUTS = `# Keyboard Shortcuts

## File

| Shortcut | Action |
|---|---|
| Ctrl+S / Cmd+S | Save file |

## Navigation

| Shortcut | Action |
|---|---|
| Arrow keys | Move cursor |
| Home / End | Start / end of line |
| Ctrl+Home / Ctrl+End | Start / end of file |
| Ctrl+← / Ctrl+→ | Move word by word |
| Page Up / Page Down | Scroll page |

## Selection

| Shortcut | Action |
|---|---|
| Shift+arrows | Extend selection |
| Ctrl+A | Select all |
| Ctrl+L | Select current line |
| Ctrl+Alt+↑ / ↓ | Add cursor above / below |
| Escape | Cancel selection / multi-cursor |

## Editing

| Shortcut | Action |
|---|---|
| Tab | Indent |
| Shift+Tab | Unindent |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+Shift+D | Duplicate line |
| Ctrl+X | Cut selection, or cut/delete line if no selection |
| Ctrl+Shift+K | Delete line |
| Ctrl+/ | Toggle line comment |
| Alt+↑ / Alt+↓ | Move line up / down |
`;

function openHelpPane() {
    state._helpModeWasSplit = state.splitMode;
    state.helpMode = true;
    document.getElementById('help-btn')?.classList.add('active');
    document.getElementById('pane2').style.display = '';
    document.getElementById('split-resize-handle').style.display = '';
    renderHelpToolbar('markdown');
    renderHelpTab('markdown');
}

function closeHelpPane() {
    state.helpMode = false;
    document.getElementById('help-btn')?.classList.remove('active');
    if (!state._helpModeWasSplit) {
        document.getElementById('pane2').style.display = 'none';
        document.getElementById('split-resize-handle').style.display = 'none';
        const p1 = document.getElementById('pane1');
        if (p1) { p1.style.flexBasis = ''; p1.style.flexGrow = ''; p1.style.flexShrink = ''; }
    } else {
        const ps = getPaneState('pane2');
        updateModeToolbar('pane2');
        if (ps.currentFileHandle) {
            const textarea = document.getElementById('source-editor-p2');
            switchToMode(ps.editorMode, 'pane2', textarea ? textarea.value : '');
        } else {
            document.getElementById('mode-toolbar-p2').innerHTML = '';
        }
    }
}

function renderHelpToolbar(activeTab) {
    const toolbar = document.getElementById('mode-toolbar-p2');
    toolbar.innerHTML = `
        <button class="btn btn-sm${activeTab === 'markdown' ? ' active' : ''}" id="help-tab-markdown">Markdown Guide</button>
        <button class="btn btn-sm${activeTab === 'shortcuts' ? ' active' : ''}" id="help-tab-shortcuts">Shortcuts</button>
        <span class="help-toolbar-spacer"></span>
        <button class="btn btn-sm btn-icon" id="help-close-btn" title="Close help">&#x2715;</button>
    `;
    toolbar.querySelector('#help-tab-markdown').addEventListener('click', () => { renderHelpToolbar('markdown'); renderHelpTab('markdown'); });
    toolbar.querySelector('#help-tab-shortcuts').addEventListener('click', () => { renderHelpToolbar('shortcuts'); renderHelpTab('shortcuts'); });
    toolbar.querySelector('#help-close-btn').addEventListener('click', closeHelpPane);
}

function renderHelpTab(tabName) {
    ['source-editor-wrap-p2', 's3-datasheet-p2', 's3-treeview-p2', 'image-viewer-p2', 'diff-view-p2']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const wysiwyg = document.getElementById('wysiwyg-p2');
    wysiwyg.style.display = 'block';
    wysiwyg.className = 's3-wysiwyg';
    wysiwyg.contentEditable = 'false';
    wysiwyg.innerHTML = TM.markdown.renderMarkdown(
        tabName === 'markdown' ? HELP_MARKDOWN_GUIDE : HELP_SHORTCUTS
    );
}
