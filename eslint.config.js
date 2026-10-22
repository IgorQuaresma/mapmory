import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/.tmp/**', 'infra/data/**',
      '**/test/__output__/**', '**/test-results/**', '**/playwright-report/**', '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Not allowed (XSS). See docs/architecture-plan.md §8.1.' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/print-page/**/*.{ts,tsx}', 'packages/poster-react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
