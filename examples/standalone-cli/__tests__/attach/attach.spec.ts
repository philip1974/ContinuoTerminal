import { describe, it, expect } from 'vitest';

import { attachOutputChunk } from '../../src/commands/attach.js';

// Polish (phase 2): interactive attach requests strip_ansi:false to render a
// real TUI, so it must emit the raw `data` stream verbatim rather than splitting
// into lines and rejoining with `\n` (which corrupts \r-only spinner frames and
// in-place redraws). These lock that preference + the pre-`data` fallback.
describe('attachOutputChunk', () => {
  it('emits raw data verbatim (preserving \\r redraws) when data is present', () => {
    const data = '\x1b[31mred\x1b[0m\rspin';
    const chunk = attachOutputChunk({ data, lines: ['red', 'spin'] });
    expect(chunk).toBe(data); // NOT the split/rejoined lines
    expect(chunk).toContain('\r');
    expect(chunk).toContain('\x1b[');
  });

  it('falls back to newline-joined lines when data is empty', () => {
    expect(attachOutputChunk({ data: '', lines: ['a', 'b'] })).toBe('a\nb\n');
  });

  it('falls back to lines for a pre-`data` sidecar (data undefined)', () => {
    expect(attachOutputChunk({ lines: ['x'] })).toBe('x\n');
  });

  it('emits nothing when there is no output', () => {
    expect(attachOutputChunk({ data: '', lines: [] })).toBe('');
  });
});
