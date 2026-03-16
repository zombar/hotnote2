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
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
