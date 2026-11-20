import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ADR-0001: only packages/open3cl-adapter may import @open3cl/engine. Because a
// later config block overrides the same rule for the same files, this
// restriction is repeated in every block that also adds layer-specific rules.
const ENGINE_RESTRICTION = {
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
};

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/web/dist/**']
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
      'no-restricted-imports': ['error', ENGINE_RESTRICTION]
    }
  },
  {
    // P3: three.js / React Three Fiber are only allowed in the geometry
    // adapter and the web viewer. The engine restriction is repeated here
    // because a later config block overrides the same rule for the same files.
    files: ['**/*.{ts,mts,js,mjs,tsx}'],
    ignores: ['packages/open3cl-adapter/**', 'packages/geometry/**', 'apps/web/**', 'tests/e2e/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...ENGINE_RESTRICTION,
          patterns: [
            ...ENGINE_RESTRICTION.patterns,
            {
              group: ['three', 'three/**', '@react-three/*'],
              message:
                'three.js/@react-three are only allowed in packages/geometry and apps/web (P3 viewer). Domain geometry is plain data.'
            }
          ]
        }
      ]
    }
  },
  {
    // The domain layer is framework-free (AGENTS.md §2): no XML parser, no
    // pg, no NestJS, no React inside packages/domain.
    files: ['packages/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...ENGINE_RESTRICTION,
          paths: [
            ...ENGINE_RESTRICTION.paths,
            { name: 'fast-xml-parser', message: 'packages/domain must stay framework-free: no XML parser imports.' },
            { name: 'pg', message: 'packages/domain must stay framework-free: no database driver imports.' }
          ],
          patterns: [
            ...ENGINE_RESTRICTION.patterns,
            { group: ['node:*'], message: 'packages/domain must stay platform-free: no Node built-ins (hashing lives in packages/application).' },
            { group: ['@nestjs/*'], message: 'packages/domain must stay framework-free: no NestJS imports.' },
            { group: ['react', 'react-dom'], message: 'packages/domain must stay framework-free: no React imports.' },
            { group: ['@mui/*', '@emotion/*'], message: 'packages/domain must stay framework-free: no UI imports.' },
            { group: ['three', 'three/**', '@react-three/*'], message: 'packages/domain must stay framework-free: no three.js imports (geometry value objects are plain data; the three.js adapter lives in packages/geometry).' }
          ]
        }
      ]
    }
  },
  {
    // The importer core is pure: no NestJS, no ORM/driver imports.
    files: ['packages/dpe-xml-importer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...ENGINE_RESTRICTION,
          paths: [
            ...ENGINE_RESTRICTION.paths,
            { name: 'pg', message: 'packages/dpe-xml-importer is pure: persistence lives in packages/postgres-repository.' }
          ],
          patterns: [
            ...ENGINE_RESTRICTION.patterns,
            { group: ['@nestjs/*'], message: 'packages/dpe-xml-importer is pure: no NestJS imports (the API is apps/api).' }
          ]
        }
      ]
    }
  }
);
