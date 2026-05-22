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

import { SessionManager } from '../../src/session-manager.js';

beforeEach(() => {
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.onDataCallbacks = [];
});

describe('SessionManager onData runtime callback', () => {
  it('calls onData with the session id and PTY chunk', async () => {
    const onData = vi.fn();
    const sm = new SessionManager({ onData });
    const created = await sm.create({});

    expect(ptyMocks.onDataCallbacks).toHaveLength(1);
    ptyMocks.onDataCallbacks[0]?.('chunk-data');

    expect(onData).toHaveBeenCalledWith(created.session_id, 'chunk-data');
  });

  it('swallows onData errors without breaking the output buffer or writing stderr', async () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const sm = new SessionManager({
      onData: () => {
        throw new Error('callback failed');
      },
    });
    const created = await sm.create({});

    try {
      expect(ptyMocks.onDataCallbacks).toHaveLength(1);
      expect(() => ptyMocks.onDataCallbacks[0]?.('chunk-data')).not.toThrow();

      const output = await sm.readOutput({ session_id: created.session_id });
      expect(output.lines.join('')).toContain('chunk-data');
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });
});
