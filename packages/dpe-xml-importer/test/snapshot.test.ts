import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DpeXmlImporter } from '../src/index.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const snapshotsDir = fileURLToPath(new URL('./fixtures/snapshots', import.meta.url));
const importDate = new Date('2026-11-20T10:00:00.000Z');
const importer = new DpeXmlImporter();

/**
 * The expected Building snapshots are frozen under
 * test/fixtures/snapshots/<dpe>.building.json (P2 contract input). The
 * snapshot normalizes the random building id and drops sourceDpeXml (the raw
 * XML lives next to the fixtures in packages/open3cl-adapter/test/fixtures).
 */
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Deep normalization: the random building UUID is replaced everywhere (the
 * aggregate id and the buildingId of every owned element), and sourceDpeXml
 * is dropped (the raw XML stays in packages/open3cl-adapter/test/fixtures).
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        key === 'id' || key === 'buildingId'
          ? PLACEHOLDER_ID
          : key === 'sourceDpeXml'
            ? null
            : normalize(entry);
    }
    return out;
  }
  return value;
}

describe('frozen Building snapshots (P2 contract input)', () => {
  const fixtureFiles = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.xml'))
    .sort();

  it('the snapshot set covers all 15 corpus fixtures', () => {
    expect(fixtureFiles.length).toBe(15);
    for (const file of fixtureFiles) {
      expect(
        readdirSync(snapshotsDir).includes(`${file.replace('.xml', '')}.building.json`),
        `missing frozen snapshot for ${file}`
      ).toBe(true);
    }
  });

  for (const file of fixtureFiles) {
    it(`import of ${file} matches its frozen Building snapshot`, () => {
      const xml = readFileSync(`${fixturesDir}/${file}`, 'utf8');
      const { building } = importer.importDpeXml(xml, importDate);
      const actual = normalize(building.toJson());
      const expected = JSON.parse(
        readFileSync(`${snapshotsDir}/${file.replace('.xml', '')}.building.json`, 'utf8')
      ) as unknown;
      expect(actual).toEqual(expected);
      expect(building.sourceDpeXml).toBe(xml);
    });
  }
});
