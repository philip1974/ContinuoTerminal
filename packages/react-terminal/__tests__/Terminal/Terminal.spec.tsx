// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xterm/xterm', () => {
  const mocks = {
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
  };
  return { Terminal: vi.fn().mockImplementation(() => mocks), __mocks: mocks };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), activate: vi.fn(), dispose: vi.fn() })),
}));

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
});
