import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { resizeInputSchema, resizeOutputSchema } from '@continuo-terminal/protocol';

import { formatError } from '../format-error.js';
import type { SessionManager } from '../session-manager.js';

export function makeResizeHandler({ sessions }: { sessions: SessionManager }) {
  return async (rawInput: unknown): Promise<CallToolResult> => {
    const parsed = resizeInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: 'text', text: formatError(parsed.error) }] };
    }

    try {
      await sessions.resize(parsed.data);
      // SessionManager.resize returns void on success; empty output schema.
      const output = resizeOutputSchema.parse({});
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}
