// HotNote2 - Pure JS Notes App
'use strict';

// =========================================================================
// Constants
// =========================================================================

const DATASHEET_PAGE_SIZE = 50;
const DEFAULT_COLUMN_WIDTH = 150;
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx',
    'go', 'py', 'rb', 'rs', 'css', 'scss', 'html', 'htm', 'xml',
    'sh', 'bash', 'zsh', 'conf', 'ini', 'env', 'toml', 'cfg', 'sql',
    'graphql', 'proto', 'tf', 'hcl', 'log', 'csv',
]);

const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif',
]);

const BINARY_EXTENSIONS = new Set([
    // Executables & compiled
    'exe', 'dll', 'so', 'dylib', 'bin', 'out', 'class', 'pyc', 'pyo', 'pyd',
    'o', 'a', 'lib', 'wasm', 'app',
    // Archives
    'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst', 'lz4', 'lzma',
    'pkg', 'deb', 'rpm', 'dmg', 'msi', 'apk', 'ipa',
    // Documents (binary)
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    // Fonts
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    // Audio
    'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'aiff',
    // Video
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'm4v', 'wmv', 'flv',
    // Database
    'sqlite', 'sqlite3', 'db',
]);

const MAX_OPENABLE_SIZE = 10 * 1024 * 1024; // 10 MB

const MAX_GIT_FILES           = 5000;  // skip git detection if index has more entries
const GIT_REFRESH_DEBOUNCE_MS = 10000; // min ms between auto git refreshes
const GIT_BATCH_SIZE          = 4;     // concurrent file reads in detectChangedFiles
const MAX_SEARCH_FILES        = 10000; // max files getAllFiles returns during search
const SEARCH_CONCURRENCY      = 10;    // concurrent file reads in content search
const FILE_HISTORY_MAX        = 100;   // max entries in fileHistory
const FILE_POS_CACHE_MAX      = 200;   // max entries in filePositionCache

// =========================================================================
// State
// =========================================================================

const state = {
    rootHandle: null,
    currentDirHandle: null,
    currentFileHandle: null,
    currentFilename: '',
    isDirty: false,
    editorMode: 'source', // 'source' | 'wysiwyg' | 'highlight' | 'datasheet' | 'treeview' | 'image'
    imageObjectUrl: null,
    scrollPositions: {},
    // JSON view state
    datasheetData: null,
    datasheetSchema: null,
    datasheetPage: 1,
    datasheetPageSize: DATASHEET_PAGE_SIZE,
    treeviewData: null,
    treeviewCollapsed: new Set(),
    nestedStack: [],  // drill-in navigation: [{mode, title, datasheetData, datasheetSchema, datasheetPage, treeviewData, treeviewCollapsed}]
    // Navigation: [{handle, name}]
    pathStack: [],
    // File history for back/forward navigation
    fileHistory: [],       // [{handle, name}, …]
    fileHistoryIndex: -1,  // pointer into fileHistory; -1 = nothing open
    filePositionCache: new Map(),  // keyed by relPath (or name); last-known pos per file
    // Autosave
    autosaveEnabled: false,
    autosaveTimer: null,
    // Last folder explicitly expanded by the user (used as create target)
    lastExpandedRelPath: null,
    // Relative path from root to current file (tracks subdirs opened via sidebar tree)
    currentRelativePath: null,
    currentLine: 1,
    currentChar: 1,
    lastModifiedTime: null,
    // Search state
    searchActive: false,
    searchQuery: '',
    // Editor display
    wordWrap: false,
    // Git state
    gitAvailable: false,
    gitChangedPaths: new Set(),
    gitChangedDirs: new Set(),   // dir relPaths containing at least one changed file
    gitFilterActive: false,
    gitMtimeCache: new Map(),    // relPath → lastModified — fast-path to skip SHA-1
    gitLastRefreshed: 0,         // performance.now() of last completed refresh
    _gitRefreshTimer: null,      // setTimeout handle for debounced post-save refresh
    // Directory watcher state
    _dirSigs: new Map(),    // dirRelPath → signature string (sorted name:kind pairs)
    _lastDirScan: 0,        // performance.now() of last directory scan
    // Split pane state
    splitMode: false,
    helpMode: false,
    _helpModeWasSplit: false,
    _panesHaveSameFile: false,
    activePaneId: 'pane1',
    // Pane 2 state (pane 1 uses the flat state fields above)
    pane2: {
        currentFileHandle: null,
        currentFilename: '',
        isDirty: false,
        editorMode: 'source',
        imageObjectUrl: null,
        scrollPositions: {},
        datasheetData: null,
        datasheetSchema: null,
        datasheetPage: 1,
        datasheetPageSize: DATASHEET_PAGE_SIZE,
        treeviewData: null,
        treeviewCollapsed: new Set(),
        nestedStack: [],
        fileHistory: [],
        fileHistoryIndex: -1,
        filePositionCache: new Map(),
        autosaveEnabled: false,
        autosaveTimer: null,
        wordWrap: false,
        currentRelativePath: null,
        currentLine: 1,
        currentChar: 1,
        lastModifiedTime: null,
    },
};

// =========================================================================
// Pane Helpers
// =========================================================================

function getPaneEl(baseId, paneId) {
    return document.getElementById(paneId === 'pane1' ? baseId : baseId + '-p2');
}

function getPaneState(paneId) {
    return paneId === 'pane2' ? state.pane2 : state;
}
