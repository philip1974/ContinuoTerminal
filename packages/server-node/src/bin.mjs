#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const HELP_TEXT = `Usage: continuo-terminal-server [options]

Run the Continuo Terminal MCP server.

Options:
  -h, --help               Show this help message.
  -v, --version            Print the package version.

Transport options:
  --transport <mode>       Transport mode: stdio or http. Default: stdio.
  --host <addr>            HTTP bind address. Default: 127.0.0.1.
  --port <n>               HTTP port. Use 0 for an ephemeral port. Default: 0.

HTTP transport is localhost-first and currently has no auth, CORS, or
policy layer. Bind only to trusted local interfaces.

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
  const options = {
    kind: 'run',
    transport: 'stdio',
    host: '127.0.0.1',
    port: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      return { kind: 'help' };
    }
    if (arg === '-v' || arg === '--version') {
      return { kind: 'version' };
    }
    if (arg === '--transport') {
      const value = argv[++i];
      if (value !== 'stdio' && value !== 'http') {
        return { kind: 'error', message: `Invalid --transport: ${value ?? '<missing>'}` };
      }
      options.transport = value;
      continue;
    }
    if (arg === '--host') {
      const value = argv[++i];
      if (!value) {
        return { kind: 'error', message: 'Missing value for --host' };
      }
      options.host = value;
      continue;
    }
    if (arg === '--port') {
      const value = argv[++i];
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        return { kind: 'error', message: `Invalid --port: ${value ?? '<missing>'}` };
      }
      options.port = port;
      continue;
    }
    return { kind: 'error', message: `Unknown option: ${arg}` };
  }
  return options;
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
  await main({
    transport: parsed.transport,
    port: parsed.port,
    host: parsed.host,
  });
}

cli().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
