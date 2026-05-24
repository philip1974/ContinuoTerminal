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
