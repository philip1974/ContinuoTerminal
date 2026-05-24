import type { CSSProperties } from 'react';
import type { ITerminalOptions } from '@xterm/xterm';

export interface MCPClientAdapter {
  callTool<O = unknown>(name: string, args: unknown): Promise<O>;
  subscribeOutput?(sessionId: string, onChunk: (lines: string[], nextSeq: number) => void): () => void;
}

export interface TerminalProps {
  sessionId: string;
  adapter: MCPClientAdapter;
  cols?: number;
  rows?: number;
  pollIntervalMs?: number | false;
  initialSinceSeq?: number;
  className?: string;
  style?: CSSProperties;
  onError?: (err: unknown) => void;
  /**
   * Topic 53: passthrough xterm options for host customization (theme,
   * cursor style, font, scrollback, etc.). Merged into the cols/rows
   * baseline on mount. Hosts that need dynamic theme switching can change
   * the key (force remount) or use `xterm.options.theme = ...` via a ref.
   */
  xtermOptions?: ITerminalOptions;
  /**
   * Topic 53: when true, the component pauses output polling and skips
   * fit-on-mount until next visible transition. Use when host panel/tab
   * is not currently shown.
   */
  hidden?: boolean;
}
