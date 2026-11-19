import { isEnergyLabel, type EnergyLabel } from './energy-label.ts';

/**
 * Result of an Open3CL (3CL-DPE) energy simulation.
 *
 * - consumptionKwh: total primary-energy consumption over the 5 regulated usages, in kWh
 *   (engine field logement.sortie.ep_conso.ep_conso_5_usages — the basis of the DPE energy label).
 * - emissionsKg: total greenhouse-gas emissions over the 5 regulated usages, in kg CO2e
 *   (engine field logement.sortie.emission_ges.emission_ges_5_usages).
 * - energyLabel / climateLabel: DPE etiquette letters A..G (engine get_classe_ges_dpe).
 * - rawEngineOutput: the unmodified engine result, kept verbatim for audit and comparison.
 */
export interface SimulationResult {
  readonly consumptionKwh: number;
  readonly emissionsKg: number;
  readonly energyLabel: EnergyLabel;
  readonly climateLabel: EnergyLabel;
  readonly rawEngineOutput: Record<string, unknown>;
}

/**
 * Input accepted by {@link createSimulationResult}.
 */
export interface SimulationResultInput {
  readonly consumptionKwh: number;
  readonly emissionsKg: number;
  readonly energyLabel: EnergyLabel;
  readonly climateLabel: EnergyLabel;
  readonly rawEngineOutput: Record<string, unknown>;
}

/**
 * Validates and builds a SimulationResult value object.
 *
 * @param input - candidate values
 * @returns an immutable SimulationResult
 * @throws RangeError when a numeric field is not a finite, non-negative number
 * @throws TypeError when a label is not a valid DPE letter
 */
export function createSimulationResult(input: SimulationResultInput): SimulationResult {
  if (!Number.isFinite(input.consumptionKwh) || input.consumptionKwh < 0) {
    throw new RangeError(
      `consumptionKwh must be a finite, non-negative number, got ${String(input.consumptionKwh)}`
    );
  }
  if (!Number.isFinite(input.emissionsKg) || input.emissionsKg < 0) {
    throw new RangeError(
      `emissionsKg must be a finite, non-negative number, got ${String(input.emissionsKg)}`
    );
  }
  if (!isEnergyLabel(input.energyLabel)) {
    throw new TypeError(`energyLabel must be a DPE letter A..G, got ${String(input.energyLabel)}`);
  }
  if (!isEnergyLabel(input.climateLabel)) {
    throw new TypeError(
      `climateLabel must be a DPE letter A..G, got ${String(input.climateLabel)}`
    );
  }
  return Object.freeze({ ...input });
}
