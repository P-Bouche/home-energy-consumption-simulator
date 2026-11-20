import { createHash } from 'node:crypto';
import type { Building, SimulationInputHash } from '@hes/domain';

/**
 * Canonical JSON serialization: object keys are sorted recursively so the
 * hash does not depend on property insertion order. Keys are compared by
 * code point (not locale) so the hash is identical on every machine and
 * Node build regardless of ICU/locale data.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Computes the canonical input hash (sha256 hex) of a building: the hash of
 * the canonical JSON serialization of its persistence shape. Any change to
 * the building (P4 edits) changes the hash, which invalidates the simulation
 * cache automatically (TR-P2-05).
 *
 * Lives in the application layer (not the domain): hashing a persistence
 * shape for a cache key is an application concern, and it keeps the domain
 * free of Node built-ins.
 */
export function computeBuildingInputHash(building: Building): SimulationInputHash {
  return createHash('sha256').update(canonicalJson(building.toJson()), 'utf8').digest('hex');
}
