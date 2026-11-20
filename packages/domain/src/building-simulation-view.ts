import type { Building } from './building.ts';
import type { BanCoordinates } from './building.ts';
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
import type { Confidence } from './confidence.ts';

/**
 * Read-only projection of a {@link Building} used by the Open3CL adapter
 * (P2). The adapter never mutates the aggregate: it works on this frozen
 * view. All Confidence metadata flows through unchanged, so the adapter can
 * log engine-input defaults for inferred (confidence < 1) fields instead of
 * silently substituting them.
 */
export interface BuildingSimulationView {
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
  readonly sourceDpeXml: string | null;
}

/**
 * Builds the read-only simulation view of a Building aggregate.
 */
export function toSimulationView(building: Building): BuildingSimulationView {
  return Object.freeze({
    id: building.id,
    dpeNumber: building.dpeNumber,
    status: building.status,
    address: building.address,
    banId: building.banId,
    banCoordinates: building.banCoordinates,
    constructionYear: building.constructionYear,
    constructionPeriod: building.constructionPeriod,
    livingAreaM2: building.livingAreaM2,
    buildingLivingAreaM2: building.buildingLivingAreaM2,
    ceilingHeightM: building.ceilingHeightM,
    levelCount: building.levelCount,
    apartmentCount: building.apartmentCount,
    climateZone: building.climateZone,
    altitudeClass: building.altitudeClass,
    altitudeM: building.altitudeM,
    thermalInertiaClass: building.thermalInertiaClass,
    zones: building.zones,
    rooms: building.rooms,
    walls: building.walls,
    roofs: building.roofs,
    floors: building.floors,
    windows: building.windows,
    doors: building.doors,
    thermalZones: building.thermalZones,
    heatingSystems: building.heatingSystems,
    ventilationSystems: building.ventilationSystems,
    photovoltaicSystems: building.photovoltaicSystems,
    importedAt: building.importedAt,
    sourceDpeXml: building.sourceDpeXml
  });
}
