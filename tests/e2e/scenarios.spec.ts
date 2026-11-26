import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixture = path.join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'packages/open3cl-adapter/test/fixtures/2238E0097309E.xml'
);

/**
 * AC-P5-01/02/03 (UI side): import a DPE fixture → create 2 scenarios from the
 * command catalog → simulate both → compare → the table shows the correct
 * deltas (verified against the API payload recomputed independently) and the
 * label improvement D → C for the wall-insulation scenario.
 *
 * Wave-2 E (US 10 / F7): the command-row editor is now the « Mode avancé » of
 * the scenario form — this pre-existing test drives it through the advanced
 * toggle, with every original data-testid and assertion unchanged.
 */

/** MUI puts data-testid on the root element: text fields need the inner <input>, selects the combobox div. */
function inputOf(page: import('@playwright/test').Page, testId: string) {
  return page.getByTestId(testId).locator('input');
}

async function selectOption(page: import('@playwright/test').Page, testId: string, option: RegExp): Promise<void> {
  await page.getByTestId(testId).locator('div[role="combobox"]').click();
  await page.getByRole('option', { name: option }).first().click();
}

test('create 2 scenarios, compare, and the table shows correct deltas and the label change', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  // wave-1 A1: scenarios live in their own tab of the workspace
  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();

  // wave-2 E: the raw command-row editor is reachable behind the « Mode avancé » toggle
  await page.getByTestId('advanced-mode-toggle').click();
  await expect(page.getByTestId('command-row-0')).toBeVisible();

  const buildingId = (await page.getByTestId('building-id').textContent())?.trim() ?? '';
  expect(buildingId).not.toBe('');

  // --- scenario 1: wall insulation (U = 0.2) ---
  await inputOf(page, 'new-scenario-name').fill('Isolation des murs');
  await inputOf(page, 'new-scenario-description').fill('Murs isolés (U = 0,2 W/m².K)');
  await selectOption(page, 'command-type-0', /mur/i);
  await selectOption(page, 'command-target-0', /wall-1/);
  const uFieldBox = await inputOf(page, 'command-field-0-uValueWm2K').boundingBox();
  expect(uFieldBox?.width).toBeGreaterThan(80);
  await inputOf(page, 'command-field-0-uValueWm2K').fill('0.2');
  await page.getByTestId('create-scenario-button').click();
  await expect(page.locator('[data-testid^="scenario-row-"]')).toHaveCount(1);

  // --- scenario 2: window replacement (Uw = 1.1) ---
  await inputOf(page, 'new-scenario-name').fill('Remplacement des fenêtres');
  await selectOption(page, 'command-type-0', /fenêtre/i);
  await selectOption(page, 'command-target-0', /window-1/);
  await inputOf(page, 'command-field-0-uValueWm2K').fill('1.1');
  await page.getByTestId('create-scenario-button').click();
  await expect(page.locator('[data-testid^="scenario-row-"]')).toHaveCount(2);

  // wait for both scenarios to appear in the list
  const list = await page.request.get(`/api/buildings/${buildingId}/scenarios`);
  expect(list.ok()).toBe(true);
  const scenarios = ((await list.json()) as { scenarios: { id: string; name: string }[] }).scenarios;
  expect(scenarios).toHaveLength(2);
  const wallScenario = scenarios.find((s) => s.name === 'Isolation des murs')!;
  const windowScenario = scenarios.find((s) => s.name === 'Remplacement des fenêtres')!;
  await expect(page.getByTestId(`scenario-row-${wallScenario.id}`)).toBeVisible();
  await expect(page.getByTestId(`scenario-row-${windowScenario.id}`)).toBeVisible();

  // --- simulate both through the UI ---
  await page.getByTestId(`simulate-scenario-${wallScenario.id}`).click();
  await expect(page.getByTestId(`scenario-label-${wallScenario.id}`)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`simulate-scenario-${windowScenario.id}`).click();
  await expect(page.getByTestId(`scenario-label-${windowScenario.id}`)).toBeVisible({ timeout: 30_000 });

  // --- compare ---
  await page.getByTestId('compare-button').click();
  await expect(page.getByTestId('comparison-table')).toBeVisible({ timeout: 30_000 });

  // API payload, deltas recomputed independently
  const compareRes = await page.request.post(`/api/buildings/${buildingId}/compare`, { data: {} });
  expect(compareRes.ok()).toBe(true);
  const cmp = (await compareRes.json()) as {
    baseline: { consumptionKwh: number; emissionsKg: number; energyLabel: string };
    entries: {
      scenarioId: string;
      deltaKwh: number;
      deltaKgCo2: number;
      energyLabelChange: { from: string; to: string } | null;
      rank: number;
      result: { consumptionKwh: number; emissionsKg: number; energyLabel: string };
    }[];
  };
  expect(cmp.entries).toHaveLength(2);
  for (const entry of cmp.entries) {
    expect(entry.deltaKwh).toBeCloseTo(entry.result.consumptionKwh - cmp.baseline.consumptionKwh, 6);
    expect(entry.deltaKgCo2).toBeCloseTo(entry.result.emissionsKg - cmp.baseline.emissionsKg, 6);
  }

  // baseline row pinned and labeled
  await expect(page.getByTestId('comparison-row-baseline')).toBeVisible();
  await expect(page.getByTestId('baseline-energy-label')).toContainText(cmp.baseline.energyLabel);

  // wall-insulation scenario: label improvement D → C (AC-P5-02) + correct delta in the table (AC-P5-01)
  const wallEntry = cmp.entries.find((e) => e.scenarioId === wallScenario.id)!;
  expect(wallEntry.energyLabelChange).toEqual({ from: 'D', to: 'C' });
  await expect(page.getByTestId(`entry-energy-label-${wallScenario.id}`)).toContainText('C');
  await expect(page.getByTestId(`label-change-${wallScenario.id}`)).toContainText('D → C');
  await expect(page.getByTestId(`rank-${wallScenario.id}`)).toContainText('1'); // most kWh saved → rank 1

  const domDelta = (await page.getByTestId(`delta-kwh-${wallScenario.id}`).textContent()) ?? '';
  const parsed = Number(domDelta.replace(/[^\d,-]/g, '').replace(',', '.'));
  expect(Math.abs(parsed - wallEntry.deltaKwh)).toBeLessThan(0.05);

  // window scenario row present with its own delta
  const windowEntry = cmp.entries.find((e) => e.scenarioId === windowScenario.id)!;
  await expect(page.getByTestId(`comparison-row-${windowScenario.id}`)).toBeVisible();
  const domDeltaW = (await page.getByTestId(`delta-kwh-${windowScenario.id}`).textContent()) ?? '';
  const parsedW = Number(domDeltaW.replace(/[^\d,-]/g, '').replace(',', '.'));
  expect(Math.abs(parsedW - windowEntry.deltaKwh)).toBeLessThan(0.05);

  // AC-P5-03 (UI side): apply the wall-insulation scenario → version bump + audit row + baseline re-simulated
  await page.getByTestId(`apply-scenario-${wallScenario.id}`).click();
  await expect(page.getByTestId('apply-success')).toContainText('version 0 → 1', { timeout: 30_000 });
  const buildingAfter = await page.request.get(`/api/buildings/${buildingId}`);
  expect(buildingAfter.ok()).toBe(true);
  expect((await buildingAfter.json()).version).toBe(1);
  const wallAfter = ((await buildingAfter.json()).building.walls as { uValueWm2K: { value: number; source: string } | null }[])[0];
  expect(wallAfter?.uValueWm2K).toMatchObject({ value: 0.2, source: 'user' });
  const audit = await page.request.get(`/api/buildings/${buildingId}/audit`);
  expect(((await audit.json()) as { entries: { commandType: string; version: number }[] }).entries).toHaveLength(1);

  // AC-P5-04 (UI side): deleting a scenario keeps the building and the other scenario
  await page.getByTestId(`delete-scenario-${windowScenario.id}`).click();
  await expect(page.getByTestId(`scenario-row-${windowScenario.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`scenario-row-${wallScenario.id}`)).toBeVisible();
  const building = await page.request.get(`/api/buildings/${buildingId}`);
  expect(building.ok()).toBe(true);
});

/**
 * Issue #73 (bug): in advanced mode, « Type de générateur » must be a labeled
 * select fed by the vendored `generatorType` enum table — previously the
 * scenario panel never fetched that kind, so the select had no options.
 */
test('issue #73: advanced mode — « Type de générateur » is a labeled select with enum options', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();

  await page.getByTestId('advanced-mode-toggle').click();
  await expect(page.getByTestId('command-row-0')).toBeVisible();
  await selectOption(page, 'command-type-0', /chaudière/i);

  const combo = page.getByTestId('command-field-0-generatorType').locator('div[role="combobox"]');
  await combo.click();
  // « Non modifié » + the vendored labeled generator ids (raw id kept in secondary)
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(await page.getByRole('option').count()).toBeGreaterThan(3);

  // close the listbox before moving on: its backdrop would intercept the next clicks
  await page.keyboard.press('Escape');

  // selecting a generator must produce a v2 command (ADR-0004) — v1 rejects the field
  const buildingId = (await page.getByTestId('building-id').textContent())?.trim() ?? '';
  await selectOption(page, 'command-target-0', /heating-1/);
  await selectOption(page, 'command-field-0-generatorType', /pac air\/eau installée après 2017/);
  await inputOf(page, 'new-scenario-name').fill('Pompe à chaleur air/eau');
  await page.getByTestId('create-scenario-button').click();
  await expect(page.locator('[data-testid^="scenario-row-"]')).toHaveCount(1);
  const list = await page.request.get(`/api/buildings/${buildingId}/scenarios`);
  const scenarios = ((await list.json()) as { scenarios: { commands: unknown[] }[] }).scenarios;
  expect(scenarios[0].commands).toEqual([
    { type: 'building.heating-system.update.v2', buildingId, systemId: 'heating-1', generatorType: '7' }
  ]);
});

/**
 * Issue #74 (bug): toggling the form between « travaux » and « avancé » must
 * not lose the in-progress draft — both modes now edit the same frozen
 * commands, converted on toggle.
 */
test('issue #74: mode toggle keeps the in-progress work row', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();

  await selectOption(page, 'work-type-0', /Remplacement des fenêtres/i);
  await selectOption(page, 'work-target-0', /Fenêtre ouest/);
  await inputOf(page, 'work-field-0-uValueWm2K').fill('1.1');

  await page.getByTestId('advanced-mode-toggle').click();
  await expect(page.getByTestId('command-row-0')).toBeVisible();
  await expect(inputOf(page, 'command-field-0-uValueWm2K')).toHaveValue('1.1');

  await page.getByTestId('advanced-mode-toggle').click();
  await expect(page.getByTestId('work-row-0')).toBeVisible();
  await expect(inputOf(page, 'work-field-0-uValueWm2K')).toHaveValue('1.1');
});

/**
 * Wave-2 E (UX US 10 / F7): work-first creation — two scenarios built from
 * named works (« Isolation des murs », « Remplacement des fenêtres »), the
 * target picked by plain name/location (« Mur nord — 54,25 m² »), the U via
 * the guided field. The stored payloads must be byte-identical to the frozen
 * command vocabulary (field by field), then both scenarios are simulated and
 * compared through the UI.
 */
test('work-first flow: create 2 scenarios from named works, byte-identical payloads, compare', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();

  const buildingId = (await page.getByTestId('building-id').textContent())?.trim() ?? '';
  expect(buildingId).not.toBe('');

  // work-first is the default mode of the form
  await expect(page.getByTestId('work-row-0')).toBeVisible();

  // --- scenario 1: « Isolation des murs » on « Mur nord — 54,25 m² », U = 0.2 ---
  await inputOf(page, 'new-scenario-name').fill('Isolation des murs');
  await inputOf(page, 'new-scenario-description').fill('Murs isolés (U = 0,2 W/m².K)');
  await selectOption(page, 'work-type-0', /Isolation des murs/i);
  await selectOption(page, 'work-target-0', /Mur nord — 54,25 m²/);
  const uFieldBox = await inputOf(page, 'work-field-0-uValueWm2K').boundingBox();
  expect(uFieldBox?.width).toBeGreaterThan(80);
  await inputOf(page, 'work-field-0-uValueWm2K').fill('0.2');
  await page.getByTestId('create-scenario-button').click();
  await expect(page.locator('[data-testid^="scenario-row-"]')).toHaveCount(1);

  // --- scenario 2: « Remplacement des fenêtres » on « Fenêtre ouest — 2,21 m² », Uw = 1.1 ---
  await inputOf(page, 'new-scenario-name').fill('Remplacement des fenêtres');
  await selectOption(page, 'work-type-0', /Remplacement des fenêtres/i);
  await selectOption(page, 'work-target-0', /Fenêtre ouest — 2,21 m²/);
  await inputOf(page, 'work-field-0-uValueWm2K').fill('1.1');
  await page.getByTestId('create-scenario-button').click();
  await expect(page.locator('[data-testid^="scenario-row-"]')).toHaveCount(2);

  // --- byte-identity: the stored command lists match the frozen payload field by field ---
  const list = await page.request.get(`/api/buildings/${buildingId}/scenarios`);
  expect(list.ok()).toBe(true);
  const scenarios = ((await list.json()) as { scenarios: { id: string; name: string; commands: unknown[] }[] }).scenarios;
  expect(scenarios).toHaveLength(2);
  const wallScenario = scenarios.find((s) => s.name === 'Isolation des murs')!;
  const windowScenario = scenarios.find((s) => s.name === 'Remplacement des fenêtres')!;
  expect(wallScenario.commands).toEqual([
    { type: 'building.wall.update.v1', buildingId, wallId: 'wall-1', uValueWm2K: 0.2 }
  ]);
  expect(windowScenario.commands).toEqual([
    { type: 'building.window.update.v1', buildingId, windowId: 'window-1', uValueWm2K: 1.1 }
  ]);

  // --- simulate both through the UI, then compare ---
  await page.getByTestId(`simulate-scenario-${wallScenario.id}`).click();
  await expect(page.getByTestId(`scenario-label-${wallScenario.id}`)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`simulate-scenario-${windowScenario.id}`).click();
  await expect(page.getByTestId(`scenario-label-${windowScenario.id}`)).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('compare-button').click();
  await expect(page.getByTestId('comparison-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`comparison-row-${wallScenario.id}`)).toBeVisible();
  await expect(page.getByTestId(`comparison-row-${windowScenario.id}`)).toBeVisible();

  // same comparison content as the advanced flow: label improvement D → C, rank 1 for the wall work
  await expect(page.getByTestId(`label-change-${wallScenario.id}`)).toContainText('D → C');
  await expect(page.getByTestId(`rank-${wallScenario.id}`)).toContainText('1');
});
