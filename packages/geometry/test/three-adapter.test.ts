import { describe, expect, it } from 'vitest';
import { BufferGeometry } from 'three';
import { ReconstructionService, type Building } from '@hes/domain';
import { DpeXmlImporter } from '@hes/dpe-xml-importer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geometryToMeshBuffers } from '../src/index.ts';
import { toThreeBufferGeometry } from '../src/three-adapter.ts';

const fixturesDir = fileURLToPath(new URL('../../open3cl-adapter/test/fixtures', import.meta.url));
const importDate = new Date('2026-11-20T12:00:00.000Z');

describe('toThreeBufferGeometry (three.js subpath adapter)', () => {
  it('builds a non-indexed BufferGeometry with position/normal attributes matching the buffers', () => {
    const xml = readFileSync(`${fixturesDir}/2238E0097309E.xml`, 'utf8');
    const building: Building = new DpeXmlImporter().importDpeXml(xml, importDate).building;
    const buffers = geometryToMeshBuffers(new ReconstructionService().reconstruct(building));
    const geometry = toThreeBufferGeometry(buffers);
    expect(geometry).toBeInstanceOf(BufferGeometry);
    expect(geometry.index).toBeNull();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    expect(position.count).toBe(buffers.positions.length / 3);
    expect(normal.count).toBe(buffers.normals.length / 3);
    expect(position.itemSize).toBe(3);
    expect(Array.from(position.array.slice(0, 3))).toEqual(Array.from(buffers.positions.slice(0, 3)));
    expect(Array.from(normal.array.slice(0, 3))).toEqual(Array.from(buffers.normals.slice(0, 3)));
  });
});
