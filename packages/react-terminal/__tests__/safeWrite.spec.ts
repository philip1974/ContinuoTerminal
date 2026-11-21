import { describe, it, expect } from 'vitest';

import { chunkifyData } from '../src/safeWrite.js';

const CHUNK = 16 * 1024;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

describe('chunkifyData', () => {
  it('chunks plain ASCII by size and is lossless', () => {
    expect(chunkifyData('', 4)).toEqual([]);
    expect(chunkifyData('abcdef', 4)).toEqual(['abcd', 'ef']);
    expect(chunkifyData('abcdef', 4).join('')).toBe('abcdef');
  });

  // Polish: chunkifyData sliced by UTF-16 code units, splitting an emoji's
  // surrogate pair at a 16KB boundary into two lone surrogates (corrupted xterm
  // render). Boundaries must never split a pair.
  it('never splits a surrogate pair across chunks', () => {
    const data = 'a'.repeat(CHUNK - 1) + '🚀' + 'b'; // pair straddles the 16KB boundary
    const chunks = chunkifyData(data, CHUNK);

    for (const chunk of chunks) {
      expect(isHighSurrogate(chunk.charCodeAt(chunk.length - 1))).toBe(false); // no trailing high surrogate
      expect(isLowSurrogate(chunk.charCodeAt(0))).toBe(false); // no leading low surrogate
    }
    expect(chunks.join('')).toBe(data); // lossless reassembly
    expect([...chunks.join('')].filter((ch) => ch === '🚀')).toHaveLength(1); // emoji intact
  });

  it('makes progress even if a lone high surrogate lands at a tiny chunk boundary', () => {
    // chunkSize 1 can't preserve a pair, but must not infinite-loop.
    const chunks = chunkifyData('🚀x', 1);
    expect(chunks.join('')).toBe('🚀x');
  });
});
