// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installAtlasGuards } from '../src/atlas-guards.js';

type MqlListener = (this: MediaQueryList, ev: MediaQueryListEvent) => void;

type MqlStub = MediaQueryList & {
  fire: () => void;
  listeners: Set<MqlListener>;
};

let mqlInstances: MqlStub[];
let originalMatchMedia: typeof window.matchMedia | undefined;

function makeMql(query: string): MqlStub {
  const listeners = new Set<MqlListener>();
  const mql = {
    media: query,
    matches: true,
    onchange: null,
    addEventListener: (type: string, listener: MqlListener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: MqlListener) => {
      if (type === 'change') listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    fire: () => {
      const event = { matches: false, media: query } as MediaQueryListEvent;
      for (const l of listeners) l.call(mql as unknown as MediaQueryList, event);
    },
    listeners,
  } as unknown as MqlStub;
  return mql;
}

beforeEach(() => {
  mqlInstances = [];
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const mql = makeMql(query);
    mqlInstances.push(mql);
    return mql;
  }) as typeof window.matchMedia;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  } else {
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  }
});

describe('installAtlasGuards', () => {
  it('clears the texture atlas when document becomes visible', () => {
    const clearTextureAtlas = vi.fn();
    installAtlasGuards({ clearTextureAtlas });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it('does not clear atlas while hidden', () => {
    const clearTextureAtlas = vi.fn();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    installAtlasGuards({ clearTextureAtlas });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(clearTextureAtlas).not.toHaveBeenCalled();
  });

  it('clears the atlas on window focus', () => {
    const clearTextureAtlas = vi.fn();
    installAtlasGuards({ clearTextureAtlas });

    window.dispatchEvent(new Event('focus'));

    expect(clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it('clears the atlas when devicePixelRatio matchMedia fires change', () => {
    const clearTextureAtlas = vi.fn();
    installAtlasGuards({ clearTextureAtlas });

    expect(mqlInstances).toHaveLength(1);
    mqlInstances[0]!.fire();

    expect(clearTextureAtlas).toHaveBeenCalledTimes(1);
    // After fire, a fresh mql is built so the next DPR crossing is still observed.
    expect(mqlInstances).toHaveLength(2);
  });

  it('dispose removes visibility/focus/DPR listeners (no further fires reach the term)', () => {
    const clearTextureAtlas = vi.fn();
    const guards = installAtlasGuards({ clearTextureAtlas });

    guards.dispose();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    mqlInstances[0]!.fire();

    expect(clearTextureAtlas).not.toHaveBeenCalled();
  });

  it('dispose is idempotent', () => {
    const clearTextureAtlas = vi.fn();
    const guards = installAtlasGuards({ clearTextureAtlas });

    guards.dispose();
    guards.dispose(); // second call must not throw
    expect(() => guards.dispose()).not.toThrow();
  });

  it('swallows clearTextureAtlas throws so a single bad event does not break later guards', () => {
    const clearTextureAtlas = vi.fn(() => {
      throw new Error('term disposed mid-event');
    });
    installAtlasGuards({ clearTextureAtlas });

    expect(() => window.dispatchEvent(new Event('focus'))).not.toThrow();
    expect(clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it('degrades silently on terminals without clearTextureAtlas (older xterm)', () => {
    const guards = installAtlasGuards({});

    expect(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      mqlInstances[0]!.fire();
    }).not.toThrow();
    guards.dispose();
  });
});
