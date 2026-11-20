import { describe, expect, it } from 'vitest';
import {
  Building,
  BuildingImported,
  DomainInvariantError,
  inferred,
  measured,
  type BuildingInput,
  type Wall
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');

function baseInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: measured('ACTIF', 'dpe-xml:dpe/statut', date),
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: measured(1961, 'dpe-xml:x/annee_construction', date),
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x/surface_habitable_logement', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: inferred(2.5, 'inference:default-ceiling-height-2.5m', 0.4, date),
    levelCount: measured(1, 'dpe-xml:x/nombre_niveau_logement', date),
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [
      {
        id: 'zone-1',
        name: inferred('logement', 'inference:single-zone-from-logement', 0.9, date),
        areaM2: measured(80.84, 'dpe-xml:x/surface_habitable_logement', date)
      }
    ],
    rooms: [],
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: '11111111-1111-4111-8111-111111111111',
        description: measured('Mur', 'dpe-xml:x', date),
        areaM2: measured(54.25, 'dpe-xml:x', date),
        uValueWm2K: measured(1.64, 'dpe-xml:x', date),
        orientation: null,
        wallType: null,
        adjacencyType: null
      }
    ],
    roofs: [],
    floors: [],
    windows: [],
    doors: [],
    thermalZones: [
      {
        id: 'thermal-zone-1',
        buildingId: '11111111-1111-4111-8111-111111111111',
        name: inferred('zone thermique du logement', 'inference:single-zone-from-logement', 0.9, date),
        heatedAreaM2: measured(80.84, 'dpe-xml:x', date)
      }
    ],
    heatingSystems: [],
    ventilationSystems: [],
    photovoltaicSystems: [],
    importedAt: date,
    ...overrides
  };
}

describe('Building aggregate', () => {
  it('createForImport emits BuildingImported and pullDomainEvents drains it', () => {
    const building = Building.createForImport(baseInput());
    const events = building.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BuildingImported);
    expect(events[0]?.type).toBe('BuildingImported');
    expect(building.pullDomainEvents()).toHaveLength(0);
  });

  it('enforces: a Building has at least one Zone', () => {
    expect(() => Building.createForImport(baseInput({ zones: [] }))).toThrow(DomainInvariantError);
  });

  it('enforces: a Room belongs to exactly one Zone of the aggregate', () => {
    const input = baseInput({
      rooms: [
        {
          id: 'room-1',
          zoneId: 'zone-unknown',
          name: measured('Salle', 'dpe-xml:x', date),
          areaM2: null
        }
      ]
    });
    expect(() => Building.createForImport(input)).toThrow(/belongs to Zone zone-unknown/);
  });

  it('enforces: envelope elements belong to exactly one Building', () => {
    const input = baseInput();
    const wall = input.walls[0];
    expect(wall).toBeDefined();
    const foreign = { ...(wall as Wall), id: 'wall-x', buildingId: 'other-building' };
    expect(() => Building.createForImport(baseInput({ walls: [foreign] }))).toThrow(DomainInvariantError);
  });

  it('addRoom attaches a room to an existing zone and rejects duplicates', () => {
    const building = Building.createForImport(baseInput());
    const room = {
      id: 'room-1',
      zoneId: 'zone-1',
      name: measured('Séjour', 'user', date),
      areaM2: null
    };
    building.addRoom(room);
    expect(building.rooms).toHaveLength(1);
    expect(() => building.addRoom(room)).toThrow(DomainInvariantError);
    expect(() =>
      building.addRoom({ ...room, id: 'room-2', zoneId: 'zone-nope' })
    ).toThrow(DomainInvariantError);
  });

  it('JSON round-trip is identical (persistence contract)', () => {
    const building = Building.createForImport(baseInput());
    const json = building.toJson();
    const serialized = JSON.stringify(json);
    const revived = Building.fromJson(JSON.parse(serialized) as ReturnType<Building['toJson']>);
    expect(JSON.stringify(revived.toJson())).toBe(serialized);
    expect(revived.livingAreaM2?.importDate).toEqual(date);
    expect(revived.zones[0]?.areaM2?.importDate).toEqual(date);
  });
});
