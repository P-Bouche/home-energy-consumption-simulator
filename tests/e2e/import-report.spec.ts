import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixture = path.join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'packages/open3cl-adapter/test/fixtures/2238E0097309E.xml'
);

/**
 * AC-P1-05: uploading a DPE XML in the web UI shows the import report
 * (parsed / inferred with confidence / unrecognized / missing).
 *
 * Wave-1 A2 (UX US 6 + 11, issue #27): each report section is an Accordion
 * with its count in the header; inferred fields are trust-critical cards
 * (open by default); unrecognized paths collapse to « N chemins non
 * reconnus » with an expandable list + copy/download; the success banner
 * shows the human building label (DPE number), not the raw UUID.
 */
test('upload a DPE XML and see the import report', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  // US 11: human building label from the DPE number, raw id in monospace detail
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await expect(page.getByTestId('upload-success')).toContainText('DPE 2238E0097309E');
  await expect(page.getByTestId('building-id-detail')).toContainText(/[0-9a-f-]{36}/);
  // wave-1 A1: the report lives in the « Rapport d'import » tab of the workspace
  await page.getByTestId('tab-report').click();
  await expect(page.getByTestId('import-report')).toBeVisible();
  await expect(page.getByTestId('report-parsed')).toContainText('Champs lus');
  await expect(page.getByTestId('report-inferred')).toContainText('Champs inférés');
  await expect(page.getByTestId('report-unrecognized')).toContainText('non reconnus');
  await expect(page.getByTestId('report-missing')).toContainText('absents');
  // the inferred section is open by default (trust-critical cards): the
  // Synthèse tab also shows the inferred values (mounted but hidden), with
  // the same confidence score in plain words
  await expect(page.getByTestId('import-report').getByText('confiance 0.9').first()).toBeVisible();
  await expect(page.getByTestId('import-report')).toContainText('estimé — à vérifier');
});

test('report sections are collapsed accordions with counts; unrecognized paths collapse to a count with an expandable list and copy/download', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('DPE 2238E0097309E');
  await page.getByTestId('tab-report').click();
  await expect(page.getByTestId('import-report')).toBeVisible();

  // US 6: each section header carries its count; parsed/missing/unrecognized
  // start collapsed, inferred starts expanded
  await expect(page.getByTestId('report-parsed')).toContainText(/Champs lus \(\d+\)/);
  await expect(page.getByTestId('report-inferred')).toContainText(/Champs inférés \(\d+\)/);
  await expect(page.getByTestId('report-unrecognized')).toContainText(/\d+ chemins non reconnus/);
  await expect(page.getByTestId('report-missing')).toContainText(/Champs absents \(\d+\)/);
  await expect(page.getByTestId('parsed-list')).toBeHidden();
  await expect(page.getByTestId('missing-list')).toBeHidden();
  await expect(page.getByTestId('inferred-card').first()).toBeVisible();

  // expand « Champs lus »: the list appears and its size matches the header count
  await page.getByTestId('report-parsed').locator('.MuiAccordionSummary-root').click();
  await expect(page.getByTestId('parsed-list')).toBeVisible();
  const parsedHeader = await page.getByTestId('report-parsed').innerText();
  const parsedCount = Number(/\((\d+)\)/.exec(parsedHeader)?.[1]);
  expect(parsedCount).toBeGreaterThan(0);
  await expect(page.getByTestId('parsed-list').locator('li')).toHaveCount(parsedCount);

  // expand « N chemins non reconnus »: expandable list + copy/download actions
  await page.getByTestId('report-unrecognized').locator('.MuiAccordionSummary-root').click();
  const unrecognizedHeader = await page.getByTestId('report-unrecognized').innerText();
  const unrecognizedCount = Number(/(\d+) chemins non reconnus/.exec(unrecognizedHeader)?.[1]);
  expect(unrecognizedCount).toBeGreaterThan(0);
  await expect(page.getByTestId('unrecognized-list')).toBeHidden();
  await expect(page.getByTestId('copy-unrecognized')).toBeVisible();
  await expect(page.getByTestId('download-unrecognized')).toBeVisible();
  await page.getByTestId('unrecognized-toggle').click();
  await expect(page.getByTestId('unrecognized-list')).toBeVisible();
  await expect(page.getByTestId('unrecognized-list').locator('li')).toHaveCount(unrecognizedCount);
  // raw XML paths are never primary text: they render as monospace detail
  await expect(page.getByTestId('unrecognized-list').locator('code').first()).toContainText('dpe/');

  // copy action puts the full list on the clipboard
  await page.getByTestId('copy-unrecognized').click();
  await expect(page.getByTestId('copy-unrecognized')).toContainText('Copié !');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('dpe/');
  expect(clipboard.trim().split('\n')).toHaveLength(unrecognizedCount);
});

test('no internal phase tags leak into user-facing titles (US 11)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await page.getByTestId('tab-scenarios').click();
  await expect(page.getByTestId('scenario-panel')).toBeVisible();
  await expect(page.getByTestId('scenario-panel')).toContainText('Scénarios de rénovation');
  await expect(page.getByTestId('scenario-panel')).not.toContainText('(P5)');
});

test('uploading invalid XML shows the 422 error', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'bad.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from('<dpe><numero_dpe>broken')
  });
  await expect(page.getByTestId('upload-error')).toBeVisible();
});
