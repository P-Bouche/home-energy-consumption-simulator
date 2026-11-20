import {
  confidenceFromJson,
  confidenceToJson,
  reviveConfidenceDates,
  type Confidence,
  type ConfidenceJson
} from './confidence.ts';
import { DomainInvariantError } from './import-errors.ts';
import type { Geometry } from './geometry.ts';
import { ReconstructionService } from './reconstruction.ts';
import type {
  BuildingId,
  Door,
  Floor,
  HeatingSystem,
  PhotovoltaicSystem,
  Room,
  Roof,
  ThermalZone,
  VentilationSystem,
  Wall,
  Window,
  Zone
} from './entities.ts';
import { BuildingImported, type DomainEvent } from './events.ts';

/**
 * BAN geolocation coordinates (Lambert-93, EPSG:2154), when the DPE
 * geolocation carries them.
 */
export interface BanCoordinates {
  readonly x: Confidence<number>;
  readonly y: Confidence<number>;
}

/**
 * Input accepted by {@link Building.createForImport}.
 */
export interface BuildingInput {
  readonly id: BuildingId;
  readonly dpeNumber: Confidence<string> | null;
  readonly status: Confidence<string> | null;
  readonly address: Confidence<string> | null;
  readonly banId: Confidence<string> | null;
  readonly banCoordinates: BanCoordinates | null;
  readonly constructionYear: Confidence<number> | null;
  readonly constructionPeriod: Confidence<string> | null;
  readonly livingAreaM2: Confidence<number> | null;
  readonly buildingLivingAreaM2: Confidence<number> | null;
  readonly ceilingHeightM: Confidence<number> | null;
  readonly levelCount: Confidence<number> | null;
  readonly apartmentCount: Confidence<number> | null;
  readonly climateZone: Confidence<string> | null;
  readonly altitudeClass: Confidence<string> | null;
  readonly altitudeM: Confidence<number> | null;
  readonly thermalInertiaClass: Confidence<string> | null;
  readonly zones: readonly Zone[];
  readonly rooms: readonly Room[];
  readonly walls: readonly Wall[];
  readonly roofs: readonly Roof[];
  readonly floors: readonly Floor[];
  readonly windows: readonly Window[];
  readonly doors: readonly Door[];
  readonly thermalZones: readonly ThermalZone[];
  readonly heatingSystems: readonly HeatingSystem[];
  readonly ventilationSystems: readonly VentilationSystem[];
  readonly photovoltaicSystems: readonly PhotovoltaicSystem[];
  readonly importedAt: Date;
  /**
   * The verbatim source DPE XML document this aggregate was imported from
   * (P2), or null when the building was not built from a DPE XML file.
   *
   * This is provenance, not an inferred value: it is the source document
   * itself, retained so the Open3CL adapter can feed the engine an input
   * identical to the diagnostic (ADR-0001 auditability; the domain aggregate
   * is intentionally a lossy projection of the DPE). Confidence metadata
   * therefore does not apply to it; every modeled field keeps its own
   * Confidence wrapper.
   */
  readonly sourceDpeXml?: string | null;
}

/**
 * JSON shape of a Building (all Confidence values flattened to ConfidenceJson,
 * dates as ISO-8601 strings). This is the persistence contract used by the
 * Postgres adapter: `POST /imports/dpe` → `GET /buildings/:id` returns
 * identical data because both sides serialize through this shape.
 */
export interface BuildingJson {
  readonly id: BuildingId;
  readonly dpeNumber: ConfidenceJson<string> | null;
  readonly status: ConfidenceJson<string> | null;
  readonly address: ConfidenceJson<string> | null;
  readonly banId: ConfidenceJson<string> | null;
  readonly banCoordinates: { x: ConfidenceJson<number>; y: ConfidenceJson<number> } | null;
  readonly constructionYear: ConfidenceJson<number> | null;
  readonly constructionPeriod: ConfidenceJson<string> | null;
  readonly livingAreaM2: ConfidenceJson<number> | null;
  readonly buildingLivingAreaM2: ConfidenceJson<number> | null;
  readonly ceilingHeightM: ConfidenceJson<number> | null;
  readonly levelCount: ConfidenceJson<number> | null;
  readonly apartmentCount: ConfidenceJson<number> | null;
  readonly climateZone: ConfidenceJson<string> | null;
  readonly altitudeClass: ConfidenceJson<string> | null;
  readonly altitudeM: ConfidenceJson<number> | null;
  readonly thermalInertiaClass: ConfidenceJson<string> | null;
  readonly zones: readonly Zone[];
  readonly rooms: readonly Room[];
  readonly walls: readonly Wall[];
  readonly roofs: readonly Roof[];
  readonly floors: readonly Floor[];
  readonly windows: readonly Window[];
  readonly doors: readonly Door[];
  readonly thermalZones: readonly ThermalZone[];
  readonly heatingSystems: readonly HeatingSystem[];
  readonly ventilationSystems: readonly VentilationSystem[];
  readonly photovoltaicSystems: readonly PhotovoltaicSystem[];
  readonly importedAt: string;
  readonly sourceDpeXml: string | null;
}

function cToJ<T>(c: Confidence<T> | null): ConfidenceJson<T> | null {
  return c === null ? null : confidenceToJson(c);
}

function cFromJ<T>(j: ConfidenceJson<T> | null): Confidence<T> | null {
  return j === null ? null : confidenceFromJson(j);
}

/**
 * Aggregate root of the Building Model bounded context.
 *
 * Invariants enforced at construction:
 * - at least one Zone exists;
 * - every Room belongs to exactly one Zone of this aggregate;
 * - every envelope element, thermal zone and system belongs to exactly this
 *   Building (buildingId === aggregate id).
 */
export class Building {
  readonly id: BuildingId;
  readonly dpeNumber: Confidence<string> | null;
  readonly status: Confidence<string> | null;
  readonly address: Confidence<string> | null;
  readonly banId: Confidence<string> | null;
  readonly banCoordinates: BanCoordinates | null;
  readonly constructionYear: Confidence<number> | null;
  readonly constructionPeriod: Confidence<string> | null;
  readonly livingAreaM2: Confidence<number> | null;
  readonly buildingLivingAreaM2: Confidence<number> | null;
  readonly ceilingHeightM: Confidence<number> | null;
  readonly levelCount: Confidence<number> | null;
  readonly apartmentCount: Confidence<number> | null;
  readonly climateZone: Confidence<string> | null;
  readonly altitudeClass: Confidence<string> | null;
  readonly altitudeM: Confidence<number> | null;
  readonly thermalInertiaClass: Confidence<string> | null;
  readonly zones: readonly Zone[];
  private readonly roomList: Room[];
  readonly walls: readonly Wall[];
  readonly roofs: readonly Roof[];
  readonly floors: readonly Floor[];
  readonly windows: readonly Window[];
  readonly doors: readonly Door[];
  readonly thermalZones: readonly ThermalZone[];
  readonly heatingSystems: readonly HeatingSystem[];
  readonly ventilationSystems: readonly VentilationSystem[];
  readonly photovoltaicSystems: readonly PhotovoltaicSystem[];
  readonly importedAt: Date;
  readonly sourceDpeXml: string | null;
  private readonly events: DomainEvent[] = [];

  private constructor(input: BuildingInput) {
    this.id = input.id;
    this.dpeNumber = input.dpeNumber;
    this.status = input.status;
    this.address = input.address;
    this.banId = input.banId;
    this.banCoordinates = input.banCoordinates;
    this.constructionYear = input.constructionYear;
    this.constructionPeriod = input.constructionPeriod;
    this.livingAreaM2 = input.livingAreaM2;
    this.buildingLivingAreaM2 = input.buildingLivingAreaM2;
    this.ceilingHeightM = input.ceilingHeightM;
    this.levelCount = input.levelCount;
    this.apartmentCount = input.apartmentCount;
    this.climateZone = input.climateZone;
    this.altitudeClass = input.altitudeClass;
    this.altitudeM = input.altitudeM;
    this.thermalInertiaClass = input.thermalInertiaClass;
    this.zones = Object.freeze([...input.zones]);
    this.roomList = [...input.rooms];
    this.walls = Object.freeze([...input.walls]);
    this.roofs = Object.freeze([...input.roofs]);
    this.floors = Object.freeze([...input.floors]);
    this.windows = Object.freeze([...input.windows]);
    this.doors = Object.freeze([...input.doors]);
    this.thermalZones = Object.freeze([...input.thermalZones]);
    this.heatingSystems = Object.freeze([...input.heatingSystems]);
    this.ventilationSystems = Object.freeze([...input.ventilationSystems]);
    this.photovoltaicSystems = Object.freeze([...input.photovoltaicSystems]);
    this.importedAt = new Date(input.importedAt.getTime());
    this.sourceDpeXml = typeof input.sourceDpeXml === 'string' ? input.sourceDpeXml : null;
  }

  /**
   * Creates a Building aggregate from an import and emits the
   * {@link BuildingImported} domain event.
   *
   * @throws DomainInvariantError when an invariant is violated
   */
  static createForImport(input: BuildingInput): Building {
    Building.assertInvariants(input);
    const building = new Building(input);
    building.events.push(
      new BuildingImported(building.id, building.dpeNumber?.value ?? null, building.importedAt)
    );
    return building;
  }

  /**
   * Rebuilds a Building aggregate from its JSON shape (persistence read
   * path). Does not re-emit events.
   */
  static fromJson(json: BuildingJson): Building {
    const revived = reviveConfidenceDates(json);
    const input: BuildingInput = {
      id: json.id,
      dpeNumber: cFromJ(json.dpeNumber),
      status: cFromJ(json.status),
      address: cFromJ(json.address),
      banId: cFromJ(json.banId),
      banCoordinates:
        json.banCoordinates === null
          ? null
          : { x: confidenceFromJson(json.banCoordinates.x), y: confidenceFromJson(json.banCoordinates.y) },
      constructionYear: cFromJ(json.constructionYear),
      constructionPeriod: cFromJ(json.constructionPeriod),
      livingAreaM2: cFromJ(json.livingAreaM2),
      buildingLivingAreaM2: cFromJ(json.buildingLivingAreaM2),
      ceilingHeightM: cFromJ(json.ceilingHeightM),
      levelCount: cFromJ(json.levelCount),
      apartmentCount: cFromJ(json.apartmentCount),
      climateZone: cFromJ(json.climateZone),
      altitudeClass: cFromJ(json.altitudeClass),
      altitudeM: cFromJ(json.altitudeM),
      thermalInertiaClass: cFromJ(json.thermalInertiaClass),
      zones: revived.zones,
      rooms: revived.rooms,
      walls: revived.walls,
      roofs: revived.roofs,
      floors: revived.floors,
      windows: revived.windows,
      doors: revived.doors,
      thermalZones: revived.thermalZones,
      heatingSystems: revived.heatingSystems,
      ventilationSystems: revived.ventilationSystems,
      photovoltaicSystems: revived.photovoltaicSystems,
      importedAt: new Date(revived.importedAt),
      sourceDpeXml: typeof json.sourceDpeXml === 'string' ? json.sourceDpeXml : null
    };
    Building.assertInvariants(input);
    return new Building(input);
  }

  private static assertInvariants(input: BuildingInput): void {
    if (input.zones.length === 0) {
      throw new DomainInvariantError('a Building must contain at least one Zone');
    }
    const zoneIds = new Set<string>();
    for (const zone of input.zones) {
      if (zoneIds.has(zone.id)) {
        throw new DomainInvariantError(`duplicate Zone id ${zone.id}`);
      }
      zoneIds.add(zone.id);
    }
    const roomIds = new Set<string>();
    for (const room of input.rooms) {
      if (roomIds.has(room.id)) {
        throw new DomainInvariantError(`duplicate Room id ${room.id}`);
      }
      roomIds.add(room.id);
      if (!zoneIds.has(room.zoneId)) {
        throw new DomainInvariantError(
          `Room ${room.id} belongs to Zone ${room.zoneId} which is not part of Building ${input.id}`
        );
      }
    }
    const owned = [
      ...input.walls,
      ...input.roofs,
      ...input.floors,
      ...input.windows,
      ...input.doors,
      ...input.thermalZones,
      ...input.heatingSystems,
      ...input.ventilationSystems,
      ...input.photovoltaicSystems
    ];
    for (const element of owned) {
      if (element.buildingId !== input.id) {
        throw new DomainInvariantError(
          `element ${element.id} belongs to Building ${element.buildingId}, not to ${input.id}`
        );
      }
    }
  }

  /**
   * Attaches a room to one of this aggregate's zones.
   *
   * @throws DomainInvariantError when the room already belongs to another
   * zone or the zone does not exist in this aggregate
   */
  addRoom(room: Room): void {
    const zoneIds = new Set(this.zones.map((z) => z.id));
    if (!zoneIds.has(room.zoneId)) {
      throw new DomainInvariantError(`cannot add Room ${room.id}: unknown Zone ${room.zoneId}`);
    }
    if (this.roomList.some((r) => r.id === room.id)) {
      throw new DomainInvariantError(`Room ${room.id} is already part of Building ${this.id}`);
    }
    this.roomList.push(room);
  }

  /**
   * The rooms of this aggregate (frozen view).
   */
  get rooms(): readonly Room[] {
    return Object.freeze([...this.roomList]);
  }

  /**
   * Reconstructs the 3D geometry of this building (Phase P3). Pure domain
   * behavior, no I/O: delegates to the {@link ReconstructionService} with its
   * versioned inference rules; every inferred element keeps its Confidence.
   * Deterministic: same Building → same Geometry (same meshHash).
   */
  reconstructGeometry(): Geometry {
    return new ReconstructionService().reconstruct(this);
  }

  /**
   * Returns and clears the pending domain events.
   */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events.length = 0;
    return events;
  }

  /**
   * Serializes the aggregate to its JSON persistence shape.
   */
  toJson(): BuildingJson {
    return {
      id: this.id,
      dpeNumber: cToJ(this.dpeNumber),
      status: cToJ(this.status),
      address: cToJ(this.address),
      banId: cToJ(this.banId),
      banCoordinates:
        this.banCoordinates === null
          ? null
          : { x: confidenceToJson(this.banCoordinates.x), y: confidenceToJson(this.banCoordinates.y) },
      constructionYear: cToJ(this.constructionYear),
      constructionPeriod: cToJ(this.constructionPeriod),
      livingAreaM2: cToJ(this.livingAreaM2),
      buildingLivingAreaM2: cToJ(this.buildingLivingAreaM2),
      ceilingHeightM: cToJ(this.ceilingHeightM),
      levelCount: cToJ(this.levelCount),
      apartmentCount: cToJ(this.apartmentCount),
      climateZone: cToJ(this.climateZone),
      altitudeClass: cToJ(this.altitudeClass),
      altitudeM: cToJ(this.altitudeM),
      thermalInertiaClass: cToJ(this.thermalInertiaClass),
      zones: this.zones,
      rooms: this.rooms,
      walls: this.walls,
      roofs: this.roofs,
      floors: this.floors,
      windows: this.windows,
      doors: this.doors,
      thermalZones: this.thermalZones,
      heatingSystems: this.heatingSystems,
      ventilationSystems: this.ventilationSystems,
      photovoltaicSystems: this.photovoltaicSystems,
      importedAt: this.importedAt.toISOString(),
      sourceDpeXml: this.sourceDpeXml
    };
  }
}
