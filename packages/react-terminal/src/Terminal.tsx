import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import type { ReadOutputOutput } from '@continuo-terminal/protocol';

import { parseCallToolResult } from './parse-result.js';
import type { TerminalProps } from './types.js';

export function Terminal({
  sessionId,
  adapter,
  cols = 80,
  rows = 24,
  pollIntervalMs = 300,
  initialSinceSeq = 0,
  className,
  style,
  onError,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sinceSeqRef = useRef(initialSinceSeq);
  const inFlightRef = useRef(false);
  const onErrorRef = useRef(onError);

  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new XTerm({ cols, rows });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    const onDataDisposable = terminal.onData((text) => {
      adapter.callTool('terminal.send_text', { session_id: sessionId, text }).catch((err: unknown) => {
        onErrorRef.current?.(err);
      });
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      onDataDisposable.dispose();
      fitAddon.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [adapter, cols, rows, sessionId]);

  useEffect(() => {
    sinceSeqRef.current = initialSinceSeq;
  }, [initialSinceSeq, sessionId]);

  useEffect(() => {
    if (typeof adapter.subscribeOutput === 'function') {
      const unsubscribe = adapter.subscribeOutput(sessionId, (lines, nextSeq) => {
        if (lines.length > 0) {
          terminalRef.current?.write(lines.join('\r\n'));
        }
        sinceSeqRef.current = nextSeq;
      });
      return () => {
        unsubscribe();
      };
    }

    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return;
    }

    // cancelled is the effect-local "generation token" that lets us reject
    // in-flight read_output results after sessionId / adapter / pollIntervalMs
    // changes. Without it, a result that started on the old session can write
    // stale lines into the new terminal and corrupt sinceSeqRef.
    let cancelled = false;

    const tick = async () => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;

      try {
        const result = await adapter.callTool<unknown>('terminal.read_output', {
          session_id: sessionId,
          since_seq: sinceSeqRef.current,
          strip_ansi: true,
        });
        if (cancelled) {
          return;
        }
        const parsed = parseCallToolResult<ReadOutputOutput>(result);
        if (parsed.lines.length > 0) {
          terminalRef.current?.write(parsed.lines.join('\r\n'));
        }
        sinceSeqRef.current = parsed.next_seq;
      } catch (err) {
        if (cancelled) {
          return;
        }
        onErrorRef.current?.(err);
      } finally {
        inFlightRef.current = false;
      }
    };

    void tick();
    const intervalId = setInterval(() => {
      void tick();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      inFlightRef.current = false;
    };
  }, [adapter, pollIntervalMs, sessionId]);

  return <div ref={containerRef} className={className} style={style} />;
}
