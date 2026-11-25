import { describe, expect, it } from 'vitest';
import {
  auditEntryFromEvent,
  auditEntryFromJson,
  auditEntryToJson,
  Building,
  BuildingUpdated,
  COMMAND_VOCABULARY_VERSION,
  CommandValidationError,
  ElementNotFoundError,
  InvalidCommandError,
  inverseOfAuditEntry,
  isLeft,
  isRight,
  measured,
  parseBuildingCommand,
  userSupplied,
  validateCommandFields,
  type BuildingCommand,
  type BuildingInput,
  type UpdateWallCommand,
  type UpdateWindowCommand
} from '../src/index.ts';

const date = new Date('2026-11-20T10:00:00.000Z');
const editCtx = { now: new Date('2026-11-21T09:30:00.000Z'), userId: 'user-42' };
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

function baseInput(overrides: Partial<BuildingInput> = {}): BuildingInput {
  return {
    id: BUILDING_ID,
    dpeNumber: measured('2238E0097309E', 'dpe-xml:dpe/numero_dpe', date),
    status: measured('ACTIF', 'dpe-xml:dpe/statut', date),
    address: null,
    banId: null,
    banCoordinates: null,
    constructionYear: measured(1961, 'dpe-xml:x/annee_construction', date),
    constructionPeriod: null,
    livingAreaM2: measured(80.84, 'dpe-xml:x/surface_habitable_logement', date),
    buildingLivingAreaM2: null,
    ceilingHeightM: null,
    levelCount: measured(1, 'dpe-xml:x', date),
    apartmentCount: null,
    climateZone: null,
    altitudeClass: null,
    altitudeM: null,
    thermalInertiaClass: null,
    zones: [
      {
        id: 'zone-1',
        name: measured('logement', 'dpe-xml:x', date),
        areaM2: measured(80.84, 'dpe-xml:x', date)
      }
    ],
    rooms: [],
    walls: [
      {
        kind: 'wall',
        id: 'wall-1',
        buildingId: BUILDING_ID,
        description: measured('Mur', 'dpe-xml:x', date),
        areaM2: measured(54.25, 'dpe-xml:x', date),
        uValueWm2K: measured(1.64, 'dpe-xml:x', date),
        orientation: null,
        wallType: null,
        adjacencyType: null
      }
    ],
    roofs: [
      {
        kind: 'roof',
        id: 'roof-1',
        buildingId: BUILDING_ID,
        description: measured('Plafond', 'dpe-xml:x', date),
        areaM2: measured(80, 'dpe-xml:x', date),
        uValueWm2K: measured(0.6, 'dpe-xml:x', date),
        roofType: null,
        adjacencyType: null
      }
    ],
    floors: [
      {
        kind: 'floor',
        id: 'floor-1',
        buildingId: BUILDING_ID,
        description: measured('Plancher', 'dpe-xml:x', date),
        areaM2: measured(80, 'dpe-xml:x', date),
        uValueWm2K: measured(1.2, 'dpe-xml:x', date),
        floorType: null,
        adjacencyType: null
      }
    ],
    windows: [
      {
        kind: 'window',
        id: 'window-1',
        buildingId: BUILDING_ID,
        description: measured('Fenêtre', 'dpe-xml:x', date),
        areaM2: measured(6, 'dpe-xml:x', date),
        uValueWm2K: measured(2.8, 'dpe-xml:x', date),
        orientation: null,
        count: measured(1, 'dpe-xml:x', date),
        solarFactorSw: null,
        glazingType: null,
        frameMaterial: null
      }
    ],
    doors: [],
    thermalZones: [],
    heatingSystems: [
      {
        id: 'heating-1',
        buildingId: BUILDING_ID,
        description: measured('Chaudière gaz', 'dpe-xml:x', date),
        installationType: measured('1', 'dpe-xml:x', date),
        generatorType: measured('88', 'dpe-xml:x', date),
        heatedAreaM2: measured(80.84, 'dpe-xml:x', date)
      }
    ],
    ventilationSystems: [
      {
        id: 'vent-1',
        buildingId: BUILDING_ID,
        description: measured('VMC', 'dpe-xml:x', date),
        ventilationType: measured('2', 'dpe-xml:x', date),
        ventilatedAreaM2: measured(80.84, 'dpe-xml:x', date),
        q4paConv: measured(1.1, 'dpe-xml:x', date)
      }
    ],
    photovoltaicSystems: [],
    importedAt: date,
    ...overrides
  };
}

function makeBuilding(overrides: Partial<BuildingInput> = {}): Building {
  const building = Building.createForImport(baseInput(overrides));
  building.pullDomainEvents(); // drain the BuildingImported event
  return building;
}

const wallCommand: UpdateWallCommand = {
  type: 'building.wall.update.v1',
  buildingId: BUILDING_ID,
  wallId: 'wall-1',
  uValueWm2K: 0.25
};

describe('command vocabulary (P4 contract with P5)', () => {
  it('is versioned and exposes the six v1 tags', () => {
    expect(COMMAND_VOCABULARY_VERSION).toBe(1);
    const parsed = parseBuildingCommand({ ...wallCommand });
    expect(isRight(parsed)).toBe(true);
    if (isRight(parsed)) {
      expect(parsed.value.type).toBe('building.wall.update.v1');
    }
  });

  it('rejects unknown type tags with InvalidCommandError', () => {
    const parsed = parseBuildingCommand({ type: 'building.wall.update.v2', buildingId: BUILDING_ID, wallId: 'wall-1' });
    expect(isLeft(parsed)).toBe(true);
    if (isLeft(parsed)) {
      expect(parsed.error).toBeInstanceOf(InvalidCommandError);
      expect(parsed.error.issues.join(' ')).toContain('unknown');
    }
  });

  it('rejects unknown fields and wrong field types', () => {
    expect(isLeft(parseBuildingCommand({ ...wallCommand, thickness: 0.2 }))).toBe(true);
    expect(isLeft(parseBuildingCommand({ ...wallCommand, uValueWm2K: '0.2' }))).toBe(true);
    expect(isLeft(parseBuildingCommand({ type: 'building.wall.update.v1' }))).toBe(true);
    expect(isLeft(parseBuildingCommand('not an object'))).toBe(true);
  });

  it('accepts the heating v2 tag with generatorType (ADR-0004)', () => {
    const v2 = {
      type: 'building.heating-system.update.v2',
      buildingId: BUILDING_ID,
      systemId: 'heating-1',
      generatorType: '97'
    };
    const parsed = parseBuildingCommand(v2);
    expect(isRight(parsed)).toBe(true);
    if (isRight(parsed)) {
      expect(parsed.value.type).toBe('building.heating-system.update.v2');
      expect(validateCommandFields(parsed.value)).toHaveLength(0);
    }
    // generatorType must be a string enum id, not a number
    expect(isLeft(parseBuildingCommand({ ...v2, generatorType: 97 }))).toBe(true);
    // v1 tag still rejects the unknown generatorType field
    expect(isLeft(parseBuildingCommand({ type: 'building.heating-system.update.v1', buildingId: BUILDING_ID, systemId: 'heating-1', generatorType: '97' }))).toBe(true);
  });

  it('parses heating create (no systemId, description required) and delete (ADR-0006)', () => {
    const create = parseBuildingCommand({
      type: 'building.heating-system.create.v1',
      buildingId: BUILDING_ID,
      description: 'Poêle à bois',
      generatorType: '22'
    });
    expect(isRight(create)).toBe(true);
    // create without description is invalid
    expect(validateCommandFields({ type: 'building.heating-system.create.v1', buildingId: BUILDING_ID } as never).some((e) => e.field === 'description')).toBe(true);
    // create rejects a client-supplied systemId (ids are minted, ADR-0003)
    expect(isLeft(parseBuildingCommand({ type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, systemId: 'heating-9', description: 'x' }))).toBe(true);
    const del = parseBuildingCommand({ type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-1' });
    expect(isRight(del)).toBe(true);
  });

  it('applies create (append-only id) and delete (removable, restorable) on heating systems (ADR-0006)', () => {
    const building = makeBuilding();
    const created = building.apply(
      { type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle à bois', generatorType: '22', heatedAreaM2: 40 },
      editCtx
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const systems = created.value.heatingSystems;
    expect(systems.map((s) => s.id)).toEqual(['heating-1', 'heating-2']);
    expect(systems[1]?.description.value).toBe('Poêle à bois');
    expect(systems[1]?.description.source).toBe('user');
    expect(systems[1]?.generatorType?.value).toBe('22');

    const deleted = created.value.apply(
      { type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-1' },
      editCtx
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.heatingSystems.map((s) => s.id)).toEqual(['heating-2']);

    // deleting an unknown id fails and leaves the aggregate unchanged
    const bad = deleted.value.apply(
      { type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-99' },
      editCtx
    );
    expect(isLeft(bad)).toBe(true);
  });

  it('undo of a heating delete restores the system with its original id (ADR-0006)', () => {
    const building = makeBuilding();
    const created = building.apply(
      { type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle à bois', generatorType: '42', heatedAreaM2: 40 },
      editCtx
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const deleted = created.value.apply(
      { type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-1' },
      editCtx
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.heatingSystems.map((s) => s.id)).toEqual(['heating-2']);
    const event = deleted.value.pullDomainEvents().find((e) => e instanceof BuildingUpdated);
    if (!(event instanceof BuildingUpdated)) throw new Error('expected BuildingUpdated');
    const entry = auditEntryFromEvent('entry-1', event);
    const restored = deleted.value.applyRestoration(entry, editCtx);
    expect(isRight(restored)).toBe(true);
    if (!isRight(restored)) return;
    expect(restored.value.heatingSystems.map((s) => s.id)).toEqual(['heating-1', 'heating-2']);
    expect(restored.value.heatingSystems[0]?.description.source).toBe('dpe-xml:x');
  });

  it('never reuses a heating id after delete (persisted high-water mark, ADR-0006)', () => {
    const building = makeBuilding();
    const created = building.apply(
      { type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle', generatorType: '42', heatedAreaM2: 40 },
      editCtx
    );
    expect(created.ok && created.value.heatingSystems.map((s) => s.id)).toEqual(['heating-1', 'heating-2']);
    if (!created.ok) return;
    const deleted = created.value.apply(
      { type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-2' },
      editCtx
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    // recreate: must mint heating-3, NOT reuse heating-2 (audit rows reference it)
    const recreated = deleted.value.apply(
      { type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Radiateurs électriques', generatorType: '98', heatedAreaM2: 80 },
      editCtx
    );
    expect(recreated.ok).toBe(true);
    if (!recreated.ok) return;
    expect(recreated.value.heatingSystems.map((s) => s.id)).toEqual(['heating-1', 'heating-3']);
    // the high-water mark survives a JSON round-trip
    const revived = Building.fromJson(recreated.value.toJson(), recreated.value.version);
    expect(revived.heatingSystemSeq).toBe(3);
  });

  it('undo of a heating create deletes the minted id (ADR-0006)', () => {
    const building = makeBuilding();
    const created = building.apply(
      { type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle', generatorType: '42', heatedAreaM2: 40 },
      editCtx
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const event = created.value.pullDomainEvents().find((e) => e instanceof BuildingUpdated);
    if (!(event instanceof BuildingUpdated)) throw new Error('expected BuildingUpdated');
    const entry = auditEntryFromEvent('entry-1', event);
    const restored = created.value.applyRestoration(entry, editCtx);
    expect(isRight(restored)).toBe(true);
    if (!isRight(restored)) return;
    expect(restored.value.heatingSystems.map((s) => s.id)).toEqual(['heating-1']);
  });

  it('rejects an un-simulable heating state: create without generator/surface, delete of the last system (ADR-0006)', () => {
    // create requires description + generatorType + heatedAreaM2 (engine needs them for ep_conso_5_usages)
    const noGen = validateCommandFields({ type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle', heatedAreaM2: 40 } as never);
    expect(noGen.some((e) => e.field === 'generatorType')).toBe(true);
    const noArea = validateCommandFields({ type: 'building.heating-system.create.v1', buildingId: BUILDING_ID, description: 'Poêle', generatorType: '42' } as never);
    expect(noArea.some((e) => e.field === 'heatedAreaM2')).toBe(true);
    // deleting the only heating system is refused (aggregate left unchanged)
    const building = makeBuilding();
    expect(building.heatingSystems).toHaveLength(1);
    const del = building.apply({ type: 'building.heating-system.delete.v1', buildingId: BUILDING_ID, systemId: 'heating-1' }, editCtx);
    expect(isLeft(del)).toBe(true);
    if (isLeft(del)) expect(del.error.message ?? '').toMatch(/at least one heating system/);
  });

  it('accepts every v1 tag', () => {
    const commands: unknown[] = [
      { type: 'building.wall.update.v1', buildingId: BUILDING_ID, wallId: 'wall-1' },
      { type: 'building.window.update.v1', buildingId: BUILDING_ID, windowId: 'window-1' },
      { type: 'building.roof.update.v1', buildingId: BUILDING_ID, roofId: 'roof-1' },
      { type: 'building.floor.update.v1', buildingId: BUILDING_ID, floorId: 'floor-1' },
      { type: 'building.heating-system.update.v1', buildingId: BUILDING_ID, systemId: 'heating-1' },
      { type: 'building.ventilation-system.update.v1', buildingId: BUILDING_ID, systemId: 'vent-1' }
    ];
    for (const c of commands) {
      expect(isRight(parseBuildingCommand(c)), JSON.stringify(c)).toBe(true);
    }
  });
});

describe('validateCommandFields', () => {
  it('rejects negative / zero / absurd U-values with a field error', () => {
    for (const u of [-1, 0, 5, Number.NaN]) {
      const errors = validateCommandFields({ ...wallCommand, uValueWm2K: u });
      expect(errors.some((e) => e.field === 'uValueWm2K'), `u=${String(u)}`).toBe(true);
    }
  });

  it('uses a higher U ceiling for windows (Uw up to 6, single glazing) — issue #48 rework', () => {
    const win: UpdateWindowCommand = { type: 'building.window.update.v1', buildingId: BUILDING_ID, windowId: 'window-1' };
    for (const uw of [5.4, 6]) {
      expect(validateCommandFields({ ...win, uValueWm2K: uw }), `uw=${String(uw)}`).toHaveLength(0);
    }
    for (const uw of [-1, 0, 6.5]) {
      expect(validateCommandFields({ ...win, uValueWm2K: uw }).some((e) => e.field === 'uValueWm2K'), `uw=${String(uw)}`).toBe(true);
    }
    // opaque elements keep the (0, 4] ceiling
    expect(validateCommandFields({ ...wallCommand, uValueWm2K: 5 }).some((e) => e.field === 'uValueWm2K')).toBe(true);
    expect(validateCommandFields({ ...wallCommand, uValueWm2K: 4 })).toHaveLength(0);
  });

  it('rejects invalid areas, counts, solar factors and q4pa', () => {
    expect(validateCommandFields({ ...wallCommand, areaM2: -5 }).some((e) => e.field === 'areaM2')).toBe(true);
    const win: UpdateWindowCommand = { type: 'building.window.update.v1', buildingId: BUILDING_ID, windowId: 'window-1', count: 0 };
    expect(validateCommandFields(win).some((e) => e.field === 'count')).toBe(true);
    const win2: UpdateWindowCommand = { ...win, count: 1, solarFactorSw: 1.5 };
    expect(validateCommandFields(win2).some((e) => e.field === 'solarFactorSw')).toBe(true);
    const vent = { type: 'building.ventilation-system.update.v1', buildingId: BUILDING_ID, systemId: 'vent-1', q4paConv: 9 } as const;
    expect(validateCommandFields(vent).some((e) => e.field === 'q4paConv')).toBe(true);
  });

  it('accepts null to clear a nullable field, but not for description', () => {
    expect(validateCommandFields({ ...wallCommand, orientation: null })).toHaveLength(0);
    expect(validateCommandFields({ ...wallCommand, description: '' }).some((e) => e.field === 'description')).toBe(true);
  });
});

describe('Building.apply (P4)', () => {
  it('applies a valid wall command: new aggregate, version+1, user confidence, event', () => {
    const building = makeBuilding();
    const result = building.apply(wallCommand, editCtx);
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const next = result.value;
    expect(next).not.toBe(building);
    expect(next.version).toBe(building.version + 1);
    // original aggregate unchanged (purity)
    expect(building.walls[0]?.uValueWm2K?.value).toBe(1.64);
    expect(building.version).toBe(0);
    const updated = next.walls[0];
    expect(updated?.uValueWm2K?.value).toBe(0.25);
    expect(updated?.uValueWm2K?.source).toBe('user');
    expect(updated?.uValueWm2K?.confidence).toBe(1);
    expect(updated?.uValueWm2K?.importDate).toEqual(editCtx.now);
    // untouched fields keep their provenance
    expect(updated?.areaM2?.source).toBe('dpe-xml:x');
    const events = next.pullDomainEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeInstanceOf(BuildingUpdated);
    if (event instanceof BuildingUpdated) {
      expect(event.commandType).toBe('building.wall.update.v1');
      expect(event.userId).toBe('user-42');
      expect(event.version).toBe(1);
      expect(event.changes).toHaveLength(1);
      expect(event.changes[0]?.field).toBe('uValueWm2K');
      expect(event.changes[0]?.oldValue?.value).toBe(1.64);
      expect(event.changes[0]?.newValue?.value).toBe(0.25);
      expect(event.changes[0]?.newValue?.source).toBe('user');
    }
  });

  it('rejects an invalid command with CommandValidationError and leaves the aggregate unchanged', () => {
    const building = makeBuilding();
    const before = building.toJson();
    const result = building.apply({ ...wallCommand, uValueWm2K: -1 }, editCtx);
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(CommandValidationError);
      expect((result.error as CommandValidationError).fieldErrors[0]?.field).toBe('uValueWm2K');
    }
    expect(building.toJson()).toEqual(before);
    expect(building.version).toBe(0);
    expect(building.pullDomainEvents()).toHaveLength(0);
  });

  it('rejects a command for another building', () => {
    const building = makeBuilding();
    const result = building.apply({ ...wallCommand, buildingId: '22222222-2222-4222-8222-222222222222' }, editCtx);
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(CommandValidationError);
    }
  });

  it('rejects an unknown element with ElementNotFoundError', () => {
    const building = makeBuilding();
    const result = building.apply({ ...wallCommand, wallId: 'wall-99' }, editCtx);
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(ElementNotFoundError);
      expect((result.error as ElementNotFoundError).elementId).toBe('wall-99');
    }
  });

  it('rejects a window larger than the total wall area', () => {
    const building = makeBuilding();
    const result = building.apply(
      { type: 'building.window.update.v1', buildingId: BUILDING_ID, windowId: 'window-1', areaM2: 1000 },
      editCtx
    );
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(CommandValidationError);
      expect((result.error as CommandValidationError).fieldErrors[0]?.field).toBe('areaM2');
    }
  });

  it('applies every command type to its element', () => {
    const building = makeBuilding();
    const commands: BuildingCommand[] = [
      { type: 'building.window.update.v1', buildingId: BUILDING_ID, windowId: 'window-1', uValueWm2K: 1.1, solarFactorSw: 0.5 },
      { type: 'building.roof.update.v1', buildingId: BUILDING_ID, roofId: 'roof-1', uValueWm2K: 0.18 },
      { type: 'building.floor.update.v1', buildingId: BUILDING_ID, floorId: 'floor-1', areaM2: 70 },
      { type: 'building.heating-system.update.v1', buildingId: BUILDING_ID, systemId: 'heating-1', heatedAreaM2: 60 },
      { type: 'building.ventilation-system.update.v1', buildingId: BUILDING_ID, systemId: 'vent-1', q4paConv: 0.6 }
    ];
    let current = building;
    for (const command of commands) {
      const result = current.apply(command, editCtx);
      expect(isRight(result), command.type).toBe(true);
      if (!isRight(result)) return;
      current = result.value;
    }
    expect(current.version).toBe(5);
    expect(current.windows[0]?.uValueWm2K?.value).toBe(1.1);
    expect(current.windows[0]?.solarFactorSw?.source).toBe('user');
    expect(current.roofs[0]?.uValueWm2K?.value).toBe(0.18);
    expect(current.floors[0]?.areaM2?.value).toBe(70);
    expect(current.heatingSystems[0]?.heatedAreaM2?.value).toBe(60);
    expect(current.ventilationSystems[0]?.q4paConv?.value).toBe(0.6);
  });

  it('clears a nullable field with null', () => {
    const building = makeBuilding();
    const result = building.apply({ ...wallCommand, orientation: '4' }, editCtx);
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const cleared = result.value.apply({ ...wallCommand, orientation: null }, editCtx);
    expect(isRight(cleared)).toBe(true);
    if (isRight(cleared)) {
      expect(cleared.value.walls[0]?.orientation).toBeNull();
    }
  });
});

describe('Building.fork (P5 building block)', () => {
  it('applies commands in order on a pure copy and accumulates events', () => {
    const building = makeBuilding();
    const before = building.toJson();
    const result = building.fork(
      [
        wallCommand,
        { type: 'building.roof.update.v1', buildingId: BUILDING_ID, roofId: 'roof-1', uValueWm2K: 0.2 }
      ],
      editCtx
    );
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const forked = result.value;
    expect(forked.version).toBe(2);
    expect(forked.walls[0]?.uValueWm2K?.value).toBe(0.25);
    expect(forked.roofs[0]?.uValueWm2K?.value).toBe(0.2);
    expect(forked.pullDomainEvents().map((e) => e.type)).toEqual(['BuildingUpdated', 'BuildingUpdated']);
    // base untouched
    expect(building.toJson()).toEqual(before);
    expect(building.version).toBe(0);
    expect(building.pullDomainEvents()).toHaveLength(0);
  });

  it('stops at the first invalid command and returns Left', () => {
    const building = makeBuilding();
    const result = building.fork([wallCommand, { ...wallCommand, uValueWm2K: -3 }], editCtx);
    expect(isLeft(result)).toBe(true);
    expect(building.version).toBe(0);
  });
});

describe('audit entries (P4)', () => {
  it('builds an audit entry from a BuildingUpdated event and round-trips JSON', () => {
    const building = makeBuilding();
    const result = building.apply(wallCommand, editCtx);
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const event = result.value.pullDomainEvents()[0];
    expect(event).toBeInstanceOf(BuildingUpdated);
    if (!(event instanceof BuildingUpdated)) return;
    const entry = auditEntryFromEvent('entry-1', event);
    expect(entry.userId).toBe('user-42');
    expect(entry.commandType).toBe('building.wall.update.v1');
    expect(entry.version).toBe(1);
    const json = auditEntryToJson(entry);
    expect(json.timestamp).toBe(editCtx.now.toISOString());
    const revived = auditEntryFromJson(json);
    expect(revived).toEqual(entry);
  });

  it('builds the inverse command of an entry (undo)', () => {
    const building = makeBuilding();
    const result = building.apply(wallCommand, editCtx);
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const event = result.value.pullDomainEvents()[0];
    if (!(event instanceof BuildingUpdated)) throw new Error('expected BuildingUpdated');
    const entry = auditEntryFromEvent('entry-1', event);
    const inverse = inverseOfAuditEntry(entry);
    expect(isRight(inverse)).toBe(true);
    if (!isRight(inverse)) return;
    expect(inverse.value.type).toBe('building.wall.update.v1');
    expect((inverse.value as UpdateWallCommand).uValueWm2K).toBe(1.64);
    // applying the inverse command restores the previous value (re-stamped user)
    const undone = result.value.apply(inverse.value, editCtx);
    expect(isRight(undone)).toBe(true);
    if (isRight(undone)) {
      expect(undone.value.walls[0]?.uValueWm2K?.value).toBe(1.64);
      expect(undone.value.walls[0]?.uValueWm2K?.source).toBe('user');
      expect(undone.value.version).toBe(2);
    }
  });

  it('applyRestoration (undo) restores the FULL original Confidence (dpe-xml provenance)', () => {
    const building = makeBuilding();
    const result = building.apply(wallCommand, editCtx);
    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    const event = result.value.pullDomainEvents()[0];
    if (!(event instanceof BuildingUpdated)) throw new Error('expected BuildingUpdated');
    const entry = auditEntryFromEvent('entry-1', event);
    const restored = result.value.applyRestoration(entry, editCtx);
    expect(isRight(restored)).toBe(true);
    if (!isRight(restored)) return;
    const wall = restored.value.walls[0]?.uValueWm2K;
    expect(wall?.value).toBe(1.64);
    expect(wall?.source).toBe('dpe-xml:x');
    expect(wall?.confidence).toBe(1);
    expect(wall?.importDate).toEqual(date);
    // the restored aggregate is identical to the original (same input hash)
    expect(restored.value.toJson()).toEqual(building.toJson());
    expect(restored.value.version).toBe(2);
  });
});

describe('userSupplied confidence', () => {
  it('wraps with source "user" and confidence 1.0', () => {
    const c = userSupplied(0.3, date);
    expect(c.source).toBe('user');
    expect(c.confidence).toBe(1);
    expect(c.importDate).toEqual(date);
  });
});

describe('Building.fromJson version', () => {
  it('defaults to 0 and honors the explicit version (schema v3 column)', () => {
    const building = makeBuilding();
    const revived = Building.fromJson(building.toJson());
    expect(revived.version).toBe(0);
    const v3 = Building.fromJson(building.toJson(), 7);
    expect(v3.version).toBe(7);
    // version is not part of the persistence document (input-hash stability)
    expect('version' in building.toJson()).toBe(false);
  });
});
