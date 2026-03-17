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
