import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixture = path.join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'packages/open3cl-adapter/test/fixtures/2238E0097309E.xml'
);

/**
 * Wave-1 A1 (UX audit US 2 + 3, issue #26): after an import the stacked page is
 * a tabbed workspace — « Synthèse » (landing), « Rapport d'import »,
 * « Éditeur du bâtiment », « Scénarios de rénovation » — with the primary
 * « Lancer la simulation » action and « Voir le modèle 3D » pinned in the
 * workspace header, always visible from any tab. The Synthèse tab shows the
 * latest result summary at the top and the inferred values in plain words
 * (« estimé — à vérifier »).
 */
test('after import the workspace shows tabs, a header primary action and the Synthèse landing tab', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');

  // header: primary action + 3D link, visible before any simulation
  await expect(page.getByTestId('workspace-header')).toBeVisible();
  await expect(page.getByTestId('run-simulation')).toBeVisible();
  await expect(page.getByTestId('run-simulation')).toContainText('Lancer la simulation');
  await expect(page.getByTestId('view-3d')).toBeVisible();

  // four tabs, Synthèse is the landing tab
  await expect(page.getByTestId('tab-synthese')).toBeVisible();
  await expect(page.getByTestId('tab-report')).toBeVisible();
  await expect(page.getByTestId('tab-editor')).toBeVisible();
  await expect(page.getByTestId('tab-scenarios')).toBeVisible();
  await expect(page.getByTestId('panel-synthese')).toBeVisible();
  await expect(page.getByTestId('panel-report')).toBeHidden();
  await expect(page.getByTestId('synthese-panel')).toBeVisible();
  // no simulation yet: empty state + inferred values in plain words
  await expect(page.getByTestId('simulation-empty')).toBeVisible();
  await expect(page.getByTestId('synthese-inferred-list')).toContainText('estimé — à vérifier');

  // one tab = one dominant region
  await page.getByTestId('tab-report').click();
  await expect(page.getByTestId('import-report')).toBeVisible();
  await expect(page.getByTestId('panel-synthese')).toBeHidden();
  // the header actions stay visible from any tab
  await expect(page.getByTestId('run-simulation')).toBeVisible();
  await expect(page.getByTestId('view-3d')).toBeVisible();

  await page.getByTestId('tab-editor').click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();

  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();
  // the primary action can be launched from any tab
  await page.getByTestId('run-simulation').click();
  await page.getByTestId('tab-synthese').click();
  await expect(page.getByTestId('simulation-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('energy-label')).toContainText('Énergie :');
  await expect(page.getByTestId('climate-label')).toContainText('Climat :');
  await expect(page.getByTestId('consumption-m2')).toContainText('kWh/m².an');
  await expect(page.getByTestId('emissions-m2')).toContainText('kg CO₂/m².an');
  await expect(page.getByTestId('simulation-detail')).toContainText('moteur Open3CL v');
  // history and raw engine JSON are behind expanders, not default-visible
  await expect(page.getByTestId('simulation-history')).toBeVisible();
  await expect(page.getByTestId('toggle-raw')).toBeVisible();
  await expect(page.getByTestId('raw-output')).toBeHidden();
});

test('« Voir le modèle 3D » in the workspace header opens the 3D viewer route', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await page.getByTestId('tab-scenarios').click();
  await page.getByTestId('view-3d').click();
  await expect(page).toHaveURL(/#\/building\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('viewer-3d')).toBeVisible({ timeout: 30_000 });
});

/**
 * Issue #42 (M2, mobile): the workspace tabs must stay reachable by touch on a
 * small screen — scrollable variant with scroll buttons instead of a hidden
 * overflow that clips tabs off-screen.
 */
test('mobile viewport: workspace tabs are scrollable, not clipped (issue #42)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  const tabsBar = page.getByTestId('workspace-tabs');
  await expect(tabsBar).toBeVisible();
  const scroller = tabsBar.locator('.MuiTabs-scroller');
  await expect(scroller).toHaveClass(/MuiTabs-scrollableX/);
  const info = await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="workspace-tabs"] .MuiTabs-scroller') as HTMLElement;
    const cs = getComputedStyle(scroller);
    return { overflowX: cs.overflowX, scrollButtons: document.querySelectorAll('[data-testid="workspace-tabs"] .MuiTabs-scrollButtons').length };
  });
  expect(info.overflowX).not.toBe('hidden');
  for (const id of ['tab-synthese', 'tab-report', 'tab-editor', 'tab-scenarios']) {
    await expect(page.getByTestId(id)).toBeAttached();
  }
});
