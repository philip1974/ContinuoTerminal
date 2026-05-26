/**
 * OSC 7 cwd parser/binder migrated from Continuo `useTerminal.ts:309-322`.
 *
 * Public API:
 *   - parseOsc7Cwd(payload, opts?) - pure string op, returns cwd or null
 *   - registerOsc7Cwd(termLike, onCwd, opts?) - binds an OSC 7 handler to a
 *     structural term-like; returns Osc7Disposable.
 *
 * `onCwd` is invoked synchronously inside the OSC handler. If `onCwd` returns a
 * rejected Promise, the rejection ESCAPES - by design, matches the legacy
 * `void coApi.terminal.updateCwd(...)` semantics in the original inline implementation.
 * Only sync throws are swallowed (handler always returns true to xterm parser).
 */

export type Osc7Disposable = Readonly<{ dispose: () => void }>;

export type Osc7Options = Readonly<{
  acceptedHosts?: readonly string[];
}>;

export type Osc7TermLike = Readonly<{
  parser: {
    registerOscHandler(
      code: number,
      handler: (data: string) => boolean | Promise<boolean>,
    ): Osc7Disposable;
  };
}>;

const DEFAULT_ACCEPTED_HOSTS: readonly string[] = ['', 'localhost'];
const OSC7_REGEX = /^file:\/\/([^/]*)(\/.*)?$/;

export function parseOsc7Cwd(
  payload: string,
  opts?: Osc7Options,
): string | null {
  const match = OSC7_REGEX.exec(payload);
  if (!match) return null;
  const [, host = '', encPath] = match;
  const accepted = opts?.acceptedHosts ?? DEFAULT_ACCEPTED_HOSTS;
  if (!accepted.includes(host)) return null;
  if (!encPath) return null;
  try {
    // legacy byte-identical: decodeURI preserves reserved chars (%2F / %23 / %3F).
    // Do NOT switch to decodeURIComponent - see plan-v3 P2-1 / topic-26.
    return decodeURI(encPath);
  } catch {
    return null;
  }
}

export function registerOsc7Cwd(
  termLike: Osc7TermLike,
  onCwd: (cwd: string) => void,
  opts?: Osc7Options,
): Osc7Disposable {
  return termLike.parser.registerOscHandler(7, (data) => {
    try {
      const cwd = parseOsc7Cwd(data, opts);
      if (cwd !== null) {
        onCwd(cwd);
      }
    } catch {
      // malformed payload / onCwd sync throw - swallow to keep OSC handling alive
    }
    return true;
  });
}
