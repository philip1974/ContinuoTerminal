import { randomBytes } from 'node:crypto';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapAgentHost,
  HostAuthConfigError,
  type AgentHost,
  type AuthContext,
  type AuthorizeToolCall,
  type BootstrapOptions,
} from '../../src/index.js';
import { TokenStore } from '../../src/token.js';

const allowAll: AuthorizeToolCall = () => ({ allow: true });

async function connectClient(endpoint: string, token: string, name = 'host-auth-test'): Promise<Client> {
  const client = new Client({ name, version: '0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

async function postJsonRpc(endpoint: string, authorizationHeader?: string): Promise<Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });
}

async function expectUnauthorized(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toBe('Bearer');
  expect(await response.json()).toEqual({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'unauthorized' },
    id: null,
  });
}

async function readSseJson(response: Response): Promise<{ result?: { tools?: unknown[] } }> {
  const text = await response.text();
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  expect(dataLine).toBeDefined();
  return JSON.parse(dataLine!.slice('data: '.length)) as { result?: { tools?: unknown[] } };
}

describe('host auth integration', { timeout: 30_000 }, () => {
  let host: AgentHost | undefined;
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    await host?.dispose();
    host = undefined;
    vi.restoreAllMocks();
  });

  it('preserves unauthenticated HTTP behavior when auth is undefined', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 } });
    const response = await postJsonRpc(host.transportInfo.endpoint);

    expect(response.status).not.toBe(401);
  });

  it('throws HostAuthConfigError when stdio-child transport receives auth options', async () => {
    await expect(bootstrapAgentHost({
      transport: { kind: 'stdio-child' },
      auth: {},
    })).rejects.toBeInstanceOf(HostAuthConfigError);
    await expect(bootstrapAgentHost({
      transport: { kind: 'stdio-child' },
      auth: {},
    })).rejects.toThrow('auth options are only valid with HTTP transport');
  });

  it('authenticates valid host-issued bearer tokens', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });
    const env = host.createAgentEnv({ subject: 'agent-a', scope: 'trusted' });
    const client = await connectClient(host.transportInfo.endpoint, env.MCP_TOKEN);
    clients.push(client);

    const tools = await client.listTools();

    expect(tools.tools).toHaveLength(7);
  });

  it('rejects missing authorization header', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });

    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint));
  });

  it('rejects wrong bearer scheme', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });

    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint, 'Token abc'));
  });

  it('rejects malformed bearer headers', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });

    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint, 'Bearer '));
    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint, 'Bearer abc def'));
  });

  it('rejects base64url-shaped bearer tokens not issued by the host', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });
    const invalidToken = randomBytes(32).toString('base64url');

    expect(invalidToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint, `Bearer ${invalidToken}`));
  });

  it('rejects expired tokens through defaultAuthenticate', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: { tokenTtlMs: 1 } });
    const env = host.createAgentEnv({ subject: 'agent-expiring' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expectUnauthorized(await postJsonRpc(host.transportInfo.endpoint, `Bearer ${env.MCP_TOKEN}`));
  });

  it('passes authenticated tool calls through an allow policy', async () => {
    host = await bootstrapAgentHost({
      transport: { kind: 'http', port: 0 },
      auth: { authorizeToolCall: allowAll },
    });
    const env = host.createAgentEnv({ subject: 'agent-allow' });
    const client = await connectClient(host.transportInfo.endpoint, env.MCP_TOKEN);
    clients.push(client);

    const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ sessions: [] });
  });

  it('returns policy deny decisions for authenticated tool calls', async () => {
    host = await bootstrapAgentHost({
      transport: { kind: 'http', port: 0 },
      auth: { authorizeToolCall: () => ({ allow: false, reason: 'scope denied' }) },
    });
    const env = host.createAgentEnv({ subject: 'agent-deny' });
    const client = await connectClient(host.transportInfo.endpoint, env.MCP_TOKEN);
    clients.push(client);

    const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'scope denied' }]);
  });

  it('forwards host-wide tokenTtlMs into TokenStore.issue', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: { tokenTtlMs: 100 } });
    const env = host.createAgentEnv({ subject: 'agent-ttl' });
    const tokens = (host as unknown as { tokens: TokenStore }).tokens;
    const token = tokens.validate(env.MCP_TOKEN);

    expect(token).not.toBeNull();
    expect(token?.expiresAt).toBe(token!.issuedAt + 100);
  });

  it('lets authenticateRequestOverride replace default TokenStore validation', async () => {
    const authContext: AuthContext = {
      subject: 'override-agent',
      scope: 'override-scope',
      tokenId: 'override-token',
      metadata: { source: 'override' },
    };
    const validate = vi.spyOn(TokenStore.prototype, 'validate');
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(() => ({ allow: true }));
    host = await bootstrapAgentHost({
      transport: { kind: 'http', port: 0 },
      auth: {
        authenticateRequestOverride: () => authContext,
        authorizeToolCall,
      },
    });
    const client = await connectClient(host.transportInfo.endpoint, 'not-from-token-store');
    clients.push(client);

    await client.callTool({ name: 'terminal.list_sessions', arguments: {} });

    expect(validate).not.toHaveBeenCalled();
    expect(authorizeToolCall).toHaveBeenCalledWith({
      auth: authContext,
      toolName: 'terminal.list_sessions',
      arguments: {},
    });
  });

  it('supports real HTTP client requests end-to-end with default auth and policy', async () => {
    host = await bootstrapAgentHost({
      transport: { kind: 'http', port: 0 },
      auth: { authorizeToolCall: allowAll },
    });
    const env = host.createAgentEnv({ subject: 'agent-fetch', scope: 'default' });
    const response = await postJsonRpc(host.transportInfo.endpoint, `Bearer ${env.MCP_TOKEN}`);
    const body = await readSseJson(response);

    expect(response.status).toBe(200);
    expect(body.result?.tools).toHaveLength(7);
  });

  it('accepts bearer scheme case-insensitively', async () => {
    host = await bootstrapAgentHost({ transport: { kind: 'http', port: 0 }, auth: {} });
    const env = host.createAgentEnv({ subject: 'agent-case' });

    for (const scheme of ['bearer', 'BEARER', 'Bearer']) {
      const response = await postJsonRpc(host.transportInfo.endpoint, `${scheme} ${env.MCP_TOKEN}`);
      expect(response.status).not.toBe(401);
    }
  });

  it('supplies default authentication when only authorizeToolCall is configured', async () => {
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(() => ({ allow: true }));
    host = await bootstrapAgentHost({
      transport: { kind: 'http', port: 0 },
      auth: { authorizeToolCall },
    });
    const env = host.createAgentEnv({ subject: 'agent-default-auth' });
    const client = await connectClient(host.transportInfo.endpoint, env.MCP_TOKEN);
    clients.push(client);

    const result = await client.callTool({ name: 'terminal.list_sessions', arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(authorizeToolCall).toHaveBeenCalledWith({
      auth: expect.objectContaining({
        subject: 'agent-default-auth',
        scope: 'default',
      }),
      toolName: 'terminal.list_sessions',
      arguments: {},
    });
  });

  it('keeps auth options structurally additive to BootstrapOptions', () => {
    const authorizeToolCall: AuthorizeToolCall = () => ({ allow: true });
    const httpOptions: BootstrapOptions = {
      transport: { kind: 'http' },
      auth: { authorizeToolCall },
    };
    const stdioOptions: BootstrapOptions = {
      transport: { kind: 'stdio-child' },
      auth: {},
    };

    expect(httpOptions.auth?.authorizeToolCall).toBe(authorizeToolCall);
    expect(stdioOptions.auth).toEqual({});
  });
});
