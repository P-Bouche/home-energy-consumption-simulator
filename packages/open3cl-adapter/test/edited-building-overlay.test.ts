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
