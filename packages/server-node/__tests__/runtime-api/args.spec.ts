import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  kill: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
  pid: 12345,
  spawn: vi.fn(),
}));

vi.mock('node-pty', () => ({
  spawn: ptyMocks.spawn.mockImplementation(() => ({
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    kill: ptyMocks.kill,
    resize: ptyMocks.resize,
    write: ptyMocks.write,
    pid: ptyMocks.pid,
  })),
}));

import { SessionManager } from '../../src/session-manager.js';

beforeEach(() => {
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.spawn.mockClear();
});

describe('SessionManager.create runtime args', () => {
  it('forwards args to pty.spawn', async () => {
    const sm = new SessionManager();

    await sm.create({ args: ['-l', '-i'], cwd: '/tmp' });

    expect(ptyMocks.spawn).toHaveBeenCalledTimes(1);
    expect(ptyMocks.spawn).toHaveBeenCalledWith(expect.any(String), ['-l', '-i'], expect.any(Object));
  });

  it('defaults to an empty args array when args is omitted', async () => {
    const sm = new SessionManager();

    await sm.create({ cwd: '/tmp' });

    expect(ptyMocks.spawn).toHaveBeenCalledTimes(1);
    expect(ptyMocks.spawn).toHaveBeenCalledWith(expect.any(String), [], expect.any(Object));
  });

  it('throws TypeError when args is not an array', async () => {
    const sm = new SessionManager();

    await expect(sm.create({ args: null as any, cwd: '/tmp' })).rejects.toThrow(TypeError);
    await expect(sm.create({ args: 'not-array' as any, cwd: '/tmp' })).rejects.toThrow(/args|must be a string\[\]/);
  });
});
