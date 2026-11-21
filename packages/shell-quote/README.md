# @continuo-terminal/shell-quote

Host-agnostic, dependency-free shell quoting for safely inserting file paths (or
other tokens) into a PTY command line across POSIX, `cmd.exe`, and PowerShell.

The canonical use case is a drag-and-drop / "insert path" affordance: the host
has one or more filesystem paths and wants to paste them into a running shell
without a control character or a shell metacharacter changing the command's
meaning. These are pure functions — no I/O, no platform detection; the caller
picks the target `ShellFamily`.

Origin: ported from Continuo `src/lib/shell-quote.ts` so any host integration
gets the same family-aware escape rules without re-implementing them.

## API

```ts
import {
  quoteForShell,
  quotePaths,
  joinWithTrailingSpace,
  type ShellFamily,   // 'posix' | 'cmd' | 'powershell'
  type QuoteResult,   // { ok: true; quoted } | { ok: false; reason }
} from '@continuo-terminal/shell-quote';
```

### `quoteForShell(path, family): QuoteResult`

Quotes a single token for the given family. Returns
`{ ok: true, quoted }` on success, or `{ ok: false, reason }` when the token
cannot be safely represented (see rejection rules below) — it never throws and
never emits an unsafe string.

```ts
quoteForShell('/tmp/my file', 'posix');       // { ok: true, quoted: "'/tmp/my file'" }
quoteForShell('C:\\Users\\me', 'cmd');        // { ok: true, quoted: '"C:\\Users\\me"' }
quoteForShell("O'Brien", 'powershell');       // { ok: true, quoted: "'O''Brien'" }
quoteForShell('a\tb', 'posix');               // { ok: false, reason: 'control_char' }
quoteForShell('50%', 'cmd');                  // { ok: false, reason: 'cmd_unrepresentable' }
```

### `quotePaths(paths, family)`

Batch form. Returns `{ quoted: string[], skipped: Array<{ path, reason }> }`.
Tokens that cannot be represented are collected in `skipped` (with the reason)
rather than dropped silently — the caller decides whether to warn, insert the
rest, or abort.

```ts
const { quoted, skipped } = quotePaths(['/a b', '50%'], 'cmd');
// quoted:  ['"/a b"']
// skipped: [{ path: '50%', reason: 'cmd_unrepresentable' }]
```

### `joinWithTrailingSpace(quoted)`

Joins already-quoted tokens with a single space and appends a trailing space
(so the shell cursor lands ready for the next argument). Returns `''` for an
empty array (no stray leading space).

## Escaping & rejection rules

Control characters (`\x00`–`\x1f`, `\x7f`) are rejected for **every** family
(`reason: 'control_char'`) — they can move the cursor, submit the line, or
otherwise change command meaning, and no quoting neutralizes them.

| Family | Strategy |
| --- | --- |
| `posix` | Bare tokens matching `^[A-Za-z0-9_\-./@%+=:,]+$` are emitted as-is; otherwise the token is single-quoted and embedded `'` are escaped as `'\''`. Always succeeds (after the control-char check). |
| `powershell` | Always single-quoted; embedded `'` are doubled (`''`), PowerShell's literal-string escape. Always succeeds (after the control-char check). |
| `cmd` | Double-quoted. `cmd.exe` has no robust in-quote escape for `"`, `%` (variable expansion), or `!` (delayed expansion, when enabled), so a token containing any of them is **rejected** with `reason: 'cmd_unrepresentable'` instead of emitting a string whose meaning could change before execution. |

## Known boundaries

- `cmd` intentionally rejects `"`, `%`, and `!` rather than attempting fragile
  escapes — prefer PowerShell on Windows when those characters are expected.
- The POSIX bare-safe set is deliberately conservative; anything outside it is
  quoted, which is always safe (never wrong, occasionally more quoting than a
  human would use).
- These functions quote **individual tokens**. Build a command line by quoting
  each token and joining with spaces (see `joinWithTrailingSpace`); do not pass a
  pre-joined string.
- An unknown `family` (e.g. a JS caller passing `'pwsh'` / `'bash'` /
  `'powershell.exe'`) is rejected with `reason: 'unsupported_shell_family'` — it
  is **not** silently treated as `cmd`. Normalize your shell string to one of
  `'posix' | 'cmd' | 'powershell'` before calling.
