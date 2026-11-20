import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const FORBIDDEN_IMPORT = [
  "import { getVersion } from '@open3cl/engine';",
  'export const v = getVersion();',
  ''
].join('\n');

async function lintAs(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const results = await eslint.lintText(code, { filePath });
  return (results[0]?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports');
}

describe('engine import boundary (ESLint no-restricted-imports on @open3cl/engine)', () => {
  it('rejects @open3cl/engine imports in every package except open3cl-adapter', async () => {
    const outsideAdapter = [
      'packages/domain/src/violation.ts',
      'packages/application/src/violation.ts',
      'apps/cli-spike/src/violation.ts'
    ];
    for (const filePath of outsideAdapter) {
      const violations = await lintAs(filePath, FORBIDDEN_IMPORT);
      expect(violations.length, `expected no-restricted-imports error for ${filePath}`).toBeGreaterThan(0);
    }
  });

  it('rejects subpath imports of @open3cl/engine outside the adapter', async () => {
    const code = "import { something } from '@open3cl/engine/engine.js';\nexport const x = something;\n";
    const violations = await lintAs('packages/domain/src/violation.ts', code);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('allows @open3cl/engine imports inside packages/open3cl-adapter', async () => {
    const violations = await lintAs('packages/open3cl-adapter/src/allowed.ts', FORBIDDEN_IMPORT);
    expect(violations).toHaveLength(0);
  });
});
