import { create } from 'zustand';
import { getSimulationHistory, getSimulationJob, runSimulation } from '../services/api-client.ts';
import type { SimulationJobJson, SimulationResultJson } from '../types.ts';

/**
 * Simulation state of the building page (P2).
 */
export type SimulationStatus = 'idle' | 'running' | 'queued' | 'done' | 'error';

/**
 * Zustand store owning the simulation flow: run → (queued? poll job) → result
 * + history. Components read it and call the actions; no business logic in
 * components.
 */
export interface SimulationState {
  readonly status: SimulationStatus;
  readonly result: SimulationResultJson | null;
  readonly job: SimulationJobJson | null;
  readonly history: readonly SimulationResultJson[];
  readonly cached: boolean;
  readonly error: string | null;
  readonly run: (buildingId: string) => Promise<void>;
  readonly loadHistory: (buildingId: string) => Promise<void>;
  readonly reset: () => void;
}

const POLL_INTERVAL_MS = 700;

/**
 * Creates the simulation store.
 */
export const useSimulationStore = create<SimulationState>((set, get) => ({
  status: 'idle',
  result: null,
  job: null,
  history: [],
  cached: false,
  error: null,

  run: async (buildingId) => {
    set({ status: 'running', error: null, cached: false });
    try {
      const response = await runSimulation(buildingId);
      if (response.mode === 'async' && response.job !== undefined) {
        set({ status: 'queued', job: response.job });
        await pollJob(response.job.id, buildingId, set, get);
        return;
      }
      const result = response.result;
      if (result === undefined) {
        throw new Error('the API returned neither a result nor a job');
      }
      set({ status: 'done', result, job: null, cached: response.cached });
      await get().loadHistory(buildingId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
    }
  },

  loadHistory: async (buildingId) => {
    try {
      const history = await getSimulationHistory(buildingId);
      set({ history: history.results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  reset: () => set({ status: 'idle', result: null, job: null, history: [], cached: false, error: null })
}));

type Set = (partial: Partial<SimulationState>) => void;
type Get = () => SimulationState;

/**
 * Polls a queued job until it reaches a terminal state, then loads the
 * resulting simulation (or surfaces the typed failure).
 */
async function pollJob(jobId: string, buildingId: string, set: Set, get: Get): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const job = await getSimulationJob(jobId);
    set({ job });
    if (job.status === 'done') {
      const history = await getSimulationHistory(buildingId);
      const result = history.results.find((r) => r.id === job.resultId) ?? history.results[0] ?? null;
      set({ status: 'done', job, result, history: history.results, cached: false });
      return;
    }
    if (job.status === 'failed') {
      const message = job.error !== null ? `[${job.error.code}] ${job.error.message}` : 'simulation failed';
      set({ status: 'error', error: message, job });
      return;
    }
    void get;
  }
}
