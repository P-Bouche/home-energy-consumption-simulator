import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DpeXmlImporter } from '../src/index.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const fixtureFiles = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.xml'))
  .sort();
const importDate = new Date('2026-11-20T10:00:00.000Z');
const importer = new DpeXmlImporter();

describe('AC-P1-01: every corpus fixture imports successfully', () => {
  it('the corpus contains 15 DPE fixtures', () => {
    expect(fixtureFiles.length).toBe(15);
  });

  for (const file of fixtureFiles) {
    it(`imports ${file}`, () => {
      const xml = readFileSync(`${fixturesDir}/${file}`, 'utf8');
      const { building, report } = importer.importDpeXml(xml, importDate);
      expect(report.reportVersion).toBe(1);
      expect(report.dpeNumber).toBe(file.replace('.xml', ''));
      expect(building.dpeNumber?.value).toBe(file.replace('.xml', ''));
      expect(building.dpeNumber?.confidence).toBe(1);
      expect(building.zones.length).toBeGreaterThanOrEqual(1);
      expect(building.walls.length).toBeGreaterThanOrEqual(1);
      expect(building.windows.length).toBeGreaterThanOrEqual(1);
      expect(report.parsedFields.length).toBeGreaterThan(0);
      expect(report.unrecognizedFields.length).toBeGreaterThan(0);
      expect(building.pullDomainEvents().map((e) => e.type)).toContain('BuildingImported');
      for (const field of report.inferredFields) {
        expect(field.source.startsWith('inference:')).toBe(true);
        expect(field.confidence).toBeGreaterThanOrEqual(0);
        expect(field.confidence).toBeLessThan(1);
        expect(Number.isNaN(Date.parse(field.importDate))).toBe(false);
      }
    });
  }

  it('covers all schema variants present in the corpus', () => {
    const variants = new Set<string>();
    for (const file of fixtureFiles) {
      const xml = readFileSync(`${fixturesDir}/${file}`, 'utf8');
      variants.add(importer.importDpeXml(xml, importDate).report.schemaVariant);
    }
    expect([...variants].sort()).toEqual([
      'modele=1/version=2',
      'modele=1/version=2.1',
      'modele=1/version=2.2',
      'modele=1/version=2.3',
      'modele=1/version=2.4'
    ]);
  });
});
