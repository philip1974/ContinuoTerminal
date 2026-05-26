import { describe, expect, it } from 'vitest';

import { createCallbackRegistry } from '../src/callback-registry.js';

describe('createCallbackRegistry', () => {
  it('returns a registered value from get', () => {
    const registry = createCallbackRegistry<string>();

    registry.register('panel-a', 'value-a');

    expect(registry.get('panel-a')).toBe('value-a');
  });

  it('returns a disposer that removes the registered value', () => {
    const registry = createCallbackRegistry<string>();

    const dispose = registry.register('panel-a', 'value-a');
    dispose();

    expect(registry.get('panel-a')).toBeUndefined();
  });

  it('unregister removes a value by key', () => {
    const registry = createCallbackRegistry<string>();
    registry.register('panel-a', 'value-a');

    registry.unregister('panel-a');

    expect(registry.get('panel-a')).toBeUndefined();
  });

  it('getAll returns a Map snapshot that cannot mutate internal state', () => {
    const registry = createCallbackRegistry<string>();
    registry.register('panel-a', 'value-a');

    const snapshot = registry.getAll();
    snapshot.set('panel-b', 'value-b');
    snapshot.delete('panel-a');

    expect(snapshot).toBeInstanceOf(Map);
    expect(registry.get('panel-a')).toBe('value-a');
    expect(registry.get('panel-b')).toBeUndefined();
  });

  it('clear removes all registered values', () => {
    const registry = createCallbackRegistry<string>();
    registry.register('panel-a', 'value-a');
    registry.register('panel-b', 'value-b');

    registry.clear();

    expect(registry.getAll().size).toBe(0);
    expect(registry.get('panel-a')).toBeUndefined();
    expect(registry.get('panel-b')).toBeUndefined();
  });

  it('keeps multiple registry instances isolated', () => {
    const first = createCallbackRegistry<string>();
    const second = createCallbackRegistry<string>();

    first.register('panel-a', 'first');
    second.register('panel-a', 'second');

    expect(first.get('panel-a')).toBe('first');
    expect(second.get('panel-a')).toBe('second');
  });

  it('does not let a stale disposer remove a same-key same-function registration', () => {
    const registry = createCallbackRegistry<() => void>();
    const fn = () => {};

    const disposeFirst = registry.register('panel-a', fn);
    registry.register('panel-a', fn);
    disposeFirst();

    expect(registry.get('panel-a')).toBe(fn);
  });

  it('does not let an old disposer remove a later different-value registration', () => {
    const registry = createCallbackRegistry<string>();

    const disposeFirst = registry.register('panel-a', 'value-a');
    disposeFirst();
    registry.register('panel-a', 'value-b');
    disposeFirst();

    expect(registry.get('panel-a')).toBe('value-b');
  });

  it('keeps disposer calls idempotent', () => {
    const registry = createCallbackRegistry<string>();
    const dispose = registry.register('panel-a', 'value-a');

    expect(() => {
      dispose();
      dispose();
    }).not.toThrow();
    expect(registry.get('panel-a')).toBeUndefined();
  });

  it('isolates tokens for repeated registrations of the same key', () => {
    const registry = createCallbackRegistry<string>();

    const disposeFirst = registry.register('panel-a', 'value-a');
    const disposeSecond = registry.register('panel-a', 'value-b');

    disposeFirst();
    expect(registry.get('panel-a')).toBe('value-b');

    disposeSecond();
    expect(registry.get('panel-a')).toBeUndefined();
  });
});
