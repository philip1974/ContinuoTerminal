import process from 'node:process';

import type { AgentEnv, CreateAgentEnvInput, TransportInfo } from './types.js';

export type ComposeAgentEnvInput = CreateAgentEnvInput & {
  transportInfo: TransportInfo;
  token: string;
};

/**
 * Serialize metadata into `MCP_META_<KEY>` env vars, upper-casing the key and
 * replacing every non-`[A-Z0-9_]` char with `_` for env-var safety.
 *
 * Because that normalization is lossy, distinct source keys can map to the same
 * env var (e.g. `build-id`, `build_id`, and `build id` all become
 * `MCP_META_BUILD_ID`). Rather than silently drop all but the last value —
 * leaving the agent with incomplete, undiagnosable metadata — this throws so the
 * colliding keys surface at compose time (metadata keys are host-authored, not
 * runtime input, so a collision is a naming bug to fix).
 */
function metadataEntries(metadata: Record<string, string> | undefined): Record<string, string> {
  if (!metadata) return {};
  const entries: Record<string, string> = {};
  const sourceKeyForEnvKey: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const envKey = `MCP_META_${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
    const priorKey = sourceKeyForEnvKey[envKey];
    if (priorKey !== undefined) {
      throw new Error(
        `composeAgentEnv: metadata keys ${JSON.stringify(priorKey)} and ${JSON.stringify(key)} ` +
        `both normalize to the env var ${envKey} — rename one so no metadata is silently dropped.`,
      );
    }
    sourceKeyForEnvKey[envKey] = key;
    entries[envKey] = value;
  }
  return entries;
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
