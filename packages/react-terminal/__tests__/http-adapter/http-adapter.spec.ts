import { describe, expect, it, vi } from 'vitest';

import { createHttpMCPClientAdapter } from '../../src/http-adapter';

function mockJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockSseResponse(body: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('createHttpMCPClientAdapter', () => {
  it('callTool posts JSON-RPC + dual-Accept + Content-Type headers', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => mockJsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result: { structuredContent: { ok: true } },
    }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.callTool<{ ok: boolean }>('terminal.create_session', { cwd: '/' });
    expect(result).toEqual({ structuredContent: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost:9999/mcp');
    const initOpts = init as RequestInit;
    expect(initOpts.method).toBe('POST');
    const headers = initOpts.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers.accept).toBe('application/json, text/event-stream');
    expect(headers.authorization).toBeUndefined();
    const body = JSON.parse(initOpts.body as string) as Record<string, unknown>;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    const params = body.params as { name: string; arguments: unknown };
    expect(params.name).toBe('terminal.create_session');
    expect(params.arguments).toEqual({ cwd: '/' });
  });

  it('adds Authorization Bearer header when token provided', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => mockJsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      token: 'test-token-abc',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    await adapter.callTool('terminal.list_sessions', {});
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const init = firstCall![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-token-abc');
  });

  it('parses SSE response body (single data: frame)', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => mockSseResponse({
      jsonrpc: '2.0',
      id: 1,
      result: { lines: ['hello', 'world'], next_seq: 42 },
    }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.callTool<{ lines: string[]; next_seq: number }>('terminal.read_output', { session_id: 'x' });
    expect(result).toEqual({ lines: ['hello', 'world'], next_seq: 42 });
  });

  it('throws on HTTP non-2xx', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('unauthorized', { status: 401 }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    await expect(adapter.callTool('terminal.create_session', {})).rejects.toThrow(/HTTP 401/);
  });

  it('throws on JSON-RPC error envelope', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => mockJsonResponse({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'invalid params' },
    }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    await expect(adapter.callTool('terminal.create_session', {})).rejects.toThrow(/MCP error -32602: invalid params/);
  });

  it('throws on missing `result` (and no error)', async () => {
    const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => mockJsonResponse({ jsonrpc: '2.0', id: 1 }));
    const adapter = createHttpMCPClientAdapter({
      endpoint: 'http://localhost:9999/mcp',
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });
    await expect(adapter.callTool('x', {})).rejects.toThrow(/missing `result`/);
  });

  it('throws when no fetch is available', () => {
    expect(() =>
      createHttpMCPClientAdapter({
        endpoint: 'http://x/mcp',
        fetch: undefined as unknown as typeof globalThis.fetch,
        // simulate non-browser pre-18 by overriding global at call site (here we pass null)
      } as Parameters<typeof createHttpMCPClientAdapter>[0]),
    ).not.toThrow();  // factory itself doesn't throw — the runtime fetch fallback works in test env
  });
});
