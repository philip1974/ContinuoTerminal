import { describe, expect, it, vi } from 'vitest';

import {
  parseOsc7Cwd,
  registerOsc7Cwd,
  type Osc7Disposable,
  type Osc7Options,
  type Osc7TermLike,
} from '../src/osc7-cwd.js';

type Osc7Handler = Parameters<
  Osc7TermLike['parser']['registerOscHandler']
>[1];

function createMockTerm(): {
  readonly term: Osc7TermLike;
  readonly registerOscHandler: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const dispose = vi.fn();
  const registerOscHandler = vi.fn(
    (_code: number, _handler: Osc7Handler): Osc7Disposable => ({ dispose }),
  );
  const term: Osc7TermLike = {
    parser: {
      registerOscHandler,
    },
  };

  return { term, registerOscHandler, dispose };
}

function captureHandler(registerOscHandler: ReturnType<typeof vi.fn>): Osc7Handler {
  const handler = registerOscHandler.mock.calls[0]?.[1];
  expect(handler).toEqual(expect.any(Function));
  return handler as Osc7Handler;
}

describe('osc7-cwd · preserve legacy strict host matching', () => {
  describe('parseOsc7Cwd', () => {
    it('T1 parses localhost file OSC 7 cwd', () => {
      expect(parseOsc7Cwd('file://localhost/tmp/')).toBe('/tmp/');
    });

    it('T2 accepts empty host as local cwd', () => {
      expect(parseOsc7Cwd('file:///tmp/')).toBe('/tmp/');
    });

    it('T3 rejects non-localhost by default', () => {
      expect(parseOsc7Cwd('file://remote/tmp/')).toBeNull();
    });

    it('T4 rejects payloads that are not file URLs', () => {
      expect(parseOsc7Cwd('not-a-url')).toBeNull();
    });

    it('T5 rejects file URLs without an encoded path', () => {
      expect(parseOsc7Cwd('file://localhost')).toBeNull();
    });

    it('T6 decodes percent-encoded UTF-8 paths', () => {
      expect(parseOsc7Cwd('file://localhost/%E4%B8%AD')).toBe('/中');
    });

    it('T6b returns null when decodeURI throws', () => {
      expect(parseOsc7Cwd('file://localhost/%XX')).toBeNull();
    });

    it('T6c accepts configured remote hosts', () => {
      const opts: Osc7Options = { acceptedHosts: ['remote'] };
      expect(parseOsc7Cwd('file://remote/path', opts)).toBe('/path');
    });

    it('T6d preserves query text as part of the byte-identical path', () => {
      expect(parseOsc7Cwd('file:///tmp/?q=1')).toBe('/tmp/?q=1');
    });

    it('T6e preserves fragment text as part of the byte-identical path', () => {
      expect(parseOsc7Cwd('file:///tmp/#frag')).toBe('/tmp/#frag');
    });

    it('T6f preserves reserved %2F encoding with decodeURI', () => {
      expect(parseOsc7Cwd('file:///foo%2Fbar')).toBe('/foo%2Fbar');
    });

    it('T6g Windows drive (windowsDrivePaths): file:///C:/Users/me → C:/Users/me', () => {
      const win = { windowsDrivePaths: true };
      expect(parseOsc7Cwd('file:///C:/Users/me', win)).toBe('C:/Users/me');
      expect(parseOsc7Cwd('file://localhost/C:/work', win)).toBe('C:/work');
    });

    it('T6g-posix POSIX 保留 /C:/work(根下名为 C: 的目录,非 Windows 模式不 strip)', () => {
      // codex diff 复查:无条件 strip 会破坏合法 POSIX 路径。
      expect(parseOsc7Cwd('file:///C:/work', { windowsDrivePaths: false })).toBe(
        '/C:/work',
      );
    });

    it('T6g preserves reserved %23 encoding with decodeURI', () => {
      expect(parseOsc7Cwd('file:///path%23frag')).toBe('/path%23frag');
    });
  });

  describe('registerOsc7Cwd', () => {
    it('T7 registers OSC 7 handler and returns a disposable', () => {
      const { term, registerOscHandler } = createMockTerm();

      const disposable = registerOsc7Cwd(term, vi.fn());

      expect(registerOscHandler).toHaveBeenCalledTimes(1);
      expect(registerOscHandler).toHaveBeenCalledWith(7, expect.any(Function));
      expect(disposable.dispose).toEqual(expect.any(Function));
    });

    it('T7b handler always returns true for malformed payloads', () => {
      const { term, registerOscHandler } = createMockTerm();
      registerOsc7Cwd(term, vi.fn());
      const handler = captureHandler(registerOscHandler);

      expect(() => handler('not-a-url')).not.toThrow();
      expect(handler('not-a-url')).toBe(true);
    });

    it('T8 calls onCwd only for parsed cwd payloads', () => {
      const { term, registerOscHandler } = createMockTerm();
      const onCwd = vi.fn();
      registerOsc7Cwd(term, onCwd, { acceptedHosts: ['', 'localhost', 'remote'] });
      const handler = captureHandler(registerOscHandler);

      const inputs = [
        'file://localhost/tmp/',
        'file:///tmp/',
        'file://other/tmp/',
        'not-a-url',
        'file://localhost',
        'file://localhost/%E4%B8%AD',
        'file://localhost/%XX',
        'file://remote/path',
        'file:///tmp/?q=1',
        'file:///tmp/#frag',
        'file:///foo%2Fbar',
        'file:///path%23frag',
      ];

      for (const input of inputs) {
        expect(handler(input)).toBe(true);
      }

      expect(onCwd).toHaveBeenCalledTimes(8);
      expect(onCwd).toHaveBeenNthCalledWith(1, '/tmp/');
      expect(onCwd).toHaveBeenNthCalledWith(2, '/tmp/');
      expect(onCwd).toHaveBeenNthCalledWith(3, '/中');
      expect(onCwd).toHaveBeenNthCalledWith(4, '/path');
      expect(onCwd).toHaveBeenNthCalledWith(5, '/tmp/?q=1');
      expect(onCwd).toHaveBeenNthCalledWith(6, '/tmp/#frag');
      expect(onCwd).toHaveBeenNthCalledWith(7, '/foo%2Fbar');
      expect(onCwd).toHaveBeenNthCalledWith(8, '/path%23frag');
    });

    it('T8b swallows sync onCwd throws and still returns true', () => {
      const { term, registerOscHandler } = createMockTerm();
      registerOsc7Cwd(term, () => {
        throw new Error('boom');
      });
      const handler = captureHandler(registerOscHandler);

      expect(() => handler('file://localhost/tmp/')).not.toThrow();
      expect(handler('file://localhost/tmp/')).toBe(true);
    });

    it('T8c returns true and does not call onCwd for remote hosts', () => {
      const { term, registerOscHandler } = createMockTerm();
      const onCwd = vi.fn();
      registerOsc7Cwd(term, onCwd);
      const handler = captureHandler(registerOscHandler);

      expect(handler('file://remote/tmp/')).toBe(true);
      expect(onCwd).not.toHaveBeenCalled();
    });
  });
});

// Polish round-10: cross-package interop contract with
// @continuo-terminal/server-node's prepareShellIntegrationEnv. Its bundled
// bash/fish snippets emit `file://<real hostname>$PWD` (bash `${HOSTNAME:-}`,
// fish `(hostname)`), NOT empty/localhost. With the parser's strict default
// (['', 'localhost']) those payloads are silently dropped — a host MUST add the
// machine hostname to acceptedHosts. This locks that contract so a future
// default/snippet change can't re-break local bash/fish cwd tracking unnoticed.
describe('osc7-cwd · interop with bundled shell integration (hostname host)', () => {
  const HOSTNAME = 'MacBook-Pro.local'; // representative `hostname` output
  // Exactly the shape prepareShellIntegrationEnv's snippets emit: file://<host>$PWD.
  const payload = `file://${HOSTNAME}/Users/me/project`;

  it('drops the bundled-integration payload under the strict default', () => {
    expect(parseOsc7Cwd(payload)).toBeNull();
  });

  it('accepts it once the machine hostname is in acceptedHosts', () => {
    const opts: Osc7Options = { acceptedHosts: ['', 'localhost', HOSTNAME] };
    expect(parseOsc7Cwd(payload, opts)).toBe('/Users/me/project');
  });
});
