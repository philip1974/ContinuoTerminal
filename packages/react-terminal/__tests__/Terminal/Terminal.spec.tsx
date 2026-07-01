// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xterm/xterm', () => {
  // Topic 53: Terminal component now uses attachCustomKeyEventHandler for
  // shared key-mapping (Shift+Enter → ESC+CR). Mock needs to expose it +
  // cols/rows reads for terminal.resize wire.
  // Unicode11 wiring: Terminal sets `unicode.activeVersion = '11'`, so the
  // mock must expose a writable unicode service slot (xterm-shape only —
  // assignment is the only contract Terminal exercises).
  const makeMocks = () => ({
    cols: 80,
    rows: 24,
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    // installAtlasGuards feature-detects this method; expose a vi.fn so the
    // guards wire (lifetime + cleanup test path) is exercised.
    clearTextureAtlas: vi.fn(),
    unicode: { activeVersion: '6' as string },
  });
  return { Terminal: vi.fn().mockImplementation(() => makeMocks()) };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), activate: vi.fn(), dispose: vi.fn() })),
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: vi.fn().mockImplementation(() => ({ activate: vi.fn(), dispose: vi.fn() })),
}));

// Mirrors Continuo main repo's useTerminal test mock (onContextLoss callback
// kept available so the dispose-on-loss wire still type-checks at runtime).
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    onContextLoss: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Topic 53: ResizeObserver isn't in jsdom; stub it as no-op.
if (typeof globalThis.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { Terminal as XTermMock } from '@xterm/xterm';

import { Terminal as TerminalComponent } from '../../src/Terminal.js';
import type { MCPClientAdapter } from '../../src/types.js';

function makeAdapter(): MCPClientAdapter {
  return {
    callTool: vi.fn(async () => ({
      structuredContent: { lines: [], next_seq: 0 },
    })) as unknown as MCPClientAdapter['callTool'],
  };
}

describe('react-terminal Terminal component', () => {
  beforeEach(() => {
    (XTermMock as any).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders container div and initializes xterm on mount', () => {
    const adapter = makeAdapter();
    const { container } = render(<TerminalComponent sessionId="test" adapter={adapter} pollIntervalMs={false} />);

    expect(XTermMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('div')).not.toBeNull();
  });

  it('calls adapter.callTool for read_output when polling enabled', async () => {
    const adapter = makeAdapter();
    render(<TerminalComponent sessionId="s1" adapter={adapter} pollIntervalMs={100} />);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(adapter.callTool).toHaveBeenCalledWith(
      'terminal.read_output',
      expect.objectContaining({ session_id: 's1' }),
    );
  });

  it('disposes xterm on unmount (StrictMode-safe cleanup)', () => {
    const adapter = makeAdapter();
    const { unmount } = render(<TerminalComponent sessionId="s1" adapter={adapter} pollIntervalMs={false} />);
    const xtermInstance = (XTermMock as any).mock.results[0]?.value;

    unmount();

    expect(xtermInstance.dispose).toHaveBeenCalled();
  });

  // Round-3 P1 #4: an in-flight read_output that started on the old sessionId
  // must NOT write its lines to the new xterm or advance the cursor for the
  // new session. Before the fix, the cancelled-flag guard was missing and a
  // stale result from session s1 would land in the s2 xterm.
  it('discards in-flight read_output result after sessionId changes mid-poll', async () => {
    let resolveStale: (value: unknown) => void = () => {};
    const stalePromise = new Promise<unknown>((resolve) => {
      resolveStale = resolve;
    });

    let callIndex = 0;
    const adapter: MCPClientAdapter = {
      callTool: vi.fn(() => {
        callIndex += 1;
        if (callIndex === 1) {
          // First tick (sessionId='s1') — we control when this resolves.
          return stalePromise;
        }
        // All later ticks (sessionId='s2') — immediately empty so the
        // assertion is only about the stale write.
        return Promise.resolve({ structuredContent: { lines: [], next_seq: 0 } });
      }) as unknown as MCPClientAdapter['callTool'],
    };

    const { rerender } = render(<TerminalComponent sessionId="s1" adapter={adapter} pollIntervalMs={50} />);
    // Let the first tick start (it will await stalePromise indefinitely).
    await new Promise((r) => setTimeout(r, 20));

    // Switch sessions. The polling-effect cleanup must flip cancelled=true
    // for the in-flight tick captured in the s1 effect closure.
    rerender(<TerminalComponent sessionId="s2" adapter={adapter} pollIntervalMs={50} />);
    await new Promise((r) => setTimeout(r, 20));

    // Resolve the held s1 promise with what would be stale lines.
    resolveStale({ structuredContent: { lines: ['STALE-FROM-S1'], next_seq: 999 } });
    await new Promise((r) => setTimeout(r, 30));

    // Two xterm instances exist (one per sessionId). Neither should have had
    // the stale lines written to it.
    const instances = (XTermMock as any).mock.results.map((r: { value: { write: ReturnType<typeof vi.fn> } }) => r.value);
    for (const inst of instances) {
      const staleCalls = inst.write.mock.calls.filter((args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('STALE-FROM-S1'),
      );
      expect(staleCalls).toEqual([]);
    }
  });

  // Polish round-3: the hidden → visible transition must sync the PTY, not
  // only re-fit the local xterm. doFit (fit + terminal.resize) is reused via a
  // ref; before the fix the transition called fitAddon.fit() alone, leaving the
  // backend PTY at a stale size after a resize-while-hidden.
  it('sends terminal.resize when transitioning from hidden back to visible', async () => {
    const adapter = makeAdapter();
    const { rerender } = render(
      <TerminalComponent sessionId="vis" adapter={adapter} pollIntervalMs={false} hidden />,
    );
    // Drain the mount-time fit (rAF) so we isolate the transition-triggered call.
    await new Promise((resolve) => setTimeout(resolve, 30));
    (adapter.callTool as any).mockClear();

    rerender(<TerminalComponent sessionId="vis" adapter={adapter} pollIntervalMs={false} hidden={false} />);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(adapter.callTool).toHaveBeenCalledWith(
      'terminal.resize',
      expect.objectContaining({ session_id: 'vis', cols: 80, rows: 24 }),
    );
  });

  // Polish round-6: large read_output.data (up to the server's multi-MiB
  // buffer) must go through safeWrite's 16KB chunking, not one synchronous
  // terminal.write(bigBlob) that janks the host UI. safeWrite.ts existed +
  // was exported but Terminal.tsx bypassed it.
  it('chunks large output through safeWrite instead of one giant terminal.write', async () => {
    const LARGE = 'x'.repeat(40 * 1024); // 40KB → 3 × ≤16KB chunks
    let served = false;
    const adapter: MCPClientAdapter = {
      callTool: vi.fn(async () => {
        if (!served) {
          served = true;
          return { structuredContent: { lines: [], data: LARGE, next_seq: 1 } };
        }
        return { structuredContent: { lines: [], data: '', next_seq: 1 } };
      }) as unknown as MCPClientAdapter['callTool'],
    };

    render(<TerminalComponent sessionId="big" adapter={adapter} pollIntervalMs={20} />);
    await new Promise((resolve) => setTimeout(resolve, 80));

    const inst = (XTermMock as any).mock.results[0]?.value;
    const writeArgs: string[] = inst.write.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((a: unknown): a is string => typeof a === 'string');

    expect(writeArgs.filter((s) => s.length > 16 * 1024)).toEqual([]); // no giant single write
    expect(writeArgs.length).toBeGreaterThan(1); // actually chunked
    expect(writeArgs.join('')).toBe(LARGE); // lossless reassembly
  });

  // Round-5 P1: the subscribeOutput branch also needs the effect-local
  // cancelled guard. Round-3 added it to polling but missed this path, so
  // an adapter whose unsubscribe() is async (or whose callback fires after
  // sessionId changes) would have written stale lines into the new xterm.
  it('discards subscribeOutput callbacks after sessionId changes mid-subscription', () => {
    let storedCallback: ((lines: string[], nextSeq: number) => void) | null = null;
    const adapter: MCPClientAdapter = {
      callTool: vi.fn() as unknown as MCPClientAdapter['callTool'],
      // subscribeOutput stores the callback in our closure; the returned
      // unsubscribe is intentionally a no-op to simulate the race where a
      // callback is already queued/inflight at the moment React tears the
      // effect down.
      subscribeOutput: vi.fn((_sessionId: string, cb: (lines: string[], nextSeq: number) => void) => {
        storedCallback = cb;
        return () => {
          /* deliberate no-op for the race scenario */
        };
      }) as unknown as MCPClientAdapter['subscribeOutput'],
    };

    const { rerender } = render(<TerminalComponent sessionId="s1" adapter={adapter} pollIntervalMs={false} />);
    // TS control-flow analysis still narrows storedCallback to `null` here
    // because the closure-side assignment happens inside vi.fn — we know
    // render() invoked the effect synchronously and the callback is now
    // set, so a runtime check + invariant assertion is the cleanest path.
    const callbackForS1 = storedCallback as ((lines: string[], nextSeq: number) => void) | null;
    expect(callbackForS1).toBeTypeOf('function');

    // Switch sessions — the polling-effect cleanup must flip cancelled=true
    // for the closure captured in the s1 subscribeOutput callback.
    rerender(<TerminalComponent sessionId="s2" adapter={adapter} pollIntervalMs={false} />);

    // Fire the s1 callback after the rerender. Pre-fix, this wrote into
    // the s2 xterm and overwrote sinceSeqRef. Post-fix, cancelled returns
    // early.
    callbackForS1?.(['STALE-FROM-S1-SUB'], 999);

    const instances = (XTermMock as any).mock.results.map((r: { value: { write: ReturnType<typeof vi.fn> } }) => r.value);
    for (const inst of instances) {
      const staleCalls = inst.write.mock.calls.filter((args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('STALE-FROM-S1-SUB'),
      );
      expect(staleCalls).toEqual([]);
    }
  });

  // Polish (phase 2): the subscribeOutput push path must honor the raw `data`
  // arg (like the polling path) so TUI \r redraws survive; older adapters that
  // omit data fall back to lines.
  it('subscribeOutput writes raw data verbatim when provided, else falls back to lines', () => {
    let cb: ((lines: string[], nextSeq: number, data?: string) => void) | null = null;
    const adapter: MCPClientAdapter = {
      callTool: vi.fn() as unknown as MCPClientAdapter['callTool'],
      subscribeOutput: vi.fn((_sessionId: string, onChunk: (lines: string[], nextSeq: number, data?: string) => void) => {
        cb = onChunk;
        return () => {};
      }) as unknown as MCPClientAdapter['subscribeOutput'],
    };

    render(<TerminalComponent sessionId="sub" adapter={adapter} pollIntervalMs={false} />);
    const fire = cb as unknown as (lines: string[], nextSeq: number, data?: string) => void;
    expect(fire).toBeTypeOf('function');

    const raw = '\x1b[32mok\x1b[0m\rspin';
    fire(['ok', 'spin'], 5, raw);
    fire(['x', 'y'], 6); // no data → lines fallback

    const inst = (XTermMock as any).mock.results[0]?.value;
    const writes: string[] = inst.write.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((a: unknown): a is string => typeof a === 'string');

    expect(writes).toContain(raw); // raw stream written verbatim (\r preserved)
    expect(writes).toContain('x\r\ny'); // fallback path still joins lines
  });

  // Polish (phase 2): send_text is fire-and-forget, but a tool-level failure
  // resolves as { isError: true } (not a reject). It must still reach onError,
  // not be silently swallowed.
  it('routes an isError result from send_text to onError', async () => {
    const onError = vi.fn();
    // Only send_text fails — resize (fired by the mount-time doFit) and other
    // calls must succeed, otherwise onError would fire for those too and the
    // count would be non-deterministic (mount fit runs via rAF/ResizeObserver).
    const adapter: MCPClientAdapter = {
      callTool: vi.fn(async (name: string) => {
        if (name === 'terminal.send_text') {
          return {
            isError: true,
            content: [{ type: 'text', text: '{"error":"SESSION_NOT_FOUND","message":"gone"}' }],
          };
        }
        return { structuredContent: {} };
      }) as unknown as MCPClientAdapter['callTool'],
    };

    render(<TerminalComponent sessionId="s1" adapter={adapter} pollIntervalMs={false} onError={onError} />);

    // Drive xterm's onData handler (registered via terminal.onData mock).
    const xterm = (XTermMock as any).mock.results[0]?.value;
    const onDataHandler = xterm.onData.mock.calls[0][0] as (data: string) => void;
    onDataHandler('hello');

    // Poll until the fire-and-forget promise chain routes the isError result to
    // onError — a fixed short delay is flaky under parallel-worker load.
    for (let waited = 0; onError.mock.calls.length === 0 && waited < 1000; waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0] as Error & { code?: string };
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('SESSION_NOT_FOUND');
  });
});
