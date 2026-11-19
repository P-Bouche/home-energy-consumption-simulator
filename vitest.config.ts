import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@hes/domain': resolve('./packages/domain/src/index.ts'),
      '@hes/application': resolve('./packages/application/src/index.ts'),
      '@hes/open3cl-adapter': resolve('./packages/open3cl-adapter/src/index.ts')
    }
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'apps/cli-spike/src/cli.ts',
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
