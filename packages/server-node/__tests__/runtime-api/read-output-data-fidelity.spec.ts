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
  ptyMocks.onDataCallbacks = [];
});

describe('SessionManager.readOutput data fidelity', () => {
  // Polish round-5: `data` is the raw byte stream and MUST NOT be affected by
  // strip_ansi (which only cleans `lines`). A red/green spinner frame carries
  // ANSI color + a `\r`-only cursor return; TUI consumers replay `data`
  // verbatim. Before the fix, `data: normalized` stripped ANSI when
  // strip_ansi:true, contradicting the schema's "original byte stream preserved".
  const RAW = '\x1b[31mred\x1b[0m\rspin';

  it('keeps data raw while stripping lines when strip_ansi is true', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});
    ptyMocks.onDataCallbacks[0]?.(RAW);

    const stripped = await sm.readOutput({ session_id: created.session_id, strip_ansi: true });

    expect(stripped.data).toBe(RAW); // raw byte stream preserved, ANSI + \r intact
    expect(stripped.data).toContain('\x1b['); // control sequences still present
    expect(stripped.lines.join('\n')).not.toContain('\x1b['); // lines cleaned
    expect(stripped.lines.join('\n')).toContain('red');
  });

  it('keeps data raw when strip_ansi is false (unchanged path)', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});
    ptyMocks.onDataCallbacks[0]?.(RAW);

    const raw = await sm.readOutput({ session_id: created.session_id, strip_ansi: false });

    expect(raw.data).toBe(RAW);
  });

  // Polish: max_lines clipping is caller-requested and drops NO data (full data
  // returned, next_seq advances), so it must NOT set truncated — that signal is
  // reserved for real byte-buffer eviction.
  it('does not set truncated when only max_lines clips the returned lines', async () => {
    const sm = new SessionManager();
    const created = await sm.create({});
    ptyMocks.onDataCallbacks[0]?.('a\nb\nc\n');

    const out = await sm.readOutput({ session_id: created.session_id, since_seq: 0, max_lines: 1 });

    expect(out.lines).toEqual(['c']); // lines clipped to the last one
    expect(out.data).toBe('a\nb\nc\n'); // full data still returned
    expect(out.truncated).toBe(false); // no real data loss → not truncated
  });
});
