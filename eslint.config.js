const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Backend: src/**/*.js
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'public/',
      'dashboard/',
      'data/',
      'logs/',
      '*.config.js',
      'dev-dashboard.js',
    ],
  },
];
