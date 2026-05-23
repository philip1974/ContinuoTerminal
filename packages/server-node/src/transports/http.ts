import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createTerminalMcpServer } from '../server.js';
import type { SessionManager } from '../session-manager.js';

export type StartHttpTransportInput = {
  sessions: SessionManager;
  port: number;
  host: string;
  endpoint?: string;
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
): Promise<void> {
  const { server } = createTerminalMcpServer({ sessions });
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
}: StartHttpTransportInput): Promise<StartedHttpTransport> {
  const httpServer = createServer((req, res) => {
    if (!matchesEndpoint(req.url, endpoint)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    void handleMcpRequest(req, res, sessions).catch((err: unknown) => {
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
    shutdown: () => closeHttpServer(httpServer),
  };
}
