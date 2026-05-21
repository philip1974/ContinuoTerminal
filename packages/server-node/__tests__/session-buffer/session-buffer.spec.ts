import { describe, expect, it } from 'vitest';

import { SessionBuffer } from '../../src/session-manager.js';

// Force the buffer past its 4 MiB cap so push() drops the oldest chunks.
const MEGABYTE = 'x'.repeat(1024 * 1024);

describe('SessionBuffer (round-3 P2 #5: truncated is not sticky)', () => {
  it('reports truncated=false on a fresh read when no chunks have been dropped', () => {
    const buf = new SessionBuffer();
    buf.push('one');
    buf.push('two');

    const out = buf.readSince(0);

    expect(out.chunks).toHaveLength(2);
    expect(out.truncated).toBe(false);
    expect(out.nextSeq).toBe(3);
  });

  it('reports truncated=true on a read whose since_seq falls in the dropped gap', () => {
    const buf = new SessionBuffer();
    // 5 chunks of 1 MiB each: total 5 MiB, cap is 4 MiB → first chunk is dropped.
    for (let i = 0; i < 5; i++) {
      buf.push(MEGABYTE);
    }

    // Asking for everything since seq=0 means seq=1 should be present, but
    // seq=1 was dropped. Buffer should report truncated=true.
    const out = buf.readSince(0);
    expect(out.truncated).toBe(true);
  });

  it('reports truncated=false once the consumer has caught up past the drop gap', () => {
    const buf = new SessionBuffer();
    // Same scenario: drop seq=1 by pushing 5 × 1 MiB.
    for (let i = 0; i < 5; i++) {
      buf.push(MEGABYTE);
    }

    // The first chunk still present has seq=2 (since seq=1 was dropped).
    // A caught-up consumer reads since_seq=2, which means "anything strictly
    // after seq=2". The oldest remaining is seq=3 — no gap. Before the fix,
    // the sticky `dropped` flag would have made this read truncated=true
    // forever even though the consumer has no missing data.
    const out = buf.readSince(2);

    expect(out.truncated).toBe(false);
    expect(out.chunks[0]?.seq).toBe(3);
  });

  it('reports truncated=false on an empty incremental read after a past drop', () => {
    const buf = new SessionBuffer();
    for (let i = 0; i < 5; i++) {
      buf.push(MEGABYTE);
    }
    // Read everything → nextSeq = 6.
    const first = buf.readSince(0);
    expect(first.truncated).toBe(true);

    // Then read again with the cursor at the latest. No new data, no gap.
    const out = buf.readSince(first.nextSeq);

    expect(out.chunks).toEqual([]);
    expect(out.truncated).toBe(false);
  });

  // Round-4 P2 regression: a single push larger than the 4 MiB cap drops
  // every retained chunk (because the while loop removes them all looking
  // for headroom that never appears). The round-3 implementation computed
  // truncated from chunks[0]?.seq ?? nextSeq and silently reported false
  // because there were no chunks left — consumers got empty lines but no
  // signal that the oversized output was lost. droppedThroughSeq fixes it.
  it('reports truncated=true when a single oversized push evicts every chunk', () => {
    const buf = new SessionBuffer();
    // ~5 MiB in one chunk: the while loop will shift this very chunk out
    // because totalBytes > MAX_BUFFER_BYTES even after the shift attempt.
    const FIVE_MB = 'y'.repeat(5 * 1024 * 1024);

    buf.push(FIVE_MB);

    // Consumer reading from the start MUST see truncated=true even though
    // the buffer is now empty.
    const out = buf.readSince(0);
    expect(out.chunks).toEqual([]);
    expect(out.truncated).toBe(true);
    expect(out.nextSeq).toBe(2); // nextSeq is incremented before drop
  });
});
