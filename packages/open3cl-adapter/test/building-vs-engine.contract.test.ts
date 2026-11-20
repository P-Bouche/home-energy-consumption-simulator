import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calcul_3cl_xml, get_classe_ges_dpe, getVersion, type EngineDpeResult } from '@open3cl/engine';
import { Open3clAdapter } from '@hes/open3cl-adapter';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import type { SimulationResult } from '@hes/domain';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureFiles = readdirSync(fixturesDir)
  .filter((file) => file.endsWith('.xml'))
  .sort();
const importDate = new Date('2026-11-20T10:00:00.000Z');
const importer = new DpeXmlImporter();

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortDeep(entry)])
    );
  }
  return value;
}

function normalizedJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function directEngineFields(engineResult: EngineDpeResult): {
  consumptionKwh: unknown;
  emissionsKg: unknown;
  energyLabel: string;
  climateLabel: string;
} {
  const logement = engineResult['logement'] as Record<string, unknown>;
  const sortie = logement['sortie'] as Record<string, unknown>;
  const epConso = sortie['ep_conso'] as Record<string, unknown>;
  const emissionGes = sortie['emission_ges'] as Record<string, unknown>;
  const classes = get_classe_ges_dpe(engineResult);
  return {
    consumptionKwh: epConso['ep_conso_5_usages'],
    emissionsKg: emissionGes['emission_ges_5_usages'],
    energyLabel: classes.dpeClass,
    climateLabel: classes.gesClass
  };
}

/**
 * AC-P2-02: for every frozen P1 fixture, simulateBuilding(importedBuilding)
 * must be semantically identical (normalized JSON, including labels and the
 * full raw engine output) to a direct engine run on the original fixture XML.
 * 100% of the corpus is required.
 */
describe('AC-P2-02: Building -> adapter -> engine == direct engine on the frozen corpus', () => {
  it('the corpus contains 15 fixtures', () => {
    expect(fixtureFiles.length).toBe(15);
  });

  const adapter = new Open3clAdapter({
    warn: () => undefined // silence default logging during the contract run
  });

  let matched = 0;

  for (const fixture of fixtureFiles) {
    it(`simulateBuilding(import(${fixture})) === calcul_3cl_xml(fixture) (100% semantic equality)`, async () => {
      const xml = readFileSync(`${fixturesDir}/${fixture}`, 'utf8');
      const { building } = importer.importDpeXml(xml, importDate);
      expect(building.sourceDpeXml).toBe(xml);

      const viaBuilding: SimulationResult = await adapter.simulateBuilding(building);
      const directResult = calcul_3cl_xml(xml, { sanitize: true });
      expect(directResult).not.toBeNull();
      const direct = directResult as EngineDpeResult;
      const directFields = directEngineFields(direct);

      expect(viaBuilding.consumptionKwh).toBe(directFields.consumptionKwh);
      expect(viaBuilding.emissionsKg).toBe(directFields.emissionsKg);
      expect(viaBuilding.energyLabel).toBe(directFields.energyLabel);
      expect(viaBuilding.climateLabel).toBe(directFields.climateLabel);
      expect(adapter.getEngineVersion()).toBe(getVersion());
      expect(normalizedJson(viaBuilding.rawEngineOutput)).toBe(normalizedJson(direct));
      matched += 1;
    });
  }

  it('100% of fixtures matched (AC-P2-02)', () => {
    expect(matched).toBe(fixtureFiles.length);
  });
});
