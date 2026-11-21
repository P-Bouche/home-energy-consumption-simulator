import { ENERGY_LABELS, type EnergyLabel } from './energy-label.ts';
import type { BuildingId } from './entities.ts';
import type { ScenarioId } from './scenario.ts';
import type { SimulationResultRecord } from './simulation-record.ts';

/**
 * One row of a {@link ScenarioComparison}: a scenario's persisted result and
 * its deltas against the baseline.
 */
export interface ScenarioComparisonEntry {
  readonly scenarioId: ScenarioId;
  readonly name: string;
  /**
   * Building version the scenario was created against (informational —
   * staleness is detected by input-hash verification, never by this field).
   */
  readonly baselineVersion: number;
  readonly result: SimulationResultRecord;
  /** scenario − baseline, in kWh (negative = consumption saved) */
  readonly deltaKwh: number;
  /** scenario − baseline, in kg CO2e (negative = emissions avoided) */
  readonly deltaKgCo2: number;
  /** energy label change, or null when the label did not move */
  readonly energyLabelChange: { readonly from: EnergyLabel; readonly to: EnergyLabel } | null;
  /** climate (GES) label change, or null when the label did not move */
  readonly climateLabelChange: { readonly from: EnergyLabel; readonly to: EnergyLabel } | null;
  /** 1 = most kWh saved; entries are sorted by rank */
  readonly rank: number;
}

/**
 * Value object produced by {@link ComparisonService.compare}: the baseline
 * result plus one entry per scenario, ranked by kWh saved. This is the frozen
 * schema P8 (AI advisor) ranks over.
 */
export interface ScenarioComparison {
  readonly buildingId: BuildingId;
  readonly baseline: SimulationResultRecord;
  readonly entries: readonly ScenarioComparisonEntry[];
  readonly generatedAt: Date;
}

/**
 * Input entry of {@link ComparisonService.compare}.
 */
export interface ComparisonEntryInput {
  readonly scenarioId: ScenarioId;
  readonly name: string;
  readonly baselineVersion: number;
  readonly result: SimulationResultRecord;
}

/**
 * A label change between two DPE letters (null when unchanged).
 */
export function labelChange(from: EnergyLabel, to: EnergyLabel): { from: EnergyLabel; to: EnergyLabel } | null {
  return from === to ? null : { from, to };
}

/**
 * Domain service (pure, no I/O): computes a {@link ScenarioComparison} over
 * persisted {@link SimulationResultRecord}s. All energy numbers come from the
 * Open3CL pipeline (ADR-0001); this service only subtracts and ranks — it
 * never computes energy itself.
 */
export class ComparisonService {
  /**
   * @param baseline - the baseline (current building state) simulation record
   * @param entries - one entry per scenario, with its persisted result
   * @param options.now - clock used for `generatedAt` (tests)
   */
  static compare(
    baseline: SimulationResultRecord,
    entries: readonly ComparisonEntryInput[],
    options?: { now?: Date }
  ): ScenarioComparison {
    const sorted = [...entries].sort((a, b) => {
      const deltaA = a.result.consumptionKwh - baseline.consumptionKwh;
      const deltaB = b.result.consumptionKwh - baseline.consumptionKwh;
      if (deltaA !== deltaB) return deltaA - deltaB; // most kWh saved first
      const kgA = a.result.emissionsKg - baseline.emissionsKg;
      const kgB = b.result.emissionsKg - baseline.emissionsKg;
      if (kgA !== kgB) return kgA - kgB;
      return a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0; // deterministic ties
    });
    const comparisonEntries: ScenarioComparisonEntry[] = sorted.map((entry, index) => ({
      scenarioId: entry.scenarioId,
      name: entry.name,
      baselineVersion: entry.baselineVersion,
      result: entry.result,
      deltaKwh: entry.result.consumptionKwh - baseline.consumptionKwh,
      deltaKgCo2: entry.result.emissionsKg - baseline.emissionsKg,
      energyLabelChange: labelChange(baseline.energyLabel, entry.result.energyLabel),
      climateLabelChange: labelChange(baseline.climateLabel, entry.result.climateLabel),
      rank: index + 1
    }));
    return {
      buildingId: baseline.buildingId,
      baseline,
      entries: Object.freeze(comparisonEntries),
      generatedAt: options?.now ?? new Date()
    };
  }
}

/**
 * @returns the index of a label in the A..G scale (0 = best)
 */
export function energyLabelRank(label: EnergyLabel): number {
  return ENERGY_LABELS.indexOf(label);
}
