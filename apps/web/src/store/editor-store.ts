import { create } from 'zustand';
import { getAuditLog, getBuilding, patchBuilding, undoBuilding } from '../services/api-client.ts';
import { ApiError } from '../services/api-client.ts';
import { useSimulationStore } from './simulation-store.ts';
import type { AuditEntryJson, BuildingCommandJson, BuildingJson } from '../types.ts';

/**
 * P4 editor state of the building page (2D-first).
 */
export type EditorStatus = 'idle' | 'loading' | 'saving' | 'error';

/**
 * Zustand store owning the editing flow: load → edit command → save (PATCH
 * with If-Match) → re-run simulation (P2) → reload audit; plus undo and the
 * 409 conflict handling (reload + surface). Components read it and call the
 * actions; no business logic in components.
 */
export interface EditorState {
  readonly building: BuildingJson | null;
  readonly version: number;
  readonly audit: readonly AuditEntryJson[];
  readonly status: EditorStatus;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly fieldErrors: Record<string, string[]>;
  readonly pendingSimulation: boolean;
  readonly load: (buildingId: string) => Promise<void>;
  readonly save: (command: BuildingCommandJson) => Promise<boolean>;
  readonly undo: () => Promise<void>;
  readonly loadAudit: () => Promise<void>;
  readonly reset: () => void;
}

const USER_ID = 'local-user';

/**
 * Triggers the P2 re-simulation after an edit, but never concurrently with an
 * in-flight run: if a simulation is already running/queued, the re-run is
 * deferred (pendingSimulation) and chained when the current one finishes
 * (subscription at the bottom of this file), so rapid successive saves cannot
 * fire overlapping engine runs.
 */
function triggerSimulation(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState
): void {
  const { building } = get();
  if (building === null) return;
  const simStatus = useSimulationStore.getState().status;
  if (simStatus === 'running' || simStatus === 'queued') {
    set({ pendingSimulation: true });
    return;
  }
  set({ pendingSimulation: false });
  void useSimulationStore.getState().run(building.id);
}

/**
 * Creates the editor store.
 */
export const useEditorStore = create<EditorState>((set, get) => ({
  building: null,
  version: 0,
  audit: [],
  status: 'idle',
  error: null,
  conflict: false,
  fieldErrors: {},
  pendingSimulation: false,

  load: async (buildingId) => {
    set({ status: 'loading', error: null });
    try {
      const response = await getBuilding(buildingId);
      const audit = await getAuditLog(buildingId);
      set({ building: response.building, version: response.version, audit: audit.entries, status: 'idle' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
    }
  },

  save: async (command) => {
    const { building, version } = get();
    if (building === null) return false;
    set({ status: 'saving', error: null, conflict: false, fieldErrors: {} });
    try {
      const response = await patchBuilding(building.id, command, version, USER_ID);
      set({ building: response.building, version: response.version, status: 'idle' });
      await get().loadAudit();
      // after a successful edit, re-simulate through the P2 endpoint
      // (the input hash changed → cache miss → new engine run)
      triggerSimulation(set, get);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.body?.fieldErrors !== undefined) {
        const fieldErrors: Record<string, string[]> = {};
        for (const fe of error.body.fieldErrors) {
          fieldErrors[fe.field] = [...(fieldErrors[fe.field] ?? []), fe.message];
        }
        set({ status: 'error', fieldErrors, error: error.message });
        return false;
      }
      if (error instanceof ApiError && error.status === 409) {
        // stale version: reload the current state so the user can retry
        set({ status: 'error', conflict: true, error: error.message });
        await get().load(building.id);
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
      return false;
    }
  },

  undo: async () => {
    const { building, version } = get();
    if (building === null) return;
    set({ status: 'saving', error: null, conflict: false });
    try {
      const response = await undoBuilding(building.id, version, USER_ID);
      set({ building: response.building, version: response.version, status: 'idle' });
      await get().loadAudit();
      triggerSimulation(set, get);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        set({ status: 'error', conflict: true, error: error.message });
        await get().load(building.id);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
    }
  },

  loadAudit: async () => {
    const { building } = get();
    if (building === null) return;
    try {
      const audit = await getAuditLog(building.id);
      set({ audit: audit.entries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  reset: () => set({ building: null, version: 0, audit: [], status: 'idle', error: null, conflict: false, fieldErrors: {}, pendingSimulation: false })
}));

// chain a deferred re-simulation when the in-flight one reaches a terminal state
useSimulationStore.subscribe((state, previous) => {
  if (state.status === previous.status) return;
  if (state.status !== 'done' && state.status !== 'error') return;
  const editor = useEditorStore.getState();
  if (editor.pendingSimulation && editor.building !== null) {
    useEditorStore.setState({ pendingSimulation: false });
    void useSimulationStore.getState().run(editor.building.id);
  }
});
