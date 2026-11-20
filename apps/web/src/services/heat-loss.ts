import { createSimulationResult, geometryFromJson, projectHeatLoss, type EnergyLabel, type HeatLossOverlay } from '@hes/domain';
import type { GeometryJson, SimulationResultJson } from '../types.ts';

/**
 * Heat-loss overlay helpers (P3, FR-P3-04). Pure presentation logic: the
 * losses come from the Open3CL SimulationResult (ADR-0001) — this module only
 * projects them onto the geometry and maps shares to colors. No energy value
 * is ever computed here.
 */

/**
 * Projects a persisted SimulationResult (P2 record JSON) onto a geometry JSON
 * into per-element loss shares (the shares sum to 1 = 100% within
 * floating-point tolerance).
 *
 * @throws HeatLossProjectionError when the engine output has no deperdition data
 */
export function overlayFromSimulation(result: SimulationResultJson, geometry: GeometryJson): HeatLossOverlay {
  const simulation = createSimulationResult({
    consumptionKwh: result.consumptionKwh,
    emissionsKg: result.emissionsKg,
    energyLabel: result.energyLabel as EnergyLabel,
    climateLabel: result.climateLabel as EnergyLabel,
    rawEngineOutput: result.rawEngineOutput
  });
  return projectHeatLoss(simulation, geometryFromJson(geometry));
}

/**
 * Non-throwing variant for render paths: returns the overlay or an error
 * message (a SimulationResult without deperdition data must not crash the
 * viewer).
 */
export function tryOverlayFromSimulation(
  result: SimulationResultJson,
  geometry: GeometryJson
): { overlay: HeatLossOverlay | null; error: string | null } {
  try {
    return { overlay: overlayFromSimulation(result, geometry), error: null };
  } catch (error) {
    return { overlay: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Maps a loss share in [0, 1] to a color on a green → amber → red scale
 * (low share = green, high share = red). share is clamped to [0, 1].
 */
export function colorForShare(share: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, share));
  const low = hexToRgb('#2e7d32');
  const mid = hexToRgb('#f9a825');
  const high = hexToRgb('#c62828');
  const [from, to, u] = t < 0.5 ? [low, mid, t * 2] : [mid, high, (t - 0.5) * 2];
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)];
}
