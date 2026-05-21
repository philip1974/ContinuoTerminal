import { useEffect, useState } from 'react';
import { Terminal } from '@continuo-terminal/react-terminal';

import { mockAdapter } from './mock-adapter';

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mockAdapter
      .callTool<{ structuredContent: { session_id: string } }>('terminal.create_session', { cwd: '/' })
      .then((result) => setSessionId(result.structuredContent.session_id))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const sendEcho = () => {
    if (!sessionId) {
      return;
    }
    mockAdapter.callTool('terminal.send_text', { session_id: sessionId, text: 'echo hi\n' }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  if (error) {
    return <pre style={{ color: 'crimson' }}>error: {error}</pre>;
  }

  if (!sessionId) {
    return <p>Loading mock session...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 18 }}>continuo-terminal minimal react host</h1>
        <p style={{ margin: '4px 0', color: '#666' }}>Mock adapter - no real PTY. Session: {sessionId}</p>
      </header>
      <button onClick={sendEcho} type="button">
        Send echo
      </button>
      <Terminal sessionId={sessionId} adapter={mockAdapter} cols={80} rows={24} pollIntervalMs={300} />
    </div>
  );
}
