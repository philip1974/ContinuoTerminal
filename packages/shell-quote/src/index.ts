// shell-quote: POSIX/cmd/PowerShell 安全引号 + 控制字符 / cmd 不可表示字符拒绝。
// Origin: Continuo `src/lib/shell-quote.ts` (ported into @continuo-terminal/shell-quote
// so any host integration gets host-agnostic shell quoting — drag-drop file → PTY
// safe insertion — without re-implementing the family-aware escape rules).

export type ShellFamily = 'posix' | 'cmd' | 'powershell';

export type QuoteResult =
  | { ok: true; quoted: string }
  | { ok: false; reason: 'control_char' | 'cmd_unrepresentable' | 'unsupported_shell_family' };

const POSIX_BARE_SAFE = /^[A-Za-z0-9_\-./@%+=:,]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1f\x7f]/;

function quotePosix(path: string): string {
  if (POSIX_BARE_SAFE.test(path)) return path;
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function quotePowerShell(path: string): string {
  return `'${path.replace(/'/g, "''")}'`;
}

function quoteCmd(path: string): QuoteResult {
  // `!` is unsafe when cmd delayed expansion is enabled; skip instead of
  // emitting a path whose meaning can change before execution.
  if (path.includes('"') || path.includes('%') || path.includes('!')) {
    return { ok: false, reason: 'cmd_unrepresentable' };
  }
  return { ok: true, quoted: `"${path}"` };
}

export function quoteForShell(path: string, family: ShellFamily): QuoteResult {
  if (CONTROL_CHAR.test(path)) return { ok: false, reason: 'control_char' };

  if (family === 'posix') return { ok: true, quoted: quotePosix(path) };
  if (family === 'powershell') return { ok: true, quoted: quotePowerShell(path) };
  if (family === 'cmd') return quoteCmd(path);
  // Unknown family (JS callers / config- or platform-detected strings like
  // 'pwsh', 'bash', 'powershell.exe'). This is a security-sensitive escaper, so
  // reject explicitly rather than silently applying cmd rules — mis-escaping a
  // PowerShell path with cmd's double-quote rules would change its meaning.
  return { ok: false, reason: 'unsupported_shell_family' };
}

export function quotePaths(
  paths: string[],
  family: ShellFamily,
): {
  quoted: string[];
  skipped: Array<{ path: string; reason: string }>;
} {
  const quoted: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const path of paths) {
    const r = quoteForShell(path, family);
    if (r.ok) {
      quoted.push(r.quoted);
    } else {
      skipped.push({ path, reason: r.reason });
    }
  }

  return { quoted, skipped };
}

export function joinWithTrailingSpace(quoted: string[]): string {
  if (quoted.length === 0) return '';
  return `${quoted.join(' ')} `;
}
