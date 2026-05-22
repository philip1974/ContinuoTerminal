import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  kill: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
  pid: 12345,
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
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
});

describe('SessionManager.resize runtime API', () => {
  it('resizes the PTY for an active session', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});

    await sm.resize({ session_id: created.session_id, cols: 120, rows: 40 });

    expect(ptyMocks.resize).toHaveBeenCalledWith(120, 40);
  });

  it('throws SESSION_NOT_FOUND for an unknown session_id', async () => {
    const sm = new SessionManager();

    await expect(sm.resize({ session_id: 'missing', cols: 120, rows: 40 })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('propagates errors thrown by node-pty resize', async () => {
    const error = new Error('ioctl(2) failed, EBADF');
    ptyMocks.resize.mockImplementationOnce(() => {
      throw error;
    });
    const sm = new SessionManager();
    const created = await sm.create({});

    await expect(sm.resize({ session_id: created.session_id, cols: 120, rows: 40 })).rejects.toBe(error);
  });
});
