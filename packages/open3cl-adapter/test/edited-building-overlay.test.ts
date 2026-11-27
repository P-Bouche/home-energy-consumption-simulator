import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { xmlParser } from '@open3cl/engine/utils.js';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { buildEngineInput, hasUserEdits, Open3clAdapter, overlayUserEdits } from '@hes/open3cl-adapter';
import { isLeft, toSimulationView, type Building } from '@hes/domain';

const fixture = fileURLToPath(new URL('./fixtures/2238E0097309E.xml', import.meta.url));
const importDate = new Date('2026-11-20T10:00:00.000Z');

const importer = new DpeXmlImporter();
const adapter = new Open3clAdapter({ warn: () => undefined });

function importFixture(): Building {
  const xml = readFileSync(fixture, 'utf8');
  const { building } = importer.importDpeXml(xml, importDate);
  return building;
}

const editCtx = { now: new Date('2026-11-21T09:30:00.000Z'), userId: 'tester' };

describe('edited-building overlay path (P4 edits)', () => {
  it('an unedited imported building keeps the verbatim source path (no user edits)', () => {
    const building = importFixture();
    const mapping = buildEngineInput(toSimulationView(building));
    expect(mapping.verbatimSource).toBe(true);
    expect(mapping.editedSource).toBe(false);
    expect(mapping.input.kind).toBe('xml');
    expect(hasUserEdits(toSimulationView(building))).toBe(false);
  });

  it('an edited building (user wall U-value) is detected and overlaid onto the parsed source', () => {
    const building = importFixture();
    const edited = building.apply(
      { type: 'building.wall.update.v1', buildingId: building.id, wallId: 'wall-1', uValueWm2K: 0.2 },
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const view = toSimulationView(edited.value);
    expect(hasUserEdits(view)).toBe(true);
    const mapping = buildEngineInput(view);
    expect(mapping.editedSource).toBe(true);
    expect(mapping.verbatimSource).toBe(false);
    expect(mapping.input.kind).toBe('json');
    const json = mapping.input.kind === 'json' ? mapping.input.json : null;
    expect(json).not.toBeNull();
    const logement = (json as Record<string, unknown>)['logement'] as Record<string, unknown>;
    const env = logement['enveloppe'] as Record<string, unknown>;
    const murs = (env['mur_collection'] as Record<string, unknown>)['mur'] as Record<string, unknown>[];
    const de = murs[0]?.['donnee_entree'] as Record<string, unknown>;
    const di = murs[0]?.['donnee_intermediaire'] as Record<string, unknown>;
    expect(de['umur_saisi']).toBe(0.2);
    expect(de['enum_methode_saisie_u_id']).toBe('9');
    expect(di['umur']).toBe(0.2);
    expect(
      mapping.defaults.some((d) => d.path === 'mur/donnee_entree/umur_saisi' && d.source === 'user' && d.confidence === 1)
    ).toBe(true);
  });

  it('a heating v2 command overlays generatorType into generateur_chauffage (ADR-0004)', () => {
    const building = importFixture();
    const edited = building.apply(
      { type: 'building.heating-system.update.v2', buildingId: building.id, systemId: 'heating-1', generatorType: '97' },
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const view = toSimulationView(edited.value);
    expect(hasUserEdits(view)).toBe(true);
    const mapping = buildEngineInput(view);
    expect(mapping.editedSource).toBe(true);
    const json = mapping.input.kind === 'json' ? mapping.input.json : null;
    const logement = (json as Record<string, unknown>)['logement'] as Record<string, unknown>;
    const ic = (logement['installation_chauffage_collection'] as Record<string, unknown>)['installation_chauffage'] as Record<string, unknown>[];
    const genRaw = (ic[0]?.['generateur_chauffage_collection'] as Record<string, unknown>)['generateur_chauffage'];
    const gen = (Array.isArray(genRaw) ? genRaw[0] : genRaw) as Record<string, unknown>;
    const genDe = gen?.['donnee_entree'] as Record<string, unknown>;
    expect(genDe['enum_type_generateur_ch_id']).toBe('97');
    expect(
      mapping.defaults.some((d) => d.path.includes('enum_type_generateur_ch_id') && d.source === 'user' && d.value === '97')
    ).toBe(true);
    // issue #88: the overlay must patch the first array entry IN PLACE — the
    // source generator fields (energy, usage, intermediates) must survive,
    // otherwise the engine omits ep_conso_5_usages (422 MAPPING on simulate)
    expect(Array.isArray(genRaw)).toBe(true);
    expect(genDe['enum_type_energie_id']).toBe('2');
    expect(genDe['enum_usage_generateur_id']).toBe('3');
    const genDi = gen?.['donnee_intermediaire'] as Record<string, unknown> | undefined;
    expect(genDi).toBeDefined();
    expect(genDi?.['pn']).toBe(24000);
  });

  it('issue #88: a v2 generatorType edit still simulates (finite 5-usages consumption)', async () => {
    const building = importFixture();
    const edited = building.apply(
      { type: 'building.heating-system.update.v2', buildingId: building.id, systemId: 'heating-1', generatorType: '7' },
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const result = await adapter.simulateBuilding(edited.value);
    expect(Number.isFinite(result.consumptionKwh)).toBe(true);
    expect(result.consumptionKwh).toBeGreaterThan(0);
  });

  it('ADR-0006: a created heating system appends a source entry; a deleted one drops its entry, survivors keep their ids', () => {
    const building = importFixture();
    // create a second heating system (poêle) with a user generator type
    const created = building.apply(
      { type: 'building.heating-system.create.v1', buildingId: building.id, description: 'Poêle à bois', generatorType: '22', heatedAreaM2: 40 },
      editCtx
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let view = toSimulationView(created.value);
    let mapping = buildEngineInput(view);
    let json = mapping.input.kind === 'json' ? mapping.input.json : null;
    let logement = (json as Record<string, unknown>)['logement'] as Record<string, unknown>;
    let ics = (logement['installation_chauffage_collection'] as Record<string, unknown>)['installation_chauffage'];
    let icArr = (Array.isArray(ics) ? ics : [ics]) as Record<string, unknown>[];
    expect(icArr).toHaveLength(2);
    const gen0 = (icArr[1]?.['generateur_chauffage_collection'] as Record<string, unknown>)['generateur_chauffage'];
    const gen0Arr = Array.isArray(gen0) ? gen0 : [gen0];
    expect(((gen0Arr[0] as Record<string, unknown>)['donnee_entree'] as Record<string, unknown>)['enum_type_generateur_ch_id']).toBe('22');

    // now delete heating-1: the source entry must be dropped, heating-2 keeps its id
    const deleted = created.value.apply(
      { type: 'building.heating-system.delete.v1', buildingId: building.id, systemId: 'heating-1' },
      editCtx
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    view = toSimulationView(deleted.value);
    mapping = buildEngineInput(view);
    json = mapping.input.kind === 'json' ? mapping.input.json : null;
    logement = (json as Record<string, unknown>)['logement'] as Record<string, unknown>;
    ics = (logement['installation_chauffage_collection'] as Record<string, unknown>)['installation_chauffage'];
    icArr = (Array.isArray(ics) ? ics : [ics]) as Record<string, unknown>[];
    expect(icArr).toHaveLength(1);
    const de = (icArr[0]?.['donnee_entree'] as Record<string, unknown>);
    expect(de['description']).toBe('Poêle à bois');
    // no unmatched user edit was logged
    expect(mapping.defaults.some((d) => String(d.value).includes('NOT overlaid'))).toBe(false);
  });

  it('overlayUserEdits patches windows (uw_saisi) and rejects unknown elements at the domain level', () => {
    const building = importFixture();
    const bad = building.fork(
      [{ type: 'building.wall.update.v1', buildingId: building.id, wallId: 'wall-99', uValueWm2K: 2 }],
      editCtx
    );
    expect(isLeft(bad)).toBe(true);
    const edited = building.fork(
      [{ type: 'building.window.update.v1', buildingId: building.id, windowId: 'window-1', uValueWm2K: 1.1 }],
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const view = toSimulationView(edited.value);
    const xml = building.sourceDpeXml as string;
    const dpe = xmlParser.parse(xml)['dpe'] as Record<string, unknown>;
    const defaults = overlayUserEdits(dpe, view);
    const logement = dpe['logement'] as Record<string, unknown>;
    const env = logement['enveloppe'] as Record<string, unknown>;
    const baies = (env['baie_vitree_collection'] as Record<string, unknown>)['baie_vitree'] as Record<string, unknown>[];
    const de = baies[0]?.['donnee_entree'] as Record<string, unknown>;
    const di = baies[0]?.['donnee_intermediaire'] as Record<string, unknown>;
    expect(de['uw_saisi']).toBe(1.1);
    expect(di['uw']).toBe(1.1);
    expect(defaults.some((d) => d.path === 'baie_vitree/donnee_entree/uw_saisi')).toBe(true);
  });

  it('simulateBuilding on an edited building runs the engine with the user edit applied (consumption drops, label D→C, aggregate not mutated)', async () => {
    const building = importFixture();
    const baseline = await adapter.simulateBuilding(building);
    expect(baseline.energyLabel).toBe('D');

    const edited = building.fork(
      [{ type: 'building.wall.update.v1', buildingId: building.id, wallId: 'wall-1', uValueWm2K: 0.2 }],
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const after = await adapter.simulateBuilding(edited.value);

    expect(after.consumptionKwh).toBeLessThan(baseline.consumptionKwh);
    expect(after.emissionsKg).toBeLessThan(baseline.emissionsKg);
    expect(after.energyLabel).toBe('C');
    expect(building.walls[0]?.uValueWm2K?.value).toBe(1.6393);
    expect(building.walls[0]?.uValueWm2K?.source).toMatch(/^dpe-xml:/);
  }, 30_000);

  it('simulateBuilding on a window-replacement edit also lowers consumption', async () => {
    const building = importFixture();
    const baseline = await adapter.simulateBuilding(building);
    const edited = building.fork(
      [{ type: 'building.window.update.v1', buildingId: building.id, windowId: 'window-1', uValueWm2K: 1.1 }],
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const after = await adapter.simulateBuilding(edited.value);
    expect(after.consumptionKwh).toBeLessThan(baseline.consumptionKwh);
  }, 30_000);

  it('undo (applyRestoration) returns the field to its original dpe-xml provenance, so no overlay remains', async () => {
    const building = importFixture();
    const edited = building.apply(
      { type: 'building.wall.update.v1', buildingId: building.id, wallId: 'wall-1', uValueWm2K: 0.2 },
      editCtx
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const event = edited.value.pullDomainEvents()[0];
    const { auditEntryFromEvent, inverseOfAuditEntry } = await import('@hes/domain');
    if (!(event instanceof (await import('@hes/domain')).BuildingUpdated)) throw new Error('expected BuildingUpdated');
    const entry = auditEntryFromEvent('entry-1', event);
    const undone = edited.value.applyRestoration(entry, editCtx);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    const wall = undone.value.walls[0];
    expect(wall?.uValueWm2K?.value).toBe(1.6393);
    expect(wall?.uValueWm2K?.source).toMatch(/^dpe-xml:/);
    expect(wall?.uValueWm2K?.confidence).toBe(1);
    expect(hasUserEdits(toSimulationView(undone.value))).toBe(false);
    expect(inverseOfAuditEntry(entry).ok).toBe(true);
    // the undone building simulates through the plain verbatim path again
    const mapping = buildEngineInput(toSimulationView(undone.value));
    expect(mapping.verbatimSource).toBe(true);
    expect(mapping.editedSource).toBe(false);
  });
});
