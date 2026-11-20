import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

async function lintAs(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const results = await eslint.lintText(code, { filePath });
  return (results[0]?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports');
}

describe('domain purity boundary (ESLint no-restricted-imports in packages/domain)', () => {
  const forbidden = [
    "import { XMLParser } from 'fast-xml-parser';",
    "import pg from 'pg';",
    "import { Controller } from '@nestjs/common';",
    "import { createElement } from 'react';",
    "import * as THREE from 'three';",
    "import { OrbitControls } from '@react-three/drei';",
    "import { randomUUID } from 'node:crypto';"
  ];

  for (const statement of forbidden) {
    it(`rejects in packages/domain: ${statement}`, async () => {
      const code = `${statement}\nexport const x = 1;\n`;
      const violations = await lintAs('packages/domain/src/violation.ts', code);
      expect(violations.length, `expected no-restricted-imports error for ${statement}`).toBeGreaterThan(0);
    });
  }

  it('allows platform-free imports in packages/domain (relative modules only)', async () => {
    const code = "import { ENERGY_LABELS } from './energy-label.ts';\nexport const labels = ENERGY_LABELS;\n";
    const violations = await lintAs('packages/domain/src/ok.ts', code);
    expect(violations).toHaveLength(0);
  });

  it('rejects NestJS/pg imports in packages/dpe-xml-importer (pure core)', async () => {
    const nest = "import { Injectable } from '@nestjs/common';\nexport const x = Injectable;\n";
    const pg = "import { Pool } from 'pg';\nexport const p = Pool;\n";
    expect(await lintAs('packages/dpe-xml-importer/src/violation.ts', nest)).not.toHaveLength(0);
    expect(await lintAs('packages/dpe-xml-importer/src/violation.ts', pg)).not.toHaveLength(0);
  });

  it('allows fast-xml-parser in packages/dpe-xml-importer', async () => {
    const code = "import { XMLParser } from 'fast-xml-parser';\nexport const P = XMLParser;\n";
    const violations = await lintAs('packages/dpe-xml-importer/src/ok.ts', code);
    expect(violations).toHaveLength(0);
  });
});
