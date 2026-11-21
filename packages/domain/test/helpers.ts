import {
  Building,
  inferred,
  measured,
  type BuildingId,
  type BuildingInput
} from '@hes/domain';

export const testDate = new Date('2026-11-20T10:00:00.000Z');

export function makeBuildingInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  const id: BuildingId = '11111111-1111-4111-8111-111111111111';
  return {
    id,
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', testDate),
    status: null,
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: measured(1961, 'dpe-xml:x', testDate),
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x', testDate),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, testDate),
    levelCount: null,
    apartmentCount: null,
    climateZone: measured('1', 'dpe-xml:x', testDate),
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [{ id: 'zone-1', name: inferred('logement', 'inference:single-zone-from-logement', 0.9, testDate), areaM2: null }],
    rooms: [],
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: id,
        description: measured('Mur nord', 'dpe-xml:x', testDate),
        areaM2: measured(54.25, 'dpe-xml:x', testDate),
        uValueWm2K: measured(1.6393, 'dpe-xml:x', testDate),
        orientation: measured('2', 'dpe-xml:x', testDate),
        wallType: measured('2', 'dpe-xml:x', testDate),
        adjacencyType: measured('1', 'dpe-xml:x', testDate)
      }
    ],
    roofs: [
      {
        kind: 'roof',
        id: 'roof-1',
        buildingId: id,
        description: measured('Plafond', 'dpe-xml:x', testDate),
        areaM2: measured(80.84, 'dpe-xml:x', testDate),
        uValueWm2K: measured(0.4, 'dpe-xml:x', testDate),
        roofType: null,
        adjacencyType: null
      }
    ],
    floors: [],
    windows: [
      {
        kind: 'window',
        id: 'window-1',
        buildingId: id,
        description: measured('Fenêtre sud', 'dpe-xml:x', testDate),
        areaM2: measured(2.5, 'dpe-xml:x', testDate),
        uValueWm2K: measured(5.4, 'dpe-xml:x', testDate),
        orientation: measured('2', 'dpe-xml:x', testDate),
        count: measured(2, 'dpe-xml:x', testDate),
        solarFactorSw: measured(0.6, 'dpe-xml:x', testDate),
        glazingType: measured('1', 'dpe-xml:x', testDate),
        frameMaterial: measured('1', 'dpe-xml:x', testDate)
      }
    ],
    doors: [],
    thermalZones: [],
    heatingSystems: [
      {
        id: 'heating-1',
        buildingId: id,
        description: measured('Chaudière gaz', 'dpe-xml:x', testDate),
        installationType: measured('1', 'dpe-xml:x', testDate),
        heatedAreaM2: measured(80.84, 'dpe-xml:x', testDate)
      }
    ],
    ventilationSystems: [
      {
        id: 'ventilation-1',
        buildingId: id,
        description: measured('VMC simple flux', 'dpe-xml:x', testDate),
        ventilationType: measured('1', 'dpe-xml:x', testDate),
        ventilatedAreaM2: measured(80.84, 'dpe-xml:x', testDate),
        q4paConv: measured(1.2, 'dpe-xml:x', testDate)
      }
    ],
    photovoltaicSystems: [],
    importedAt: testDate,
    sourceDpeXml: '<dpe/>',
    ...overrides
  };
}

export function makeBuilding(overrides: Partial<BuildingInput> = {}): Building {
  return Building.createForImport(makeBuildingInput(overrides));
}
