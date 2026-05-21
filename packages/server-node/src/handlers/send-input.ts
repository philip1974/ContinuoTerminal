import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { sendInputInputSchema, sendInputOutputSchema } from '@continuo-terminal/protocol';

import { formatError } from '../format-error.js';
import type { SessionManager } from '../session-manager.js';

export function makeSendInputHandler({ sessions }: { sessions: SessionManager }) {
  return async (rawInput: unknown): Promise<CallToolResult> => {
    const parsed = sendInputInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: 'text', text: formatError(parsed.error) }] };
    }

    try {
      const raw = await sessions.sendInput(parsed.data);
      const output = sendInputOutputSchema.parse(raw);
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}
