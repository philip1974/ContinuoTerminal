import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  kill: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
  pid: 12345,
  onExitCallbacks: [] as Array<(event: { exitCode: number; signal?: number }) => void>,
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn((callback: (event: { exitCode: number; signal?: number }) => void) => {
      ptyMocks.onExitCallbacks.push(callback);
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
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.onExitCallbacks = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionManager.kill gracePeriodMs runtime API', () => {
  it('removes the session immediately when gracePeriodMs is omitted', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});

    await sm.kill({ session_id: created.session_id, signal: 'SIGTERM' });

    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    expect(ptyMocks.kill).toHaveBeenCalledWith('SIGTERM');
    await expect(sm.list()).resolves.toEqual({ sessions: [] });
  });

  // Polish round-4: kill is fire-and-forget — the session is removed as soon as
  // the signal is sent. The tool description promises no retry, so a second kill
  // on the same id must be a silent no-op ({}) that does NOT reach the PTY again
  // (the handle is already gone). Guards against the description drifting back to
  // an unmet "retry a stronger signal" promise.
  it('is not retryable: a second kill after removal is a silent no-op', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});

    await sm.kill({ session_id: created.session_id, signal: 'SIGTERM' });
    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    await expect(sm.list()).resolves.toEqual({ sessions: [] });

    // Process ignored SIGTERM and is still alive; caller retries SIGKILL.
    const retry = await sm.kill({ session_id: created.session_id, signal: 'SIGKILL' });

    expect(retry).toEqual({}); // silent no-op
    expect(ptyMocks.kill).toHaveBeenCalledTimes(1); // no second signal reached the PTY
    expect(ptyMocks.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('sends SIGKILL after the grace period when the PTY has not exited', async () => {
    vi.useFakeTimers();
    const sm = new SessionManager();
    const created = await sm.create({});

    const killPromise = sm.kill({ session_id: created.session_id, signal: 'SIGTERM', gracePeriodMs: 50 });

    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    expect(ptyMocks.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');

    await vi.advanceTimersByTimeAsync(49);
    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await killPromise;

    expect(ptyMocks.kill).toHaveBeenCalledTimes(2);
    expect(ptyMocks.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
    await expect(sm.list()).resolves.toEqual({ sessions: [] });
  });

  it('does not send SIGKILL when onExit fires during the grace period', async () => {
    vi.useFakeTimers();
    const sm = new SessionManager();
    const created = await sm.create({});

    const killPromise = sm.kill({ session_id: created.session_id, signal: 'SIGTERM', gracePeriodMs: 50 });
    ptyMocks.onExitCallbacks[0]?.({ exitCode: 0 });

    await vi.advanceTimersByTimeAsync(50);
    await killPromise;

    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    expect(ptyMocks.kill).toHaveBeenCalledWith('SIGTERM');
    expect(ptyMocks.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('does not wait or send SIGTERM when initial signal is SIGKILL', async () => {
    vi.useFakeTimers();
    const sm = new SessionManager();
    const created = await sm.create({});

    await sm.kill({ session_id: created.session_id, signal: 'SIGKILL', gracePeriodMs: 50 });

    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    expect(ptyMocks.kill).toHaveBeenCalledWith('SIGKILL');
    expect(ptyMocks.kill).not.toHaveBeenCalledWith('SIGTERM');
  });

  it('uses SIGINT as the initial signal and escalates to SIGKILL after grace', async () => {
    vi.useFakeTimers();
    const sm = new SessionManager();
    const created = await sm.create({});

    const killPromise = sm.kill({ session_id: created.session_id, signal: 'SIGINT', gracePeriodMs: 50 });

    expect(ptyMocks.kill).toHaveBeenCalledTimes(1);
    expect(ptyMocks.kill).toHaveBeenNthCalledWith(1, 'SIGINT');

    await vi.advanceTimersByTimeAsync(50);
    await killPromise;

    expect(ptyMocks.kill).toHaveBeenCalledTimes(2);
    expect(ptyMocks.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });
});
