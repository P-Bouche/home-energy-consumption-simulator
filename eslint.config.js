import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,js,mjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['**/*.{ts,mts,js,mjs}'],
    ignores: ['packages/open3cl-adapter/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@open3cl/engine',
              message:
                'Only packages/open3cl-adapter may import @open3cl/engine (ADR-0001: single engine boundary).'
            }
          ],
          patterns: [
            {
              group: ['@open3cl/engine/**'],
              message:
                'Only packages/open3cl-adapter may import @open3cl/engine (ADR-0001: single engine boundary).'
            }
          ]
        }
      ]
    }
  }
);
