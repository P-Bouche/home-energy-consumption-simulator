import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixture = path.join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'packages/open3cl-adapter/test/fixtures/2238E0097309E.xml'
);

/**
 * AC-P2-03: import a DPE fixture → run the simulation in the UI → the labels
 * and figures shown in the results panel match the API payload exactly.
 * AC-P2-04 (UI side): running again shows the cached badge.
 */
test('run a simulation from the UI and the panel matches the API payload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await expect(page.getByTestId('simulation-panel')).toBeVisible();

  await page.getByTestId('run-simulation').click();
  await expect(page.getByTestId('simulation-result')).toBeVisible({ timeout: 30_000 });

  const buildingId = (await page.getByTestId('building-id').textContent())?.trim() ?? '';
  expect(buildingId).not.toBe('');

  const history = await page.request.get(`/api/buildings/${buildingId}/simulations`);
  expect(history.ok()).toBe(true);
  const payload = (await history.json()) as {
    results: {
      energyLabel: string;
      climateLabel: string;
      consumptionKwhM2An: number | null;
      emissionsKgCo2M2An: number | null;
      engineVersion: string;
    }[];
  };
  expect(payload.results.length).toBe(1);
  const api = payload.results[0]!;

  await expect(page.getByTestId('energy-label')).toContainText(`Énergie : ${api.energyLabel}`);
  await expect(page.getByTestId('climate-label')).toContainText(`Climat : ${api.climateLabel}`);
  if (api.consumptionKwhM2An !== null) {
    await expect(page.getByTestId('consumption-m2')).toContainText(`${api.consumptionKwhM2An} kWh/m².an`);
  }
  if (api.emissionsKgCo2M2An !== null) {
    await expect(page.getByTestId('emissions-m2')).toContainText(`${api.emissionsKgCo2M2An} kg CO₂/m².an`);
  }
  await expect(page.getByTestId('simulation-detail')).toContainText(`Open3CL v${api.engineVersion}`);

  const rawToggle = page.getByTestId('toggle-raw');
  await rawToggle.click();
  await expect(page.getByTestId('raw-output')).toBeVisible();

  // AC-P2-04: re-running an identical building is served from the cache
  await page.getByTestId('run-simulation').click();
  await expect(page.getByTestId('cached-badge')).toBeVisible({ timeout: 30_000 });
  const historyAfter = await page.request.get(`/api/buildings/${buildingId}/simulations`);
  const payloadAfter = (await historyAfter.json()) as { results: unknown[] };
  expect(payloadAfter.results.length).toBe(1); // same result row, engine not re-run
});
