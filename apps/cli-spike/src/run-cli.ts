import { readFileSync } from 'node:fs';
import { Open3clAdapter } from '@hes/open3cl-adapter';
import { SimulationError } from '@hes/domain';

/**
 * Writable sink used by the CLI (process.stdout / process.stderr in production).
 */
export interface CliIo {
  writeOut(chunk: string): void;
  writeErr(chunk: string): void;
}

/**
 * Runs the CLI spike logic with injectable IO so it is unit-testable in-process.
 *
 * @param argv - CLI arguments (without node/script), e.g. ['simulate', 'file.xml']
 * @param io - output sinks
 * @returns the process exit code (0 success, 1 failure, 2 usage error)
 */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv;
  const file = args[0];
  if (command !== 'simulate' || args.length !== 1 || file === undefined) {
    io.writeErr('Usage: node . simulate <file.xml>\n');
    return 2;
  }

  let dpeXml: string;
  try {
    dpeXml = readFileSync(file, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    io.writeErr(`Error: cannot read file '${file}': ${detail}\n`);
    return 1;
  }

  const adapter = new Open3clAdapter();
  try {
    const result = await adapter.simulate(dpeXml);
    const output = { engineVersion: adapter.getEngineVersion(), ...result };
    io.writeOut(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof SimulationError) {
      io.writeErr(`Error [${error.code}]: ${error.message}\n`);
      return 1;
    }
    const detail = error instanceof Error ? error.message : String(error);
    io.writeErr(`Unexpected error: ${detail}\n`);
    return 1;
  }
}
