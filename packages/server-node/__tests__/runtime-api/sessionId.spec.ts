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

describe('SessionManager.create runtime session_id', () => {
  it('honors a custom session_id', async () => {
    const sm = new SessionManager();

    const created = await sm.create({ session_id: 'custom-id-abc', cwd: '/tmp' });

    expect(created.session_id).toBe('custom-id-abc');
    expect(ptyMocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('throws RangeError when session_id collides with an active session', async () => {
    const sm = new SessionManager();

    await sm.create({ session_id: 'dup', cwd: '/tmp' });

    await expect(sm.create({ session_id: 'dup', cwd: '/tmp' })).rejects.toThrow(RangeError);
    await expect(sm.create({ session_id: 'dup', cwd: '/tmp' })).rejects.toThrow(/already in use/);
  });

  it('throws RangeError when session_id is empty', async () => {
    const sm = new SessionManager();

    await expect(sm.create({ session_id: '', cwd: '/tmp' })).rejects.toThrow(RangeError);
    await expect(sm.create({ session_id: '', cwd: '/tmp' })).rejects.toThrow(/must be non-empty/);
  });

  it('uses a non-empty uuid v4 session_id by default', async () => {
    const sm = new SessionManager();

    const custom = await sm.create({ session_id: 'custom-1', cwd: '/tmp' });
    const generated = await sm.create({ cwd: '/tmp' });

    expect(custom.session_id).toBe('custom-1');
    expect(generated.session_id).toHaveLength(36);
    expect(generated.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(generated.session_id).not.toBe('custom-1');
  });
});
