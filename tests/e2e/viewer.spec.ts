import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { confidenceInWords } from '../../apps/web/src/services/confidence-words.ts';

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
 * Runs a simulation through the API (sync 201 or async 202 + job polling) so
 * the viewer's heat-loss overlay has a persisted SimulationResult.
 */
async function runSimulationViaApi(page: import('@playwright/test').Page, buildingId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const post = await fetch(`/api/buildings/${id}/simulations`, { method: 'POST' });
    if (post.status === 201) return;
    if (post.status !== 202) throw new Error(`simulation POST failed with status ${post.status}`);
    const body = (await post.json()) as { job: { id: string } };
    for (let i = 0; i < 120; i += 1) {
      const res = await fetch(`/api/simulations/jobs/${body.job.id}`);
      const job = (await res.json()) as { status: string; error: { message?: string } | null };
      if (job.status === 'done') return;
      if (job.status === 'failed') throw new Error(`simulation job failed: ${job.error?.message ?? 'unknown'}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('simulation job did not finish in time');
  }, buildingId);
}

/**
 * Rebuilds the live viewer camera (window.__hesCamera) in the test process.
 */
async function liveCamera(page: import('@playwright/test').Page): Promise<PerspectiveCamera> {
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
  return cam;
}

/**
 * Builds a raycastable mesh from an API element in DOMAIN coordinates, then
 * applies the same Z-up -> Y-up conversion as the three-adapter
 * ((x, y, z) -> (x, z, -y), i.e. a -PI/2 rotation about X) so the test meshes
 * live in the same three.js space as the rendered scene.
 */
function meshOf(el: GeometryElementApi): Mesh {
  const positions: number[] = [];
  for (const face of el.mesh.faces) {
    const vs = face.vertices;
    for (let i = 1; i < vs.length - 1; i += 1) {
      for (const v of [vs[0], vs[i], vs[i + 1]]) positions.push(v.x, v.y, v.z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  const mesh = new Mesh(g, new MeshBasicMaterial({ side: 2 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.updateMatrixWorld();
  return mesh;
}

/** Converts a domain (Z-up) point to three.js (Y-up) space: (x, y, z) -> (x, z, -y). */
function domainToThree(p: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(p.x, p.z, -p.y);
}

/**
 * AC-P3-03 + AC-P3-04 (incomplete fixture → guaranteed inferred elements):
 * the viewer renders, inferred elements are marked, the hover tooltip shows
 * { source, confidence }, and clicking an element shows its properties.
 * Also asserts the F8 up-axis fix: with the 3/4 Y-up camera, the roof top
 * projects ABOVE the far ground corner on screen (before the fix both had
 * ~the same screen height — the building was rendered "on its side").
 */
test('viewer renders the building upright, marks inferred elements, tooltip + picking work', async ({ page }) => {
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
  expect(apiGeometry.inferenceRulesVersion).toBe('2.0.0');
  expect(apiGeometry.elements.length).toBeGreaterThan(0);
  expect(apiGeometry.elements.some((e) => e.inferred)).toBe(true);

  // AC-P3-03: confidence legend + room label rendered
  await expect(page.getByTestId('confidence-legend')).toBeVisible();
  await expect(page.getByTestId('room-label').first()).toBeVisible();

  // F8: the building stands upright — roof top center is higher on screen
  // than the far ground corner (both projected with the live viewer camera)
  await page.waitForFunction(() => '__hesCamera' in window, undefined, { timeout: 10_000 });
  const cam = await liveCamera(page);
  const b = apiGeometry.bounds;
  const roofTop = domainToThree({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: b.max.z }).project(cam);
  const groundFar = domainToThree({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: b.min.z }).project(cam);
  expect(roofTop.y).toBeGreaterThan(groundFar.y + 0.05);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  // AC-P3-04: clicking an element shows its properties in the side panel, and
  // the picked id resolves to the same element (with the same properties) in
  // the API geometry
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('element-panel')).toBeVisible();
  const pickedId = ((await page.getByTestId('element-id').textContent()) ?? '').trim();
  const picked = apiGeometry.elements.find((e) => e.id === pickedId);
  expect(picked).toBeDefined();
  // F11: the selection draws an edge outline (drei <Edges> -> fat line segments)
  // around the picked element
  await page.waitForFunction(() => {
    const scene = (window as unknown as { __hesScene?: { traverse: (cb: (o: { type: string }) => void) => void } }).__hesScene;
    if (!scene) return false;
    let found = false;
    scene.traverse((o) => {
      if (o.type.startsWith('LineSegments') || o.type === 'Line2' || o.type === 'Line') found = true;
    });
    return found;
  }, undefined, { timeout: 10_000 });
  if (picked?.areaM2 !== null && picked !== undefined) {
    const areaText = (await page.getByTestId('element-area').textContent()) ?? '';
    expect(areaText).toContain(`${picked.areaM2.value} m²`);
  }
  // wave-2 D (US 7 / F6): the side panel renders confidence in plain words
  // (« mesuré par le DPE » / « estimé — à vérifier »), the numeric score as a
  // subtle secondary indicator, and the raw source path behind the
  // « d'où vient cette valeur ? » detail
  await expect(page.getByTestId('element-confidence')).toContainText(
    picked !== undefined ? confidenceInWords(picked.placement) : 'confiance'
  );
  await expect(page.getByTestId('element-confidence')).toContainText('confiance');
  await expect(page.getByTestId('element-confidence-detail')).toBeHidden();
  await page.getByTestId('element-confidence-toggle').click();
  await expect(page.getByTestId('element-confidence-detail')).toContainText(picked?.placement.source ?? 'source');

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
    const cam = await liveCamera(page);

    const raycaster = new Raycaster();
    for (const win of windows) {
      const vs = win.mesh.faces.flatMap((f) => f.vertices);
      const centroid = vs.reduce((acc, v) => ({ x: acc.x + v.x / vs.length, y: acc.y + v.y / vs.length, z: acc.z + v.z / vs.length }), { x: 0, y: 0, z: 0 });
      const ndc = domainToThree(centroid).project(cam);
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
  const panelId = ((await page.getByTestId('element-id').textContent()) ?? '').trim();
  // the hit must resolve to a WINDOW element (per-mesh sub-buffer lookup), not
  // the wall/roof behind it; adjacent clamped panels can overlap, so any
  // window-* id is accepted
  expect(panelId).toMatch(/^window-\d+$/);
  expect(windows.map((w) => w.id)).toContain(panelId);
});

/**
 * UI audit F10: after a simulation, enabling the heat-loss overlay shows the
 * gradient legend and the hover tooltip carries the element's numeric share
 * of total losses ("perte … %"). The overlay values come unchanged from the
 * Open3CL projection; only the presentation (legend, tooltip) is asserted here.
 */
test('heat-loss overlay: legend + numeric share in the hover tooltip (F10)', async ({ page }) => {
  const xml = readFileSync(path.join(fixturesDir, '2387E0888781I.xml'), 'utf8');
  await page.goto('/');
  const buildingId = await uploadViaApi(page, xml, '2387E0888781I.xml');
  await runSimulationViaApi(page, buildingId);
  await page.goto(`/#/building/${buildingId}`);
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await expect(page.getByTestId('heat-loss-toggle')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('heat-loss-toggle').click();
  await expect(page.getByTestId('confidence-legend')).toBeVisible();

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const fractions: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.35], [0.5, 0.5], [0.4, 0.4], [0.6, 0.4],
    [0.5, 0.65], [0.35, 0.55], [0.65, 0.55], [0.5, 0.25]
  ];
  let sawShare = false;
  for (const [fx, fy] of fractions) {
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * fx, (box?.y ?? 0) + (box?.height ?? 0) * fy);
    await page.waitForTimeout(150);
    const tooltip = page.getByTestId('element-tooltip');
    if ((await tooltip.count()) > 0) {
      const text = (await tooltip.textContent()) ?? '';
      if (text.includes('perte')) {
        expect(text).toMatch(/perte \d+,\d %/);
        sawShare = true;
        break;
      }
    }
  }
  expect(sawShare).toBe(true);
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

/**
 * Issue #42 (M1, mobile): at a 390x844 viewport the 3D canvas must use the
 * full screen width (the element panel moves below it in column layout),
 * instead of being squeezed to ~70 px by the fixed 320 px side panel.
 */
test('mobile viewport: the 3D canvas spans the viewport width, panel below', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const xml = readFileSync(path.join(fixturesDir, '2238E0097309E.xml'), 'utf8');
  await page.goto('/');
  const buildingId = await uploadViaApi(page, xml, '2238E0097309E.xml');
  await page.goto(`/#/building/${buildingId}`);
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const panel = document.querySelector('[data-testid="element-panel"]') as HTMLElement;
    const cr = canvas.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    return { viewportW: window.innerWidth, canvasW: cr.width, panelW: pr.width, panelTop: pr.top, canvasBottom: cr.bottom };
  });
  expect(layout.canvasW).toBeGreaterThan(layout.viewportW * 0.9);
  expect(layout.panelW).toBeLessThanOrEqual(layout.viewportW);
  expect(layout.panelTop).toBeGreaterThanOrEqual(layout.canvasBottom - 1);
});
