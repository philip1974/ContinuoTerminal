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
  /**
   * Hosts whose `file://<host>/path` OSC 7 payloads are accepted. Defaults to
   * `['', 'localhost']` (strict local-only matching — legacy Continuo contract).
   *
   * ⚠ Interop note: `@continuo-terminal/server-node`'s bundled shell integration
   * (`prepareShellIntegrationEnv`) emits `file://<real hostname>$PWD` — bash uses
   * `$HOSTNAME`, fish uses `hostname` — NOT an empty/localhost host. So a host
   * wiring those snippets to this parser MUST pass the machine hostname here
   * (e.g. `acceptedHosts: ['', 'localhost', os.hostname()]`), otherwise every
   * cwd update is silently dropped. See prepareShellIntegrationEnv JSDoc.
   */
  acceptedHosts?: readonly string[];
  /**
   * 是否把 `file:///C:/...` 解码后的 `/C:/...` 的前导斜杠去掉得到 Windows 路径 `C:/...`。
   * 默认按宿主平台检测(navigator=Windows 时 true)。**POSIX 上 `/C:/work` 是合法绝对
   * 路径**(根下名为 `C:` 的目录),无条件 strip 会把它误改成非绝对路径(codex diff 复查)
   * → 仅 Windows 模式 strip。
   */
  windowsDrivePaths?: boolean;
}>;

function isWindowsHost(): boolean {
  return (
    typeof navigator !== 'undefined' && /^win/i.test(navigator.platform ?? '')
  );
}

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
    const decoded = decodeURI(encPath);
    // Windows: shells emit `file:///C:/Users/me`, so encPath is `/C:/Users/me`.
    // Strip the leading slash before the drive letter → real Windows path
    // (`C:/Users/me`). 仅在 Windows 模式 strip:POSIX 上 `/C:/work` 是合法绝对路径
    // (根下名为 `C:` 的目录),strip 会破坏它(codex diff 复查)。
    const stripDrive = opts?.windowsDrivePaths ?? isWindowsHost();
    return stripDrive && /^\/[a-zA-Z]:[\\/]/.test(decoded)
      ? decoded.slice(1)
      : decoded;
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
