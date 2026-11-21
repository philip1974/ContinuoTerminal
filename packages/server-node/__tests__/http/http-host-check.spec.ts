// DNS rebinding 防护:绑定回环地址时,只接受 Host 为回环名 + 实际端口的请求。
// 否则恶意网页可把自己的域名解析到 127.0.0.1,借浏览器调用 terminal.create_session 等工具。
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionManager } from '../../src/session-manager.js';
import { startHttpTransport, type StartedHttpTransport } from '../../src/transports/http.js';

let started: StartedHttpTransport | undefined;
let sessions: SessionManager | undefined;

afterEach(async () => {
  await started?.shutdown();
  await sessions?.dispose();
  started = undefined;
  sessions = undefined;
});

function post(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          host,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
  });
}

describe('HTTP transport · Host header check (DNS rebinding)', () => {
  it('rejects a foreign Host with 403 when bound to loopback', async () => {
    sessions = new SessionManager();
    started = await startHttpTransport({ sessions, port: 0, host: '127.0.0.1' });
    expect(await post(started.port, `evil.example:${started.port}`)).toBe(403);
    expect(await post(started.port, 'evil.example')).toBe(403);
  });

  it('accepts loopback Host names with the bound port', async () => {
    sessions = new SessionManager();
    started = await startHttpTransport({ sessions, port: 0, host: '127.0.0.1' });
    for (const h of [`127.0.0.1:${started.port}`, `localhost:${started.port}`, `LOCALHOST:${started.port}`]) {
      expect(await post(started.port, h)).not.toBe(403);
    }
  });

  it('rejects a loopback Host with a different port', async () => {
    sessions = new SessionManager();
    started = await startHttpTransport({ sessions, port: 0, host: '127.0.0.1' });
    expect(await post(started.port, `localhost:${started.port + 1}`)).toBe(403);
  });
});
