import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { BufferAttribute, CanvasTexture, DoubleSide, RepeatWrapping, Vector3, type BufferGeometry as ThreeBufferGeometry } from 'three';
import { elementAtVertex, filterByKinds, geometryJsonToMeshBuffers, type MeshBuffers, type MeshGroup } from '@hes/geometry';
import { domainToThree, toThreeBufferGeometry } from '@hes/geometry/three';
import { normalizedLossShares } from '../services/heat-loss.ts';
import { elementColor, SELECTION_OUTLINE_COLOR } from '../services/view-colors.ts';
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
 * Axes: `toThreeBufferGeometry` converts the Z-up domain geometry to the Y-up
 * three.js space ONCE at the rendering boundary, so every mesh, the selection
 * outline and the projected room labels below are directly in three.js space
 * (UI audit F8); domain objects and the mesh hash are untouched.
 *
 * DOM overlays (room labels, hover tooltip) are rendered outside the Canvas by
 * ViewerOverlays: this in-canvas projector only writes their screen positions
 * to the store (R3F cannot render raw DOM elements inside <Canvas>).
 */

type ColorFor = (group: MeshGroup) => [number, number, number];

/**
 * Soft diagonal hatch for inferred elements (UI audit F11): thin,
 * low-contrast lines on a transparent background instead of the former loud
 * opaque orange stripes.
 */
function makeHatchTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.clearRect(0, 0, 16, 16);
  ctx.strokeStyle = 'rgba(140, 84, 20, 0.4)';
  ctx.lineWidth = 1;
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
 * when a position actually moved). Room labels are skipped when the
 * « Étiquettes des pièces » toggle is off (UI audit F12).
 */
function OverlayProjector({
  roomLabels
}: Readonly<{ roomLabels: readonly { id: string; position: [number, number, number]; label: string }[] }>) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const hoverPoint = useViewerStore((s) => s.hoverPoint);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const showRoomLabels = useViewerStore((s) => s.showRoomLabels);
  const setScreenOverlays = useViewerStore((s) => s.setScreenOverlays);
  const last = useRef<string>('');
  useFrame(() => {
    const project = (p: [number, number, number]): [number, number] | null => {
      const v = new Vector3(p[0], p[1], p[2]).project(camera);
      if (v.z > 1) return null;
      return [Math.round(((v.x * 0.5 + 0.5) * size.width) * 2) / 2, Math.round(((-v.y * 0.5 + 0.5) * size.height) * 2) / 2];
    };
    const overlays: ScreenOverlay[] = [];
    if (showRoomLabels) {
      for (const room of roomLabels) {
        const xy = project(room.position);
        if (xy !== null) overlays.push({ id: room.id, role: 'room', x: xy[0], y: xy[1] });
      }
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

  // Heat-loss shares normalized per building run (UI audit F10): the raw
  // shares (max ≈ 0.2) are divided by the run's maxShare at this presentation
  // layer so the green→red ramp is fully used; the raw shares stay untouched.
  const lossShareById = useMemo(() => {
    if (overlay === null) return new Map<string, number>();
    return normalizedLossShares(overlay.shares);
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

  // Room-label anchors live in domain (Z-up) coordinates in the buffers: they
  // are converted to three.js space with the same boundary conversion as the
  // meshes before being projected to screen pixels.
  const roomLabels = useMemo(
    () =>
      (rooms?.groups ?? [])
        .filter((g) => g.labelPosition !== null)
        .map((g) => {
          const lp = g.labelPosition;
          return {
            id: g.elementId,
            label: g.label,
            position: lp === null ? ([0, 0, 0] as [number, number, number]) : domainToThree(lp)
          };
        }),
    [rooms]
  );

  // Selection outline (UI audit F11): drei <Edges> around the selected element,
  // built from its own vertex range (converted to three.js space) — kept in
  // addition to the 50/50 color mix so the selection stays visible under the
  // heat-loss overlay.
  const selectedGeometry = useMemo(() => {
    if (buffers === null || selectedElementId === null) return null;
    const group = buffers.groups.find((g) => g.elementId === selectedElementId);
    if (group === undefined) return null;
    const from = group.start * 3;
    const to = (group.start + group.count) * 3;
    const sub: MeshBuffers = {
      positions: buffers.positions.slice(from, to),
      normals: buffers.normals.slice(from, to),
      groups: [{ ...group, start: 0 }]
    };
    return toThreeBufferGeometry(sub);
  }, [buffers, selectedElementId]);

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
        <mesh geometry={layers[0].geom} castShadow receiveShadow {...envelopeHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.95} metalness={0} />
        </mesh>
      )}
      {layers[1]?.geom != null && layers[1].sub !== null && layers[1].sub.groups.length > 0 && (
        <mesh geometry={layers[1].geom} castShadow {...inferredHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} map={hatchTexture ?? undefined} transparent opacity={0.9} roughness={0.95} metalness={0} />
        </mesh>
      )}
      {layers[2]?.geom != null && (
        <mesh geometry={layers[2].geom} castShadow {...openingHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} transparent opacity={0.75} roughness={0.35} metalness={0.1} />
        </mesh>
      )}
      {layers[3]?.geom != null && (
        <mesh geometry={layers[3].geom} {...roomHandlers}>
          <meshStandardMaterial vertexColors side={DoubleSide} transparent opacity={0.3} depthWrite={false} roughness={1} metalness={0} />
        </mesh>
      )}
      {selectedGeometry !== null && (
        <Edges geometry={selectedGeometry} color={SELECTION_OUTLINE_COLOR} lineWidth={2.5} threshold={15} />
      )}
      <OverlayProjector roomLabels={roomLabels} />
    </>
  );
}
