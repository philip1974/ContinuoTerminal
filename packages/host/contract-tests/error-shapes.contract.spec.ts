import { describe, expect, it } from 'vitest';
import { HostAuthConfigError, HostDisposedError, TokenInvalidError } from '@continuo-terminal/host';

describe('host error classes — contract', () => {
  function customOwnKeys(e: Error): string[] {
    return Object.getOwnPropertyNames(e).filter((k) => !['stack', 'message', 'name'].includes(k));
  }

  it('HostDisposedError surface', () => {
    const e = new HostDisposedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('HostDisposedError');
    expect(e.message).toBe('AgentHost has been disposed');
    expect(customOwnKeys(e)).toEqual([]);
  });

  it('HostAuthConfigError surface', () => {
    const e = new HostAuthConfigError('test message');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('HostAuthConfigError');
    expect(e.message).toBe('test message');
    expect(customOwnKeys(e)).toEqual([]);
  });

  it('TokenInvalidError surface', () => {
    const e = new TokenInvalidError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('TokenInvalidError');
    expect(e.message).toBe('Token is not valid for this host');
    expect(customOwnKeys(e)).toEqual([]);
  });
});
