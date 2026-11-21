# Cross-platform support (Windows / macOS / Linux)

Analysis of the repo's multi-OS adaptation. macOS and Linux are the supported,
CI-tested targets; Windows is **not yet a supported runtime** (see
[getting-started](./getting-started.md)) but the code carries deliberate,
unit-tested Windows-aware branches so a future Windows target is incremental,
not a rewrite.

## CI coverage

`.github/workflows/ci.yml` matrix is `macos-latest` + `ubuntu-latest` only — **no
`windows-latest`**. Windows code paths therefore never execute end-to-end in CI;
they are covered only by unit tests that mock `process.platform` (see below).
Adding a Windows CI leg is the single biggest gap before claiming Windows
support (node-pty ConPTY, path/HOME semantics, and the local-socket boundary all
need real-runner validation).

## Per-dimension status

| Area | Windows | macOS | Linux | Notes |
|---|---|---|---|---|
| Default shell (`getDefaultShell`) | ✅ `powershell.exe` | ✅ `$SHELL`→`/bin/sh` | ✅ `$SHELL`→`/bin/sh` | Unix fallback is POSIX-guaranteed `/bin/sh` (not `/bin/zsh`). Unit-tested via mocked platform. |
| Shell allowlist (`isAllowedShell`) | ✅ basename allowlist (powershell/pwsh/cmd/wsl `.exe`) | ✅ prefix+name | ✅ prefix+name | Unix prefixes fixed to `/bin`,`/usr/bin`,`/usr/local/bin`,`/opt/homebrew/bin` — non-standard locations (Nix store, `~/.local/bin`) are rejected by design. |
| PTY spawn (node-pty) | ⚠️ ConPTY (untested in CI) | ✅ | ✅ | node-pty handles ConPTY; native prebuild required per-OS. macOS `spawn-helper` caveat documented. |
| autorun timing | ✅ 600ms (ConPTY) | ✅ 200ms | ✅ 200ms | Fixed: was hardcoded 200ms on all platforms; now `autorunDelayMs()` honors the documented per-OS contract. |
| stdio transport | ✅ | ✅ | ✅ | Fully cross-platform (CLI/host default). |
| HTTP transport | ✅ | ✅ | ✅ | Binds `127.0.0.1`; cross-platform. |
| local-socket transport | ❌ throws (by design) | ✅ Unix socket | ✅ Unix socket | Windows named-pipe is an explicit follow-up; throws a clear error. Socket path length checked in **bytes** (UTF-8), not chars. |
| Shell integration / OSC 7 emit | ⚠️ bash/fish only (git-bash/msys) | ✅ bash/fish (zsh disabled) | ✅ bash/fish (zsh disabled) | `detectShell` strips `.exe` + splits on `[\\/]` so git-bash `bash.exe`/`fish.exe` are recognized. No PowerShell/cmd OSC 7 hook. bash uses `--rcfile` (BASH_ENV alone is ignored by interactive bash). |
| OSC 7 cwd parse (`parseOsc7Cwd`) | ✅ strips `/C:/` drive prefix | ✅ | ✅ | `windowsDrivePaths` option + `isWindowsHost()` (browser `navigator.platform`). POSIX `/C:/...` preserved. |
| Path handling | ✅ | ✅ | ✅ | Uses `node:path` (platform-aware); `detectShell` deliberately platform-independent. |
| shell-quote | ✅ posix/cmd/powershell | ✅ | ✅ | All three families; unknown family rejected. |
| Repo scripts (leak/version-check) | ✅ | ✅ | ✅ | Use `fileURLToPath` (handles Windows drive `file://` URLs), not `.pathname`. |

## Known gaps / follow-ups (not bugs on the supported OSes)

1. **No Windows CI leg** — Windows branches are unit-tested (mocked platform) but never run end-to-end. Add `windows-latest` to the matrix before advertising Windows support; expect node-pty/ConPTY, `HOME` vs `USERPROFILE`, and drive-path edges to surface.
2. **local-socket on Windows** — intentionally unsupported (throws); needs a named-pipe (`\\.\pipe\...`) transport. HTTP/stdio cover Windows in the meantime.
3. **No PowerShell/cmd OSC 7 cwd tracking** — only bash/fish/zsh get the hook. Native-Windows cwd tracking would need a PowerShell `$PROFILE` snippet emitting OSC 7.
4. **bash integration `_TERMINAL_USER_HOME`** reads `HOME` (set by git-bash; may be unset on native Windows, which uses `USERPROFILE`) — degrades to not sourcing user rc, not a hard failure.
5. **`isWindowsHost()` uses the deprecated `navigator.platform`** — still works everywhere; could prefer `navigator.userAgentData?.platform` with fallback.

## What's already solid

The prior cross-platform audit + this pass hardened: POSIX-safe default shell, byte-based socket-path limit, `.exe`-aware shell detection, Windows drive-path OSC 7, `fileURLToPath` in scripts, and per-OS autorun timing. Platform logic is unit-tested by mocking `process.platform` / `navigator.platform` even though CI runs only macOS + Linux.
