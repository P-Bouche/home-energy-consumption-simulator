import { parentPort } from 'node:worker_threads';
import { calcul_3cl, calcul_3cl_xml } from '@open3cl/engine';

// Engine worker thread: the only place where @open3cl/engine executes at
// runtime. The engine is synchronous and CPU-bound, so it must never run on
// the API event loop; this single worker serializes all engine calls of the
// process off the main thread. Plain JS on purpose: it is not type-checked
// (tsconfig includes only .ts) and needs no loader flags (execArgv: []).
parentPort.on('message', (message) => {
  const { id, task } = message;
  try {
    const result =
      task.kind === 'xml'
        ? calcul_3cl_xml(task.xml, { sanitize: true })
        : calcul_3cl(task.json, { sanitize: true });
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? (error.stack ?? error.message) : String(error)
    });
  }
});
