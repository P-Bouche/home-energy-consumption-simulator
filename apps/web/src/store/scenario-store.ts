import { create } from 'zustand';
import {
  applyScenario,
  compareScenarios,
  createScenario,
  deleteScenario,
  getBuilding,
  listScenarios,
  simulateScenario
} from '../services/api-client.ts';
import type {
  ApplyScenarioResponse,
  BuildingJson,
  CommandJson,
  ComparisonResponse,
  ScenarioJson,
  SimulateScenarioResponse
} from '../types.ts';

/**
 * Scenario state of the building page (P5, headless). Components read the
 * store and call its actions; no business logic in components.
 */
export type ScenarioStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error';

export interface ScenarioState {
  readonly status: ScenarioStatus;
  readonly buildingId: string | null;
  readonly building: BuildingJson | null;
  readonly scenarios: readonly ScenarioJson[];
  readonly comparison: ComparisonResponse | null;
  readonly lastSimulations: Readonly<Record<string, SimulateScenarioResponse>>;
  readonly lastApply: ApplyScenarioResponse | null;
  readonly error: string | null;
  readonly load: (buildingId: string) => Promise<void>;
  readonly create: (input: { name: string; description?: string; commands: readonly CommandJson[] }) => Promise<ScenarioJson>;
  readonly simulate: (scenarioId: string) => Promise<void>;
  readonly compare: () => Promise<void>;
  readonly apply: (scenarioId: string) => Promise<void>;
  readonly remove: (scenarioId: string) => Promise<void>;
  readonly reset: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the scenario store.
 */
export const useScenarioStore = create<ScenarioState>((set, get) => ({
  status: 'idle',
  buildingId: null,
  building: null,
  scenarios: [],
  comparison: null,
  lastSimulations: {},
  lastApply: null,
  error: null,

  load: async (buildingId) => {
    set({ status: 'loading', buildingId, error: null });
    try {
      const [building, list] = await Promise.all([getBuilding(buildingId), listScenarios(buildingId)]);
      set({ status: 'ready', building: building.building, scenarios: list.scenarios });
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
    }
  },

  create: async (input) => {
    const buildingId = get().buildingId;
    if (buildingId === null) throw new Error('no building loaded');
    set({ status: 'busy', error: null });
    try {
      const scenario = await createScenario(buildingId, input);
      set({ status: 'ready', scenarios: [...get().scenarios, scenario] });
      return scenario;
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
      throw error;
    }
  },

  simulate: async (scenarioId) => {
    set({ status: 'busy', error: null });
    try {
      const response = await simulateScenario(scenarioId);
      set({
        status: 'ready',
        lastSimulations: { ...get().lastSimulations, [scenarioId]: response },
        comparison: null // results moved: force a fresh compare
      });
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
    }
  },

  compare: async () => {
    const buildingId = get().buildingId;
    if (buildingId === null) throw new Error('no building loaded');
    set({ status: 'busy', error: null });
    try {
      const comparison = await compareScenarios(buildingId);
      set({ status: 'ready', comparison });
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
    }
  },

  apply: async (scenarioId) => {
    set({ status: 'busy', error: null });
    try {
      const response = await applyScenario(scenarioId);
      set({ status: 'ready', lastApply: response, comparison: null });
      await get().load(response.simulation.buildingId);
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
    }
  },

  remove: async (scenarioId) => {
    set({ status: 'busy', error: null });
    try {
      await deleteScenario(scenarioId);
      set({
        status: 'ready',
        scenarios: get().scenarios.filter((s) => s.id !== scenarioId),
        comparison: null
      });
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
    }
  },

  reset: () =>
    set({
      status: 'idle',
      buildingId: null,
      building: null,
      scenarios: [],
      comparison: null,
      lastSimulations: {},
      lastApply: null,
      error: null
    })
}));
