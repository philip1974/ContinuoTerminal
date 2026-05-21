import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readOutputInputSchema, readOutputOutputSchema } from '@continuo-terminal/protocol';

import { formatError } from '../format-error.js';
import type { SessionManager } from '../session-manager.js';

export function makeReadOutputHandler({ sessions }: { sessions: SessionManager }) {
  return async (rawInput: unknown): Promise<CallToolResult> => {
    const parsed = readOutputInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: 'text', text: formatError(parsed.error) }] };
    }

    try {
      const raw = await sessions.readOutput(parsed.data);
      const output = readOutputOutputSchema.parse(raw);
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (err) {
      // When the underlying error carries a stable machine code (e.g. the
      // SessionManager.getSession SESSION_NOT_FOUND), emit a structured
      // JSON body so polling clients (notably standalone-cli `attach`)
      // can detect "session is gone" without parsing English. Other
      // errors keep the plain-text formatError shape so the existing
      // generic-throw tests stay green. Round-5 audit P2 hardening.
      const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
      if (code === 'SESSION_NOT_FOUND') {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }] };
      }
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}
