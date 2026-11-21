export { formatError } from './format-error.js';
export { makeCreateSessionHandler } from './handlers/create-session.js';
export { makeKillHandler } from './handlers/kill.js';
export { makeListSessionsHandler } from './handlers/list-sessions.js';
export { makePressKeyHandler } from './handlers/press-key.js';
export { makeReadOutputHandler } from './handlers/read-output.js';
export { makeResizeHandler } from './handlers/resize.js';
export { makeSendInputHandler } from './handlers/send-input.js';
export { makeSendTextHandler } from './handlers/send-text.js';
export { createTerminalMcpServer, main } from './server.js';
export { SessionManager } from './session-manager.js';
export { startHttpTransport } from './transports/http.js';
export {
  MAX_UNIX_SOCKET_PATH_LENGTH,
  ServerSocketTransport,
  splitLines,
  startLocalSocketTransport,
} from './transports/local-socket.js';
export { LocalSocketClientTransport } from './transports/local-socket-client.js';
export { connectLocalSocketStdioProxy } from './transports/local-socket-proxy.js';
export type {
  AuthContext,
  AuthenticateRequest,
  AuthorizationDecision,
  AuthorizeToolCall,
} from './auth-hooks.js';
export type { SessionManagerOptions, SessionManagerKillInput, SessionManagerCreateInput } from './session-manager.js';
export type {
  StartHttpTransportInput as HttpTransportOptions,
  StartedHttpTransport as HttpTransportHandle,
} from './transports/http.js';
export type {
  SplitLinesResult,
  StartLocalSocketTransportInput as LocalSocketTransportOptions,
  StartedLocalSocketTransport as LocalSocketTransportHandle,
} from './transports/local-socket.js';
export type {
  ConnectLocalSocketStdioProxyInput,
  LocalSocketStdioProxy,
} from './transports/local-socket-proxy.js';
export { isAllowedShell, getDefaultShell, prepareShellIntegrationEnv } from './shell-env/index.js';
export type { SupportedShell } from './shell-env/index.js';
