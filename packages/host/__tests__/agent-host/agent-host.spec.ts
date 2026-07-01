import { afterEach, describe, expect, it } from 'vitest';

import { HostDisposedError, bootstrapAgentHost, type AgentHost } from '../../src/index.js';

describe('AgentHost', () => {
  let host: AgentHost | undefined;

  afterEach(async () => {
    await host?.dispose();
    host = undefined;
  });

  it('creates stdio-child env shape', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'stdio-child' } });

    const env = host.createAgentEnv({ subject: 'agent-a', workspaceRoot: '/tmp/work' });

    expect(env.MCP_BIN_PATH).toContain('bin.mjs');
    expect(env.MCP_URL).toBeUndefined();
    expect(env.MCP_SUBJECT).toBe('agent-a');
    expect(env.MCP_SCOPE).toBe('default');
    expect(env.MCP_WORKSPACE_ROOT).toBe('/tmp/work');
    expect(env.MCP_TOKEN).toEqual(expect.any(String));
  });

  it('creates HTTP env shape', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });

    const env = host.createAgentEnv({ subject: 'agent-b', scope: 'demo' });

    expect(env.MCP_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(env.MCP_BIN_PATH).toBeUndefined();
    expect(env.MCP_SUBJECT).toBe('agent-b');
    expect(env.MCP_SCOPE).toBe('demo');
    expect(env.MCP_TOKEN).toEqual(expect.any(String));
  });

  it('serializes metadata as MCP_META entries', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'stdio-child' } });

    const env = host.createAgentEnv({
      subject: 'agent-c',
      metadata: { role: 'primary', 'build-id': '42' },
    });

    expect(env.MCP_META_ROLE).toBe('primary');
    expect(env.MCP_META_BUILD_ID).toBe('42');
  });

  // Polish (phase 2): distinct metadata keys that normalize to the same
  // MCP_META_<KEY> env var must not silently overwrite each other — compose
  // throws naming both colliding keys instead of dropping metadata.
  it('throws on metadata keys that collide after env-var normalization', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'stdio-child' } });

    expect(() =>
      host!.createAgentEnv({
        subject: 'agent-collide',
        metadata: { 'build-id': 'dash', build_id: 'underscore' },
      }),
    ).toThrow(/both normalize to the env var MCP_META_BUILD_ID/);
  });

  it('throws HostDisposedError after dispose', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'stdio-child' } });
    await host.dispose();

    expect(() => host!.createAgentEnv({ subject: 'agent-d' })).toThrow(HostDisposedError);
  });

  it('dispose is idempotent', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });

    await host.dispose();
    await expect(host.dispose()).resolves.toBeUndefined();
  });
});
