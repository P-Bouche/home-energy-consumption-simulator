import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesDir = path.join(repoRoot, 'packages/open3cl-adapter/test/fixtures');
const incompleteFixture = path.join(repoRoot, 'packages/dpe-xml-importer/test/fixtures/incomplete-dpe.xml');

interface GeometryApi {
  buildingId: string;
  geometry: {
    meshHash: string;
    inferenceRulesVersion: string;
    elements: { id: string; kind: string; inferred: boolean }[];
  };
}

async function uploadViaApi(page: import('@playwright/test').Page, xml: string, name: string): Promise<string> {
  return page.evaluate(
    async ([xmlContent, fileName]) => {
      const form = new FormData();
      form.append('file', new Blob([xmlContent], { type: 'text/xml' }), fileName);
      const res = await fetch('/api/imports/dpe', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload failed with status ${res.status}`);
      const body = (await res.json()) as { buildingId: string };
      return body.buildingId;
    },
    [xml, name]
  );
}

async function fetchGeometry(page: import('@playwright/test').Page, buildingId: string): Promise<GeometryApi['geometry']> {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/buildings/${id}/geometry`);
    if (!res.ok) throw new Error(`geometry fetch failed with status ${res.status}`);
    const body = (await res.json()) as GeometryApi;
    return body.geometry;
  }, buildingId);
}

/**
 * AC-P3-03 + AC-P3-04 (incomplete fixture → guaranteed inferred elements):
 * the viewer renders, inferred elements are marked, the hover tooltip shows
 * { source, confidence }, and clicking an element shows its properties.
 */
test('viewer renders the building, marks inferred elements, tooltip + picking work', async ({ page }) => {
  const xml = readFileSync(incompleteFixture, 'utf8');
  await page.goto('/');
  const buildingId = await uploadViaApi(page, xml, 'incomplete-dpe.xml');
  await page.goto(`/#/building/${buildingId}`);

  await expect(page.getByTestId('viewer-3d')).toBeVisible();
  const canvas = page.locator('canvas');
  await canvas.waitFor({ timeout: 30_000 });

  const hash = await page.getByTestId('mesh-hash').getAttribute('data-hash');
  expect(hash).toMatch(/^[0-9a-f]{16}$/);
  const apiGeometry = await fetchGeometry(page, buildingId);
  // deterministic geometry: rendered hash === API hash (same building → same mesh)
  expect(apiGeometry.meshHash).toBe(hash);
  expect(apiGeometry.inferenceRulesVersion).toBe('1.0.0');
  expect(apiGeometry.elements.length).toBeGreaterThan(0);
  expect(apiGeometry.elements.some((e) => e.inferred)).toBe(true);

  // AC-P3-03: confidence legend + room label rendered
  await expect(page.getByTestId('confidence-legend')).toBeVisible();
  await expect(page.getByTestId('room-label').first()).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  // AC-P3-04: clicking an element shows its properties in the side panel
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('element-panel')).toBeVisible();
  const panelId = (await page.getByTestId('element-id').textContent()) ?? '';
  const pickedId = panelId.replace('id :', '').trim();
  expect(apiGeometry.elements.map((e) => e.id)).toContain(pickedId);
  await expect(page.getByTestId('element-confidence')).toContainText('confiance');
  await expect(page.getByTestId('element-confidence')).toContainText('source');

  // AC-P3-03: hovering shows the tooltip with { source, confidence }
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('element-tooltip')).toBeVisible();
  const tooltip = (await page.getByTestId('element-tooltip').textContent()) ?? '';
  expect(tooltip).toMatch(/(inference:|dpe-xml:)/);
  expect(tooltip).toMatch(/confiance 0?\.\d+/);
});

/**
 * AC-P3-02: every corpus fixture renders in the viewer; per-fixture screenshot
 * stored as a regression artifact + mesh-hash regression against the API.
 */
test.describe('AC-P3-02: corpus fixtures render (screenshot + mesh-hash regression)', () => {
  test.setTimeout(120_000);
  const files = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.xml'))
    .sort();

  for (const file of files) {
    test(`renders ${file}`, async ({ page }) => {
      const xml = readFileSync(path.join(fixturesDir, file), 'utf8');
      await page.goto('/');
      const buildingId = await uploadViaApi(page, xml, file);
      await page.goto(`/#/building/${buildingId}`);
      await page.locator('canvas').waitFor({ timeout: 30_000 });
      await expect(page.getByTestId('mesh-hash')).toHaveAttribute('data-hash', /^[0-9a-f]{16}$/);
      const hash = await page.getByTestId('mesh-hash').getAttribute('data-hash');
      const apiGeometry = await fetchGeometry(page, buildingId);
      expect(apiGeometry.meshHash).toBe(hash);
      expect(apiGeometry.elements.length).toBeGreaterThan(0);
      await page.screenshot({ path: `test-results/viewer-screenshots/${file}.png` });
    });
  }
});
