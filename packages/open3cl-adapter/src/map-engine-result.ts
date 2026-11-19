import { get_classe_ges_dpe, type EngineDpeResult } from '@open3cl/engine';
import {
  createSimulationResult,
  isEnergyLabel,
  SimulationMappingError,
  type EnergyLabel,
  type SimulationResult
} from '@hes/domain';

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SimulationMappingError(`Expected an object at '${path}' in the engine output.`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SimulationMappingError(`Expected a finite number at '${path}' in the engine output.`);
  }
  return value;
}

function asLabel(value: unknown, path: string): EnergyLabel {
  if (!isEnergyLabel(value)) {
    throw new SimulationMappingError(`Expected a DPE label A..G at '${path}', got ${String(value)}.`);
  }
  return value;
}

/**
 * Maps a raw Open3CL engine result to the domain SimulationResult value object.
 *
 * Field mapping (engine 1.11.6 output shape):
 * - consumptionKwh <- logement.sortie.ep_conso.ep_conso_5_usages (kWh primary, 5 usages)
 * - emissionsKg    <- logement.sortie.emission_ges.emission_ges_5_usages (kg CO2e, 5 usages)
 * - energyLabel    <- get_classe_ges_dpe(result).dpeClass
 * - climateLabel   <- get_classe_ges_dpe(result).gesClass
 * - rawEngineOutput <- the engine result, verbatim
 *
 * @param engineResult - raw result returned by calcul_3cl_xml / calcul_3cl
 * @returns the mapped SimulationResult
 * @throws SimulationMappingError when a required field is missing or invalid
 */
export function mapEngineResult(engineResult: EngineDpeResult): SimulationResult {
  const logement = asRecord(engineResult['logement'], 'logement');
  const sortie = asRecord(logement['sortie'], 'logement.sortie');
  const epConso = asRecord(sortie['ep_conso'], 'logement.sortie.ep_conso');
  const emissionGes = asRecord(sortie['emission_ges'], 'logement.sortie.emission_ges');

  const consumptionKwh = asNumber(
    epConso['ep_conso_5_usages'],
    'logement.sortie.ep_conso.ep_conso_5_usages'
  );
  const emissionsKg = asNumber(
    emissionGes['emission_ges_5_usages'],
    'logement.sortie.emission_ges.emission_ges_5_usages'
  );

  let classes;
  try {
    classes = get_classe_ges_dpe(engineResult);
  } catch (error) {
    throw new SimulationMappingError('get_classe_ges_dpe failed on the engine output.', {
      cause: error
    });
  }
  const energyLabel = asLabel(classes.dpeClass, 'get_classe_ges_dpe().dpeClass');
  const climateLabel = asLabel(classes.gesClass, 'get_classe_ges_dpe().gesClass');

  try {
    return createSimulationResult({
      consumptionKwh,
      emissionsKg,
      energyLabel,
      climateLabel,
      rawEngineOutput: engineResult
    });
  } catch (error) {
    throw new SimulationMappingError('Engine output values failed domain validation.', {
      cause: error
    });
  }
}
