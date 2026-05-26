import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TERMINAL_SEARCH_OPTIONS,
  INITIAL_TERMINAL_SEARCH_STATE,
  applyTerminalSearchEffect,
  terminalSearchReducer,
  toSearchAddonOptions,
  type SearchAddonLike,
  type SearchDecorations,
  type TerminalSearchAction,
  type TerminalSearchOptions,
  type TerminalSearchState,
} from '../src/search-state.js';

const DECORATIONS: SearchDecorations = {
  matchBackground: '#fff',
  matchBorder: '#fff',
  matchOverviewRuler: '#fff',
  activeMatchBackground: '#fff',
  activeMatchBorder: '#fff',
  activeMatchColorOverviewRuler: '#fff',
};

function addon(): SearchAddonLike {
  return {
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => true),
    clearDecorations: vi.fn(),
    clearActiveDecoration: vi.fn(),
  };
}

function stateWith(
  patch: Partial<TerminalSearchState>,
): TerminalSearchState {
  return { ...INITIAL_TERMINAL_SEARCH_STATE, ...patch };
}

describe('terminalSearchReducer', () => {
  it('opens the search state', () => {
    const next = terminalSearchReducer(INITIAL_TERMINAL_SEARCH_STATE, {
      type: 'open',
    });

    expect(next.isOpen).toBe(true);
  });

  it('closes back to the initial search state', () => {
    const prior = stateWith({
      isOpen: true,
      term: 'apple',
      result: { index: 2, count: 5 },
    });

    expect(terminalSearchReducer(prior, { type: 'close' })).toEqual(
      INITIAL_TERMINAL_SEARCH_STATE,
    );
  });

  it('sets a non-empty term and preserves the current result', () => {
    const prior = stateWith({ result: { index: 1, count: 3 } });
    const next = terminalSearchReducer(prior, {
      type: 'setTerm',
      term: 'apple',
    });

    expect(next.term).toBe('apple');
    expect(next.result).toEqual({ index: 1, count: 3 });
  });

  it('sets an empty term and resets the result', () => {
    const prior = stateWith({
      term: 'apple',
      result: { index: 1, count: 3 },
    });
    const next = terminalSearchReducer(prior, {
      type: 'setTerm',
      term: '',
    });

    expect(next.term).toBe('');
    expect(next.result).toEqual(INITIAL_TERMINAL_SEARCH_STATE.result);
  });

  it('sets search options', () => {
    const options: TerminalSearchOptions = {
      regex: true,
      caseSensitive: true,
      wholeWord: false,
    };
    const next = terminalSearchReducer(INITIAL_TERMINAL_SEARCH_STATE, {
      type: 'setOptions',
      options,
    });

    expect(next.options).toEqual(options);
  });

  it('applies mounted result updates', () => {
    const next = terminalSearchReducer(INITIAL_TERMINAL_SEARCH_STATE, {
      type: 'results',
      mounted: true,
      result: { index: 4, count: 9 },
    });

    expect(next.result).toEqual({ index: 4, count: 9 });
  });

  it('ignores unmounted result updates and returns the original state object', () => {
    const prior = stateWith({ result: { index: 1, count: 3 } });
    const next = terminalSearchReducer(prior, {
      type: 'results',
      mounted: false,
      result: { index: 4, count: 9 },
    });

    expect(next).toBe(prior);
    expect(next).toEqual(prior);
  });

  it.each<TerminalSearchAction>([
    { type: 'next' },
    { type: 'prev' },
    { type: 'clearActiveDecoration' },
  ])('returns the same state object for %s', (action) => {
    const prior = stateWith({ term: 'apple' });

    expect(terminalSearchReducer(prior, action)).toBe(prior);
  });
});

describe('applyTerminalSearchEffect', () => {
  it('clears decorations on close', () => {
    const a = addon();

    applyTerminalSearchEffect(a, INITIAL_TERMINAL_SEARCH_STATE, {
      type: 'close',
    });

    expect(a.clearDecorations).toHaveBeenCalledTimes(1);
  });

  it('clears the active decoration only for clearActiveDecoration', () => {
    const a = addon();

    applyTerminalSearchEffect(a, INITIAL_TERMINAL_SEARCH_STATE, {
      type: 'clearActiveDecoration',
    });

    expect(a.clearActiveDecoration).toHaveBeenCalledTimes(1);
    expect(a.clearDecorations).not.toHaveBeenCalled();
  });

  it('clears decorations for an empty setTerm action', () => {
    const a = addon();

    applyTerminalSearchEffect(a, stateWith({ term: 'apple' }), {
      type: 'setTerm',
      term: '',
    });

    expect(a.clearDecorations).toHaveBeenCalledTimes(1);
    expect(a.findNext).not.toHaveBeenCalled();
  });

  it('searches next for a non-empty setTerm action with decorations when provided', () => {
    const a = addon();

    applyTerminalSearchEffect(
      a,
      INITIAL_TERMINAL_SEARCH_STATE,
      { type: 'setTerm', term: 'apple' },
      DECORATIONS,
    );

    expect(a.findNext).toHaveBeenCalledWith(
      'apple',
      expect.objectContaining({ decorations: DECORATIONS }),
    );
  });

  it('searches next for setOptions when the current term is non-empty', () => {
    const a = addon();
    const options: TerminalSearchOptions = {
      regex: true,
      caseSensitive: true,
      wholeWord: true,
    };

    applyTerminalSearchEffect(
      a,
      stateWith({ term: 'apple' }),
      { type: 'setOptions', options },
      DECORATIONS,
    );

    expect(a.findNext).toHaveBeenCalledWith(
      'apple',
      expect.objectContaining({
        regex: true,
        caseSensitive: true,
        wholeWord: true,
        decorations: DECORATIONS,
      }),
    );
  });

  it('searches next for next when the current term is non-empty', () => {
    const a = addon();

    applyTerminalSearchEffect(
      a,
      stateWith({ term: 'apple' }),
      { type: 'next' },
      DECORATIONS,
    );

    expect(a.findNext).toHaveBeenCalledWith(
      'apple',
      expect.objectContaining({ decorations: DECORATIONS }),
    );
  });

  it('searches previous for prev when the current term is non-empty', () => {
    const a = addon();

    applyTerminalSearchEffect(
      a,
      stateWith({ term: 'apple' }),
      { type: 'prev' },
      DECORATIONS,
    );

    expect(a.findPrevious).toHaveBeenCalledWith(
      'apple',
      expect.objectContaining({ decorations: DECORATIONS }),
    );
  });

  it.each<TerminalSearchAction>([
    { type: 'setTerm', term: 'apple' },
    {
      type: 'setOptions',
      options: { regex: true, caseSensitive: false, wholeWord: false },
    },
    { type: 'next' },
    { type: 'prev' },
  ])('omits the decorations key when decorations are not provided for %s', (action) => {
    const a = addon();
    const state = stateWith({ term: 'apple' });

    applyTerminalSearchEffect(a, state, action);

    const spy =
      action.type === 'prev'
        ? vi.mocked(a.findPrevious)
        : vi.mocked(a.findNext);
    const options = spy.mock.calls[0]?.[1];
    expect(options).toBeDefined();
    expect('decorations' in options!).toBe(false);
  });
});

describe('toSearchAddonOptions', () => {
  it('omits the decorations key when decorations are omitted', () => {
    const result = toSearchAddonOptions(DEFAULT_TERMINAL_SEARCH_OPTIONS);

    expect('decorations' in result).toBe(false);
  });

  it('omits the decorations key when decorations are explicitly undefined', () => {
    const result = toSearchAddonOptions(
      DEFAULT_TERMINAL_SEARCH_OPTIONS,
      undefined,
    );

    expect('decorations' in result).toBe(false);
  });

  it('injects decorations when provided', () => {
    const result = toSearchAddonOptions(
      DEFAULT_TERMINAL_SEARCH_OPTIONS,
      DECORATIONS,
    );

    expect(result.decorations).toBe(DECORATIONS);
  });

  it('passes through regex, caseSensitive, and wholeWord', () => {
    const result = toSearchAddonOptions(
      { regex: true, caseSensitive: true, wholeWord: true },
      DECORATIONS,
    );

    expect(result).toEqual({
      regex: true,
      caseSensitive: true,
      wholeWord: true,
      decorations: DECORATIONS,
    });
  });
});
