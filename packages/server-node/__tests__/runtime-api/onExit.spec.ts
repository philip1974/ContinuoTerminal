import { describe, expect, it, vi, beforeEach } from 'vitest';

const exitHandles = vi.hoisted(() => [] as Array<(info: { exitCode: number; signal?: number }) => void>);

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
    onExit: vi.fn((callback: (info: { exitCode: number; signal?: number }) => void) => {
      exitHandles.push(callback);
      return { dispose: vi.fn() };
    }),
    kill: ptyMocks.kill,
    resize: ptyMocks.resize,
    write: ptyMocks.write,
    pid: ptyMocks.pid,
  })),
}));

import { SessionManager } from '../../src/session-manager.js';

beforeEach(() => {
  exitHandles.length = 0;
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.spawn.mockClear();
});

function fireLastExit(info: { exitCode: number; signal?: number }): void {
  const handle = exitHandles.at(-1);
  if (!handle) {
    throw new Error('No onExit callback captured');
  }
  handle(info);
}

describe('SessionManager onExit runtime callback', () => {
  it('fires with exit info before removeSession, then removes the session', async () => {
    let sm!: SessionManager;
    const observed: Array<{
      id: string;
      info: { exitCode: number; signal?: number };
      listAtCallback: ReturnType<SessionManager['list']>;
    }> = [];
    sm = new SessionManager({
      onExit: (id, info) => {
        observed.push({ id, info, listAtCallback: sm.list() });
      },
    });
    const created = await sm.create({ cwd: '/tmp' });

    await expect(sm.list()).resolves.toEqual(
      expect.objectContaining({
        sessions: expect.arrayContaining([expect.objectContaining({ session_id: created.session_id })]),
      }),
    );

    fireLastExit({ exitCode: 0, signal: 15 });

    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      id: created.session_id,
      info: { exitCode: 0, signal: 15 },
    });
    await expect(observed[0]!.listAtCallback).resolves.toEqual(
      expect.objectContaining({
        sessions: expect.arrayContaining([expect.objectContaining({ session_id: created.session_id })]),
      }),
    );
    await expect(sm.list()).resolves.toEqual({ sessions: [] });
  });

  it('passes signal undefined for natural exit', async () => {
    const onExitSpy = vi.fn();
    const sm = new SessionManager({ onExit: onExitSpy });
    const created = await sm.create({ cwd: '/tmp' });

    fireLastExit({ exitCode: 0 });

    expect(onExitSpy).toHaveBeenCalledWith(created.session_id, { exitCode: 0, signal: undefined });
  });

  it('swallows callback errors and still removes the session', async () => {
    const sm = new SessionManager({
      onExit: () => {
        throw new Error('boom');
      },
    });
    const created = await sm.create({ cwd: '/tmp' });

    expect(() => fireLastExit({ exitCode: 1 })).not.toThrow();

    const listed = await sm.list();
    expect(listed.sessions.some((session) => session.session_id === created.session_id)).toBe(false);
  });
});
