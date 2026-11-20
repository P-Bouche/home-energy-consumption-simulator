import { useViewerStore } from '../store/viewer-store.ts';

/**
 * DOM overlays of the 3D viewer (rendered outside the Canvas): room labels and
 * the hover tooltip with { source, confidence } (AC-P3-03). Pure presentation
 * of store state; positions come from the in-canvas projector.
 */
export function ViewerOverlays() {
  const overlays = useViewerStore((s) => s.screenOverlays);
  const geometry = useViewerStore((s) => s.geometry);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const roomLabelById = new Map(
    (geometry?.elements.filter((e) => e.kind === 'room') ?? []).map((e) => [e.id, e.label])
  );
  const hoveredElement = geometry?.elements.find((el) => el.id === hoveredElementId) ?? null;

  return (
    <>
      {overlays.map((o) =>
        o.role === 'room' ? (
          <div
            key={o.id}
            data-testid="room-label"
            style={{
              position: 'absolute',
              left: o.x,
              top: o.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.85)',
              padding: '2px 4px',
              borderRadius: 4,
              fontSize: 12,
              lineHeight: '16px',
              whiteSpace: 'nowrap'
            }}
          >
            {roomLabelById.get(o.id) ?? o.id}
          </div>
        ) : (
          hoveredElement !== null && (
            <div
              key={o.id}
              data-testid="element-tooltip"
              style={{
                position: 'absolute',
                left: o.x,
                top: o.y,
                transform: 'translate(-50%, -120%)',
                pointerEvents: 'none',
                background: 'rgba(20,20,20,0.88)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                whiteSpace: 'nowrap'
              }}
            >
              {hoveredElement.label} — {hoveredElement.placement.source} — confiance {hoveredElement.placement.confidence}
              {hoveredElement.inferred ? ' (inféré)' : ''}
            </div>
          )
        )
      )}
    </>
  );
}
