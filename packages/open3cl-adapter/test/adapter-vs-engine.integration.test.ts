import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calcul_3cl_xml, get_classe_ges_dpe, getVersion, type EngineDpeResult } from '@open3cl/engine';
import { Open3clAdapter } from '@hes/open3cl-adapter';
import type { SimulationResult } from '@hes/domain';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureFiles = readdirSync(fixturesDir)
  .filter((file) => file.endsWith('.xml'))
  .sort();

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

describe('AC-P0-01/AC-P0-02: adapter vs direct engine on the fixture corpus', () => {
  it('the corpus contains at least 10 fixtures', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(10);
  });

  const adapter = new Open3clAdapter();

  for (const fixture of fixtureFiles) {
    it(`simulates ${fixture} with 100% semantic equivalence to the direct engine call`, async () => {
      const xml = readFileSync(`${fixturesDir}/${fixture}`, 'utf8');

      const adapterResult: SimulationResult = await adapter.simulate(xml);
      const directResult = calcul_3cl_xml(xml, { sanitize: true });

      expect(directResult).not.toBeNull();
      const direct = directResult as EngineDpeResult;
      const directFields = directEngineFields(direct);

      expect(adapterResult.consumptionKwh).toBe(directFields.consumptionKwh);
      expect(adapterResult.emissionsKg).toBe(directFields.emissionsKg);
      expect(adapterResult.energyLabel).toBe(directFields.energyLabel);
      expect(adapterResult.climateLabel).toBe(directFields.climateLabel);
      expect(adapter.getEngineVersion()).toBe(getVersion());

      expect(normalizedJson(adapterResult.rawEngineOutput)).toBe(normalizedJson(direct));
    });
  }
});
