const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',   // plain <script> tags, not ES modules
            globals: {
                ...globals.browser,
                TM: 'readonly',     // namespace from lib-markdown/lib-format
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            // Cross-file globals are documented by script load order in index.html.
            // Turning off no-undef avoids requiring per-file /* global */ declarations
            // for every inter-file function reference in this no-build browser app.
            'no-undef': 'off',
            // vars:'local' skips top-level declarations so functions exported to other
            // script files aren't flagged as unused within their defining file.
            'no-unused-vars': ['error', { vars: 'local', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
        },
    },
    {
        // lib files are UMD — also allow Node globals
        files: ['js/lib-*.js'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
    },
];
