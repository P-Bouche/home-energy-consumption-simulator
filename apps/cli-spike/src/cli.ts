import { runCli } from './run-cli.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  writeOut: (chunk) => process.stdout.write(chunk),
  writeErr: (chunk) => process.stderr.write(chunk)
});
