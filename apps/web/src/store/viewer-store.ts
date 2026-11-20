import { useMemo } from 'react';
import { create } from 'zustand';
import type { HeatLossOverlay } from '@hes/domain';
import { getBuildingGeometry } from '../services/api-client.ts';
import { overlayFromSimulation } from '../services/heat-loss.ts';
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
  readonly simulation: SimulationResultJson | null;
  readonly showHeatLoss: boolean;
  readonly screenOverlays: readonly ScreenOverlay[];
  readonly loadGeometry: (buildingId: string) => Promise<void>;
  readonly setScreenOverlays: (overlays: readonly ScreenOverlay[]) => void;
  readonly select: (elementId: string | null) => void;
  readonly setHovered: (elementId: string | null, point: [number, number, number] | null) => void;
  readonly setSimulation: (result: SimulationResultJson | null) => void;
  readonly toggleHeatLoss: () => void;
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
  screenOverlays: [],
  loadGeometry: async (buildingId) => {
    if (get().buildingId === buildingId && get().status === 'ready') return;
    set({ status: 'loading', buildingId, error: null, geometry: null, selectedElementId: null, hoveredElementId: null, hoverPoint: null });
    try {
      const response = await getBuildingGeometry(buildingId);
      set({ status: 'ready', geometry: response.geometry });
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
      screenOverlays: []
    })
}));

/**
 * Derived read-only projection: the heat-loss overlay for the loaded geometry,
 * or null when hidden (no SimulationResult, or overlay toggled off). Shares
 * sum to 100%.
 */
export function useHeatLossOverlay(): HeatLossOverlay | null {
  const simulation = useViewerStore((s) => s.simulation);
  const geometry = useViewerStore((s) => s.geometry);
  const showHeatLoss = useViewerStore((s) => s.showHeatLoss);
  return useMemo(() => {
    if (simulation === null || geometry === null || !showHeatLoss) return null;
    return overlayFromSimulation(simulation, geometry);
  }, [simulation, geometry, showHeatLoss]);
}
