import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { pressKeyInputSchema, pressKeyOutputSchema } from '@continuo-terminal/protocol';

import { formatError } from '../format-error.js';
import type { SessionManager } from '../session-manager.js';

export function makePressKeyHandler({ sessions }: { sessions: SessionManager }) {
  return async (rawInput: unknown): Promise<CallToolResult> => {
    const parsed = pressKeyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: 'text', text: formatError(parsed.error) }] };
    }

    try {
      const raw = await sessions.pressKey(parsed.data);
      const output = pressKeyOutputSchema.parse(raw);
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}
