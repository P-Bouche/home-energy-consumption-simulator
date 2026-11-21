import { formatSharePercent } from '../services/heat-loss.ts';
import { useHeatLossOverlay, useViewerStore } from '../store/viewer-store.ts';

/**
 * DOM overlays of the 3D viewer (rendered outside the Canvas): room labels and
 * the hover tooltip with { source, confidence } and, when the heat-loss
 * overlay is on, the element's numeric share of total losses (AC-P3-03,
 * UI audit F10/F12). Pure presentation of store state; positions come from the
 * in-canvas projector (already in three.js screen space).
 */
export function ViewerOverlays() {
  const overlays = useViewerStore((s) => s.screenOverlays);
  const geometry = useViewerStore((s) => s.geometry);
  const hoveredElementId = useViewerStore((s) => s.hoveredElementId);
  const { overlay } = useHeatLossOverlay();
  const roomLabelById = new Map(
    (geometry?.elements.filter((e) => e.kind === 'room') ?? []).map((e) => [e.id, e.label])
  );
  const hoveredElement = geometry?.elements.find((el) => el.id === hoveredElementId) ?? null;
  const hoveredShare =
    overlay === null || hoveredElementId === null
      ? null
      : (overlay.shares.find((s) => s.elementId === hoveredElementId)?.share ?? null);

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
              maxWidth: 220,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              textAlign: 'center'
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
                lineHeight: '16px',
                maxWidth: 280,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere'
              }}
            >
              {hoveredElement.label} — {hoveredElement.placement.source} — confiance {hoveredElement.placement.confidence}
              {hoveredElement.inferred ? ' (inféré)' : ''}
              {hoveredShare !== null ? ` — perte ${formatSharePercent(hoveredShare)}` : ''}
            </div>
          )
        )
      )}
    </>
  );
}
