import type { GeometryElementKind } from '@hes/domain';
import { colorForShare } from './heat-loss.ts';

/**
 * Pure color mapping for the 3D viewer (presentation only — no business
 * logic). Deterministic per element state.
 */

/**
 * Input describing an element's current visual state.
 */
export interface ElementVisualState {
  readonly kind: GeometryElementKind;
  readonly inferred: boolean;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly lossShare: number | null;
}

const KIND_COLORS: Readonly<Record<GeometryElementKind, [number, number, number]>> = {
  wall: [0.76, 0.73, 0.68],
  roof: [0.62, 0.47, 0.36],
  floor: [0.55, 0.51, 0.46],
  window: [0.55, 0.8, 0.95],
  door: [0.5, 0.36, 0.22],
  room: [0.92, 0.92, 0.86]
};

const INFERRED_COLOR: [number, number, number] = [0.96, 0.62, 0.13];
const SELECTED_COLOR: [number, number, number] = [0.12, 0.45, 0.95];
const HOVERED_LIFT = 0.12;

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Resolves the RGB color of an element given its visual state. Priority:
 * selected (blended 50/50 with the underlying loss/inferred/kind color so the
 * selection stays visible under the heat-loss overlay) > hovered lift >
 * heat-loss share > inferred > kind default.
 */
export function elementColor(state: ElementVisualState): [number, number, number] {
  const base = state.lossShare !== null ? colorForShare(state.lossShare) : state.inferred ? INFERRED_COLOR : KIND_COLORS[state.kind];
  if (state.selected) return mix(base, SELECTED_COLOR, 0.5);
  if (state.hovered) {
    return [
      Math.min(1, base[0] + HOVERED_LIFT),
      Math.min(1, base[1] + HOVERED_LIFT),
      Math.min(1, base[2] + HOVERED_LIFT)
    ];
  }
  return base;
}
