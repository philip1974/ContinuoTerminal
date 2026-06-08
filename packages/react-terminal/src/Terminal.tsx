import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal as XTerm } from '@xterm/xterm';
import type { ReadOutputOutput } from '@continuo-terminal/protocol';

import {
  applyMappedKeyOnKeydown,
  consumeMappedKeyOnData,
  createMappedKeyState,
  shouldSkipXtermKey,
} from './key-mapping.js';
import { parseCallToolResult } from './parse-result.js';
import type { TerminalProps } from './types.js';

/**
 * Production xterm renderer for ContinuoTerminal sidecar sessions.
 *
 * Topic 53 upgrades over the v0.1.0 reference impl:
 * - **Shared key-mapping** (Shift+Enter → ESC+CR for ink-based CLIs)
 * - **Raw data field** (topic 51) — uses `parsed.data` instead of
 *   `lines.join('\r\n')` to preserve `\r`-only spinner / cursor-positioning
 *   updates that would otherwise corrupt TUI rendering (stacked spinner
 *   frames, "Stewing@MacBook-Pro" char overlay).
 * - **strip_ansi: false** default — preserves color/escape codes (TUI apps
 *   like Claude Code render heavy ANSI).
 * - **FitAddon + ResizeObserver + terminal.resize wire** — host container
 *   sizing reflects to PTY via topic 46 MCP terminal.resize.
 * - **xtermOptions prop** — host passes ITerminalOptions for theme / cursor /
 *   font / scrollback customization without re-implementing the renderer.
 * - **hidden prop** — when host's panel is not visible (tab inactive), the
 *   component pauses polling and skips fit-on-show until visible again.
 */
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
  xtermOptions,
  hidden,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sinceSeqRef = useRef(initialSinceSeq);
  const inFlightRef = useRef(false);
  const onErrorRef = useRef(onError);
  const hiddenRef = useRef(hidden);

  onErrorRef.current = onError;
  hiddenRef.current = hidden;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // xterm.js: cols/rows are constructor-init options, ITerminalOptions
    // (passed via .options later) doesn't include them — merged as untyped
    // here then cast to satisfy the constructor signature.
    // allowProposedApi forced true (after host spread) so Unicode11Addon's
    // unicode.activeVersion mutation is permitted regardless of host opts.
    const terminal = new XTerm({
      cols,
      rows,
      ...(xtermOptions ?? {}),
      allowProposedApi: true,
    } as ConstructorParameters<typeof XTerm>[0]);
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    // Unicode 11 width table: default xterm table is Unicode 6 and disagrees
    // with modern glibc/musl wcwidth on ambiguous-width / new emoji / CJK
    // extension ranges, causing column drift between PTY-side cursor advance
    // and renderer-side cell allocation. Load BEFORE .open() so the first
    // write uses the correct width table.
    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = '11';
    terminal.open(container);
    // WebGL renderer: default DOM renderer simulates CJK double-width via
    // letter-spacing, whose accumulated error overflows row clientWidth and
    // triggers row's overflow:hidden — clipping the trailing CJK glyphs
    // (only "fixed" by resize-triggered redraw). WebGL draws on a precise
    // cell grid and avoids the letter-spacing path. Mirrors Continuo main
    // repo's useTerminal.ts:248-254 pattern. Silent fallback to DOM on
    // context loss / init failure (terminal still usable, CJK clipping
    // edge case may resurface).
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[continuo-terminal] WebGL renderer init failed, falling back to DOM:', err);
    }

    // Topic 53: install shared key-mapping. shouldSkipXtermKey returns false to
    // let xterm handle the keydown (Shift+(Cmd|Ctrl)+Enter case is for host
    // command system — host integration must intercept via document-level
    // listener if needed; not surfaced at this layer).
    const mappedKeyState = createMappedKeyState();
    terminal.attachCustomKeyEventHandler((event) => {
      if (shouldSkipXtermKey(event)) return false;
      applyMappedKeyOnKeydown(mappedKeyState, event);
      return true;
    });

    const onDataDisposable = terminal.onData((data) => {
      const outgoing = consumeMappedKeyOnData(mappedKeyState, data);
      adapter
        .callTool('terminal.send_text', { session_id: sessionId, text: outgoing })
        .catch((err: unknown) => {
          onErrorRef.current?.(err);
        });
    });

    // Topic 53: FitAddon + ResizeObserver wire → MCP terminal.resize
    const doFit = () => {
      try {
        fitAddon.fit();
        if (terminal.cols > 0 && terminal.rows > 0) {
          adapter
            .callTool('terminal.resize', {
              session_id: sessionId,
              cols: terminal.cols,
              rows: terminal.rows,
            })
            .catch((err: unknown) => onErrorRef.current?.(err));
        }
      } catch (err) {
        onErrorRef.current?.(err);
      }
    };
    // Initial fit; if container has no layout yet, retry on next frame.
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      doFit();
    } else {
      requestAnimationFrame(doFit);
    }
    const resizeObserver = new ResizeObserver(() => {
      if (hiddenRef.current) return;
      doFit();
    });
    resizeObserver.observe(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      fitAddon.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [adapter, cols, rows, sessionId, xtermOptions]);

  // Re-fit on hidden → visible transition (host panel toggled back).
  useEffect(() => {
    if (hidden) return;
    const fit = fitAddonRef.current;
    if (!fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // dispose race during hide/show — ignore
      }
    });
  }, [hidden]);

  useEffect(() => {
    sinceSeqRef.current = initialSinceSeq;
  }, [initialSinceSeq, sessionId]);

  useEffect(() => {
    if (typeof adapter.subscribeOutput === 'function') {
      let cancelled = false;
      const unsubscribe = adapter.subscribeOutput(sessionId, (lines, nextSeq) => {
        if (cancelled) return;
        if (lines.length > 0) {
          terminalRef.current?.write(lines.join('\r\n'));
        }
        sinceSeqRef.current = nextSeq;
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (hiddenRef.current) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Topic 51: strip_ansi=false preserves color codes + cursor positioning.
        // Topic 51: prefer raw `data` field (no \r-eating spinner residue).
        const result = await adapter.callTool<unknown>('terminal.read_output', {
          session_id: sessionId,
          since_seq: sinceSeqRef.current,
          strip_ansi: false,
        });
        if (cancelled) return;
        const parsed = parseCallToolResult<ReadOutputOutput>(result);
        if (parsed.data && parsed.data.length > 0) {
          terminalRef.current?.write(parsed.data);
        } else if (parsed.lines.length > 0) {
          // Backwards-compat for sidecar versions < topic 51 that lack data
          terminalRef.current?.write(parsed.lines.join('\r\n'));
        }
        sinceSeqRef.current = parsed.next_seq;
      } catch (err) {
        if (cancelled) return;
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
