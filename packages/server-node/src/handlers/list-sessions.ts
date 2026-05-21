import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { listSessionsInputSchema, listSessionsOutputSchema } from '@continuo-terminal/protocol';

import { formatError } from '../format-error.js';
import type { SessionManager } from '../session-manager.js';

export function makeListSessionsHandler({ sessions }: { sessions: SessionManager }) {
  return async (rawInput: unknown): Promise<CallToolResult> => {
    const parsed = listSessionsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: 'text', text: formatError(parsed.error) }] };
    }

    try {
      const raw = await sessions.list();
      const output = listSessionsOutputSchema.parse(raw);
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}
