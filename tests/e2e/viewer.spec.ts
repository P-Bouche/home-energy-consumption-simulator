import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesDir = path.join(repoRoot, 'packages/open3cl-adapter/test/fixtures');
const incompleteFixture = path.join(repoRoot, 'packages/dpe-xml-importer/test/fixtures/incomplete-dpe.xml');

interface GeometryElementApi {
  id: string;
  kind: string;
  inferred: boolean;
  areaM2: { value: number; confidence: number; source: string } | null;
  uValueWm2K: { value: number; confidence: number; source: string } | null;
  orientation: { value: string; confidence: number; source: string } | null;
  placement: { source: string; confidence: number };
  mesh: { faces: { vertices: { x: number; y: number; z: number }[] }[] };
}

interface GeometryApi {
  buildingId: string;
  geometry: {
    meshHash: string;
    inferenceRulesVersion: string;
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
    elements: GeometryElementApi[];
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

  // AC-P3-04: clicking an element shows its properties in the side panel, and
  // the picked id resolves to the same element (with the same properties) in
  // the API geometry
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('element-panel')).toBeVisible();
  const panelId = (await page.getByTestId('element-id').textContent()) ?? '';
  const pickedId = panelId.replace('id :', '').trim();
  const picked = apiGeometry.elements.find((e) => e.id === pickedId);
  expect(picked).toBeDefined();
  if (picked?.areaM2 !== null && picked !== undefined) {
    const areaText = (await page.getByTestId('element-area').textContent()) ?? '';
    expect(areaText).toContain(`${picked.areaM2.value} m²`);
  }
  await expect(page.getByTestId('element-confidence')).toContainText('confiance');
  await expect(page.getByTestId('element-confidence')).toContainText(picked?.placement.source ?? 'source');

  // AC-P3-03: hovering shows the tooltip with { source, confidence }
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('element-tooltip')).toBeVisible();
  const tooltip = (await page.getByTestId('element-tooltip').textContent()) ?? '';
  expect(tooltip).toMatch(/(inference:|dpe-xml:)/);
  expect(tooltip).toMatch(/confiance 0?\.\d+/);
});

/**
 * AC-P3-04 (picking correctness): clicking a WINDOW panel selects the
 * window-* element, not the wall/roof behind it — each mesh resolves raycast
 * hits against its own sub-buffers (re-based group starts). The test raycasts
 * from the live viewer camera (window.__hesCamera) to pick a window that is
 * actually visible (first hit = the window panel).
 */
test('clicking a window selects window-* (per-mesh picking)', async ({ page }) => {
  // fixture with windows hosted on the S wall (camera side at the default view)
  const xml = readFileSync(path.join(fixturesDir, '2387E0888781I.xml'), 'utf8');
  await page.goto('/');
  const buildingId = await uploadViaApi(page, xml, '2387E0888781I.xml');
  await page.goto(`/#/building/${buildingId}`);
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await expect(page.getByTestId('mesh-hash')).toHaveAttribute('data-hash', /^[0-9a-f]{16}$/);
  await page.waitForFunction(() => '__hesCamera' in window, undefined, { timeout: 10_000 });
  const apiGeometry = await fetchGeometry(page, buildingId);
  const windows = apiGeometry.elements.filter((e) => e.kind === 'window');
  expect(windows.length).toBeGreaterThan(0);

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  const meshOf = (el: GeometryElementApi): Mesh => {
    const positions: number[] = [];
    for (const face of el.mesh.faces) {
      const vs = face.vertices;
      for (let i = 1; i < vs.length - 1; i += 1) {
        for (const v of [vs[0], vs[i], vs[i + 1]]) positions.push(v.x, v.y, v.z);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    return new Mesh(g, new MeshBasicMaterial({ side: 2 }));
  };

  // Orbit if needed: pick the first window whose centroid ray (from the live
  // camera) hits that window first, i.e. is actually visible.
  let target: { id: string; x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 5 && target === null; attempt += 1) {
    if (attempt > 0) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - (box?.width ?? 0) * 0.6, cy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(600); // let OrbitControls damping settle
    }
    const camData = await page.evaluate(() => {
      const cam = (window as unknown as { __hesCamera?: { position: { toArray(): number[] }; projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } } }).__hesCamera;
      if (!cam) throw new Error('camera bridge missing');
      return { position: cam.position.toArray(), proj: cam.projectionMatrix.elements, view: cam.matrixWorldInverse.elements };
    });
    const cam = new PerspectiveCamera();
    cam.projectionMatrix.fromArray(camData.proj);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.matrixWorldInverse.fromArray(camData.view);
    cam.matrixWorld.copy(cam.matrixWorldInverse).invert();
    cam.position.fromArray(camData.position);

    const raycaster = new Raycaster();
    for (const win of windows) {
      const vs = win.mesh.faces.flatMap((f) => f.vertices);
      const centroid = vs.reduce((acc, v) => ({ x: acc.x + v.x / vs.length, y: acc.y + v.y / vs.length, z: acc.z + v.z / vs.length }), { x: 0, y: 0, z: 0 });
      const ndc = new Vector3(centroid.x, centroid.y, centroid.z).project(cam);
      if (ndc.z > 1) continue;
      raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), cam);
      const all = apiGeometry.elements.map((el) => ({ el, mesh: meshOf(el) }));
      const hits = raycaster.intersectObjects(all.map((a) => a.mesh), false);
      const firstEl = hits[0] === undefined ? undefined : all.find((a) => a.mesh === hits[0].object)?.el;
      if (firstEl?.id !== win.id) continue; // occluded
      target = { id: win.id, x: (ndc.x * 0.5 + 0.5) * (box?.width ?? 0), y: (-ndc.y * 0.5 + 0.5) * (box?.height ?? 0) };
      break;
    }
  }
  expect(target).not.toBeNull();
  await page.mouse.click((box?.x ?? 0) + (target?.x ?? 0), (box?.y ?? 0) + (target?.y ?? 0));
  await expect(page.getByTestId('element-panel')).toBeVisible();
  const panelId = ((await page.getByTestId('element-id').textContent()) ?? '').replace('id :', '').trim();
  // the hit must resolve to a WINDOW element (per-mesh sub-buffer lookup), not
  // the wall/roof behind it; adjacent clamped panels can overlap, so any
  // window-* id is accepted
  expect(panelId).toMatch(/^window-\d+$/);
  expect(windows.map((w) => w.id)).toContain(panelId);
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
