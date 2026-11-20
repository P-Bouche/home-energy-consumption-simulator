import type { BuildingId } from './entities.ts';
import { isEnergyLabel } from './energy-label.ts';
import type { SimulationResult } from './simulation-result.ts';

/**
 * Identifier of a persisted simulation result (UUID).
 */
export type SimulationResultId = string;

/**
 * Identifier of a simulation job (UUID).
 */
export type SimulationJobId = string;

/**
 * Canonical hash (sha256 hex) of the serialized building input that produced
 * a simulation. Cache key: two simulations with the same (buildingId,
 * inputHash) are the same computation.
 */
export type SimulationInputHash = string;

/**
 * A {@link SimulationResult} with its persistence identity (P2): the P0 value
 * object shape (consumptionKwh, emissionsKg, energyLabel, climateLabel,
 * rawEngineOutput) is kept intact and extended with id / buildingId /
 * inputHash / engineVersion / createdAt.
 */
export interface SimulationResultRecord extends SimulationResult {
  readonly id: SimulationResultId;
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly engineVersion: string;
  readonly createdAt: Date;
}

/**
 * Input accepted by {@link createSimulationResultRecord}.
 */
export interface SimulationResultRecordInput extends SimulationResult {
  readonly id: SimulationResultId;
  readonly buildingId: BuildingId;
  readonly inputHash: SimulationInputHash;
  readonly engineVersion: string;
  readonly createdAt: Date;
}

/**
 * JSON shape of a SimulationResultRecord (createdAt as ISO-8601 string).
 */
export interface SimulationResultRecordJson extends Omit<SimulationResultRecord, 'createdAt'> {
  readonly createdAt: string;
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`SimulationResultRecord.${field} must be a non-empty string`);
  }
}

/**
 * Validates and builds a persisted SimulationResultRecord.
 *
 * @throws TypeError when an identity field is empty or a label is invalid
 * @throws RangeError when a numeric field is not finite/non-negative or
 * createdAt is not a valid Date
 */
export function createSimulationResultRecord(input: SimulationResultRecordInput): SimulationResultRecord {
  assertNonEmpty(input.id, 'id');
  assertNonEmpty(input.buildingId, 'buildingId');
  if (!/^[0-9a-f]{64}$/.test(input.inputHash)) {
    throw new TypeError('SimulationResultRecord.inputHash must be a sha256 hex string (64 chars)');
  }
  assertNonEmpty(input.engineVersion, 'engineVersion');
  if (!(input.createdAt instanceof Date) || Number.isNaN(input.createdAt.getTime())) {
    throw new RangeError('SimulationResultRecord.createdAt must be a valid Date');
  }
  if (!Number.isFinite(input.consumptionKwh) || input.consumptionKwh < 0) {
    throw new RangeError(
      `consumptionKwh must be a finite, non-negative number, got ${String(input.consumptionKwh)}`
    );
  }
  if (!Number.isFinite(input.emissionsKg) || input.emissionsKg < 0) {
    throw new RangeError(`emissionsKg must be a finite, non-negative number, got ${String(input.emissionsKg)}`);
  }
  if (!isEnergyLabel(input.energyLabel)) {
    throw new TypeError(`energyLabel must be a DPE letter A..G, got ${String(input.energyLabel)}`);
  }
  if (!isEnergyLabel(input.climateLabel)) {
    throw new TypeError(`climateLabel must be a DPE letter A..G, got ${String(input.climateLabel)}`);
  }
  return Object.freeze({ ...input, createdAt: new Date(input.createdAt.getTime()) });
}

/**
 * Serializes a SimulationResultRecord to plain JSON (createdAt as ISO string).
 */
export function simulationResultRecordToJson(record: SimulationResultRecord): SimulationResultRecordJson {
  return { ...record, createdAt: record.createdAt.toISOString() };
}

/**
 * Revives a SimulationResultRecord from its JSON shape, re-validating all fields.
 *
 * @throws TypeError/RangeError when the JSON shape is invalid
 */
export function simulationResultRecordFromJson(json: SimulationResultRecordJson): SimulationResultRecord {
  return createSimulationResultRecord({
    ...json,
    createdAt: new Date(json.createdAt)
  });
}
