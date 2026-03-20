# HotNote2 — Project Guidelines for Claude

## Testing

### Commands
- `make test-install` — install Playwright + Chromium (run once after clone)
- `make test` — run all E2E tests (headless Chromium)
- `make test-ui` — open Playwright UI for interactive test runs / traces
- `make test-report` — open the last HTML test report

### Architecture
Tests live in `tests/`. The app has no build step — Playwright serves it via `python3 -m http.server 8080`.
All tests use Chromium only (File System Access API not supported in Firefox/Safari).

### Mock File System
Every test that touches the file system **must** inject the mock before `page.goto()`:

```javascript
test.beforeEach(async ({ page }) => {
    await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
    await page.goto('/');
});
```

Set the virtual file tree **after** `goto()` but **before** clicking `#open-folder`:

```javascript
await page.evaluate(({ tree, rootName }) => window.__mockFS.setTree(tree, rootName), {
    tree: { 'notes.md': '# Hello', 'data.json': '[{"id":1}]' },
    rootName: 'my-notes',  // optional, defaults to 'my-notes'
});
await page.locator('#open-folder').click();
await page.locator('#file-list li').first().waitFor({ state: 'visible' });
```

### Tree format
- String value → file with that content: `{ 'notes.md': '# Hello' }`
- Object value → directory: `{ 'docs': { 'guide.md': '...' } }`
- `{ __content: '...' }` → file (alternative syntax, rarely needed)

### Asserting saves
```javascript
const written = await page.evaluate(() => window.__mockFS.written);
expect(written['notes.md']).toContain('expected content');
// Keys are relative paths from root: 'subdir/file.md'
```

### Key element IDs
| Element | ID |
|---|---|
| Open folder button | `#open-folder` |
| Sidebar | `#sidebar` |
| File list | `#file-list` |
| Resize handle | `#resize-handle` |
| Sidebar toggle | `#sidebar-toggle` |
| Back / forward | `#back-btn` / `#forward-btn` |
| New file / folder | `#new-file-btn` / `#new-folder-btn` |
| Split pane toggle | `#split-pane-btn` |
| Pane 1 / 2 | `#pane1` / `#pane2` |
| Source editors | `#source-editor` / `#source-editor-p2` |
| Wysiwyg | `#wysiwyg` / `#wysiwyg-p2` |
| Datasheet | `#s3-datasheet` / `#s3-datasheet-p2` |
| Treeview | `#s3-treeview` / `#s3-treeview-p2` |
| Mode toolbar | `#mode-toolbar` (hidden until file open) |
| Mode buttons | `#mode-source` / `#mode-wysiwyg` / `#mode-datasheet` / `#mode-treeview` |
| Save button | `#save-btn` |
| Autosave checkbox | `#autosave-checkbox` |
| Theme toggle | `#theme-toggle` |
| Resume prompt | `#resume-prompt` / `#resume-open-btn` / `#resume-dismiss-btn` |

### Intercepting dialogs
```javascript
// confirm() dialogs (delete, discard changes)
page.on('dialog', d => d.accept());   // accept
page.on('dialog', d => d.dismiss());  // cancel
```

### Fake timers (autosave, file watcher)
```javascript
await page.clock.install();
// ... trigger action ...
await page.clock.fastForward(2500);  // advance 2.5s for autosave
```

### What NOT to test
- Drag-to-move files in sidebar (complex pointer interaction, low ROI)
- Update checker (real network request to GitHub API)
- Image viewer (createObjectURL not available in mock environment)
- Mobile auto-collapse (viewport simulation, edge case)

## Git Workflow

Always pull `main` before creating a feature branch:
```
git checkout main && git pull origin main
git checkout -b feature/my-feature
```

## Release Checklist

When adding a CHANGELOG.md entry with a new version, also update `APP_VERSION` in `js/editor.js` to match.

## Other Make Targets
- `make lint` — ESLint on `js/` only (test files are excluded)
- `make preview` — serve on port 8080 and open browser
- `make setup` — install deps + git hooks (run after clone)
