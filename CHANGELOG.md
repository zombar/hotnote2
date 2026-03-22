## [0.9.7] — 2026-03-22

### Added
- **Wikilinks**: `[[note-name]]` or `[[note-name|display text]]` syntax in markdown files renders as a clickable link in Preview mode; clicking opens the target note (`.md` extension auto-appended if omitted); notes not found show a toast
- **Scroll sync**: when split pane is open with the same file in source + preview, scrolling either panel proportionally scrolls the other

## [0.9.6] — 2026-03-22

### Fixed
- **File open freeze after folder load**: git status workers were firing up to 20 concurrent File System API calls, queuing behind user-initiated file opens. Reduced worker concurrency (`GIT_BATCH_SIZE` 20 → 4) and added a `setTimeout(0)` yield after each file so the event loop can process clicks between reads

## [0.9.5] — 2026-03-21

### Changed
- **Performance — large monorepos**: `detectChangedFiles` now skips git status entirely when a repo has >5 000 indexed files (returns unavailable) and uses a 20-worker batch pool with an mtime fast-path to avoid redundant SHA-1 hashing on unchanged files; `refreshGitStatus` is debounced to at most once per 10 s on post-save calls (open-folder calls always run immediately)
- **Performance — O(1) git dot annotation**: pre-computed `gitChangedDirs` Set replaces O(n×m) `startsWith` scans in `_reAnnotateSidebarDots`, `renderSidebar`, `toggleFolder`, and `renderFileEntry`
- **Performance — search**: `performSearch` now uses an `AbortController` to cancel stale in-flight searches when a new query is typed; content reads use a 10-worker concurrency pool instead of an unbounded `Promise.all`; `getAllFiles` accepts a `limit` (default 10 000 files) to cap memory use on huge trees
- **Performance — history/cache caps**: `fileHistory` is capped at 100 entries; `filePositionCache` (converted to `Map`) evicts the oldest entry when it reaches 200

## [0.9.4] — 2026-03-20

### Added
- **Help panel**: `?` button in the header opens pane2 as a read-only help panel with two tabs — **Markdown Guide** (headings, emphasis, links, lists, blockquotes, code blocks, tables) and **Keyboard Shortcuts** (full shortcut reference table); a ✕ button closes the panel and restores the prior pane2 state; coexists cleanly with split-pane mode
- **Ctrl+X cut-line**: in the source editor, Ctrl+X with a selection cuts it to the clipboard; with no selection, cuts and deletes the entire current line (matches VS Code behaviour)
- **E2E tests**: 9 new tests covering help panel open/close, tab switching, content verification, split-pane coexistence, and Ctrl+X behaviour (suite grows to 189)

## [0.9.3] — 2026-03-20

### Fixed
- **File watcher false reload after save**: saving a file no longer triggers a "Reloaded" toast; `saveFile` now updates `lastModifiedTime` from the written file so the watcher ignores the app's own saves while still detecting genuine external changes

## [0.9.2] — 2026-03-20

### Fixed
- **Diff shows entire file as created on cloned repos**: `_walkTree` had a silent `try/catch` that returned `null` on any object-read error, making pack-file failures indistinguishable from "file not in HEAD tree"; `readHeadBlob` then treated the file as untracked and rendered every line as an addition. Fix: errors from reading git objects now propagate — if pack reading genuinely fails, the diff view shows "Could not load HEAD content" instead of a false "entire file created" diff; truly new/untracked files still show all lines as additions as before.

### Added
- **Welcome screen footer**: version number and copyright (`v0.9.2 · © 2026 FORGE3D CYF`) now appear at the bottom of the welcome screen (shown when no folder is open)

## [0.9.1] — 2026-03-19

### Fixed
- **Folder re-open resets both panes**: opening a new folder now closes split pane, hides pane2, and clears file history for both panes; previously pane2 kept showing content from the previous folder
- **E2E tests**: 3 new tests covering pane2 hidden, split button inactive, and back button disabled after folder re-open (suite grows to 142)

## [0.9.0] — 2026-03-19

### Added
- **Git integration**: when a folder is opened inside a git repository, HotNote reads `.git/` directly via the File System Access API — no shell commands or backend required
- **Changed files indicator**: orange dots appear next to modified files and folders in the sidebar, positioned to the left of the file icon
- **Changes filter**: a "N changes" checkbox in the sidebar footer filters the file tree and search results to show only modified files; toggling a folder open while filtered shows only changed children
- **Diff mode**: a "Diff" button in the mode toolbar shows a unified diff against HEAD — hunk headers, two-column line numbers (new line number for context lines, blank old column), syntax highlighting on added/context lines (none on deleted lines), and CVD-safe colouring; diff view auto-opens when the changes filter is active and a changed file is opened
- **Pack file support**: git objects stored in `.git/objects/pack/` are fully parsed (pack index v2 binary search, deflate-raw decompression, OFS_DELTA and REF_DELTA reconstruction), enabling diff in repos cloned from remotes where all objects are packed
- **Word wrap toggle**: a right-aligned "wrap" pill-checkbox in each pane's mode toolbar toggles word wrap on/off (default off); state is tracked independently per pane in split mode
- **E2E tests**: 10 new tests covering git dots, filter bar, diff rendering (added/removed/unchanged lines, hunk headers, untracked files, syntax highlighting, line numbers, auto-diff), search+filter interaction, and word wrap (suite grows to 139)

## [0.8.2] — 2026-03-18

### Fixed
- **Sidebar minimum width** now derived from actual rendered toolbar button sizes rather than a hardcoded pixel value; CSS uses `calc(14.5rem + 1px)` so it scales with browser font-size, and the JS drag-resize minimum measures live button geometry via `getBoundingClientRect` — correct at any zoom or font-size setting
- **Toolbar icon buttons** (`flex-shrink: 0`) can no longer be compressed by their flex container

## [0.8.0] — 2026-03-18

### Added
- **Sidebar search**: magnifying-glass icon in sidebar toolbar opens a search panel; type to filter by filename; check "Search content" to also match file contents; click a result to open the file; click the icon again to dismiss and restore the file tree
- **E2E tests**: 8 new search tests (suite grows to 111)

## [0.7.9] — 2026-03-18

### Changed
- **Refactor: split `js/hotnote.js` into 11 focused modules** — `state.js`, `utils.js`, `url-state.js`, `highlight.js`, `json-views.js`, `autosave.js`, `split-pane.js`, `ui.js`, `editor.js`, `sidebar.js`, `init.js`; loaded in order via `<script>` tags; no build step, no behaviour changes

## [0.7.8] — 2026-03-18

### Changed
- **Nested tables fill the pane**: clicking an array-of-objects link in treeview or a nested-array cell in datasheet now replaces the pane content with a full paginated table (using `_renderDatasheet`) instead of opening a modal overlay; a `← Back` button in the table toolbar returns to the previous view (treeview or parent table); non-table nested values (raw arrays, objects) still open in the compact modal

## [0.7.7] — 2026-03-18

### Added
- **Example: `examples/team.json`** — array-of-objects that auto-opens in Table view; `tags` (nested array) and `address` (nested object) columns show item-count / `{…}` badges that drill down into a modal
- **Example: `examples/departments.json`** — top-level JSON object that auto-opens in Tree (preview) mode; `engineering`, `design`, and `data` properties are arrays-of-objects — clicking the `N items` link next to each navigates into a full table in the drill-down modal
- **E2E tests**: 10 new tests covering nested array/object drill-down from both datasheet and treeview modes (suite grows to 101)

## [0.7.6] — 2026-03-18

### Added
- **Playwright E2E test suite**: 66 tests covering boot, session restore, sidebar, file browser, editing, view modes (wysiwyg/datasheet/treeview/syntax highlighting), back/forward navigation, split pane, theme toggle, and sidebar resize; run via `make test`
- **Mock File System Access API** (`tests/helpers/mock-fs.js`): injectable in-memory FS for testing without real disk access; supports `entries()`, `getFileHandle`, `getDirectoryHandle`, `removeEntry`, `createWritable`, and `isSameEntry`

## [0.7.5] — 2026-03-18

### Added
- **GitHub icon in navbar**: link to the source repo with tooltip "Review the code"; opens in a new tab
- **File watcher**: open files in pane1/pane2 are polled every 3 s; if the underlying file changes externally and the pane has no unsaved edits, the content is reloaded automatically with a toast notification
- **Toast notification system**: `showToast(message)` — non-blocking bottom-right fade-in/out notifications used by the file watcher

## [0.7.4] — 2026-03-18

### Added
- **Tree view array drill-down**: clicking the `[N items]` count link on any array node in tree view opens the nested data modal; if the array contains objects it renders a table, otherwise shows formatted JSON

### Fixed
- **Pane mirror sync broken on split open**: `state._panesHaveSameFile` now set immediately when toggling split pane; previously it was never set, so neither source mirroring nor preview sync worked
- **Nested JSON cells showing `[object Object]`**: `renderCell` now detects object/array values in any column (regardless of inferred type) and renders a clickable `{…}` / "N items" badge
- **Nested modal drill-down**: clicking a nested badge inside the modal table now navigates into that sub-value with a Back button to return to the parent level; uses event delegation on the modal body so handlers survive re-renders

## [0.7.3] — 2026-03-17

### Fixed
- **Delete not closing editor**: `_resolveAfterDelete` now wraps `isSameEntry` in try/catch (handle may be invalid post-deletion) and adds a `relPath` fallback so deleting the open file always clears the editor
- **Create target ignoring last expanded folder**: `getTargetDir()` now tracks `lastExpandedRelPath` in state; the most recently expanded folder is used as the create target, falling back to the active file's parent folder; collapsing a folder walks the target up to the parent
- **Multiple files highlighted as active**: sidebar active state now compares by full relative path instead of filename; files with identical names in different folders no longer both appear selected
- **File/folder input boxes not exclusive**: opening a new-file input now dismisses any open new-folder input and vice versa
- **Empty folder placeholder visible during input**: "Empty folder" text is now hidden while the creation input row is visible in that folder and restored on cancel

## [0.7.2] — 2026-03-17

### Fixed
- **Wysiwyg pane2 link clicks**: registering the click handler once at init instead of on every mode switch; previously each wysiwyg→source→wysiwyg cycle stacked another handler, causing links to open multiple tabs
- **Memory leaks**: `URL.revokeObjectURL` now called when clearing pane1 (on file delete) and when closing the split pane, preventing orphaned blob URLs for image files
- **Autosave timer leak**: pending autosave timer for pane2 is now cancelled when closing the split pane
- **Circular drag-move**: dragging a folder into one of its own descendants is now blocked in both `dragover` (no drop highlight) and `drop`; previously `copyDirInto` would recurse into the folder while modifying it, creating `a/b/a/b/…` nesting and eventually throwing "state had changed" errors
- **Folder loop nesting**: removed "deepest expanded folder" fallback from `getTargetDir()`; it caused runaway nesting (`examples/test/examples/test/…`) when the current file's parent wasn't visible in the sidebar, or when no file was open. Now always falls back to the root of the current directory view
- **Drag-move stale handle error**: `moveEntry` now deletes via `FileSystemHandle.remove()` instead of `sourceParentHandle.removeEntry()`; the parent handle's cached directory listing becomes stale after creating a sibling folder, which caused "state had changed since it was read from disk" errors
- **Stale sidebar after failed move**: `renderSidebar()` now runs in a `finally` block so it always fires, even on partial failure — prevents the sidebar from misrepresenting disk state and triggering subsequent mis-placed folder creation

### Changed
- Removed dead code: `_clearPane2`, `_CODE_EXTENSIONS`, `_shouldUseWysiwygMode`
- Deduplicated `keyup`/`mouseup` cursor-position logic into a shared `_updateCursorPosition` helper

## [0.7.1] — 2026-03-17

### Fixed
- **Smart target folder**: new file/folder input row now appears inside the parent folder of the active pane's current file (instead of the deepest expanded folder), preventing runaway nesting like `examples/test/examples/test/…`
- **Mirror sync after delete+recreate**: same-file sync between panes now uses `isSameEntry` (cached as `_panesHaveSameFile`) instead of comparing relative path strings; prevents false mirroring when pane1 deletes and recreates a file at the same path while pane2 still holds the old (deleted) handle

## [0.7.0] — 2026-03-17
### Added
- **Inline folder creation**: new folder button now shows an inline input (same UX as new file), replacing the old `prompt()` dialog
- **Smart target folder**: new file/folder is created inside the last-expanded subfolder in the sidebar, preserving expanded tree state; a hint label shows the target path
- **Split pane mode**: split button in the sidebar toolbar opens a second editor side-by-side
  - Each pane has its own file, mode toolbar, history, save/autosave, and focus ring
  - Sidebar file clicks open in the last-focused pane
  - Opening a markdown/JSON/CSV file in split mode automatically puts pane 1 in source and pane 2 in preview
  - Editing in pane 1 syncs content to pane 2 in real time when both panes show the same file
  - URL and history track only pane 1; back/forward buttons operate on the active pane's history
  - Draggable resize handle between panes

### Fixed
- When the same file is open in both panes in source mode, typing in one pane now
  correctly mirrors text in the other pane (the backdrop highlight was not being
  updated, making the synced pane appear blank due to `color: transparent` on the textarea)
- Same-file sync detection now uses relative path instead of bare filename, preventing
  false matches for files with identical names in different folders
- Deleting an open file now navigates back to the previously-open file rather than
  showing an empty editor; if pane2 has no remaining history after deletion, split
  mode is automatically closed; deleted folders correctly affect all open files inside them

## [0.6.0] — 2026-03-16
### Added
- URL now tracks cursor column (`&char=N`) alongside line number (`&line=N`)
- Column position persisted in localStorage (`hotnote2-lastChar`) and restored on resume
- Back/forward navigation updates URL to reflect the navigated file's line and column
- Resume prompt restores cursor to exact line and column on reload

## [0.5.0] — 2026-03-16
### Added
- JSON array-of-objects files now open automatically in Table (datasheet) view
- CSV file support: opens in Table view with RFC 4180 parsing (quoted fields, embedded commas/newlines, numeric coercion)
- "Table" toolbar button for JSON and CSV files; switch freely between Source and Table
- `examples/` folder with sample files: markdown reference, JSON table, JSON tree data, and CSV

### Fixed
- Table view panel rendered with wrong display mode (`block` instead of `flex`), causing layout overflow
- Welcome screen incorrectly stated images could be edited — corrected to "view"

## [0.4.0] — 2026-03-16
### Added
- Session restore: reopens last folder/file on load via URL params or localStorage
- Back/forward file history navigation with browser-style buttons
- Cursor position and scroll memory per file (restored when switching back)
- Editor mode (source/preview/tree) remembered per history entry
- Update notification banner — alerts when a new version is deployed
- URL reflects current file and line number for shareable deep links

## [0.3.0] — 2026-03-15 (UI & Features)
### Added
- Image viewer for PNG, JPG, GIF, SVG, WebP, ICO files
- Syntax highlighting mode for code and JSON files
- Autosave with configurable toggle (persists to localStorage)
- Drag-to-move files within the sidebar
- Resizable sidebar with drag handle
- Back-navigation breadcrumb for nested folders
- Word wrap in source editor

### Changed
- 3-level elevation system for chrome shading
- Sidebar auto-opens when folder is loaded on wide screens; collapses on mobile
- SVG icons for toolbar actions (new file, new folder)
- Greyscale and dark themes with toggle

## [0.2.0] — 2026-03-15 (JSON & Markdown)
### Added
- JSON datasheet view: arrays of objects rendered as sortable/paginated table
- JSON tree view with collapsible nodes and syntax token colours
- Markdown preview (wysiwyg mode) with GitHub-style rendering
- Markdown alerts (note/warning/tip/caution blocks)
- Full-width image support in markdown preview
- Code block syntax highlighting in preview
- Mode toolbar switching between Source / Preview / Tree views

## [0.1.0] — 2026-03-15 (Initial Release)
### Added
- File System Access API-based local folder browser (Chrome/Edge)
- Sidebar file browser: directories + files, sorted alphabetically
- Source editor with line numbers and highlight backdrop
- Create and delete files/folders from the sidebar
- Light/dark theme with system preference detection
- Binary and large file (>10 MB) detection with graceful fallback
- PWA manifest and service worker for offline support
- Mobile UI with responsive sidebar collapse
