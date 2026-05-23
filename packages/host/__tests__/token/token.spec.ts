import { describe, expect, it } from 'vitest';

import { TokenStore } from '../../src/token.js';

describe('TokenStore', () => {
  it('issues and validates a token', () => {
    const store = new TokenStore();
    const token = store.issue();

    expect(store.validate(token)).toBe(true);
  });

  it('rejects invalid tokens', () => {
    const store = new TokenStore();

    expect(store.validate('not-issued')).toBe(false);
  });

  it('clears issued tokens', () => {
    const store = new TokenStore();
    const token = store.issue();

    store.clear();

    expect(store.validate(token)).toBe(false);
  });
});
