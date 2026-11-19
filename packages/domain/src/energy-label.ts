/**
 * DPE energy / climate label letters, from A (best) to G (worst).
 */
export type EnergyLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/**
 * All valid DPE label letters, ordered from best to worst.
 */
export const ENERGY_LABELS: readonly EnergyLabel[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Type guard for DPE label letters.
 *
 * @param value - candidate value
 * @returns true when value is one of A..G
 */
export function isEnergyLabel(value: unknown): value is EnergyLabel {
  return typeof value === 'string' && (ENERGY_LABELS as readonly string[]).includes(value);
}
