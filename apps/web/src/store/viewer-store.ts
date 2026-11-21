import { useMemo } from 'react';
import { create } from 'zustand';
import type { HeatLossOverlay } from '@hes/domain';
import { getBuilding, getBuildingGeometry, getSimulationHistory } from '../services/api-client.ts';
import { tryOverlayFromSimulation } from '../services/heat-loss.ts';
import type { GeometryJson, SimulationResultJson } from '../types.ts';

export type { HeatLossOverlay };

/**
 * Viewer status.
 */
export type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * A DOM overlay anchored to a 3D point (projected to canvas pixels by the
 * in-canvas projector). role 'room' renders a room label, 'hover' the
 * confidence tooltip of the hovered element.
 */
export interface ScreenOverlay {
  readonly id: string;
  readonly role: 'room' | 'hover';
  readonly x: number;
  readonly y: number;
}

/**
 * Zustand store of the 3D viewer (P3). Components read it and call its
 * actions; no business logic lives in components. The reconstruction itself is
 * computed server-side (GET /buildings/:id/geometry); the store only holds
 * the fetched geometry JSON and the UI state (selection, hover, overlay).
 */
export interface ViewerState {
  readonly status: ViewerStatus;
  readonly buildingId: string | null;
  readonly geometry: GeometryJson | null;
  readonly error: string | null;
  readonly selectedElementId: string | null;
  readonly hoveredElementId: string | null;
  readonly hoverPoint: [number, number, number] | null;
  /**
   * Latest SimulationResult (P2). null until P2 is wired → the heat-loss
   * overlay stays hidden (FR-P3-04).
   */
  /**
   * Latest persisted SimulationResult (P2, GET /buildings/:id/simulations).
   * null when the building was never simulated → the heat-loss overlay stays
   * hidden (FR-P3-04).
   */
  readonly simulation: SimulationResultJson | null;
  readonly showHeatLoss: boolean;
  /**
   * DPE number of the building (from the import report via
   * GET /buildings/:id), shown in the viewer header instead of the UUID.
   * null when unavailable — the header then falls back to the raw id.
   */
  readonly dpeNumber: string | null;
  /** Whether the room-name DOM labels are projected over the 3D view (F12). */
  readonly showRoomLabels: boolean;
  readonly screenOverlays: readonly ScreenOverlay[];
  readonly loadGeometry: (buildingId: string) => Promise<void>;
  readonly setScreenOverlays: (overlays: readonly ScreenOverlay[]) => void;
  readonly select: (elementId: string | null) => void;
  readonly setHovered: (elementId: string | null, point: [number, number, number] | null) => void;
  readonly setSimulation: (result: SimulationResultJson | null) => void;
  readonly toggleHeatLoss: () => void;
  readonly toggleRoomLabels: () => void;
  readonly reset: () => void;
}

/**
 * Creates the viewer store.
 */
export const useViewerStore = create<ViewerState>((set, get) => ({
  status: 'idle',
  buildingId: null,
  geometry: null,
  error: null,
  selectedElementId: null,
  hoveredElementId: null,
  hoverPoint: null,
  simulation: null,
  showHeatLoss: false,
  dpeNumber: null,
  showRoomLabels: true,
  screenOverlays: [],
  loadGeometry: async (buildingId) => {
    if (get().buildingId === buildingId && get().status === 'ready') return;
    set({ status: 'loading', buildingId, error: null, geometry: null, selectedElementId: null, hoveredElementId: null, hoverPoint: null, dpeNumber: null });
    try {
      const response = await getBuildingGeometry(buildingId);
      set({ status: 'ready', geometry: response.geometry });
      // Best-effort: wire the heat-loss overlay to the latest persisted
      // SimulationResult (P2). Absence (404/empty history) just hides it.
      getSimulationHistory(buildingId)
        .then((history) => {
          const latest = [...history.results].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
          set({ simulation: latest });
        })
        .catch(() => set({ simulation: null }));
      // Best-effort: DPE number for the viewer header (F12). 404 just leaves
      // the header on the raw building id.
      getBuilding(buildingId)
        .then((building) => set({ dpeNumber: building.report.dpeNumber }))
        .catch(() => set({ dpeNumber: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
    }
  },
  select: (elementId) => set({ selectedElementId: elementId }),
  setScreenOverlays: (overlays) => set({ screenOverlays: overlays }),
  setHovered: (elementId, point) => set({ hoveredElementId: elementId, hoverPoint: point }),
  setSimulation: (result) => set({ simulation: result, showHeatLoss: result !== null ? get().showHeatLoss : false }),
  toggleHeatLoss: () => {
    const { simulation, showHeatLoss } = get();
    if (simulation === null) return;
    set({ showHeatLoss: !showHeatLoss });
  },
  toggleRoomLabels: () => set({ showRoomLabels: !get().showRoomLabels }),
  reset: () =>
    set({
      status: 'idle',
      buildingId: null,
      geometry: null,
      error: null,
      selectedElementId: null,
      hoveredElementId: null,
      hoverPoint: null,
      simulation: null,
      showHeatLoss: false,
      dpeNumber: null,
      showRoomLabels: true,
      screenOverlays: []
    })
}));

/**
 * Derived read-only projection: the heat-loss overlay for the loaded geometry,
 * or null when hidden (no SimulationResult, or overlay toggled off). Shares
 * sum to 100%. Never throws inside render: a SimulationResult without
 * deperdition data degrades to `{ overlay: null, error }`.
 */
export function useHeatLossOverlay(): { overlay: HeatLossOverlay | null; error: string | null } {
  const simulation = useViewerStore((s) => s.simulation);
  const geometry = useViewerStore((s) => s.geometry);
  const showHeatLoss = useViewerStore((s) => s.showHeatLoss);
  return useMemo(() => {
    if (simulation === null || geometry === null || !showHeatLoss) return { overlay: null, error: null };
    return tryOverlayFromSimulation(simulation, geometry);
  }, [simulation, geometry, showHeatLoss]);
} 
