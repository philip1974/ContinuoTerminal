import type { MCPClientAdapter } from '@continuo-terminal/react-terminal';

interface SessionState {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  output: Array<{ seq: number; line: string }>;
  nextSeq: number;
}

const sessions = new Map<string, SessionState>();

function newSession(cwd: string): SessionState {
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  const session: SessionState = {
    id,
    title: 'mock',
    cwd,
    createdAt: Date.now(),
    output: [],
    nextSeq: 0,
  };
  session.output.push({ seq: session.nextSeq++, line: `[mock] session ${id} created in ${cwd}` });
  session.output.push({ seq: session.nextSeq++, line: '[mock] type into the terminal or click Send to append text' });
  sessions.set(id, session);
  return session;
}

function structured<O>(value: O): { structuredContent: O; content: Array<{ type: 'text'; text: string }> } {
  return { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export const mockAdapter: MCPClientAdapter = {
  async callTool<O = unknown>(name: string, args: unknown): Promise<O> {
    const input = args as Record<string, unknown>;

    if (name === 'terminal.create_session') {
      const session = newSession(typeof input.cwd === 'string' ? input.cwd : '/');
      // Shape matches @continuo-terminal/protocol createSessionOutputSchema (strict).
      return structured({
        session_id: session.id,
        pid: 0,
      }) as unknown as O;
    }

    if (name === 'terminal.list_sessions') {
      // Shape matches protocol sessionItemSchema (strict): session_id / title / cwd /
      // origin / created_at / exit_code. Mock sessions are always 'user' origin.
      const arr = [...sessions.values()].map((session) => ({
        session_id: session.id,
        title: session.title,
        cwd: session.cwd,
        origin: 'user' as const,
        created_at: session.createdAt,
        exit_code: null as number | null,
      }));
      return structured({ sessions: arr }) as unknown as O;
    }

    if (name === 'terminal.read_output') {
      const id = input.session_id as string;
      const since = (input.since_seq as number | undefined) ?? 0;
      const session = sessions.get(id);
      if (!session) {
        // Shape matches protocol readOutputOutputSchema (strict):
        // lines / data / next_seq / truncated. `data` is required (the raw byte
        // stream TUI consumers replay); empty here since there is no session.
        return structured({ lines: [], data: '', next_seq: 0, truncated: false }) as unknown as O;
      }
      const after = session.output.filter((output) => output.seq >= since);
      const lines = after.map((output) => output.line);
      return structured({
        lines,
        // `data` is the raw stream; mock lines carry no control sequences, so
        // join with CRLF to match how the renderer would present them.
        data: lines.join('\r\n'),
        next_seq: session.nextSeq,
        truncated: false,
      }) as unknown as O;
    }

    if (name === 'terminal.send_text') {
      const id = input.session_id as string;
      const text = (input.text as string) ?? '';
      const session = sessions.get(id);
      if (!session) {
        throw new Error(`mock: session ${id} not found`);
      }
      session.output.push({ seq: session.nextSeq++, line: `[mock echo] ${text.replace(/\n$/, '')}` });
      return structured({}) as unknown as O;
    }

    if (name === 'terminal.kill') {
      const id = input.session_id as string;
      sessions.delete(id);
      return structured({}) as unknown as O;
    }

    throw new Error(`mock-adapter: unknown tool ${name}`);
  },
};
