import process from 'node:process';

import type { AgentEnv, CreateAgentEnvInput, TransportInfo } from './types.js';

export type ComposeAgentEnvInput = CreateAgentEnvInput & {
  transportInfo: TransportInfo;
  token: string;
};

function metadataEntries(metadata: Record<string, string> | undefined): Record<string, string> {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      `MCP_META_${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`,
      value,
    ]),
  );
}

export function composeAgentEnv({
  subject,
  scope = 'default',
  workspaceRoot = process.cwd(),
  metadata,
  transportInfo,
  token,
}: ComposeAgentEnvInput): AgentEnv {
  const transportEnv: Record<string, string> =
    transportInfo.kind === 'stdio-child'
      ? { MCP_BIN_PATH: transportInfo.endpoint }
      : { MCP_URL: transportInfo.endpoint };

  return {
    ...transportEnv,
    MCP_SUBJECT: subject,
    MCP_SCOPE: scope,
    MCP_WORKSPACE_ROOT: workspaceRoot,
    MCP_TOKEN: token,
    ...metadataEntries(metadata),
  };
}
