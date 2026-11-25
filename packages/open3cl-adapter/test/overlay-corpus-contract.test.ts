import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import {
  assertOverlayCoversUserEdits,
  buildEngineInput,
  Open3clAdapter,
  overlayUserEdits
} from '@hes/open3cl-adapter';
import {
  SimulationMappingError,
  toSimulationView,
  USER_SOURCE,
  userSupplied,
  type Building,
  type BuildingCommand,
  type BuildingSimulationView
} from '@hes/domain';
import { xmlParser } from '@open3cl/engine/utils.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.xml')).sort();
const importDate = new Date('2026-11-20T10:00:00.000Z');
const editCtx = { now: new Date('2026-11-21T09:30:00.000Z'), userId: 'corpus-test' };

const importer = new DpeXmlImporter();
const adapter = new Open3clAdapter({ warn: () => undefined });

function importFixture(file: string): Building {
  const xml = readFileSync(path.join(fixturesDir, file), 'utf8');
  const { building } = importer.importDpeXml(xml, importDate);
  building.pullDomainEvents();
  return building;
}

/**
 * Per element kind: the P4 command tag + id field, the engine collection path
 * in the parsed DPE document, and the saisie field the overlay must write.
 * The importer assigns `<kind>-<i+1>` ids in document order (mappers.ts), so
 * `wall-3` MUST address index 2 of `mur_collection.mur` — this test makes that
 * positional assumption explicit and corpus-wide.
 */
const KINDS = [
  {
    kind: 'wall',
    collection: ['logement', 'enveloppe', 'mur_collection', 'mur'],
    tag: 'building.wall.update.v1',
    idField: 'wallId',
    saisie: 'umur_saisi',
    saisieEnum: { key: 'enum_methode_saisie_u_id', value: '9' }
  },
  {
    kind: 'roof',
    collection: ['logement', 'enveloppe', 'plancher_haut_collection', 'plancher_haut'],
    tag: 'building.roof.update.v1',
    idField: 'roofId',
    saisie: 'uph_saisi',
    saisieEnum: { key: 'enum_methode_saisie_u_id', value: '9' }
  },
  {
    kind: 'floor',
    collection: ['logement', 'enveloppe', 'plancher_bas_collection', 'plancher_bas'],
    tag: 'building.floor.update.v1',
    idField: 'floorId',
    saisie: 'upb_saisi',
    saisieEnum: { key: 'enum_methode_saisie_u_id', value: '9' }
  },
  {
    kind: 'window',
    collection: ['logement', 'enveloppe', 'baie_vitree_collection', 'baie_vitree'],
    tag: 'building.window.update.v1',
    idField: 'windowId',
    saisie: 'uw_saisi',
    saisieEnum: null // the engine honors uw_saisi directly (3.3_baie_vitree.js: no enum switch)
  }
] as const;

function makeUCommand(
  spec: (typeof KINDS)[number],
  buildingId: string,
  elementId: string,
  uValueWm2K: number
): BuildingCommand {
  switch (spec.tag) {
    case 'building.wall.update.v1':
      return { type: spec.tag, buildingId, wallId: elementId, uValueWm2K };
    case 'building.roof.update.v1':
      return { type: spec.tag, buildingId, roofId: elementId, uValueWm2K };
    case 'building.floor.update.v1':
      return { type: spec.tag, buildingId, floorId: elementId, uValueWm2K };
    case 'building.window.update.v1':
      return { type: spec.tag, buildingId, windowId: elementId, uValueWm2K };
  }
}

function viewCollection(view: BuildingSimulationView, kind: string): readonly { id: string }[] {
  switch (kind) {
    case 'wall': return view.walls;
    case 'roof': return view.roofs;
    case 'floor': return view.floors;
    case 'window': return view.windows;
    default: throw new Error(`unknown kind ${kind}`);
  }
}

function engineCollection(json: Record<string, unknown>, pathParts: readonly string[]): Record<string, unknown>[] {
  let node: unknown = json;
  for (const part of pathParts) {
    node = (node as Record<string, unknown>)[part];
  }
  return node as Record<string, unknown>[];
}

describe('corpus-wide importer ↔ overlay contract (positional id mapping)', () => {
  it('every fixture is present', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of fixtureFiles) {
    it(`${file}: every user-edited element of every kind lands on the intended source collection entry`, () => {
      const building = importFixture(file);
      const view = toSimulationView(building);
      for (const spec of KINDS) {
        const elements = viewCollection(view, spec.kind);
        if (elements.length === 0) continue;
        // one command per element, each with a distinctive marker U-value
        const commands: BuildingCommand[] = elements.map((el, i) =>
          makeUCommand(spec, building.id, el.id, 0.11 + i * 0.01)
        );
        const forked = building.fork(commands, editCtx);
        if (!forked.ok) {
          throw new Error(`fork failed for ${file} ${spec.kind}: ${JSON.stringify(forked.error)}`);
        }
        const editedView = toSimulationView(forked.value);
        assertOverlayCoversUserEdits(editedView); // must not throw for vocabulary commands
        const mapping = buildEngineInput(editedView);
        expect(mapping.editedSource).toBe(true);
        if (mapping.input.kind !== 'json') throw new Error('expected json engine input');
        const items = engineCollection(mapping.input.json, spec.collection);
        // positional contract: element id `<kind>-N` → collection index N-1
        elements.forEach((el, i) => {
          const expectedIndex = Number(/^(\d+)$/.exec(el.id.split('-')[1] ?? '')?.[1] ?? '') - 1;
          expect(el.id).toBe(`${spec.kind}-${i + 1}`); // importer assigns ids in document order
          const entry = items[expectedIndex];
          const de = entry?.['donnee_entree'] as Record<string, unknown> | undefined;
          expect(de?.[spec.saisie]).toBeCloseTo(0.11 + i * 0.01, 10);
          if (spec.saisieEnum !== null) {
            expect(de?.[spec.saisieEnum.key]).toBe(spec.saisieEnum.value);
          }
          // the overlay is logged, never silent
          expect(
            mapping.defaults.some(
              (d) => d.source === USER_SOURCE && d.value === de?.[spec.saisie] && d.path.includes(spec.saisie)
            )
          ).toBe(true);
        });
        // no element was left unmatched
        expect(mapping.defaults.some((d) => String(d.value).includes('NOT overlaid'))).toBe(false);
      }
    });
  }

  it('an unmatched user-edited element id is LOGGED, never silently skipped', () => {
    const building = importFixture(fixtureFiles[0] as string);
    const view = toSimulationView(building);
    // hand-build a view whose wall id cannot match any source entry
    const forged = {
      ...view,
      walls: view.walls.map((w, i) =>
        i === 0 ? { ...w, uValueWm2K: userSupplied(0.2, editCtx.now) , id: 'wall-999' } : w
      )
    };
    const xml = building.sourceDpeXml as string;
    const dpe = xmlParser.parse(xml)['dpe'] as Record<string, unknown>;
    const defaults = overlayUserEdits(dpe, forged);
    const unmatched = defaults.find((d) => String(d.value).includes('NOT overlaid'));
    expect(unmatched).toBeDefined();
    expect(unmatched?.path).toContain('wall-999');
    expect(unmatched?.source).toBe(USER_SOURCE);
  });

  it('a user-sourced field OUTSIDE the overlay-covered collections fails loudly (SimulationMappingError)', () => {
    const building = importFixture(fixtureFiles[0] as string);
    const view = toSimulationView(building);
    const forged = { ...view, livingAreaM2: userSupplied(123, editCtx.now) };
    expect(() => assertOverlayCoversUserEdits(forged)).toThrow(SimulationMappingError);
    expect(() => assertOverlayCoversUserEdits(forged)).toThrow(/livingAreaM2/);
    // buildEngineInput must refuse too (edited-source path, uncovered edit)
    expect(() => buildEngineInput(forged)).toThrow(SimulationMappingError);
  });

  // ADR-0006: cardinality changes — append (create) and drop (delete) of heating entries
  it('ADR-0006 corpus contract: create appends an entry, delete drops it, survivors keep their ids', () => {
    for (const file of fixtureFiles) {
      const building = importFixture(file);
      if (building.heatingSystems.length === 0) continue;
      // create a second heating system via the domain command
      const created = building.apply(
        {
          type: 'building.heating-system.create.v1',
          buildingId: building.id,
          description: 'Complément',
          generatorType: '42', heatedAreaM2: 40
        },
        editCtx
      );
      expect(created.ok, file).toBe(true);
      if (!created.ok) continue;
      const viewCreated = toSimulationView(created.value);
      const mapping = buildEngineInput(viewCreated);
      const json = mapping.input.kind === 'json' ? mapping.input.json : null;
      const logement = (json as Record<string, unknown>)['logement'] as Record<string, unknown>;
      const icsRaw = (logement['installation_chauffage_collection'] as Record<string, unknown>)['installation_chauffage'];
      const ics = (Array.isArray(icsRaw) ? icsRaw : [icsRaw]) as Record<string, unknown>[];
      expect(ics.length, `append ${file}`).toBe(building.heatingSystems.length + 1);
      const last = ics[ics.length - 1] as Record<string, unknown>;
      const genRaw = (last['generateur_chauffage_collection'] as Record<string, unknown>)['generateur_chauffage'];
      const gen = (Array.isArray(genRaw) ? genRaw[0] : genRaw) as Record<string, unknown>;
      expect(((gen['donnee_entree'] as Record<string, unknown>)['enum_type_generateur_ch_id']), `generator ${file}`).toBe('42');

      // delete the first system: its source entry is dropped, the created one stays
      const deleted = created.value.apply(
        { type: 'building.heating-system.delete.v1', buildingId: building.id, systemId: 'heating-1' },
        editCtx
      );
      expect(deleted.ok, file).toBe(true);
      if (!deleted.ok) continue;
      const mapping2 = buildEngineInput(toSimulationView(deleted.value));
      const json2 = mapping2.input.kind === 'json' ? mapping2.input.json : null;
      const logement2 = (json2 as Record<string, unknown>)['logement'] as Record<string, unknown>;
      const ics2Raw = (logement2['installation_chauffage_collection'] as Record<string, unknown>)['installation_chauffage'];
      const ics2 = (Array.isArray(ics2Raw) ? ics2Raw : [ics2Raw]) as Record<string, unknown>[];
      expect(ics2.length, `drop ${file}`).toBe(building.heatingSystems.length);
      // the created system is appended last and keeps its user description
      const last2 = ics2[ics2.length - 1] as Record<string, unknown>;
      expect((last2?.['donnee_entree'] as Record<string, unknown>)['description'], `created survivor ${file}`).toBe('Complément');
      expect(mapping2.defaults.some((d) => String(d.value).includes('NOT overlaid')), `unmatched ${file}`).toBe(false);
    }
  });
});

describe('uw_saisi is honored by the engine across the corpus (windows)', () => {
  const filesWithWindows = fixtureFiles.filter((file) => {
    const building = importFixture(file);
    return building.windows.length > 0;
  });

  it('fixtures with windows exist', () => {
    expect(filesWithWindows.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of filesWithWindows) {
    it(`${file}: replacing every window's U with 1.1 strictly lowers the simulated consumption (uw_saisi consumed)`, async () => {
      const building = importFixture(file);
      const baseline = await adapter.simulateBuilding(building);
      const commands: BuildingCommand[] = building.windows.map((w) => ({
        type: 'building.window.update.v1',
        buildingId: building.id,
        windowId: w.id,
        uValueWm2K: 1.1
      }));
      const forked = building.fork(commands, editCtx);
      if (!forked.ok) throw new Error(`fork failed: ${JSON.stringify(forked.error)}`);
      const after = await adapter.simulateBuilding(forked.value);
      expect(after.consumptionKwh).toBeLessThan(baseline.consumptionKwh);
      expect(after.emissionsKg).toBeLessThanOrEqual(baseline.emissionsKg);
    }, 60_000);
  }
});
