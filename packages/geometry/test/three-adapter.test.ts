import { describe, expect, it } from 'vitest';
import { BufferGeometry, Vector3 } from 'three';
import { ReconstructionService, computeMeshHash, geometryToJson, type Building } from '@hes/domain';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geometryToMeshBuffers } from '../src/index.ts';
import { cameraFrameForBounds, domainToThree, toThreeBufferGeometry } from '../src/three-adapter.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const importDate = new Date('2026-11-20T12:00:00.000Z');

function fixtureBuilding(): Building {
  const xml = readFileSync(`${fixturesDir}/2238E0097309E.xml`, 'utf8');
  return new DpeXmlImporter().importDpeXml(xml, importDate).building;
}

describe('toThreeBufferGeometry (three.js subpath adapter)', () => {
  it('builds a non-indexed BufferGeometry with position/normal attributes, converting Z-up domain axes to Y-up three.js axes', () => {
    const building = fixtureBuilding();
    const buffers = geometryToMeshBuffers(new ReconstructionService().reconstruct(building));
    const geometry = toThreeBufferGeometry(buffers);
    expect(geometry).toBeInstanceOf(BufferGeometry);
    expect(geometry.index).toBeNull();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    expect(position.count).toBe(buffers.positions.length / 3);
    expect(normal.count).toBe(buffers.normals.length / 3);
    expect(position.itemSize).toBe(3);
    // every vertex is remapped (x, y, z) -> (x, z, -y)
    for (let i = 0; i < buffers.positions.length; i += 3) {
      const [tx, ty, tz] = domainToThree({
        x: buffers.positions[i] ?? 0,
        y: buffers.positions[i + 1] ?? 0,
        z: buffers.positions[i + 2] ?? 0
      });
      expect([position.getX(i / 3), position.getY(i / 3), position.getZ(i / 3)]).toEqual([tx, ty, tz]);
      const [nx, ny, nz] = domainToThree({
        x: buffers.normals[i] ?? 0,
        y: buffers.normals[i + 1] ?? 0,
        z: buffers.normals[i + 2] ?? 0
      });
      expect([normal.getX(i / 3), normal.getY(i / 3), normal.getZ(i / 3)]).toEqual([nx, ny, nz]);
    }
  });

  it('never mutates the input buffers and leaves the mesh hash untouched (rendering-only conversion, UI audit F8)', () => {
    const building = fixtureBuilding();
    const geometry = new ReconstructionService().reconstruct(building);
    const hashBefore = geometry.meshHash;
    const jsonHashBefore = geometryToJson(geometry).meshHash;
    const buffers = geometryToMeshBuffers(geometry);
    const positionsBefore = Array.from(buffers.positions);
    const normalsBefore = Array.from(buffers.normals);
    toThreeBufferGeometry(buffers);
    // input arrays are byte-identical after the conversion
    expect(Array.from(buffers.positions)).toEqual(positionsBefore);
    expect(Array.from(buffers.normals)).toEqual(normalsBefore);
    // the domain geometry and its hash are unchanged, and reconstruction is still deterministic
    expect(geometry.meshHash).toBe(hashBefore);
    expect(geometryToJson(geometry).meshHash).toBe(jsonHashBefore);
    expect(computeMeshHash(geometry.inferenceRulesVersion, geometry.elements)).toBe(hashBefore);
    expect(new ReconstructionService().reconstruct(building).meshHash).toBe(hashBefore);
  });
});

describe('domainToThree (Z-up -> Y-up axis conversion, UI audit F8)', () => {
  it('maps (x, y, z) -> (x, z, -y)', () => {
    const mapped = domainToThree({ x: 1, y: 2, z: 3 });
    expect(mapped[0]).toBe(1);
    expect(mapped[1]).toBe(3);
    expect(mapped[2]).toBe(-2);
    const origin = domainToThree({ x: 0, y: 0, z: 0 });
    expect(origin[0]).toBeCloseTo(0, 12);
    expect(origin[1]).toBeCloseTo(0, 12);
    expect(origin[2]).toBeCloseTo(0, 12);
  });

  it('is a pure rotation: preserves lengths and equals a -PI/2 rotation about X', () => {
    const p = { x: 4.33, y: 3.27, z: 5.12 };
    const [tx, ty, tz] = domainToThree(p);
    expect(Math.hypot(tx, ty, tz)).toBeCloseTo(Math.hypot(p.x, p.y, p.z), 12);
    // verify against three.js itself: same result as a -PI/2 rotation about X
    const rotated = new Vector3(p.x, p.y, p.z).applyAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    expect(tx).toBeCloseTo(rotated.x, 12);
    expect(ty).toBeCloseTo(rotated.y, 12);
    expect(tz).toBeCloseTo(rotated.z, 12);
    // the domain up axis (0,0,1) becomes the three.js up axis (0,1,0)
    const up = domainToThree({ x: 0, y: 0, z: 1 });
    expect(up[0]).toBeCloseTo(0, 12);
    expect(up[1]).toBeCloseTo(1, 12);
    expect(up[2]).toBeCloseTo(0, 12);
  });
});

describe('cameraFrameForBounds (3/4 reframe, UI audit F8 — runs without a GPU)', () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 6, z: 5 } };

  it('targets the converted bounding-sphere center and places the camera at azimuth 45°, elevation 30°', () => {
    const frame = cameraFrameForBounds(bounds);
    // domain center (4, 3, 2.5) -> three.js (4, 2.5, -3)
    expect(frame.target).toEqual([4, 2.5, -3]);
    const radius = Math.hypot(4, 3, 2.5);
    expect(frame.radius).toBeCloseTo(radius, 9);
    const dx = frame.position[0] - frame.target[0];
    const dy = frame.position[1] - frame.target[1];
    const dz = frame.position[2] - frame.target[2];
    const dist = Math.hypot(dx, dy, dz);
    expect(frame.distance).toBeCloseTo(dist, 9);
    // elevation 30°: vertical component = sin(30°) * distance
    expect(dy / dist).toBeCloseTo(Math.sin((30 * Math.PI) / 180), 9);
    // azimuth 45°: horizontal components share the horizontal projection equally
    expect(dx / Math.hypot(dx, dz)).toBeCloseTo(Math.sin((45 * Math.PI) / 180), 9);
    expect(dz / Math.hypot(dx, dz)).toBeCloseTo(Math.cos((45 * Math.PI) / 180), 9);
    // distance ~1.8x the bounding sphere (diameter), and the sphere fits the 50° frustum
    expect(frame.distance).toBeGreaterThanOrEqual(1.8 * 2 * radius);
    expect(frame.distance).toBeGreaterThanOrEqual(radius / Math.sin((50 * Math.PI) / 360));
    // the camera is above the ground plane (three.js y > 0 = domain z > 0)
    expect(frame.position[1]).toBeGreaterThan(0);
  });

  it('raises the distance to the frustum-fit distance for narrow fovs so the model always fits', () => {
    const narrow = cameraFrameForBounds(bounds, { fovDeg: 20 });
    const radius = Math.hypot(4, 3, 2.5);
    expect(narrow.distance).toBeCloseTo((radius / Math.sin((20 * Math.PI) / 360)) * 1.02, 6);
    expect(narrow.distance).toBeGreaterThan(1.8 * 2 * radius);
  });

  it('handles degenerate bounds without NaN', () => {
    const frame = cameraFrameForBounds({ min: { x: 1, y: 2, z: 3 }, max: { x: 1, y: 2, z: 3 } });
    expect(Number.isFinite(frame.position[0])).toBe(true);
    expect(Number.isFinite(frame.position[1])).toBe(true);
    expect(Number.isFinite(frame.position[2])).toBe(true);
    expect(frame.radius).toBe(1);
    expect(frame.target).toEqual([1, 3, -2]);
  });
});
