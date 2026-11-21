import type { CSSProperties } from 'react';
import type { ITerminalOptions } from '@xterm/xterm';

export interface MCPClientAdapter {
  callTool<O = unknown>(name: string, args: unknown): Promise<O>;
  /**
   * Optional push channel for output (replaces polling when provided). The
   * third `data` arg is the raw byte stream (like read_output.data): push
   * adapters SHOULD supply it so TUI apps render correctly — `\r`-only cursor
   * updates / in-place redraws are corrupted by line-splitting. It is optional
   * for back-compat; when omitted the renderer falls back to `lines`.
   */
  subscribeOutput?(
    sessionId: string,
    onChunk: (lines: string[], nextSeq: number, data?: string) => void,
  ): () => void;
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
