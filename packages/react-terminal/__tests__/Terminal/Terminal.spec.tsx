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
});
