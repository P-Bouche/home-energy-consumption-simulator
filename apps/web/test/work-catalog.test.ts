import { describe, expect, it } from 'vitest';
import { buildCommand, catalogEntryFor } from '../src/components/command-catalog.ts';
import {
  catalogEntryForWork,
  commandTypesForWork,
  composeWorkCommand,
  elementOptionFor,
  elementOptionsForWork,
  targetsForWork,
  uNounForTargetKind,
  workEntryFor,
  WORK_CATALOG
} from '../src/services/work-catalog.ts';
import type { BuildingJson, WallJson, WindowJson } from '../src/types.ts';

const ORIENTATION = { '1': 'sud', '2': 'nord', '3': 'est', '4': 'ouest', '5': 'horizontal' };

function conf<T>(value: T) {
  return { value, source: 'dpe', confidence: 1, importDate: '2026-11-21T10:00:00.000Z' };
}

const wall: WallJson = {
  id: 'wall-1',
  buildingId: 'b1',
  kind: 'wall',
  description: conf('Mur en béton banché'),
  areaM2: conf(54.25),
  uValueWm2K: conf(1.64),
  orientation: conf('2'),
  wallType: conf('13'),
  adjacencyType: conf('1')
};

const window: WindowJson = {
  id: 'window-1',
  buildingId: 'b1',
  kind: 'window',
  description: conf('Fenêtre bois simple vitrage'),
  areaM2: conf(1.44),
  uValueWm2K: conf(4.5),
  orientation: conf('3'),
  count: conf(1),
  solarFactorSw: null,
  glazingType: null,
  frameMaterial: null
};

const building = {
  id: 'b1',
  walls: [wall],
  windows: [window],
  roofs: [],
  floors: [],
  heatingSystems: [
    {
      id: 'heating-1',
      buildingId: 'b1',
      description: conf('Chaudière gaz standard'),
      installationType: conf('4'),
      heatedAreaM2: conf(70)
    }
  ],
  ventilationSystems: []
} as unknown as BuildingJson;

describe('work-catalog service (work-first scenarios, US 10 / F7)', () => {
  it('exposes the six named works with their French labels', () => {
    expect(WORK_CATALOG.map((w) => w.label)).toEqual([
      'Isolation des murs',
      'Isolation de la toiture',
      'Isolation du plancher',
      'Remplacement des fenêtres',
      'Changement du chauffage',
      'Changement de la ventilation'
    ]);
  });

  it('maps each work to its command type(s) from the existing command catalog', () => {
    expect(commandTypesForWork('wall-insulation')).toEqual(['building.wall.update.v1']);
    expect(commandTypesForWork('roof-insulation')).toEqual(['building.roof.update.v1']);
    expect(commandTypesForWork('floor-insulation')).toEqual(['building.floor.update.v1']);
    expect(commandTypesForWork('window-replacement')).toEqual(['building.window.update.v1']);
    expect(commandTypesForWork('heating-change')).toEqual(['building.heating-system.update.v1']);
    expect(commandTypesForWork('ventilation-change')).toEqual(['building.ventilation-system.update.v1']);
    // every mapped type exists in the frozen catalog
    for (const w of WORK_CATALOG) {
      for (const type of w.commandTypes) {
        expect(catalogEntryFor(type)).toBeDefined();
      }
    }
    expect(workEntryFor('nope')).toBeUndefined();
    expect(commandTypesForWork('nope')).toEqual([]);
  });

  it('resolves the catalog entry (target kind + fields) behind each work', () => {
    expect(catalogEntryForWork('wall-insulation')?.targetKind).toBe('walls');
    expect(catalogEntryForWork('roof-insulation')?.targetKind).toBe('roofs');
    expect(catalogEntryForWork('floor-insulation')?.targetKind).toBe('floors');
    expect(catalogEntryForWork('window-replacement')?.targetKind).toBe('windows');
    expect(catalogEntryForWork('heating-change')?.targetKind).toBe('heatingSystems');
    expect(catalogEntryForWork('ventilation-change')?.targetKind).toBe('ventilationSystems');
    expect(catalogEntryForWork('nope')).toBeUndefined();
  });

  it('filters the target elements by the work target kind', () => {
    expect(targetsForWork('wall-insulation', building).map((t) => t.id)).toEqual(['wall-1']);
    expect(targetsForWork('window-replacement', building).map((t) => t.id)).toEqual(['window-1']);
    expect(targetsForWork('heating-change', building).map((t) => t.id)).toEqual(['heating-1']);
    expect(targetsForWork('roof-insulation', building)).toEqual([]);
    expect(targetsForWork('wall-insulation', null)).toEqual([]);
    expect(targetsForWork('nope', building)).toEqual([]);
  });

  it('labels a target by plain name + location: « Mur nord — 54,25 m² », raw id in secondary', () => {
    const option = elementOptionFor(wall, 'walls', { orientation: ORIENTATION });
    expect(option.primary).toBe('Mur nord — 54,25 m²');
    expect(option.secondary).toBe('wall-1 · Mur en béton banché');
    expect(elementOptionsForWork('wall-insulation', building, { orientation: ORIENTATION })).toEqual([option]);
  });

  it('keeps the raw orientation id when it is unknown to the DPE table (never guesses)', () => {
    const oddWall: WallJson = { ...wall, orientation: conf('99') };
    const option = elementOptionFor(oddWall, 'walls', { orientation: ORIENTATION });
    expect(option.primary).toBe('Mur 99 — 54,25 m²');
    // table not loaded yet (null): raw id as well
    expect(elementOptionFor(wall, 'walls', { orientation: null }).primary).toBe('Mur 2 — 54,25 m²');
  });

  it('labels elements without orientation/area with just the kind, and windows as « Fenêtre »', () => {
    const option = elementOptionFor(window, 'windows', { orientation: ORIENTATION });
    expect(option.primary).toBe('Fenêtre est — 1,44 m²');
    const heating = building.heatingSystems[0];
    expect(heating).toBeDefined();
    const heatingOption = elementOptionFor(heating as NonNullable<typeof heating>, 'heatingSystems', { orientation: ORIENTATION });
    expect(heatingOption.primary).toBe('Chauffage');
    expect(heatingOption.secondary).toBe('heating-1 · Chaudière gaz standard');
  });

  it('provides the guided U noun per target kind', () => {
    expect(uNounForTargetKind('walls')).toEqual({ noun: 'mur', gender: 'm' });
    expect(uNounForTargetKind('roofs')).toEqual({ noun: 'toiture', gender: 'f' });
    expect(uNounForTargetKind('windows')).toEqual({ noun: 'baie vitrée', gender: 'f' });
    expect(uNounForTargetKind('unknown')).toEqual({ noun: 'paroi', gender: 'f' });
  });

  it('composes byte-identical commands with the advanced command-row editor (buildCommand)', () => {
    const viaWork = composeWorkCommand('wall-insulation', 'wall-1', { uValueWm2K: '0.2' });
    const viaRow = buildCommand(catalogEntryFor('building.wall.update.v1')!, 'wall-1', { uValueWm2K: '0.2' });
    expect(viaWork).toEqual(viaRow);
    expect(viaWork).toEqual({ type: 'building.wall.update.v1', wallId: 'wall-1', uValueWm2K: 0.2 });

    const viaWorkEnum = composeWorkCommand('heating-change', 'heating-1', { installationType: '4' });
    const viaRowEnum = buildCommand(catalogEntryFor('building.heating-system.update.v1')!, 'heating-1', { installationType: '4' });
    expect(viaWorkEnum).toEqual(viaRowEnum);
    // enum ids stay strings: the domain validates string fields strictly
    expect(viaWorkEnum).toEqual({ type: 'building.heating-system.update.v1', systemId: 'heating-1', installationType: '4' });

    // empty values are skipped exactly like the advanced flow
    expect(composeWorkCommand('window-replacement', 'window-1', { uValueWm2K: '' })).toEqual({
      type: 'building.window.update.v1',
      windowId: 'window-1'
    });
    expect(composeWorkCommand('nope', 'wall-1', {})).toBeUndefined();
  });

  it('sends generatorType through the v2 command as a string (ADR-0004, issue #73 follow-up)', () => {
    // generatorType is v2-only: the v1 command rejects it as an unknown field
    expect(composeWorkCommand('heating-change', 'heating-1', { generatorType: '7' })).toEqual({
      type: 'building.heating-system.update.v2',
      systemId: 'heating-1',
      generatorType: '7'
    });
    // installation-only changes stay on v1
    expect(composeWorkCommand('heating-change', 'heating-1', { installationType: '4' })?.type).toBe(
      'building.heating-system.update.v1'
    );
  });
});
