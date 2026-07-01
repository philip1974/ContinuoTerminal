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
 * SSE(`text/event-stream`)response bodies are parsed per the SSE spec: lines
 * are grouped into events on blank lines, the `data:` lines within one event are
 * concatenated with `\n`, and each event's payload is JSON-parsed. The adapter
 * returns the JSON-RPC message whose `id` matches this request (falling back to
 * the first message carrying `result`/`error`), so a stream that interleaves
 * notification/progress frames before the response — or splits a large response
 * across multiple `data:` lines — is handled correctly。
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
 * Split an SSE body into per-event `data` payloads. Events are separated by
 * blank lines; within one event the `data:` lines are concatenated with `\n`
 * (per the SSE spec, stripping a single leading space after the colon). Other
 * fields (`event:`, `id:`, `:` comments, …) are ignored.
 */
function sseDataEvents(rawBody: string): string[] {
  const events: string[] = [];
  let dataLines: string[] = [];
  const flush = (): void => {
    if (dataLines.length > 0) {
      events.push(dataLines.join('\n'));
      dataLines = [];
    }
  };
  for (const line of rawBody.split(/\r?\n/)) {
    if (line === '') {
      flush(); // blank line dispatches the current event
      continue;
    }
    if (line.startsWith('data:')) {
      const value = line.slice('data:'.length);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }
  flush(); // trailing event without a final blank line
  return events;
}

/**
 * Parse the JSON-RPC response out of a raw body (plain JSON or SSE). For SSE,
 * returns the message whose `id` matches `expectedId`, else the first message
 * carrying `result`/`error` — never merely the first `data:` frame, which may be
 * a notification/progress event or a partial line.
 */
function extractJsonRpcBody(
  rawBody: string,
  contentType: string,
  expectedId: number | string,
): JsonRpcResponse {
  if (!contentType.includes('text/event-stream')) {
    return JSON.parse(rawBody) as JsonRpcResponse;
  }
  let firstResponse: JsonRpcResponse | undefined;
  for (const data of sseDataEvents(rawBody)) {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(data) as JsonRpcResponse;
    } catch {
      continue; // skip non-JSON frames (e.g. keep-alive comments)
    }
    const isResponse = msg.result !== undefined || msg.error !== undefined;
    if (!isResponse) continue; // skip notifications / progress frames
    if (msg.id === expectedId) return msg;
    firstResponse ??= msg;
  }
  if (firstResponse !== undefined) return firstResponse;
  throw new Error('SSE response body had no parseable JSON-RPC response frame');
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
      const rpc = extractJsonRpcBody(rawBody, contentType, id);
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
