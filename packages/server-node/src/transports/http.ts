import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createTerminalMcpServer } from '../server.js';
import type { SessionManager } from '../session-manager.js';
import type { AuthContext, AuthenticateRequest, AuthorizeToolCall } from '../auth-hooks.js';

export type StartHttpTransportInput = {
  sessions: SessionManager;
  port: number;
  host: string;
  endpoint?: string;
  authenticateRequest?: AuthenticateRequest;
  authorizeToolCall?: AuthorizeToolCall;
};

export type StartedHttpTransport = {
  httpServer: HttpServer;
  port: number;
  address: string;
  shutdown: () => Promise<void>;
};

function matchesEndpoint(url: string | undefined, endpoint: string): boolean {
  if (!url) return false;
  const path = url.split('?', 1)[0];
  return path === endpoint || path === `${endpoint}/`;
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: SessionManager,
  authenticateRequest: AuthenticateRequest | undefined,
  authorizeToolCall: AuthorizeToolCall | undefined,
): Promise<void> {
  let auth: AuthContext | null = null;
  if (authenticateRequest) {
    auth = await authenticateRequest({
      authorizationHeader: req.headers.authorization,
      method: req.method ?? '',
      url: req.url ?? '',
    });
    if (auth === null) {
      res.writeHead(401, {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
      });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'unauthorized' },
        id: null,
      }));
      return;
    }
  }

  const { server } = createTerminalMcpServer({ sessions, auth, authorizeToolCall });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } finally {
    await server.close().catch(() => {});
  }
}

export async function startHttpTransport({
  sessions,
  port,
  host,
  endpoint = '/mcp',
  authenticateRequest,
  authorizeToolCall,
}: StartHttpTransportInput): Promise<StartedHttpTransport> {
  if (authorizeToolCall && !authenticateRequest) {
    throw new Error(
      '@continuo-terminal/server-node: authorizeToolCall requires authenticateRequest ' +
      'in startHttpTransport (HTTP-layer silent-bypass risk). See ADR 0005 §A2.',
    );
  }

  const httpServer = createServer((req, res) => {
    if (!matchesEndpoint(req.url, endpoint)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    void handleMcpRequest(req, res, sessions, authenticateRequest, authorizeToolCall).catch((err: unknown) => {
      if (res.headersSent) return;
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message },
          id: null,
        }),
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      httpServer.off('error', onError);
      resolve();
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  });

  const addressInfo = httpServer.address();
  if (addressInfo === null || typeof addressInfo === 'string') {
    throw new Error('HTTP server did not return TCP address info');
  }

  const { address, port: actualPort } = addressInfo as AddressInfo;

  return {
    httpServer,
    port: actualPort,
    address,
    shutdown: async () => {
      // server.close() resolves only once every active connection ends, but
      // Streamable HTTP keeps long-lived SSE streams open and request bodies
      // can hang or half-close — so close() alone can wait indefinitely.
      // AgentHostImpl.dispose() awaits this shutdown before disposing PTY
      // sessions (and a hung await, unlike a rejection, skips its finally), so
      // an unbounded close would strand live shells on teardown. Force-
      // terminate open connections after initiating close so shutdown is
      // bounded and never blocks session cleanup.
      const closed = closeHttpServer(httpServer);
      httpServer.closeAllConnections();
      await closed;
    },
  };
}
