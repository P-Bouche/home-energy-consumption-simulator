import { createSimulationResult, geometryFromJson, projectHeatLoss, type EnergyLabel, type HeatLossOverlay, type HeatLossShare } from '@hes/domain';
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
 *
 * The input is expected to be a NORMALIZED share (see
 * {@link normalizedLossShares}): raw shares are fractions of the total spread
 * over every envelope element (max ≈ 0.2), so mapping them directly would
 * leave the red end of the ramp unreachable (UI audit F10).
 */
export function colorForShare(share: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, share));
  const low = hexToRgb('#2e7d32');
  const mid = hexToRgb('#f9a825');
  const high = hexToRgb('#c62828');
  const [from, to, u] = t < 0.5 ? [low, mid, t * 2] : [mid, high, (t - 0.5) * 2];
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)];
}

/**
 * Largest raw loss share of an overlay (0 when the overlay has no shares).
 */
export function maxLossShare(shares: readonly HeatLossShare[]): number {
  return shares.reduce((max, s) => Math.max(max, s.share), 0);
}

/**
 * Normalizes the raw loss shares of one building run (UI audit F10): the raw
 * shares are fractions of the total deperditions spread over all envelope
 * elements, so the largest is ≈ 1/n and the legend's red is unreachable. This
 * presentation-layer mapping divides every share by the run's `maxShare`, so
 * the worst element maps to 1 (red) and the scale spans the full ramp.
 * Guarded against `maxShare = 0` (every element then maps to 0). The raw
 * shares coming from the Open3CL projection are never modified.
 */
export function normalizedLossShares(shares: readonly HeatLossShare[]): Map<string, number> {
  const max = maxLossShare(shares);
  const map = new Map<string, number>();
  for (const s of shares) {
    map.set(s.elementId, max > 0 ? s.share / max : 0);
  }
  return map;
}

/**
 * Formats a raw loss share as a French percentage for the hover tooltip
 * (e.g. `0.184` → `18,4 %`).
 */
export function formatSharePercent(share: number): string {
  return `${(share * 100).toFixed(1).replace('.', ',')} %`;
}
