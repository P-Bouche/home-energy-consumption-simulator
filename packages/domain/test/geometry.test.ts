import { describe, expect, it } from 'vitest';
import {
  COORDINATE_SYSTEM,
  computeMeshHash,
  faceArea,
  geometryFromJson,
  geometryToJson,
  hashString,
  makeFace,
  meshArea,
  ORIENTATIONS,
  parseOrientation,
  v3,
  type GeometryElement
} from '../src/index.ts';

describe('geometry value objects (P3)', () => {
  it('documents the coordinate system: meters, Z-up, origin at footprint corner', () => {
    expect(COORDINATE_SYSTEM).toEqual({
      unit: 'm',
      upAxis: 'Z',
      axes: { x: 'east', y: 'north', z: 'up' },
      origin: 'building-footprint-corner'
    });
  });

  it('parses 3CL enum orientation ids (1=N … 8=NW, 9=horizontal)', () => {
    expect(parseOrientation('1')).toBe('N');
    expect(parseOrientation('2')).toBe('NE');
    expect(parseOrientation('4')).toBe('SE');
    expect(parseOrientation('5')).toBe('S');
    expect(parseOrientation('8')).toBe('NW');
    expect(parseOrientation('9')).toBe('horizontal');
  });

  it('parses French and English compass words, case-insensitive', () => {
    expect(parseOrientation('Nord')).toBe('N');
    expect(parseOrientation('sud-ouest')).toBe('SW');
    expect(parseOrientation(' West ')).toBe('W');
    expect(parseOrientation('horizontale')).toBe('horizontal');
  });

  it('returns null on unknown or missing orientation', () => {
    expect(parseOrientation(null)).toBeNull();
    expect(parseOrientation(undefined)).toBeNull();
    expect(parseOrientation('')).toBeNull();
    expect(parseOrientation('xyz')).toBeNull();
  });

  it('ORIENTATIONS lists all orientations', () => {
    expect(ORIENTATIONS).toContain('N');
    expect(ORIENTATIONS).toContain('horizontal');
    expect(ORIENTATIONS).toHaveLength(9);
  });

  it('makeFace computes the outward normal from the winding (right-hand rule)', () => {
    const up = makeFace([v3(0, 0, 0), v3(1, 0, 0), v3(1, 1, 0), v3(0, 1, 0)]);
    expect(up.normal).toEqual({ x: 0, y: 0, z: 1 });
    const down = makeFace([v3(0, 0, 0), v3(0, 1, 0), v3(1, 1, 0), v3(1, 0, 0)]);
    expect(down.normal).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('makeFace rejects faces with other than 3 or 4 vertices', () => {
    expect(() => makeFace([v3(0, 0, 0), v3(1, 0, 0)])).toThrow(RangeError);
  });

  it('faceArea / meshArea compute polygon areas in m²', () => {
    const unit = makeFace([v3(0, 0, 0), v3(2, 0, 0), v3(2, 3, 0), v3(0, 3, 0)]);
    expect(faceArea(unit)).toBeCloseTo(6, 9);
    expect(meshArea({ faces: [unit, unit] })).toBeCloseTo(12, 9);
  });

  it('v3 rounds coordinates to 6 decimals (stable serialization)', () => {
    expect(v3(1 / 3, 0.1 + 0.2, -0)).toEqual({ x: 0.333333, y: 0.3, z: 0 });
  });

  it('hashString is deterministic and pure (same input → same hash)', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('abc')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('computeMeshHash is order-independent over elements and stable', () => {
    const el = (id: string): GeometryElement => ({
      id,
      kind: 'wall',
      label: id,
      mesh: { faces: [makeFace([v3(0, 0, 0), v3(1, 0, 0), v3(1, 0, 1), v3(0, 0, 1)])] },
      areaM2: null,
      uValueWm2K: null,
      orientation: null,
      placement: {
        value: { origin: v3(0, 0, 0), dimensions: { width: 1, depth: 0.2, height: 1 }, orientation: 'N' },
        source: 'dpe-xml:x',
        confidence: 1,
        importDate: new Date('2026-11-20T10:00:00.000Z')
      },
      inferred: false
    });
    const h1 = computeMeshHash('1.0.0', [el('wall-1'), el('wall-2')]);
    const h2 = computeMeshHash('1.0.0', [el('wall-2'), el('wall-1')]);
    expect(h1).toBe(h2);
    expect(computeMeshHash('1.0.0', [el('wall-1')])).not.toBe(h1);
    expect(computeMeshHash('2.0.0', [el('wall-1'), el('wall-2')])).not.toBe(h1);
  });
});

describe('geometry JSON round-trip (API contract of GET /buildings/:id/geometry)', () => {
  it('toJson → fromJson preserves every field including Confidence metadata', () => {
    const el: GeometryElement = {
      id: 'wall-1',
      kind: 'wall',
      label: 'Mur nord',
      mesh: { faces: [makeFace([v3(0, 0, 0), v3(2, 0, 0), v3(2, 0, 2.5), v3(0, 0, 2.5)])] },
      areaM2: {
        value: 5,
        source: 'dpe-xml:mur/surface',
        confidence: 1,
        importDate: new Date('2026-11-20T10:00:00.000Z')
      },
      uValueWm2K: {
        value: 1.5,
        source: 'inference:umur-default',
        confidence: 0.4,
        importDate: new Date('2026-11-20T10:00:00.000Z')
      },
      orientation: {
        value: 'N',
        source: 'dpe-xml:mur/orientation',
        confidence: 1,
        importDate: new Date('2026-11-20T10:00:00.000Z')
      },
      placement: {
        value: { origin: v3(0, 1, 0), dimensions: { width: 2, depth: 0.2, height: 2.5 }, orientation: 'N' },
        source: 'inference:wall-orientation-by-capacity',
        confidence: 0.4,
        importDate: new Date('2026-11-20T10:00:00.000Z')
      },
      inferred: true
    };
    const geometry = {
      buildingId: 'b-1',
      coordinateSystem: COORDINATE_SYSTEM,
      inferenceRulesVersion: '1.0.0',
      bounds: { min: v3(0, 0, 0), max: v3(2, 1, 2.5) },
      elements: [el],
      meshHash: computeMeshHash('1.0.0', [el])
    };
    const json = geometryToJson(geometry);
    const revived = geometryFromJson(JSON.parse(JSON.stringify(json)) as ReturnType<typeof geometryToJson>);
    expect(revived).toEqual(geometry);
    expect(revived.elements[0]?.placement.importDate).toBeInstanceOf(Date);
    expect(revived.meshHash).toBe(geometry.meshHash);
  });
});
