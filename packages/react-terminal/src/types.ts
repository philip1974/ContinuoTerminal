import type { CSSProperties } from 'react';

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
}
