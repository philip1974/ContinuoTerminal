import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthContext,
  AuthenticateRequest,
  AuthorizationDecision,
  AuthorizeToolCall,
} from '../../src/index.js';
import { createTerminalMcpServer, SessionManager, startHttpTransport } from '../../src/index.js';

type ConnectedServer = {
  client: Client;
  server: Awaited<ReturnType<typeof createTerminalMcpServer>>['server'];
  sessions: SessionManager;
};

const authContext: AuthContext = {
  subject: 'agent-a',
  scope: 'trusted',
  tokenId: 'token-a',
  metadata: { role: 'primary' },
};

async function connectInMemory(options: Parameters<typeof createTerminalMcpServer>[0] = {}): Promise<ConnectedServer> {
  const created = createTerminalMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'auth-hooks-test', version: '0' }, { capabilities: {} });

  await created.server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server: created.server, sessions: created.sessions };
}

async function startHttp(options: Partial<Parameters<typeof startHttpTransport>[0]> = {}) {
  const sessions = options.sessions ?? new SessionManager();
  const handle = await startHttpTransport({
    sessions,
    port: 0,
    host: '127.0.0.1',
    ...options,
  });
  return { handle, sessions, url: new URL(`http://${handle.address}:${handle.port}/mcp`) };
}

async function connectHttpClient(url: URL, authorization = 'Bearer token-a'): Promise<Client> {
  const client = new Client({ name: 'auth-hooks-http-test', version: '0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: authorization } },
  });
  await client.connect(transport);
  return client;
}

async function callListSessions(client: Client) {
  return client.callTool({ name: 'terminal.list_sessions', arguments: {} });
}

describe('server-node auth policy hooks', { timeout: 30_000 }, () => {
  const clients: Client[] = [];
  const servers: ConnectedServer[] = [];
  const handles: Array<Awaited<ReturnType<typeof startHttp>>['handle']> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    await Promise.all(servers.splice(0).map(({ server, sessions }) => server.close().catch(() => {}).then(() => sessions.dispose().catch(() => {}))));
    await Promise.all(handles.splice(0).map((handle) => handle.shutdown().catch(() => {})));
    vi.restoreAllMocks();
  });

  it('preserves no-hook tool calls', async () => {
    const connected = await connectInMemory();
    servers.push(connected);
    clients.push(connected.client);

    const result = await callListSessions(connected.client);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ sessions: [] });
  });

  it('authenticates HTTP requests and allows tool calls without an authorize hook', async () => {
    const authenticateRequest = vi.fn<AuthenticateRequest>(() => authContext);
    const { handle, url } = await startHttp({ authenticateRequest });
    handles.push(handle);
    const client = await connectHttpClient(url);
    clients.push(client);

    const result = await callListSessions(client);

    expect(result.isError).toBeUndefined();
    expect(authenticateRequest).toHaveBeenCalledWith(expect.objectContaining({
      authorizationHeader: 'Bearer token-a',
      method: expect.any(String),
      url: expect.stringContaining('/mcp'),
    }));
  });

  it('returns 401 JSON-RPC envelope when authenticateRequest returns null', async () => {
    const { handle, url } = await startHttp({ authenticateRequest: () => null });
    handles.push(handle);

    const response = await fetch(url, { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'unauthorized' },
      id: null,
    });
  });

  it('returns 500 JSON-RPC envelope when authenticateRequest throws', async () => {
    const { handle, url } = await startHttp({
      authenticateRequest: () => {
        throw new Error('auth backend down');
      },
    });
    handles.push(handle);

    const response = await fetch(url, { method: 'POST' });
    const body = await response.json() as { error: { code: number; message: string }; id: null; jsonrpc: '2.0' };

    expect(response.status).toBe(500);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.code).toBe(-32603);
    expect(body.error.message).toContain('auth backend down');
    expect(body.id).toBeNull();
  });

  it('dispatches tool calls when authorizeToolCall allows', async () => {
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(() => ({ allow: true }));
    const connected = await connectInMemory({ authorizeToolCall });
    servers.push(connected);
    clients.push(connected.client);

    const result = await callListSessions(connected.client);

    expect(result.isError).toBeUndefined();
    expect(authorizeToolCall).toHaveBeenCalledWith({
      auth: null,
      toolName: 'terminal.list_sessions',
      arguments: {},
    });
  });

  it('returns authorize deny reason as CallToolResult isError text', async () => {
    const connected = await connectInMemory({
      authorizeToolCall: () => ({ allow: false, reason: 'scope denied' }),
    });
    servers.push(connected);
    clients.push(connected.client);

    const result = await callListSessions(connected.client);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'scope denied' }]);
  });

  it('returns default deny text when authorizeToolCall denies without reason', async () => {
    const connected = await connectInMemory({
      authorizeToolCall: () => ({ allow: false }),
    });
    servers.push(connected);
    clients.push(connected.client);

    const result = await callListSessions(connected.client);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'not authorized' }]);
  });

  it('returns authorize hook failure and logs when authorizeToolCall throws', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const connected = await connectInMemory({
      authorizeToolCall: () => {
        throw new Error('policy crashed');
      },
    });
    servers.push(connected);
    clients.push(connected.client);

    const result = await callListSessions(connected.client);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'authorize hook failure' }]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('policy crashed'));
  });

  it('propagates AuthContext from HTTP authenticate into authorizeToolCall', async () => {
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(() => ({ allow: true }));
    const { handle, url } = await startHttp({
      authenticateRequest: () => authContext,
      authorizeToolCall,
    });
    handles.push(handle);
    const client = await connectHttpClient(url);
    clients.push(client);

    const result = await callListSessions(client);

    expect(result.isError).toBeUndefined();
    expect(authorizeToolCall).toHaveBeenCalledWith({
      auth: authContext,
      toolName: 'terminal.list_sessions',
      arguments: {},
    });
  });

  it('can deny an authenticated HTTP tool call using propagated auth context', async () => {
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(({ auth }) => ({
      allow: false,
      reason: `subject denied: ${auth?.subject ?? 'none'}`,
    }));
    const { handle, url } = await startHttp({
      authenticateRequest: () => authContext,
      authorizeToolCall,
    });
    handles.push(handle);
    const client = await connectHttpClient(url);
    clients.push(client);

    const result = await callListSessions(client);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'subject denied: agent-a' }]);
  });

  it('allows direct library use with authorizeToolCall receiving auth:null', async () => {
    const authorizeToolCall = vi.fn<AuthorizeToolCall>(() => ({ allow: true }));
    const connected = await connectInMemory({ authorizeToolCall });
    servers.push(connected);
    clients.push(connected.client);

    await callListSessions(connected.client);

    expect(authorizeToolCall).toHaveBeenCalledWith({
      auth: null,
      toolName: 'terminal.list_sessions',
      arguments: {},
    });
  });

  it('exports minimal auth hook types from the package entry', () => {
    const context: AuthContext = { subject: 'agent-a', scope: 'trusted', tokenId: 'token-a' };
    const allow: AuthorizationDecision = { allow: true };
    const deny: AuthorizationDecision = { allow: false, reason: 'denied' };
    const authenticate: AuthenticateRequest = () => context;
    const authorize: AuthorizeToolCall = () => allow;

    expect(context).toEqual({ subject: 'agent-a', scope: 'trusted', tokenId: 'token-a' });
    expect(allow.allow).toBe(true);
    expect(deny).toEqual({ allow: false, reason: 'denied' });
    expect(authenticate({ authorizationHeader: undefined, method: 'POST', url: '/mcp' })).toEqual(context);
    expect(authorize({ auth: null, toolName: 'terminal.list_sessions', arguments: {} })).toEqual(allow);
  });

  it('denies unknown tool names before the unknown-tool branch', async () => {
    const connected = await connectInMemory({
      authorizeToolCall: () => ({ allow: false, reason: 'policy denied first' }),
    });
    servers.push(connected);
    clients.push(connected.client);

    const result = await connected.client.callTool({ name: 'terminal.not_real', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'policy denied first' }]);
  });

  it('falls through to the unknown-tool branch when authorize allows unknown names', async () => {
    const connected = await connectInMemory({
      authorizeToolCall: () => ({ allow: true }),
    });
    servers.push(connected);
    clients.push(connected.client);

    const result = await connected.client.callTool({ name: 'terminal.not_real', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Unknown tool: terminal.not_real' }]);
  });

  it('accepts synchronous authenticate and authorize hook returns', async () => {
    const { handle, url } = await startHttp({
      authenticateRequest: () => authContext,
      authorizeToolCall: () => ({ allow: true }),
    });
    handles.push(handle);
    const client = await connectHttpClient(url);
    clients.push(client);

    const result = await callListSessions(client);

    expect(result.isError).toBeUndefined();
  });

  it('accepts asynchronous authenticate and authorize hook returns', async () => {
    const { handle, url } = await startHttp({
      authenticateRequest: async () => authContext,
      authorizeToolCall: async () => ({ allow: true }),
    });
    handles.push(handle);
    const client = await connectHttpClient(url);
    clients.push(client);

    const result = await callListSessions(client);

    expect(result.isError).toBeUndefined();
  });

  it('throws at startup when HTTP authorizeToolCall is provided without authenticateRequest', async () => {
    await expect(startHttpTransport({
      sessions: new SessionManager(),
      port: 0,
      host: '127.0.0.1',
      authorizeToolCall: () => ({ allow: true }),
    })).rejects.toThrow('authorizeToolCall requires authenticateRequest');
  });
});
