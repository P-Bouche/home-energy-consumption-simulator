import { describe, expect, it } from 'vitest';
import type { EngineDpeResult } from '@open3cl/engine';
import { mapEngineResult, Open3clAdapter } from '@hes/open3cl-adapter';
import {
  EngineExecutionError,
  InvalidDpeError,
  SimulationMappingError,
  UnsupportedDpeModelError
} from '@hes/domain';

function buildEngineResult(overrides?: {
  epConso5Usages?: unknown;
  emissionGes5Usages?: unknown;
  dpeClass?: string;
  gesClass?: string;
}): EngineDpeResult {
  const epConso5Usages = overrides?.epConso5Usages ?? 48522.767;
  const emissionGes5Usages = overrides?.emissionGes5Usages ?? 7770.9;
  const dpeClass = overrides?.dpeClass ?? 'D';
  const gesClass = overrides?.gesClass ?? 'D';
  return {
    numero_dpe: 'TEST0000000000X',
    logement: {
      meteo: {
        enum_zone_climatique_id: 'H1',
        enum_classe_altitude_id: '1'
      },
      caracteristique_generale: {
        enum_methode_application_dpe_log_id: '1',
        surface_habitable_logement: 221.7
      },
      sortie: {
        ep_conso: { ep_conso_5_usages: epConso5Usages, ep_conso_5_usages_m2: 219 },
        emission_ges: {
          emission_ges_5_usages: emissionGes5Usages,
          emission_ges_5_usages_m2: 35
        }
      }
    },
    __expectedClasses: { dpeClass, gesClass }
  } as EngineDpeResult;
}

describe('mapEngineResult', () => {
  it('maps consumption, emissions, labels and keeps the raw output verbatim', () => {
    const engineResult = buildEngineResult();
    const result = mapEngineResult(engineResult);
    expect(result.consumptionKwh).toBe(48522.767);
    expect(result.emissionsKg).toBe(7770.9);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(result.energyLabel);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G']).toContain(result.climateLabel);
    expect(result.rawEngineOutput).toBe(engineResult);
  });

  it('throws SimulationMappingError when a numeric field is missing', () => {
    const engineResult = buildEngineResult({ epConso5Usages: undefined });
    delete (engineResult.logement as Record<string, unknown>).sortie;
    expect(() => mapEngineResult(engineResult)).toThrow(SimulationMappingError);
  });

  it('throws SimulationMappingError when the numeric field is not a number', () => {
    const engineResult = buildEngineResult({ emissionGes5Usages: 'lots' });
    expect(() => mapEngineResult(engineResult)).toThrow(SimulationMappingError);
  });

  it('throws SimulationMappingError when logement is not an object', () => {
    expect(() => mapEngineResult({ logement: 'nope' })).toThrow(SimulationMappingError);
  });

  it('wraps domain validation failures (e.g. negative consumption) in SimulationMappingError', () => {
    const engineResult = buildEngineResult({ epConso5Usages: -10 });
    expect(() => mapEngineResult(engineResult)).toThrow(SimulationMappingError);
  });
});

describe('Open3clAdapter.simulate (error mapping)', () => {
  const adapter = new Open3clAdapter();

  it('rejects empty input with InvalidDpeError', async () => {
    await expect(adapter.simulate('')).rejects.toBeInstanceOf(InvalidDpeError);
    await expect(adapter.simulate('   ')).rejects.toBeInstanceOf(InvalidDpeError);
  });

  it('maps engine throws (malformed XML) to EngineExecutionError', async () => {
    await expect(adapter.simulate('<not-a-dpe>hello</not-a-dpe>')).rejects.toBeInstanceOf(
      EngineExecutionError
    );
  });

  it('exposes the pinned engine version', () => {
    expect(adapter.getEngineVersion()).toBe('1.11.6');
  });
});

describe('Open3clAdapter.simulate (unsupported model)', () => {
  it('maps a null engine result to UnsupportedDpeModelError (verified against the engine first)', async () => {
    const { calcul_3cl_xml } = await import('@open3cl/engine');
    const nonLogementModelXml = [
      '<dpe version="0.1.0">',
      '<administratif><enum_modele_dpe_id>2</enum_modele_dpe_id>',
      '<date_etablissement_dpe>2023-01-01</date_etablissement_dpe>',
      '<diagnostiqueur><version_logiciel>1.0</version_logiciel></diagnostiqueur></administratif>',
      '<logement><caracteristique_generale><enum_methode_application_dpe_log_id>1</enum_methode_application_dpe_log_id></caracteristique_generale></logement>',
      '</dpe>'
    ].join('');
    expect(calcul_3cl_xml(nonLogementModelXml, { sanitize: true })).toBeNull();
    const adapter = new Open3clAdapter();
    await expect(adapter.simulate(nonLogementModelXml)).rejects.toBeInstanceOf(
      UnsupportedDpeModelError
    );
  });
});
