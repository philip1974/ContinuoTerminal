import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type SupportedShell = 'zsh' | 'bash' | 'fish' | null;

const BASH_SNIPPET = String.raw`# 同 zsh 注释:non-login bash 默认只读 .bashrc,但用户的 PATH / brew 通常配
# 在 .bash_profile / .profile;补 source 它们以避免 plugin 链式坏。
[ -n "$_TERMINAL_USER_HOME" ] && [ -f "$_TERMINAL_USER_HOME/.bash_profile" ] && source "$_TERMINAL_USER_HOME/.bash_profile"
[ -n "$_TERMINAL_USER_HOME" ] && [ -f "$_TERMINAL_USER_HOME/.profile" ] && source "$_TERMINAL_USER_HOME/.profile"
[ -n "$_TERMINAL_USER_BASH_RC" ] && [ -f "$_TERMINAL_USER_BASH_RC" ] && source "$_TERMINAL_USER_BASH_RC"

_continuo_osc7() {
  printf '\e]7;file://%s%s\a' "${'${HOSTNAME:-}'}" "$PWD"
}

if [ -n "${'${PROMPT_COMMAND:-}'}" ]; then
  PROMPT_COMMAND="_continuo_osc7; ${'${PROMPT_COMMAND}'}"
else
  PROMPT_COMMAND="_continuo_osc7"
fi

_continuo_osc7
`;

const FISH_SNIPPET = String.raw`if test -n "$_TERMINAL_USER_FISH_CONFIG"; and test -f "$_TERMINAL_USER_FISH_CONFIG"
  source "$_TERMINAL_USER_FISH_CONFIG"
end

function _continuo_osc7 --on-variable PWD
  printf '\e]7;file://%s%s\a' (hostname) "$PWD"
end

_continuo_osc7
`;

function detectShell(shellPath?: string): SupportedShell {
  if (!shellPath) return null;
  // 平台无关地取 basename(同时吃 `/` 与 `\`,不依赖 path.basename 的运行时平台),
  // 去 `.exe` 后缀并小写:Windows git-bash 的 `bash.exe`(以及 fish.exe 等)是真正
  // 的 POSIX shell,能跑 BASH/FISH 集成片段;不去后缀会漏注入 OSC7 cwd 跟踪
  // (跨平台审计 P2)。
  const base = shellPath.split(/[\\/]/).pop() ?? '';
  const name = base.toLowerCase().replace(/\.exe$/, '');
  if (name === 'zsh') return 'zsh';
  if (name === 'bash') return 'bash';
  if (name === 'fish') return 'fish';
  return null;
}

async function noopCleanup(): Promise<void> {}

/**
 * Prepare shell-integration so bash/fish emit an OSC 7 cwd sequence on each
 * prompt / PWD change (zsh is intentionally skipped — see the ZDOTDIR note).
 *
 * Returns `{ env, args, cleanup }`. Callers MUST spawn the shell with BOTH the
 * returned `env` and `args` — for bash, `args` is `['--rcfile', <file>, '-i']`
 * because interactive bash ignores `BASH_ENV` and would never load the snippet
 * from env alone (fish/zsh return `args: []`; fish loads via `XDG_CONFIG_HOME`,
 * zsh is a no-op). Passing only `env` silently disables cwd tracking for bash.
 *
 * ⚠ OSC 7 host field: the emitted payload is `file://<hostname>$PWD` — bash uses
 * `${HOSTNAME:-}`, fish uses `(hostname)` — i.e. the REAL machine hostname, not
 * an empty/localhost host. `@continuo-terminal/react-terminal`'s `parseOsc7Cwd`
 * / `registerOsc7Cwd` default to strict `['', 'localhost']` matching, so a host
 * pairing these two bundled helpers MUST pass the machine hostname into the
 * parser's `acceptedHosts` (e.g. `['', 'localhost', os.hostname()]`) or every
 * cwd update is silently dropped. See parseOsc7Cwd's Osc7Options JSDoc.
 */
export async function prepareShellIntegrationEnv(
  shellPath: string,
  baseEnv: NodeJS.ProcessEnv,
): Promise<{ env: NodeJS.ProcessEnv; args: string[]; cleanup: () => Promise<void> }> {
  const shell = detectShell(shellPath);
  if (!shell) return { env: baseEnv, args: [], cleanup: noopCleanup };

  // ⚠ zsh:不 hijack ZDOTDIR。实测 hijack 会让 oh-my-zsh / starship /
  // zsh-autosuggestions / syntax-highlighting 等 plugin 初始化时 silent 失败
  // (它们检测 ZDOTDIR == /tmp/... 当 "abnormal env" 跳过自身 hook 注册)。
  // sub-shell `env -u ZDOTDIR zsh -i` plugin 全工作可证。
  //
  // 代价:跨进程 OSC 7 自动 cwd 跟踪暂停 (panel 内 split 时新 leaf 不再继承
  // `cd /tmp` 后的 cwd,只继承 panel 启动 cwd)。topic 03 plan-v4 P0-1 cwd
  // inherit 走的是 trackedCwd via OSC 7 — 这条 path 也 disabled。但用户体感
  // 上 autosuggestions / 主题 / plugin 工作的优先级远高于自动 cwd 继承,
  // user 可手动 cd。后续 topic 可换 main-side `lsof -p <pty.pid> -d cwd`
  // 取真实 cwd 替代 OSC 7 注入,不需要 ZDOTDIR hijack。
  if (shell === 'zsh') return { env: baseEnv, args: [], cleanup: noopCleanup };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuo-shell-'));
  const cleanup = async (): Promise<void> => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  };

  if (shell === 'bash') {
    const rcfile = path.join(tmpDir, '.bashrc');
    await fs.writeFile(rcfile, BASH_SNIPPET, 'utf8');
    return {
      env: {
        ...baseEnv,
        // BASH_ENV/ENV only load the snippet for NON-interactive bash; kept for
        // sub-shells but insufficient on their own for the interactive PTY case.
        BASH_ENV: rcfile,
        ENV: rcfile,
        _TERMINAL_USER_HOME: baseEnv.HOME ?? '',
        _TERMINAL_USER_BASH_RC: baseEnv.HOME
          ? path.join(baseEnv.HOME, '.bashrc')
          : '',
      },
      // Interactive bash ignores BASH_ENV and reads ~/.bashrc, so the snippet
      // must be forced in via `--rcfile` (the snippet itself re-sources the
      // user's real rc files). Callers MUST spawn bash with these args or the
      // OSC 7 hook is never installed.
      args: ['--rcfile', rcfile, '-i'],
      cleanup,
    };
  }

  const confDir = path.join(tmpDir, 'fish', 'conf.d');
  await fs.mkdir(confDir, { recursive: true });
  await fs.writeFile(path.join(confDir, '_continuo.fish'), FISH_SNIPPET, 'utf8');
  // fish auto-sources `$XDG_CONFIG_HOME/fish/conf.d/*.fish` on interactive
  // startup, so the env override alone installs the hook — no extra args needed.
  return {
    env: {
      ...baseEnv,
      XDG_CONFIG_HOME: tmpDir,
      _TERMINAL_USER_FISH_CONFIG: baseEnv.XDG_CONFIG_HOME
        ? path.join(baseEnv.XDG_CONFIG_HOME, 'fish', 'config.fish')
        : baseEnv.HOME
          ? path.join(baseEnv.HOME, '.config', 'fish', 'config.fish')
          : '',
    },
    args: [],
    cleanup,
  };
}
