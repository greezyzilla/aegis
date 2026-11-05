import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/', '.wxt/', '.output/', 'coverage/', 'test-results/', 'playwright-report/', 'backlog/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // `const { dropped: _dropped, ...rest } = obj` removes a key on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.tsx'], extends: [reactHooks.configs.flat.recommended] },
  // The Firefox harness runs in Node and sends functions that run in extension pages (browser.*).
  {
    files: ['**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.webextensions } },
  },
  // Playwright fixtures must destructure their dependencies, even when there are none: `({}, use)`.
  { files: ['e2e/**'], rules: { 'no-empty-pattern': 'off' } },
  // Formatting is Prettier's job: turn off the rules that would fight it.
  prettier,
]);
