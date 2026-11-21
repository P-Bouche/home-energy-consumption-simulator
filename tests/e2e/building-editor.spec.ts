import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixture = path.join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'packages/open3cl-adapter/test/fixtures/2238E0097309E.xml'
);

/**
 * AC-P4-01..04 (P4, 2D-first editor, memory:// API + Vite dev server started
 * by playwright.config.ts):
 * - AC-P4-01: edit a wall U-value → save → re-simulation runs through P2 and
 *   produces a NEW SimulationResult (input hash changed → cache miss).
 * - AC-P4-02: invalid edit (U = -1) → 400 field-level message, nothing persisted.
 * - AC-P4-03: audit view shows old→new values with source "user".
 * - AC-P4-04: undo restores the previous value, is audit-logged and re-simulates.
 */

interface SimulationHistoryPayload {
  results: { id: string; inputHash: string; createdAt: string; consumptionKwh: number; energyLabel: string }[];
}

async function importFixtureAndOpenEditor(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  // wave-1 A1: the editor lives in its own tab of the workspace
  await page.getByTestId('tab-editor').click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();
  await expect(page.getByTestId('building-version')).toContainText('version 0');
  const buildingId = (await page.getByTestId('building-id').textContent())?.trim() ?? '';
  expect(buildingId).not.toBe('');
  return buildingId;
}

test('AC-P4-02: invalid edit (negative U-value) is rejected with a field-level message and nothing is persisted', async ({ page }) => {
  const buildingId = await importFixtureAndOpenEditor(page);

  await page.getByTestId('edit-wall-wall-1').click();
  await page.getByTestId('field-uValueWm2K').fill('-1');
  await page.getByTestId('save-edit').click();

  // field-level message from the API (400 COMMAND_VALIDATION.fieldErrors)
  await expect(page.getByRole('dialog').locator('.MuiFormHelperText-root.Mui-error')).toContainText('must be in (0, 4]');
  // dialog stays open, version unchanged, audit empty
  await expect(page.getByTestId('building-version')).toContainText('version 0');
  await expect(page.getByTestId('audit-list')).toContainText('Aucune modification enregistrée');

  const audit = await page.request.get(`/api/buildings/${buildingId}/audit`);
  expect((await audit.json()).entries).toHaveLength(0);
  const building = await page.request.get(`/api/buildings/${buildingId}`);
  const walls = (await building.json()).building.walls as { uValueWm2K: { value: number; source: string } }[];
  expect(walls[0]?.uValueWm2K.value).toBeCloseTo(1.6393);
  expect(walls[0]?.uValueWm2K.source).toMatch(/^dpe-xml:/);
});

test('AC-P4-01 + AC-P4-03 + AC-P4-04: edit → save → re-simulate (cache miss) → audit shows old→new "user" → undo restores + re-simulates', async ({ page }) => {
  const buildingId = await importFixtureAndOpenEditor(page);

  // baseline simulation through the P2 endpoint (verbatim source document)
  await page.getByTestId('run-simulation').click();
  // wave-1 A1: the result summary renders at the top of the « Synthèse » tab
  await page.getByTestId('tab-synthese').click();
  await expect(page.getByTestId('simulation-result')).toBeVisible({ timeout: 30_000 });
  const history0 = (await (await page.request.get(`/api/buildings/${buildingId}/simulations`)).json()) as SimulationHistoryPayload;
  expect(history0.results).toHaveLength(1);
  const hash0 = history0.results[0]!.inputHash;
  const consumption0 = history0.results[0]!.consumptionKwh;
  const label0 = history0.results[0]!.energyLabel;

  // AC-P4-01: edit the wall U-value 1.6393 → 0.25 and save
  await page.getByTestId('tab-editor').click();
  await page.getByTestId('edit-wall-wall-1').click();
  await page.getByTestId('field-uValueWm2K').fill('0.25');
  await page.getByTestId('save-edit').click();

  await expect(page.getByTestId('building-version')).toContainText('version 1');
  // the editor store automatically re-ran the simulation through P2 — wait
  // until the new result row actually exists (the result panel was already
  // visible from the baseline run, so toBeVisible alone would not wait)
  await expect
    .poll(
      async () => {
        const h = (await (await page.request.get(`/api/buildings/${buildingId}/simulations`)).json()) as SimulationHistoryPayload;
        return h.results.length;
      },
      { timeout: 30_000 }
    )
    .toBe(2);
  // the refreshed result summary is on the « Synthèse » tab
  await page.getByTestId('tab-synthese').click();
  await expect(page.getByTestId('simulation-result')).toBeVisible({ timeout: 30_000 });

  // cache-miss proof: a NEW simulation result exists with a different input hash
  const history1 = (await (await page.request.get(`/api/buildings/${buildingId}/simulations`)).json()) as SimulationHistoryPayload;
  expect(history1.results.length).toBe(2);
  const hashes1 = history1.results.map((r) => r.inputHash);
  expect(hashes1).toContain(hash0);
  expect(hashes1.some((h) => h !== hash0)).toBe(true);
  // the re-simulation after the edit reflects the edit in the ENGINE INPUT:
  // insulating the wall (U 1.6393 → 0.25) must lower the consumption
  const newest = history1.results[0]!;
  expect(newest.inputHash).not.toBe(hash0);
  expect(newest.consumptionKwh).toBeLessThan(consumption0);
  expect(newest.energyLabel).not.toBe(label0); // label moved (D→C on this fixture)

  // the persisted wall value is user-sourced with confidence 1.0
  const building1 = await page.request.get(`/api/buildings/${buildingId}`);
  const walls1 = (await building1.json()).building.walls as {
    uValueWm2K: { value: number; source: string; confidence: number };
  }[];
  expect(walls1[0]?.uValueWm2K.value).toBe(0.25);
  expect(walls1[0]?.uValueWm2K.source).toBe('user');
  expect(walls1[0]?.uValueWm2K.confidence).toBe(1);

  // AC-P4-03: audit view shows the change old→new with source "user"
  await page.getByTestId('tab-editor').click();
  await expect(page.getByTestId('audit-list')).toContainText('building.wall.update.v1');
  const auditEntry = page.getByTestId('audit-entry').first();
  await expect(auditEntry).toContainText('uValueWm2K');
  await expect(auditEntry).toContainText('1.6393');
  await expect(auditEntry).toContainText('0.25');
  await expect(auditEntry).toContainText('[user, confiance 1]');

  // AC-P4-04: undo restores the previous value, is audit-logged, re-simulates
  await page.getByTestId('undo-button').click();
  await expect(page.getByTestId('building-version')).toContainText('version 2');

  const building2 = await page.request.get(`/api/buildings/${buildingId}`);
  const walls2 = (await building2.json()).building.walls as { uValueWm2K: { value: number; source: string } }[];
  expect(walls2[0]?.uValueWm2K.value).toBeCloseTo(1.6393);
  expect(walls2[0]?.uValueWm2K.source).toMatch(/^dpe-xml:/); // full original Confidence restored from the audit entry

  const audit2 = (await (await page.request.get(`/api/buildings/${buildingId}/audit`)).json()) as { entries: { commandType: string; version: number }[] };
  expect(audit2.entries).toHaveLength(2);
  expect(audit2.entries.map((e) => e.version)).toEqual([1, 2]);
  await expect(page.getByTestId('audit-list')).toContainText('v2');

  // re-simulation after undo: the restored aggregate is byte-identical to the
  // original (full Confidence restored from the audit entry), so the input
  // hash equals hash0 → cache HIT on the original result, no new row, no
  // engine re-run; the panel shows the cached original numbers again
  await expect(page.getByTestId('cached-badge')).toBeVisible({ timeout: 30_000 });
  const history2 = (await (await page.request.get(`/api/buildings/${buildingId}/simulations`)).json()) as SimulationHistoryPayload;
  expect(history2.results.length).toBe(2);
  expect(new Set(history2.results.map((r) => r.inputHash)).size).toBe(2);
  const original = history2.results.find((r) => r.inputHash === hash0)!;
  expect(original.consumptionKwh).toBeCloseTo(consumption0, 0); // back to baseline
  expect(original.energyLabel).toBe(label0);
  expect(original.consumptionKwh).toBeGreaterThan(newest.consumptionKwh); // undoing the insulation raises consumption again
});

test('stale If-Match is rejected with 409 and the UI reloads the current version', async ({ page }) => {
  const buildingId = await importFixtureAndOpenEditor(page);

  // first edit lands (version 0 → 1)
  await page.getByTestId('edit-wall-wall-1').click();
  await page.getByTestId('field-uValueWm2K').fill('0.25');
  await page.getByTestId('save-edit').click();
  await expect(page.getByTestId('building-version')).toContainText('version 1');

  // a second client edits with the stale version 0 → 409 from the API
  const conflict = await page.request.patch(`/api/buildings/${buildingId}`, {
    headers: { 'If-Match': '0', 'x-user-id': 'other-client', 'Content-Type': 'application/json' },
    data: { type: 'building.wall.update.v1', buildingId, wallId: 'wall-1', uValueWm2K: 0.9 }
  });
  expect(conflict.status()).toBe(409);
  const body = (await conflict.json()) as { code: string; expectedVersion: number; currentVersion: number };
  expect(body.code).toBe('STALE_VERSION');
  expect(body.expectedVersion).toBe(0);
  expect(body.currentVersion).toBe(1);

  // nothing extra persisted: still one audit entry, version still 1
  const audit = (await (await page.request.get(`/api/buildings/${buildingId}/audit`)).json()) as { entries: unknown[] };
  expect(audit.entries).toHaveLength(1);
  const building = await page.request.get(`/api/buildings/${buildingId}`);
  expect((await building.json()).version).toBe(1);
});
