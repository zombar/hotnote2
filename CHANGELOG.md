# Changelog

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
