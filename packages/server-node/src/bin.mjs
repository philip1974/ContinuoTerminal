#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const HELP_TEXT = `Usage: continuo-terminal-server [options]

Run the Continuo Terminal MCP server over stdio.

Options:
  -h, --help       Show this help message.
  -v, --version    Print the package version.

The short alias "ct-server" is also available. Use
"continuo-terminal-server" as the canonical command name in scripts and
documentation.
`;

function getVersion() {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  return String(packageJson.version);
}

function parseArgs(argv) {
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      return { kind: 'help' };
    }
    if (arg === '-v' || arg === '--version') {
      return { kind: 'version' };
    }
    return { kind: 'error', message: `Unknown option: ${arg}` };
  }
  return { kind: 'run' };
}

async function loadMain() {
  const require = createRequire(import.meta.url);
  const tsxEsmPath = require.resolve('tsx/esm');
  await import(pathToFileURL(tsxEsmPath).href);
  return import('./server.ts');
}

/**
 * Starts the stdio MCP server. The imported main() owns long-lived server
 * shutdown and may call process.exit() after signal or stdin-close cleanup;
 * this wrapper only handles argument parsing and startup failures.
 */
async function cli() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (parsed.kind === 'version') {
    process.stdout.write(`${getVersion()}\n`);
    return;
  }
  if (parsed.kind === 'error') {
    process.stderr.write(`${parsed.message}\n\n${HELP_TEXT}`);
    process.exitCode = 2;
    return;
  }

  const { main } = await loadMain();
  await main();
}

cli().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
