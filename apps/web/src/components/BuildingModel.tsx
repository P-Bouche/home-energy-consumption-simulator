import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { BufferAttribute, CanvasTexture, DoubleSide, RepeatWrapping, Vector3, type BufferGeometry as ThreeBufferGeometry } from 'three';
import { elementAtVertex, filterByKinds, geometryJsonToMeshBuffers, type MeshBuffers, type MeshGroup } from '@hes/geometry';
import { toThreeBufferGeometry } from '@hes/geometry/three';
import { elementColor } from '../services/view-colors.ts';
import { useHeatLossOverlay, useViewerStore, type ScreenOverlay } from '../store/viewer-store.ts';

/**
 * R3F model of the reconstructed building (P3). Presentation only: buffers
 * come from the store (fed by the API), colors from services/view-colors,
 * picking maps a raycast vertex to its stable element id via the buffer
 * groups **of the mesh that was actually hit** (each material-class mesh has
 * its own sub-buffers with re-based group starts). Geometry is merged by
 * material class (envelope / openings / rooms / inferred-hatch) to limit draw
 * calls (TR-P3-02); only the `color` attribute is rewritten on hover/selection
 * changes, never the position/normal buffers.
 *
 * DOM overlays (room labels, hover tooltip) are rendered outside the Canvas by
 * ViewerOverlays: this in-canvas projector only writes their screen positions
 * to the store (R3F cannot render raw DOM elements inside <Canvas>).
 */

type ColorFor = (group: MeshGroup) => [number, number, number];

function makeHatchTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 16, 16);
  ctx.strokeStyle = 'rgba(120, 60, 0, 0.85)';
  ctx.lineWidth = 3;
  for (let i = -16; i < 32; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 16);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Projects room-label positions and the hover point to canvas pixels every
 * frame and stores them as screen overlays (diffed: the store is only updated
 * when a position actually moved).
 */
function OverlayProjector({
  roomLabels
}: Readonly<{ roomLabels: readonly { id: string; position: [number, number, number]; label: string }[] }>) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const hoverPoint = useViewerStore((s) => s.hoverPoint);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const setScreenOverlays = useViewerStore((s) => s.setScreenOverlays);
  const last = useRef<string>('');
  useFrame(() => {
    const project = (p: [number, number, number]): [number, number] | null => {
      const v = new Vector3(p[0], p[1], p[2]).project(camera);
      if (v.z > 1) return null;
      return [Math.round(((v.x * 0.5 + 0.5) * size.width) * 2) / 2, Math.round(((-v.y * 0.5 + 0.5) * size.height) * 2) / 2];
    };
    const overlays: ScreenOverlay[] = [];
    for (const room of roomLabels) {
      const xy = project(room.position);
      if (xy !== null) overlays.push({ id: room.id, role: 'room', x: xy[0], y: xy[1] });
    }
    if (hoveredElementId !== null && hoverPoint !== null) {
      const xy = project(hoverPoint);
      if (xy !== null) overlays.push({ id: hoveredElementId, role: 'hover', x: xy[0], y: xy[1] });
    }
    const key = JSON.stringify(overlays);
    if (key !== last.current) {
      last.current = key;
      setScreenOverlays(overlays);
    }
  });
  return null;
}

export function BuildingModel() {
  const geometry = useViewerStore((s) => s.geometry);
  const selectedElementId = useViewerStore((s) => s.selectedElementId);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const select = useViewerStore((s) => s.select);
  const setHovered = useViewerStore((s) => s.setHovered);
  const { overlay } = useHeatLossOverlay();

  const buffers = useMemo(() => (geometry === null ? null : geometryJsonToMeshBuffers(geometry)), [geometry]);
  const envelope = useMemo(() => (buffers === null ? null : filterByKinds(buffers, ['wall', 'roof', 'floor'])), [buffers]);
  const openings = useMemo(() => (buffers === null ? null : filterByKinds(buffers, ['window', 'door'])), [buffers]);
  const rooms = useMemo(() => (buffers === null ? null : filterByKinds(buffers, ['room'])), [buffers]);
  const inferredEnvelope = useMemo(
    () =>
      buffers === null
        ? null
        : filterByKinds(
            {
              ...buffers,
              groups: buffers.groups.filter((g) => g.inferred && (g.kind === 'wall' || g.kind === 'roof' || g.kind === 'floor'))
            },
            ['wall', 'roof', 'floor']
          ),
    [buffers]
  );
  const hatchTexture = useMemo(() => makeHatchTexture(), []);

  const lossShareById = useMemo(() => {
    const map = new Map<string, number>();
    if (overlay !== null) for (const share of overlay.shares) map.set(share.elementId, share.share);
    return map;
  }, [overlay]);

  const colorFor: ColorFor = useMemo(
    () => (group) =>
      elementColor({
        kind: group.kind,
        inferred: group.inferred,
        selected: group.elementId === selectedElementId,
        hovered: group.elementId === hoveredElementId,
        lossShare: lossShareById.get(group.elementId) ?? null
      }),
    [selectedElementId, hoveredElementId, lossShareById]
  );

  // Stable geometries per material class (positions/normals never rebuilt on
  // hover/selection); only the color attribute is rewritten in place below.
  const layers = useMemo(() => {
    const mk = (sub: MeshBuffers | null): ThreeBufferGeometry | null => (sub === null ? null : toThreeBufferGeometry(sub));
    return [
      { sub: envelope, geom: mk(envelope) },
      { sub: inferredEnvelope, geom: mk(inferredEnvelope) },
      { sub: openings, geom: mk(openings) },
      { sub: rooms, geom: mk(rooms) }
    ];
  }, [envelope, inferredEnvelope, openings, rooms]);

  useEffect(() => {
    for (const { sub, geom } of layers) {
      if (sub === null || geom === null) continue;
      let attr = geom.getAttribute('color') as BufferAttribute | undefined;
      if (attr === undefined) {
        attr = new BufferAttribute(new Float32Array(sub.positions.length), 3);
        geom.setAttribute('color', attr);
      }
      for (const group of sub.groups) {
        const [r, g, b] = colorFor(group);
        for (let v = group.start; v < group.start + group.count; v += 1) {
          attr.setXYZ(v, r, g, b);
        }
      }
      attr.needsUpdate = true;
    }
  }, [layers, colorFor]);

  const roomLabels = useMemo(
    () =>
      (rooms?.groups ?? [])
        .filter((g) => g.labelPosition !== null)
        .map((g) => ({
          id: g.elementId,
          label: g.label,
          position: [g.labelPosition?.x ?? 0, g.labelPosition?.y ?? 0, g.labelPosition?.z ?? 0] as [number, number, number]
        })),
    [rooms]
  );

  // Per-mesh picking: the hit faceIndex is relative to the hit mesh's own
  // sub-buffers (re-based group starts), never the full merged buffers.
  const handlersFor = (sub: MeshBuffers | null) => ({
    onPointerMove: (event: ThreeEvent<PointerEvent>): void => {
      event.stopPropagation();
      const faceIndex = event.faceIndex;
      const group = sub !== null && faceIndex !== null && faceIndex !== undefined ? elementAtVertex(sub, faceIndex * 3) : null;
      setHovered(group === null ? null : group.elementId, group === null ? null : [event.point.x, event.point.y, event.point.z]);
    },
    onClick: (event: ThreeEvent<MouseEvent>): void => {
      event.stopPropagation();
      const faceIndex = event.faceIndex;
      const group = sub !== null && faceIndex !== null && faceIndex !== undefined ? elementAtVertex(sub, faceIndex * 3) : null;
      select(group === null ? null : group.elementId);
    }
  });

  if (buffers === null || geometry === null) return null;

  const envelopeHandlers = handlersFor(envelope);
  const inferredHandlers = handlersFor(inferredEnvelope);
  const openingHandlers = handlersFor(openings);
  const roomHandlers = handlersFor(rooms);

  return (
    <>
      {layers[0]?.geom != null && (
        <mesh geometry={layers[0].geom} {...envelopeHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} />
        </mesh>
      )}
      {layers[1]?.geom != null && layers[1].sub !== null && layers[1].sub.groups.length > 0 && (
        <mesh geometry={layers[1].geom} {...inferredHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} map={hatchTexture ?? undefined} transparent opacity={0.9} />
        </mesh>
      )}
      {layers[2]?.geom != null && (
        <mesh geometry={layers[2].geom} {...openingHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} transparent opacity={0.75} />
        </mesh>
      )}
      {layers[3]?.geom != null && (
        <mesh geometry={layers[3].geom} {...roomHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      <OverlayProjector roomLabels={roomLabels} />
    </>
  );
}
