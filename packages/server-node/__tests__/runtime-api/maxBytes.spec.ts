import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  kill: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
  pid: 12345,
  onDataCallbacks: [] as Array<(chunk: string) => void>,
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn((callback: (chunk: string) => void) => {
      ptyMocks.onDataCallbacks.push(callback);
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    kill: ptyMocks.kill,
    resize: ptyMocks.resize,
    write: ptyMocks.write,
    pid: ptyMocks.pid,
  })),
}));

import { SessionManager, SessionBuffer } from '../../src/session-manager.js';

beforeEach(() => {
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.onDataCallbacks = [];
});

describe('SessionManager constructor maxBytes', () => {
  it('uses maxBytes as the per-session output buffer cap', async () => {
    const sm = new SessionManager({ maxBytes: 8192 });
    const created = await sm.create({});
    const chunk = 'x'.repeat(4096);

    expect(ptyMocks.onDataCallbacks).toHaveLength(1);
    ptyMocks.onDataCallbacks[0]?.(chunk);
    ptyMocks.onDataCallbacks[0]?.(chunk);
    ptyMocks.onDataCallbacks[0]?.(chunk);

    const output = await sm.readOutput({ session_id: created.session_id, since_seq: 0 });
    expect(output.truncated).toBe(true);
  });

  it('rejects invalid maxBytes values when creating a session buffer', async () => {
    for (const maxBytes of [NaN, Infinity, -1, 0, 1.5]) {
      const sm = new SessionManager({ maxBytes });
      await expect(sm.create({})).rejects.toThrow(RangeError);
    }
  });
});

describe('SessionBuffer direct constructor (@internal regression)', () => {
  it('uses the direct maxBytes argument as the buffer cap', () => {
    const buffer = new SessionBuffer(8192);
    const chunk = 'x'.repeat(4096);

    buffer.push(chunk);
    buffer.push(chunk);
    buffer.push(chunk);

    expect(buffer.readSince(0).truncated).toBe(true);
  });
});
