import { meshArea, type Geometry, type GeometryElementKind } from './geometry.ts';
import type { SimulationResult } from './simulation-result.ts';

/**
 * Read-only projection of a SimulationResult onto the reconstructed geometry
 * (P3 heat-loss overlay, FR-P3-04).
 *
 * Open3CL is the single source of truth for energy (ADR-0001): this module
 * never computes a loss. It reads the per-category envelope losses reported
 * by the engine (`logement.sortie.deperdition.*`, W/K) and distributes each
 * category's loss across the geometry elements of that kind proportionally to
 * their area. `totalEnvelopeLossWk` sums only the categories that have matching
 * geometry elements, so `share × total = lossWk` holds for every share and the
 * shares sum to 1 (100%) within floating-point tolerance.
 */

/**
 * Error thrown when the engine output carries no usable envelope losses.
 */
export class HeatLossProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeatLossProjectionError';
  }
}

/**
 * Loss share of one envelope element. `share` is in [0, 1]; the shares of an
 * overlay sum to 1.
 */
export interface HeatLossShare {
  readonly elementId: string;
  readonly kind: GeometryElementKind;
  readonly lossWk: number;
  readonly share: number;
}

/**
 * Overlay payload: per-element loss shares summing to 100%.
 */
export interface HeatLossOverlay {
  readonly buildingId: string;
  readonly totalEnvelopeLossWk: number;
  readonly shares: readonly HeatLossShare[];
}

/**
 * Maps a geometry element kind to the engine sortie field carrying the
 * category loss (W/K) for that kind.
 */
const KIND_TO_ENGINE_FIELD: Readonly<Record<GeometryElementKind, string | null>> = {
  wall: 'deperdition_mur',
  floor: 'deperdition_plancher_bas',
  roof: 'deperdition_plancher_haut',
  window: 'deperdition_baie_vitree',
  door: 'deperdition_porte',
  room: null
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  if (record === null) return null;
  const v = record[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Projects a SimulationResult onto a Geometry.
 *
 * @throws HeatLossProjectionError when the engine output has no envelope
 * deperdition data (never invent losses)
 */
export function projectHeatLoss(result: SimulationResult, geometry: Geometry): HeatLossOverlay {
  const logement = asRecord(result.rawEngineOutput['logement']);
  const sortie = asRecord(logement?.['sortie']);
  const deperdition = asRecord(sortie?.['deperdition']);
  if (deperdition === null) {
    throw new HeatLossProjectionError(
      'SimulationResult.rawEngineOutput has no logement.sortie.deperdition: cannot project heat losses'
    );
  }
  const categoryLoss = new Map<GeometryElementKind, number>();
  for (const kind of Object.keys(KIND_TO_ENGINE_FIELD) as GeometryElementKind[]) {
    const field = KIND_TO_ENGINE_FIELD[kind];
    if (field === null) continue;
    const loss = readNumber(deperdition, field);
    // only categories with matching geometry elements contribute to the total
    if (loss !== null && loss > 0 && geometry.elements.some((el) => el.kind === kind)) {
      categoryLoss.set(kind, loss);
    }
  }
  const total = [...categoryLoss.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) {
    throw new HeatLossProjectionError('engine-reported envelope losses are all zero or missing');
  }

  const shares: HeatLossShare[] = [];
  for (const [kind, lossWk] of categoryLoss) {
    const elements = geometry.elements.filter((el) => el.kind === kind);
    if (elements.length === 0) continue;
    const areas = elements.map((el) => el.areaM2 !== null && el.areaM2.value > 0 ? el.areaM2.value : meshArea(el.mesh));
    const kindArea = areas.reduce((a, b) => a + b, 0);
    elements.forEach((el, i) => {
      const area = areas[i] as number;
      const withinKind = kindArea > 0 ? area / kindArea : 1 / elements.length;
      const elementLoss = lossWk * withinKind;
      shares.push({
        elementId: el.id,
        kind,
        lossWk: Math.round(elementLoss * 1e6) / 1e6,
        share: elementLoss / total
      });
    });
  }
  const shareSum = shares.reduce((a, s) => a + s.share, 0);
  if (shareSum <= 0) {
    throw new HeatLossProjectionError('no envelope element matched the engine loss categories');
  }
  const normalized = shares.map((s) => ({ ...s, share: s.share / shareSum }));
  return {
    buildingId: geometry.buildingId,
    totalEnvelopeLossWk: Math.round(total * 1e6) / 1e6,
    shares: Object.freeze(normalized)
  };
}
