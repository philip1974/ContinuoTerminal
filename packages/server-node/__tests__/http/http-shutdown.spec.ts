import { connect as netConnect, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { SessionManager, startHttpTransport } from '../../src/index.js';

// Polish round-8: startHttpTransport().shutdown() previously only called
// httpServer.close(), which resolves only after every active connection ends.
// Streamable HTTP keeps long-lived SSE streams open and request bodies can
// hang, so close() alone can wait forever — and AgentHostImpl.dispose() awaits
// this shutdown before disposing PTY sessions (a hung await skips its finally).
// The fix force-terminates open connections so shutdown is bounded.
describe('startHttpTransport shutdown boundedness', () => {
  const sockets: Socket[] = [];
  const managers: SessionManager[] = [];

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.destroy();
    await Promise.all(managers.splice(0).map((m) => m.dispose().catch(() => {})));
  });

  it('resolves promptly even with a hanging in-flight request', async () => {
    const sessions = new SessionManager();
    managers.push(sessions);
    const started = await startHttpTransport({ sessions, port: 0, host: '127.0.0.1' });

    // Open a raw socket and send request headers with a Content-Length body
    // that never arrives → an active request server.close() would block on.
    const sock = netConnect(started.port, '127.0.0.1');
    sockets.push(sock);
    await new Promise<void>((resolve, reject) => {
      sock.once('connect', () => resolve());
      sock.once('error', reject);
    });
    sock.write(
      'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n' +
        'Content-Type: application/json\r\nContent-Length: 1000\r\n\r\n',
    );
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the request register

    // shutdown() must not block on the open/hanging connection.
    await Promise.race([
      started.shutdown(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('shutdown hung on an open connection')), 3000),
      ),
    ]);
  });
});
