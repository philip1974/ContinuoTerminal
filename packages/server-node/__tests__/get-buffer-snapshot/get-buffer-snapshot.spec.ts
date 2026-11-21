import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { SessionManager } from '../../src/session-manager.js';

beforeEach(() => {
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.onDataCallbacks = [];
});

async function createWithData(sm: SessionManager, chunks: string[]) {
  const created = await sm.create({ cwd: '/tmp' });
  const onData = ptyMocks.onDataCallbacks.at(-1);
  expect(onData).toBeDefined();
  for (const chunk of chunks) {
    onData?.(chunk);
  }
  return created;
}

describe('SessionManager.getBufferSnapshot', () => {
  it('returns concatenated raw data for an active session', async () => {
    const sm = new SessionManager();
    const created = await createWithData(sm, ['one', 'two', 'three']);

    expect(sm.getBufferSnapshot(created.session_id)).toMatchObject({
      data: 'onetwothree',
      truncated: false,
    });
  });

  it('honors sinceSeq as an inclusive cursor', async () => {
    const sm = new SessionManager();
    const created = await createWithData(sm, ['a', 'b', 'c', 'd', 'e']);

    expect(sm.getBufferSnapshot(created.session_id, { sinceSeq: 3 })).toMatchObject({
      data: 'cde',
      nextSeq: 6,
      truncated: false,
    });
  });

  it('returns an empty snapshot for a new session with no chunks', async () => {
    const sm = new SessionManager();
    const created = await sm.create({ cwd: '/tmp' });

    expect(sm.getBufferSnapshot(created.session_id)).toEqual({
      data: '',
      nextSeq: 1,
      truncated: false,
    });
  });

  it('throws SESSION_NOT_FOUND for an unknown session id', () => {
    const sm = new SessionManager();

    expect(() => sm.getBufferSnapshot('unknown-id')).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    );
  });

  it('reports truncated=true when maxBytes evicts earlier chunks', async () => {
    const sm = new SessionManager({ maxBytes: 32 });
    const created = await createWithData(sm, ['a'.repeat(16), 'b'.repeat(16), 'c'.repeat(16)]);

    expect(sm.getBufferSnapshot(created.session_id, { sinceSeq: 0 }).truncated).toBe(true);
  });

  it('reports truncated=false when sinceSeq is past the dropped gap', async () => {
    const sm = new SessionManager({ maxBytes: 32 });
    const created = await createWithData(sm, ['a'.repeat(16), 'b'.repeat(16), 'c'.repeat(16)]);

    expect(sm.getBufferSnapshot(created.session_id, { sinceSeq: 2 })).toEqual({
      data: `${'b'.repeat(16)}${'c'.repeat(16)}`,
      nextSeq: 4,
      truncated: false,
    });
  });

  it('preserves ANSI escape sequences in raw data', async () => {
    const sm = new SessionManager();
    const ansi = '\x1b[31mred\x1b[0m';
    const created = await createWithData(sm, [ansi]);

    expect(sm.getBufferSnapshot(created.session_id).data).toBe(ansi);
  });

  it('treats default options, empty options, and sinceSeq:0 as equivalent', async () => {
    const sm = new SessionManager();
    const created = await createWithData(sm, ['alpha', 'beta']);

    expect(sm.getBufferSnapshot(created.session_id)).toEqual(
      sm.getBufferSnapshot(created.session_id, {}),
    );
    expect(sm.getBufferSnapshot(created.session_id)).toEqual(
      sm.getBufferSnapshot(created.session_id, { sinceSeq: 0 }),
    );
  });

  it('treats sinceSeq:undefined the same as sinceSeq:0', async () => {
    const sm = new SessionManager();
    const created = await createWithData(sm, ['x', 'y']);

    expect(sm.getBufferSnapshot(created.session_id, { sinceSeq: undefined })).toEqual(
      sm.getBufferSnapshot(created.session_id, { sinceSeq: 0 }),
    );
  });

  it('returns a monotonic nextSeq cursor for incremental pulls', async () => {
    const sm = new SessionManager();
    const created = await createWithData(sm, ['first']);
    const first = sm.getBufferSnapshot(created.session_id);
    const onData = ptyMocks.onDataCallbacks.at(-1);

    onData?.('second');
    const second = sm.getBufferSnapshot(created.session_id, { sinceSeq: first.nextSeq });

    expect(first.nextSeq).toBe(2);
    expect(second).toEqual({
      data: 'second',
      nextSeq: 3,
      truncated: false,
    });
  });
});
