import { Worker } from 'node:worker_threads';
import type { EngineDpeResult } from '@open3cl/engine';

/**
 * A unit of engine work sent to the worker thread.
 */
export type EngineTask =
  | { readonly kind: 'xml'; readonly xml: string }
  | { readonly kind: 'json'; readonly json: Record<string, unknown> };

interface EngineWorkerRequest {
  readonly id: number;
  readonly task: EngineTask;
}

type EngineWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: EngineDpeResult | null }
  | { readonly id: number; readonly ok: false; readonly message: string };

interface PendingRun {
  readonly resolve: (result: EngineDpeResult | null) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Runs the Open3CL engine in a dedicated `worker_threads` worker
 * (`engine-worker.mjs`). The engine is synchronous and CPU-bound: executing
 * it on the main thread would block the API event loop for the whole
 * simulation (review finding on PR #14). One worker per process serializes
 * engine calls naturally (messages are processed one at a time).
 *
 * The worker is `unref()`'d so it never keeps the process alive by itself;
 * while runs are pending, a ref'd keep-alive interval keeps the event loop
 * alive so responses are actually received (CLI spike, benchmarks). If the
 * worker crashes, pending runs are rejected and the next `run()` lazily
 * starts a fresh worker.
 */
export class EngineRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRun>();
  private keepAlive: NodeJS.Timeout | null = null;

  /**
   * Executes one engine task in the worker thread.
   *
   * @returns the raw engine result (null when the DPE model is unsupported)
   * @throws Error when the engine threw inside the worker
   */
  run(task: EngineTask): Promise<EngineDpeResult | null> {
    const worker = this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;
    this.armKeepAlive();
    return new Promise<EngineDpeResult | null>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, task } satisfies EngineWorkerRequest);
    });
  }

  /**
   * Terminates the worker thread (idempotent); pending runs are rejected.
   */
  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.rejectAll(new Error('engine runner disposed'));
    if (worker !== null) {
      await worker.terminate();
    }
  }

  private ensureWorker(): Worker {
    if (this.worker === null) {
      const worker = new Worker(new URL('./engine-worker.mjs', import.meta.url), { execArgv: [] });
      worker.on('message', (message: unknown) => this.onMessage(message));
      worker.on('error', (error: Error) => this.onWorkerCrash(error));
      worker.on('exit', (code: number) =>
        this.onWorkerCrash(new Error(`engine worker exited unexpectedly with code ${code}`))
      );
      // unref AFTER attaching the listeners: attaching a 'message' listener
      // re-refs the worker's internal MessagePort, so unref must come last for
      // the worker to never keep the process alive on its own.
      worker.unref();
      this.worker = worker;
    }
    return this.worker;
  }

  private onMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }
    const response = message as Partial<EngineWorkerResponse>;
    if (typeof response.id !== 'number') {
      return;
    }
    const pending = this.pending.get(response.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(response.id);
    if (this.pending.size === 0) {
      this.disarmKeepAlive();
    }
    if (response.ok === true) {
      pending.resolve((response as { result: EngineDpeResult | null }).result);
    } else {
      pending.reject(new Error(typeof response.message === 'string' ? response.message : 'engine worker failed'));
    }
  }

  private onWorkerCrash(error: Error): void {
    this.worker = null;
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    this.disarmKeepAlive();
    for (const run of pending) {
      run.reject(error);
    }
  }

  private armKeepAlive(): void {
    if (this.keepAlive === null) {
      this.keepAlive = setInterval(() => undefined, 60_000);
    }
  }

  private disarmKeepAlive(): void {
    if (this.keepAlive !== null) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }
}

let singleton: EngineRunner | null = null;

/**
 * Process-wide engine runner singleton: one worker thread per process.
 */
export function getEngineRunner(): EngineRunner {
  if (singleton === null) {
    singleton = new EngineRunner();
  }
  return singleton;
}
