import { describe, it, expect, vi, afterEach } from 'vitest';

import { autorunDelayMs } from '../../src/session-manager.js';

// Cross-platform analysis: the protocol schema documents autorun as
// "200ms (Windows 600)", but the implementation hardcoded 200 on every platform
// — on Windows, ConPTY isn't ready that early and the autorun command was
// dropped/mangled. autorunDelayMs() now honors the documented per-OS contract.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('autorunDelayMs (cross-platform PTY readiness)', () => {
  it('is 200ms on Unix (darwin / linux)', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    expect(autorunDelayMs()).toBe(200);
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(autorunDelayMs()).toBe(200);
  });

  it('is 600ms on Windows (ConPTY needs longer before accepting input)', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(autorunDelayMs()).toBe(600);
  });
});
