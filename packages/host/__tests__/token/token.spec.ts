import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenStore } from '../../src/token.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function entryFor(store: TokenStore, tokenId: string): unknown {
  return (store as unknown as { entries: Map<string, unknown> }).entries.get(tokenId);
}

describe('TokenStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a 256-bit base64url bearer value and token metadata', () => {
    const store = new TokenStore();
    const issued = store.issue({
      subject: 'agent-a',
      scope: 'demo',
      workspaceRoot: '/tmp/work',
      metadata: { role: 'primary' },
    });

    expect(issued.value).toMatch(TOKEN_RE);
    expect(issued.token).toMatchObject({
      tokenId: expect.any(String),
      subject: 'agent-a',
      scope: 'demo',
      workspaceRoot: '/tmp/work',
      metadata: { role: 'primary' },
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
  });

  // Security: `readonly` on Token is compile-time only. issue()/validate() must
  // NOT hand back a live reference to internal auth state — otherwise a caller
  // could mutate expiresAt (TTL bypass) or subject/scope (privilege escalation)
  // at runtime and corrupt what validate()/pruneExpired() trust.
  it('returns frozen, tamper-proof token metadata from issue() and validate()', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a', scope: 'demo', metadata: { role: 'primary' } });

    expect(Object.isFrozen(issued.token)).toBe(true);
    expect(Object.isFrozen(issued.token.metadata)).toBe(true);

    // Runtime tamper attempts are rejected (frozen object, strict-mode ESM).
    expect(() => {
      (issued.token as { expiresAt?: number }).expiresAt = Date.now() + 1_000_000_000;
    }).toThrow();
    expect(() => {
      (issued.token as { subject: string }).subject = 'attacker';
    }).toThrow();

    const validated = store.validate(issued.value);
    expect(validated).not.toBeNull();
    expect(Object.isFrozen(validated)).toBe(true);
    expect(validated?.subject).toBe('agent-a');
    expect(validated?.expiresAt).toBe(Date.now() + 30 * 60 * 1000);
  });

  it('cannot bypass TTL by mutating a previously issued token object', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a', ttlMs: 1 });

    // Attempt to extend lifetime via the returned reference — must not take.
    try {
      (issued.token as { expiresAt?: number }).expiresAt = Date.now() + 1_000_000_000;
    } catch {
      /* frozen → throws in strict mode; either way internal state is intact */
    }

    vi.advanceTimersByTime(2);
    expect(store.validate(issued.value)).toBeNull(); // still expired despite tamper
  });

  it('stores only digest and metadata internally, never plaintext token value', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a' });
    const entry = entryFor(store, issued.token.tokenId);

    expect(entry).toMatchObject({
      digest: expect.any(Buffer),
      metadata: issued.token,
    });
    expect((entry as { digest: Buffer }).digest).toHaveLength(32);
    expect(entry).not.toHaveProperty('value');
    expect(entry).not.toHaveProperty('plainValue');
    expect(entry).not.toHaveProperty('token');
  });

  it('validates a matching value and returns token metadata', () => {
    const store = new TokenStore();
    const issued = store.issue({
      subject: 'agent-a',
      scope: 'trusted',
      metadata: { lane: 'a' },
    });

    expect(store.validate(issued.value)).toEqual(issued.token);
  });

  it('returns null for wrong token values', () => {
    const store = new TokenStore();
    store.issue({ subject: 'agent-a' });

    expect(store.validate('not-issued')).toBeNull();
  });

  it('returns null for empty and non-string values', () => {
    const store = new TokenStore();
    store.issue({ subject: 'agent-a' });

    expect(store.validate('')).toBeNull();
    expect(store.validate(undefined as unknown as string)).toBeNull();
  });

  it('expires default-TTL tokens lazily during validation and removes entries', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a' });

    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    expect(store.validate(issued.value)).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('expires explicit ttlMs tokens', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a', ttlMs: 1 });

    vi.advanceTimersByTime(2);

    expect(store.validate(issued.value)).toBeNull();
  });

  it('supports ttlMs:null for no-expiry local demos', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a', ttlMs: null });

    vi.advanceTimersByTime(10 * 365 * 24 * 60 * 60 * 1000);

    expect(issued.token.expiresAt).toBeUndefined();
    expect(store.validate(issued.value)).toEqual(issued.token);
  });

  it('rejects non-positive and non-finite ttlMs values', () => {
    const store = new TokenStore();

    expect(() => store.issue({ subject: 'agent-a', ttlMs: 0 })).toThrow(RangeError);
    expect(() => store.issue({ subject: 'agent-a', ttlMs: -1 })).toThrow(RangeError);
    expect(() => store.issue({ subject: 'agent-a', ttlMs: Number.NaN })).toThrow(RangeError);
  });

  it('deep-clones metadata on issue', () => {
    const store = new TokenStore();
    const metadata = { role: 'primary' };
    const issued = store.issue({ subject: 'agent-a', metadata });

    metadata.role = 'mutated';

    expect(issued.token.metadata).toEqual({ role: 'primary' });
    expect(store.validate(issued.value)?.metadata).toEqual({ role: 'primary' });
  });

  it('revokes tokens by token id and reports whether one existed', () => {
    const store = new TokenStore();
    const issued = store.issue({ subject: 'agent-a' });

    expect(store.revokeById(issued.token.tokenId)).toBe(true);
    expect(store.validate(issued.value)).toBeNull();
    expect(store.revokeById(issued.token.tokenId)).toBe(false);
  });

  it('revokes all tokens for a subject and leaves other subjects untouched', () => {
    const store = new TokenStore();
    const first = store.issue({ subject: 'agent-a' });
    const second = store.issue({ subject: 'agent-a' });
    const other = store.issue({ subject: 'agent-b' });

    expect(store.revokeBySubject('agent-a')).toBe(2);
    expect(store.validate(first.value)).toBeNull();
    expect(store.validate(second.value)).toBeNull();
    expect(store.validate(other.value)).toEqual(other.token);
  });

  it('actively prunes expired tokens on issue', () => {
    const store = new TokenStore();
    const expired = store.issue({ subject: 'agent-a', ttlMs: 1 });
    vi.advanceTimersByTime(2);

    const fresh = store.issue({ subject: 'agent-b' });

    expect(entryFor(store, expired.token.tokenId)).toBeUndefined();
    expect(store.size()).toBe(1);
    expect(store.validate(fresh.value)).toEqual(fresh.token);
  });

  it('actively prunes expired tokens on revokeBySubject even when target is absent', () => {
    const store = new TokenStore();
    const expired = store.issue({ subject: 'agent-a', ttlMs: 1 });
    vi.advanceTimersByTime(2);

    expect(store.revokeBySubject('absent')).toBe(0);
    expect(entryFor(store, expired.token.tokenId)).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it('clears all tracked tokens', () => {
    const store = new TokenStore();
    const first = store.issue({ subject: 'agent-a' });
    const second = store.issue({ subject: 'agent-b' });

    store.clear();

    expect(store.size()).toBe(0);
    expect(store.validate(first.value)).toBeNull();
    expect(store.validate(second.value)).toBeNull();
  });
});
