import { AgentHostImpl } from './agent-host.js';
import type { AgentHost, BootstrapOptions } from './types.js';

export async function bootstrapAgentHost(opts: BootstrapOptions): Promise<AgentHost> {
  const host = new AgentHostImpl(opts);
  await host.initialize();
  return host;
}
