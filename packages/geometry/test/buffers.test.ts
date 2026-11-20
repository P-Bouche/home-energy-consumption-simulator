import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import {
  computeMeshHash,
  geometryFromJson,
  geometryToJson,
  ReconstructionService,
  type Building,
  type Geometry
} from '@hes/domain';
import {
  elementAtVertex,
  filterByKinds,
  geometryJsonToMeshBuffers,
  geometryToMeshBuffers
} from '../src/index.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const importDate = new Date('2026-11-20T12:00:00.000Z');
const importer = new DpeXmlImporter();
const service = new ReconstructionService();

function fixtureBuilding(name: string): Building {
  const xml = readFileSync(`${fixturesDir}/${name}`, 'utf8');
  return importer.importDpeXml(xml, importDate).building;
}

describe('geometryToMeshBuffers (pure adapter core)', () => {
  const geometry = service.reconstruct(fixtureBuilding('2238E0097309E.xml'));

  it('produces non-indexed buffers whose groups cover every vertex exactly once', () => {
    const buffers = geometryToMeshBuffers(geometry);
    const totalVertices = buffers.positions.length / 3;
    expect(buffers.normals.length).toBe(buffers.positions.length);
    let covered = 0;
    for (const g of buffers.groups) {
      expect(g.count).toBeGreaterThan(0);
      covered += g.count;
    }
    expect(covered).toBe(totalVertices);
    expect(buffers.groups.map((g) => g.elementId).sort()).toEqual(
      geometry.elements.map((e) => e.id).sort()
    );
  });

  it('triangulates quads (4 vertices → 2 triangles → 6 vertices per face)', () => {
    const buffers = geometryToMeshBuffers(geometry);
    const wall = geometry.elements.find((e) => e.kind === 'wall');
    expect(wall?.mesh.faces.length).toBeGreaterThan(0);
    const group = buffers.groups.find((g) => g.elementId === wall?.id);
    expect(group?.count).toBe((wall?.mesh.faces.length ?? 0) * 6);
  });

  it('elementAtVertex maps a raycast vertex (faceIndex*3) to the right element', () => {
    const buffers = geometryToMeshBuffers(geometry);
    for (const g of buffers.groups) {
      expect(elementAtVertex(buffers, g.start)?.elementId).toBe(g.elementId);
      expect(elementAtVertex(buffers, g.start + g.count - 1)?.elementId).toBe(g.elementId);
    }
    expect(elementAtVertex(buffers, buffers.positions.length / 3)).toBeNull();
  });

  it('filterByKinds re-bases groups onto sub-buffers (material merging)', () => {
    const buffers = geometryToMeshBuffers(geometry);
    const envelope = filterByKinds(buffers, ['wall', 'roof', 'floor']);
    expect(envelope.groups.every((g) => ['wall', 'roof', 'floor'].includes(g.kind))).toBe(true);
    const covered = envelope.groups.reduce((a, g) => a + g.count, 0);
    expect(covered).toBe(envelope.positions.length / 3);
    const openings = filterByKinds(buffers, ['window', 'door']);
    expect(openings.groups.every((g) => g.kind === 'window' || g.kind === 'door')).toBe(true);
    expect(envelope.positions.length + openings.positions.length + filterByKinds(buffers, ['room']).positions.length)
      .toBe(buffers.positions.length);
  });

  it('is deterministic: same geometry → identical buffers', () => {
    const a = geometryToMeshBuffers(geometry);
    const b = geometryToMeshBuffers(service.reconstruct(fixtureBuilding('2238E0097309E.xml')));
    expect(Buffer.from(a.positions.buffer).toString('hex')).toBe(Buffer.from(b.positions.buffer).toString('hex'));
    expect(a.groups).toEqual(b.groups);
  });

  it('room groups carry a label position at the strip center', () => {
    const buffers = geometryToMeshBuffers(geometry);
    const rooms = buffers.groups.filter((g) => g.kind === 'room');
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) {
      expect(r.labelPosition).not.toBeNull();
    }
  });

  it('JSON round-trip: geometryJsonToMeshBuffers(toJson(g)) equals the direct conversion and preserves the mesh hash', () => {
    const json = JSON.parse(JSON.stringify(geometryToJson(geometry))) as ReturnType<typeof geometryToJson>;
    const viaJson = geometryJsonToMeshBuffers(json);
    const direct = geometryToMeshBuffers(geometry);
    expect(Buffer.from(viaJson.positions.buffer).toString('hex')).toBe(Buffer.from(direct.positions.buffer).toString('hex'));
    const revived = geometryFromJson(json);
    expect(computeMeshHash(revived.inferenceRulesVersion, revived.elements)).toBe(geometry.meshHash);
  });
});

describe('reconstruction over the full DPE corpus (AC-P3-01 input set)', () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.xml')).sort();

  it('the corpus has 15 fixtures', () => {
    expect(files).toHaveLength(15);
  });

  for (const file of files) {
    it(`reconstructs ${file} deterministically with stable element ids and hash`, () => {
      const building = fixtureBuilding(file);
      const g1: Geometry = service.reconstruct(building);
      const g2 = service.reconstruct(building);
      expect(g1.meshHash).toBe(g2.meshHash);
      expect(g1.elements.length).toBeGreaterThan(0);
      expect(g1.elements.every((e) => e.mesh.faces.length > 0)).toBe(true);
      // stable ids: every element id is either a domain entity id or a deterministic synthesized id
      for (const el of g1.elements) {
        expect(el.id).toMatch(/^(wall|roof|floor|window|door|room)-(synthesized-)?\d+$/);
      }
      // buffers build fine
      const buffers = geometryToMeshBuffers(g1);
      expect(buffers.positions.length).toBeGreaterThan(0);
      expect(buffers.groups).toHaveLength(g1.elements.length);
    });
  }
});
