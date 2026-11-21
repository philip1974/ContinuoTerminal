import { createRequire } from 'node:module';
import path from 'node:path';

export function resolveBinPath(binPath?: string): string {
  if (binPath) return binPath;
  const require = createRequire(import.meta.url);
  return path.resolve(path.dirname(require.resolve('@continuo-terminal/server-node')), 'bin.mjs');
}
