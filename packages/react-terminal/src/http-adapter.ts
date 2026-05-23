import type { MCPClientAdapter } from './types.js';

/**
 * Browser/Node-fetch-based `MCPClientAdapter` for the @continuo-terminal/server-node
 * HTTP transport(`startHttpTransport` in server-node;see ADR 0004 M3 + ADR 0005 A2/A3)。
 *
 * Use this when embedding the `<Terminal>` component in a non-Electron host
 * (browser app / VS Code webview / Tauri renderer / standalone web demo etc.)
 * that talks to a real HTTP MCP server over the wire。
 *
 * Implements the SDK Streamable HTTP request shape per SDK invariant:
 * - `Content-Type: application/json`
 * - `Accept: application/json, text/event-stream`(BOTH formats — SDK
 *   `webStandardStreamableHttp.js` returns 406 if either is missing)
 *
 * Optional bearer token wires A3 host auth(passed to A2 server `authenticateRequest`
 * hook;see `examples/standalone-cli-host/` for a full-auth host setup)。
 *
 * SSE(`text/event-stream`)response bodies are accepted but consumed as a
 * single concatenated `data:` payload — the SDK Streamable HTTP transport may
 * upgrade individual responses to SSE for streaming;current implementation
 * collects all `data:` frames and JSON-parses the final aggregate body。
 *
 * No `subscribeOutput` implementation — output streaming uses the polling
 * fallback in `<Terminal>` via `pollIntervalMs`(see `Terminal.tsx`)。Future
 * follow-up may add MCP-side notifications + SSE streaming for true push;
 * not in CT-C3 pragmatic scope。
 */
export interface CreateHttpMCPClientAdapterInput {
  /**
   * MCP endpoint URL — typically `http://127.0.0.1:<port>/mcp`(per `startHttpTransport`
   * listening output line OR `host.transportInfo.endpoint` from `bootstrapAgentHost`)。
   */
  readonly endpoint: string;
  /**
   * Optional bearer token for `Authorization: Bearer <token>` header(A3 wires
   * this via `createAgentEnv` env var injection into the child process)。
   * When undefined,no Authorization header is sent(M3 unauthenticated path)。
   */
  readonly token?: string;
  /**
   * Optional `fetch` override(default:globalThis.fetch)。Useful for tests
   * injecting mock fetch + for environments that need a polyfill。
   */
  readonly fetch?: typeof globalThis.fetch;
}

interface JsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string };
}

let nextId = 1;

function buildHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token !== undefined && token.length > 0) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Parse SSE-style response body — extracts the first non-empty `data:` payload
 * and returns it。SDK Streamable HTTP may return either raw JSON OR
 * `text/event-stream` framing for the response;both contain a single
 * JSON-RPC response payload。
 */
function extractJsonRpcBody(rawBody: string, contentType: string): JsonRpcResponse {
  if (contentType.includes('text/event-stream')) {
    // SSE frames:`data: <json>\n\n` repeated。Take the first `data:` value
    // with content(SDK Streamable HTTP returns request response as a single
    // SSE event)。
    const lines = rawBody.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const payload = line.slice('data:'.length).trim();
        if (payload.length > 0) {
          return JSON.parse(payload) as JsonRpcResponse;
        }
      }
    }
    throw new Error('SSE response body had no parseable `data:` frame');
  }
  return JSON.parse(rawBody) as JsonRpcResponse;
}

/**
 * Factory:build an `MCPClientAdapter` bound to an HTTP MCP server endpoint。
 *
 * Example(browser / minimal-react-host with real server):
 *
 *   const adapter = createHttpMCPClientAdapter({
 *     endpoint: 'http://127.0.0.1:12345/mcp',
 *     token: env.MCP_TOKEN,  // optional;omit for M3 no-auth path
 *   });
 *   <Terminal sessionId={sessionId} adapter={adapter} pollIntervalMs={300} />;
 */
export function createHttpMCPClientAdapter({
  endpoint,
  token,
  fetch: fetchImpl,
}: CreateHttpMCPClientAdapterInput): MCPClientAdapter {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error(
      'createHttpMCPClientAdapter: no `fetch` available (pass options.fetch in non-browser non-Node-18+ environments)',
    );
  }
  const headers = buildHeaders(token);
  return {
    async callTool<O = unknown>(name: string, args: unknown): Promise<O> {
      const id = nextId++;
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const resp = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from MCP endpoint ${endpoint}`);
      }
      const contentType = resp.headers.get('content-type') ?? 'application/json';
      const rawBody = await resp.text();
      const rpc = extractJsonRpcBody(rawBody, contentType);
      if (rpc.error) {
        throw new Error(
          `MCP error ${rpc.error.code ?? 'unknown'}: ${rpc.error.message ?? 'unknown error'}`,
        );
      }
      if (rpc.result === undefined) {
        throw new Error('MCP response missing `result`');
      }
      return rpc.result as O;
    },
  };
}
