export type { MCPClientAdapter, TerminalProps } from './types.js';
export { Terminal } from './Terminal.js';
export { parseCallToolResult } from './parse-result.js';
export {
  createHttpMCPClientAdapter,
  type CreateHttpMCPClientAdapterInput,
} from './http-adapter.js';
export {
  applyMappedKeyOnKeydown,
  consumeMappedKeyOnData,
  createMappedKeyState,
  mapTerminalKey,
  shouldSkipXtermKey,
  type MappedKeyState,
} from './key-mapping.js';
export { chunkifyData, disposeQueue, safeWrite } from './safeWrite.js';

// callback-registry
export { createCallbackRegistry } from './callback-registry.js';

// search-state
export {
  type TerminalSearchOptions,
  type TerminalSearchResult,
  type TerminalSearchState,
  type TerminalSearchAction,
  type SearchAddonLike,
  type SearchDecorations,
  type TerminalSearchAddonOptions,
  DEFAULT_TERMINAL_SEARCH_OPTIONS,
  INITIAL_TERMINAL_SEARCH_STATE,
  toSearchAddonOptions,
  terminalSearchReducer,
  applyTerminalSearchEffect,
} from './search-state.js';

// search-keymap
export { isSearchHotkey } from './search-keymap.js';
