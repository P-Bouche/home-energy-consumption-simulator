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
 */
test('upload a DPE XML and see the import report', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixture);
  await expect(page.getByTestId('upload-success')).toContainText('Bâtiment importé');
  await expect(page.getByTestId('import-report')).toBeVisible();
  await expect(page.getByTestId('report-parsed')).toContainText('Champs lus');
  await expect(page.getByTestId('report-inferred')).toContainText('Champs inférés');
  await expect(page.getByTestId('report-unrecognized')).toContainText('non reconnus');
  await expect(page.getByTestId('report-missing')).toContainText('absents');
  await expect(page.getByText('confiance 0.9').first()).toBeVisible();
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
