import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { resolveBinPath } from '../../../src/transports/stdio-child.js';

describe('stdio-child transport helpers', () => {
  it('resolves server-node bin.mjs', () => {
    const binPath = resolveBinPath();

    expect(binPath.endsWith('bin.mjs')).toBe(true);
    expect(existsSync(binPath)).toBe(true);
  });
});
