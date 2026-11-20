import type { Confidence } from './confidence.ts';

/**
 * Entity identifiers. Plain strings (UUIDs for buildings, deterministic
 * `type-N` ids for imported envelope elements) so aggregates stay
 * JSON-serializable without framework code.
 */
export type BuildingId = string;
export type ZoneId = string;
export type RoomId = string;
export type WallId = string;
export type RoofId = string;
export type FloorId = string;
export type WindowId = string;
export type DoorId = string;
export type ThermalZoneId = string;
export type SystemId = string;

/**
 * A zone of the dwelling (v1: the DPE describes one dwelling, so imports
 * produce a single zone unless a later phase splits it).
 */
export interface Zone {
  readonly id: ZoneId;
  readonly name: Confidence<string>;
  readonly areaM2: Confidence<number> | null;
}

/**
 * A room. Invariant: a Room belongs to exactly one Zone (enforced by the
 * Building aggregate, see building.ts).
 */
export interface Room {
  readonly id: RoomId;
  readonly zoneId: ZoneId;
  readonly name: Confidence<string>;
  readonly areaM2: Confidence<number> | null;
}

/**
 * Common shape of envelope elements. Invariant: an envelope element belongs
 * to exactly one Building (buildingId is assigned once, at creation inside
 * the aggregate).
 */
export interface EnvelopeElement {
  readonly id: string;
  readonly buildingId: BuildingId;
  readonly description: Confidence<string>;
  readonly areaM2: Confidence<number> | null;
  readonly uValueWm2K: Confidence<number> | null;
}

/**
 * An opaque vertical wall (DPE `mur`).
 */
export interface Wall extends EnvelopeElement {
  readonly kind: 'wall';
  readonly orientation: Confidence<string> | null;
  readonly wallType: Confidence<string> | null;
  readonly adjacencyType: Confidence<string> | null;
}

/**
 * An upper floor / roof slab (DPE `plancher_haut`).
 */
export interface Roof extends EnvelopeElement {
  readonly kind: 'roof';
  readonly roofType: Confidence<string> | null;
  readonly adjacencyType: Confidence<string> | null;
}

/**
 * A lower floor slab (DPE `plancher_bas`).
 */
export interface Floor extends EnvelopeElement {
  readonly kind: 'floor';
  readonly floorType: Confidence<string> | null;
  readonly adjacencyType: Confidence<string> | null;
}

/**
 * A glazed opening (DPE `baie_vitree`).
 */
export interface Window extends EnvelopeElement {
  readonly kind: 'window';
  readonly orientation: Confidence<string> | null;
  readonly count: Confidence<number>;
  readonly solarFactorSw: Confidence<number> | null;
  readonly glazingType: Confidence<string> | null;
  readonly frameMaterial: Confidence<string> | null;
}

/**
 * An opaque door (DPE `porte`).
 */
export interface Door extends EnvelopeElement {
  readonly kind: 'door';
  readonly doorType: Confidence<string> | null;
  readonly count: Confidence<number>;
}

/**
 * A thermal zone (heated volume). v1 imports derive a single thermal zone
 * from the heated surface of the heating installations.
 */
export interface ThermalZone {
  readonly id: ThermalZoneId;
  readonly buildingId: BuildingId;
  readonly name: Confidence<string>;
  readonly heatedAreaM2: Confidence<number> | null;
}

/**
 * A heating installation (DPE `installation_chauffage`).
 */
export interface HeatingSystem {
  readonly id: SystemId;
  readonly buildingId: BuildingId;
  readonly description: Confidence<string>;
  readonly installationType: Confidence<string> | null;
  readonly heatedAreaM2: Confidence<number> | null;
}

/**
 * A ventilation installation (DPE `ventilation`).
 */
export interface VentilationSystem {
  readonly id: SystemId;
  readonly buildingId: BuildingId;
  readonly description: Confidence<string>;
  readonly ventilationType: Confidence<string> | null;
  readonly ventilatedAreaM2: Confidence<number> | null;
  readonly q4paConv: Confidence<number> | null;
}

/**
 * A photovoltaic installation (DPE `panneaux_pv`).
 */
export interface PhotovoltaicSystem {
  readonly id: SystemId;
  readonly buildingId: BuildingId;
  readonly sensorAreaM2: Confidence<number> | null;
  readonly moduleCount: Confidence<number> | null;
  readonly orientation: Confidence<string> | null;
  readonly inclination: Confidence<string> | null;
}
