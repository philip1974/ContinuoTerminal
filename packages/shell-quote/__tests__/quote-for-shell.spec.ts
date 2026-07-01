import { describe, it, expect } from 'vitest';

import { quoteForShell, quotePaths, joinWithTrailingSpace, type ShellFamily } from '../src/index.js';

describe('quoteForShell', () => {
  it('posix: bare-safe tokens pass through, others are single-quoted', () => {
    expect(quoteForShell('/usr/bin/env', 'posix')).toEqual({ ok: true, quoted: '/usr/bin/env' });
    expect(quoteForShell('/tmp/my file', 'posix')).toEqual({ ok: true, quoted: "'/tmp/my file'" });
    expect(quoteForShell("O'Brien", 'posix')).toEqual({ ok: true, quoted: "'O'\\''Brien'" });
  });

  it('powershell: single-quotes and doubles embedded quotes', () => {
    expect(quoteForShell("O'Brien", 'powershell')).toEqual({ ok: true, quoted: "'O''Brien'" });
  });

  it('cmd: double-quotes, rejects unrepresentable chars', () => {
    expect(quoteForShell('C:\\a b', 'cmd')).toEqual({ ok: true, quoted: '"C:\\a b"' });
    expect(quoteForShell('50%', 'cmd')).toEqual({ ok: false, reason: 'cmd_unrepresentable' });
    expect(quoteForShell('a!b', 'cmd')).toEqual({ ok: false, reason: 'cmd_unrepresentable' });
  });

  it('rejects control characters for every family', () => {
    for (const family of ['posix', 'cmd', 'powershell'] as ShellFamily[]) {
      expect(quoteForShell('a\tb', family)).toEqual({ ok: false, reason: 'control_char' });
    }
  });

  // Polish (phase 2): an unknown family must NOT silently fall through to cmd
  // rules (dangerous for a security escaper) — it is rejected explicitly.
  it('rejects an unknown shell family instead of defaulting to cmd', () => {
    const result = quoteForShell('C:\\a', 'pwsh' as unknown as ShellFamily);
    expect(result).toEqual({ ok: false, reason: 'unsupported_shell_family' });
  });
});

describe('quotePaths / joinWithTrailingSpace', () => {
  it('collects skipped tokens with reasons and quotes the rest', () => {
    const { quoted, skipped } = quotePaths(['/a b', '50%'], 'cmd');
    expect(quoted).toEqual(['"/a b"']);
    expect(skipped).toEqual([{ path: '50%', reason: 'cmd_unrepresentable' }]);
  });

  it('joins with a single trailing space, empty for no tokens', () => {
    expect(joinWithTrailingSpace(['a', 'b'])).toBe('a b ');
    expect(joinWithTrailingSpace([])).toBe('');
  });
});
