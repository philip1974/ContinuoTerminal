// Internal barrel for shell-env module. Public API surface lives on
// `@continuo-terminal/server-node` root export.
export { isAllowedShell, getDefaultShell } from './host-shell-policy.js';
export { prepareShellIntegrationEnv } from './integration.js';
export type { SupportedShell } from './integration.js';
