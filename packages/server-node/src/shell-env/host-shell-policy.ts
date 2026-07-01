/**
 * Host helper for shell allowlist policy. Not invoked by SessionManager —
 * host wrapper (e.g. Continuo IPC) calls explicitly to vet user-supplied shells.
 * Moved from Continuo electron/shared/terminal-shells.ts in 2026-05-25 migration.
 */

import path from 'node:path';

const SHELL_NAMES = [
  'zsh',
  'bash',
  'sh',
  'fish',
  // Windows
  'powershell.exe',
  'pwsh.exe',
  'cmd.exe',
  'wsl.exe',
];

const UNIX_PREFIXES = [
  '/bin/',
  '/usr/bin/',
  '/usr/local/bin/',
  '/opt/homebrew/bin/',
];

export function isAllowedShell(shellPath: string): boolean {
  const norm = path.normalize(shellPath);
  if (process.platform === 'win32') {
    const base = path.basename(norm).toLowerCase();
    return SHELL_NAMES.includes(base);
  }
  // Unix:必须是允许的前缀 + 允许的名字
  return UNIX_PREFIXES.some((pre) => {
    if (!norm.startsWith(pre)) return false;
    const name = norm.slice(pre.length);
    return SHELL_NAMES.includes(name);
  });
}

/**
 * 默认 shell:优先用户 `$SHELL`(VSCode 行为);
 * 否则平台默认(Windows 用 powershell.exe;Mac/Linux 回退 /bin/sh)。
 * 回退用 /bin/sh 而非 /bin/zsh:zsh 在多数 Linux 发行版默认不存在,会导致终端
 * 创建失败;/bin/sh 是 POSIX 必备(跨平台审计 P1)。
 */
export function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe';
  const envShell = process.env['SHELL'];
  if (envShell && isAllowedShell(envShell)) return envShell;
  return '/bin/sh';
}
