import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted: mock factories run before any import.
const ptyMocks = vi.hoisted(() => ({
  kill: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
  pid: 12345,
  spawn: vi.fn(),
}));

vi.mock('node-pty', () => ({
  spawn: ptyMocks.spawn.mockImplementation(() => ({
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    kill: ptyMocks.kill,
    resize: ptyMocks.resize,
    write: ptyMocks.write,
    pid: ptyMocks.pid,
  })),
}));

import { SessionManager } from '../../src/session-manager.js';

let originalTerm: string | undefined;

beforeEach(() => {
  originalTerm = process.env.TERM;
  ptyMocks.kill.mockReset();
  ptyMocks.resize.mockReset();
  ptyMocks.write.mockReset();
  ptyMocks.spawn.mockClear();
});

afterEach(() => {
  if (originalTerm === undefined) {
    delete process.env.TERM;
  } else {
    process.env.TERM = originalTerm;
  }
});

function lastSpawnEnv(): Record<string, string | undefined> {
  const options = ptyMocks.spawn.mock.calls.at(-1)?.[2] as { env?: Record<string, string | undefined> } | undefined;
  return options?.env ?? {};
}

describe('SessionManager.create runtime env', () => {
  it('merges input.env keys into spawn env', async () => {
    const sm = new SessionManager();

    await sm.create({ env: { LANG: 'en_US.UTF-8', FOO: 'bar' }, cwd: '/tmp' });

    const env = lastSpawnEnv();
    expect(env).toEqual(expect.objectContaining({ LANG: 'en_US.UTF-8', FOO: 'bar' }));
    if (process.env.PATH !== undefined) {
      expect(env).toEqual(expect.objectContaining({ PATH: process.env.PATH }));
    }
  });

  it('allows input.env.TERM to override the default TERM', async () => {
    delete process.env.TERM;
    const sm = new SessionManager();

    await sm.create({ env: { TERM: 'xterm' }, cwd: '/tmp' });

    expect(lastSpawnEnv()).toEqual(expect.objectContaining({ TERM: 'xterm' }));
  });

  it("sets default TERM from process.env.TERM || 'xterm-256color'", async () => {
    process.env.TERM = 'dumb';
    const smWithTerm = new SessionManager();
    await smWithTerm.create({ cwd: '/tmp' });
    expect(lastSpawnEnv().TERM).toBe('dumb');

    ptyMocks.spawn.mockClear();
    delete process.env.TERM;
    const smWithoutTerm = new SessionManager();
    await smWithoutTerm.create({ cwd: '/tmp' });
    expect(lastSpawnEnv().TERM).toBe('xterm-256color');
  });
});
