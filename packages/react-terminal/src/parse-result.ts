/**
 * Throw if a resolved CallToolResult is an MCP tool-level failure
 * (`isError: true`). These are NOT rejected by the SDK client / adapters — they
 * resolve like a success — so any callTool site that cares about failure (both
 * result-consuming and fire-and-forget send_text/resize) must run its result
 * through this. server-node's typed `{ error, message }` envelope is surfaced as
 * the thrown Error's `code` (mirrors the standalone CLI's readResult); non-JSON
 * error text is used verbatim as the message. No-op on success.
 */
export function throwIfToolError(raw: unknown): void {
  const result = raw as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  if (result.isError !== true) return;

  const text = result.content?.find(
    (block) => block?.type === 'text' && typeof block.text === 'string',
  )?.text;
  let message = text && text.length > 0 ? text : 'callTool returned an error result';
  let code: string | undefined;
  if (text) {
    try {
      const envelope = JSON.parse(text) as { error?: unknown; message?: unknown };
      if (envelope && typeof envelope === 'object') {
        if (typeof envelope.message === 'string') message = envelope.message;
        if (typeof envelope.error === 'string') code = envelope.error;
      }
    } catch {
      // non-JSON error text — use it verbatim as the message
    }
  }
  const err = new Error(message) as Error & { code?: string };
  if (code !== undefined) err.code = code;
  throw err;
}

export function parseCallToolResult<O>(raw: unknown): O {
  // Tool-level failures (isError:true) must throw, not be JSON-parsed and
  // returned as a fake success payload (which caused a masking TypeError
  // downstream).
  throwIfToolError(raw);

  const result = raw as {
    structuredContent?: O;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const block = result.content?.[0];
  if (block?.type === 'text' && typeof block.text === 'string') {
    return JSON.parse(block.text) as O;
  }

  throw new Error('callTool: no parseable result (missing structuredContent and text)');
}
