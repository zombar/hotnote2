/**
 * Mock Git State — injected via page.addInitScript() in git tests.
 * Overrides detectChangedFiles() and readHeadBlob() in git.js.
 */
(function () {
    'use strict';

    window.__mockGit = {
        // Set to a Set<relPath> to mock changed files, or null to simulate "no git repo"
        changedPathsOverride: undefined, // undefined = use real impl; null = no git; Set = changed paths

        // Map of relPath → string | null for HEAD blob content
        headBlobs: {},

        setChangedPaths(paths) {
            // paths: array of relPaths, or null (no git)
            this.changedPathsOverride = paths === null ? null : new Set(paths);
        },

        setHeadBlob(relPath, content) {
            this.headBlobs[relPath] = content;
        },

        reset() {
            this.changedPathsOverride = undefined;
            this.headBlobs = {};
        },
    };
})();
