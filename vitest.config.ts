import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@hes/domain', replacement: resolve('./packages/domain/src/index.ts') },
      { find: '@hes/application', replacement: resolve('./packages/application/src/index.ts') },
      { find: '@hes/open3cl-adapter', replacement: resolve('./packages/open3cl-adapter/src/index.ts') },
      { find: '@hes/dpe-xml-importer', replacement: resolve('./packages/dpe-xml-importer/src/index.ts') },
      { find: '@hes/postgres-repository', replacement: resolve('./packages/postgres-repository/src/index.ts') },
      // regex finds (before the '@hes/geometry' prefix match) so the subpath resolves to the three.js adapter
      { find: /^@hes\/geometry\/three$/, replacement: resolve('./packages/geometry/src/three-adapter.ts') },
      { find: /^@hes\/geometry$/, replacement: resolve('./packages/geometry/src/index.ts') }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'apps/cli-spike/src/cli.ts',
        'apps/api/src/main.ts',
        'packages/application/src/**'
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80
      }
    }
  }
});
