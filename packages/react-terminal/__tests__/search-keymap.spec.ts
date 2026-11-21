import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSearchHotkey } from '../src/search-keymap.js';

function keyEvent(
  input: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'key'>,
): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...input,
  } as KeyboardEvent;
}

describe('isSearchHotkey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when navigator is undefined', () => {
    vi.stubGlobal('navigator', undefined);

    expect(isSearchHotkey(keyEvent({ key: 'f', metaKey: true }))).toBe(false);
  });

  it('accepts Cmd+F on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });

    expect(
      isSearchHotkey(
        keyEvent({
          key: 'f',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        }),
      ),
    ).toBe(true);
  });

  it('accepts Ctrl+F and rejects Cmd+F on non-mac platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });

    expect(isSearchHotkey(keyEvent({ key: 'f', ctrlKey: true }))).toBe(true);
    expect(isSearchHotkey(keyEvent({ key: 'f', metaKey: true }))).toBe(false);
  });

  it('rejects alt or shift modifiers', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });

    expect(
      isSearchHotkey(keyEvent({ key: 'f', metaKey: true, altKey: true })),
    ).toBe(false);
    expect(
      isSearchHotkey(keyEvent({ key: 'F', metaKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it('rejects non-f keys and treats uppercase F as f', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });

    expect(isSearchHotkey(keyEvent({ key: 'g', metaKey: true }))).toBe(false);
    expect(isSearchHotkey(keyEvent({ key: 'F', metaKey: true }))).toBe(true);
  });
});
