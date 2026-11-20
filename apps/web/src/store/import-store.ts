import { create } from 'zustand';
import { uploadDpeXml } from '../services/api-client.ts';
import type { ImportReportJson } from '../types.ts';

/**
 * Upload state of the import page.
 */
export type ImportStatus = 'idle' | 'uploading' | 'done' | 'error';

/**
 * Zustand store holding the import flow state. Components read it and call
 * {@link ImportState.upload}; no business logic lives in components.
 */
export interface ImportState {
  readonly status: ImportStatus;
  readonly buildingId: string | null;
  readonly report: ImportReportJson | null;
  readonly error: string | null;
  readonly upload: (fileName: string, content: string) => Promise<void>;
  readonly reset: () => void;
}

/**
 * Creates the import store.
 */
export const useImportStore = create<ImportState>((set) => ({
  status: 'idle',
  buildingId: null,
  report: null,
  error: null,
  upload: async (fileName, content) => {
    set({ status: 'uploading', error: null });
    try {
      const result = await uploadDpeXml(fileName, content);
      set({ status: 'done', buildingId: result.buildingId, report: result.report, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message, buildingId: null, report: null });
    }
  },
  reset: () => set({ status: 'idle', buildingId: null, report: null, error: null })
}));
