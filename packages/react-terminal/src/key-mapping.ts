// Terminal key mapping — shared module for all downstream xterm renderers.
// Origin: Continuo `src/panels/Terminal/key-mapping.ts` (F1 paste-stuck fix
// commit 0c46735); ported into @continuo-terminal/react-terminal so any
// host integration gets consistent Shift+Enter / future modifier mappings
// without re-implementing the byte-level race protection.
//
// xterm.js defaults Enter / Shift+Enter to send `\r`. Ink-based CLIs (Claude
// Code / Codex CLI) submit on `\r` and cannot distinguish "submit" from
// "newline within input". This module remaps Shift+Enter → ESC+CR (`\x1b\r`):
//   - Claude Code / Codex / ink-based CLI: ESC prefix → newline within input
//   - zsh / bash readline: ESC+CR binds to accept-line, identical to Enter
//
// The pending-state state machine has a critical invariant (issue #36 F1
// paste-stuck): ANY onData call clears pending, even when data is not the
// expected paired `\r`. This prevents stale pending from hijacking a
// subsequent paste sequence that arrives before the paired `\r` (focus
// switch / xterm internal race / paste preempt) — see consumeMappedKeyOnData
// JSDoc for the full incident chain.

/**
 * Returns true when the keydown event should bypass xterm's default handling
 * AND not invoke any mapped-key behavior. Currently covers Shift+(Cmd|Ctrl)+Enter
 * — Continuo uses this to delegate to document-level command system (terminal
 * zoom toggle, etc.). Host integrations may choose to route the keydown
 * elsewhere (eg renderer-side command dispatch) when this returns true.
 *
 * Pure function (no isTrusted read) — testable from jsdom.
 */
export function shouldSkipXtermKey(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown') return false;
  if (event.isComposing) return false;
  if (event.key !== 'Enter') return false;
  if (!event.shiftKey) return false;
  if (event.altKey) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  return true;
}

/**
 * Map a keyboard event to the byte sequence to write to the PTY. Returns null
 * when the event should fall through to xterm's default key handling.
 */
export function mapTerminalKey(event: KeyboardEvent): string | null {
  if (event.isComposing) return null;
  if (
    event.type === 'keydown' &&
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    return '\x1b\r';
  }
  return null;
}

/**
 * Pending-state for the keydown → onData byte-stream handoff.
 * Set by `applyMappedKeyOnKeydown` (in xterm `attachCustomKeyEventHandler`),
 * consumed by `consumeMappedKeyOnData` (in `term.onData` forwarder).
 */
export interface MappedKeyState {
  pending: string | null;
}

export function createMappedKeyState(): MappedKeyState {
  return { pending: null };
}

/**
 * Call inside xterm's `attachCustomKeyEventHandler`. If the event maps to a
 * byte sequence, stash it in state.pending. The caller MUST return `true` to
 * let xterm dispatch the default key handler (otherwise onData never fires
 * and pending stays uncomsumed forever).
 */
export function applyMappedKeyOnKeydown(
  state: MappedKeyState,
  event: KeyboardEvent,
): void {
  const mapped = mapTerminalKey(event);
  if (mapped !== null) {
    state.pending = mapped;
  }
}

/**
 * Call inside `term.onData` forwarder. If state.pending is non-null AND
 * data is the expected paired `\r`, return pending (and clear state.pending).
 * Otherwise return data verbatim AND clear pending.
 *
 * Critical invariant (issue #36 F1 paste-stuck fix): **ANY onData clears
 * pending**, even when data is not `\r`. Prevents stale pending from
 * hijacking a subsequent paste sequence (Shift+Enter keydown set pending,
 * paired `\r` onData was delayed by focus/race/preempt, paste arrived first
 * → pre-fix code returned pending and overwrote paste data with `\x1b\r`,
 * losing the bracketed paste end sequence and trapping zsh in paste-mode).
 *
 * Bug repro (pre-fix):
 *   1. Shift+Enter keydown → applyMappedKeyOnKeydown sets pending='\x1b\r'
 *   2. Some reason onData('\r') is delayed
 *   3. User paste long text → onData('\x1b[200~text\x1b[201~')
 *   4. Pre-fix: pending non-null → hijack entire paste data, replace with
 *      '\x1b\r' → bracketed paste end seq lost → zsh stuck in paste-mode
 *   5. Post-fix: data !== '\r' → pending cleared + paste data passes through
 */
export function consumeMappedKeyOnData(
  state: MappedKeyState,
  data: string,
): string {
  const pending = state.pending;
  // ALWAYS clear pending — single-shot contract; any subsequent onData
  // (paired '\r' or stale-window arrival) consumes the slot.
  state.pending = null;
  if (pending !== null && data === '\r') {
    return pending;
  }
  return data;
}
