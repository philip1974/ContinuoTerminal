import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { prepareShellIntegrationEnv } from '../../src/index.js';

const EXPECTED_BASH_SNIPPET = String.raw`# 同 zsh 注释:non-login bash 默认只读 .bashrc,但用户的 PATH / brew 通常配
# 在 .bash_profile / .profile;补 source 它们以避免 plugin 链式坏。
[ -n "$_TERMINAL_USER_HOME" ] && [ -f "$_TERMINAL_USER_HOME/.bash_profile" ] && source "$_TERMINAL_USER_HOME/.bash_profile"
[ -n "$_TERMINAL_USER_HOME" ] && [ -f "$_TERMINAL_USER_HOME/.profile" ] && source "$_TERMINAL_USER_HOME/.profile"
[ -n "$_TERMINAL_USER_BASH_RC" ] && [ -f "$_TERMINAL_USER_BASH_RC" ] && source "$_TERMINAL_USER_BASH_RC"

_continuo_osc7() {
  printf '\e]7;file://%s%s\a' "${'${HOSTNAME:-}'}" "$PWD"
}

if [ -n "${'${PROMPT_COMMAND:-}'}" ]; then
  PROMPT_COMMAND="_continuo_osc7; ${'${PROMPT_COMMAND}'}"
else
  PROMPT_COMMAND="_continuo_osc7"
fi

_continuo_osc7
`;

const EXPECTED_FISH_SNIPPET = String.raw`if test -n "$_TERMINAL_USER_FISH_CONFIG"; and test -f "$_TERMINAL_USER_FISH_CONFIG"
  source "$_TERMINAL_USER_FISH_CONFIG"
end

function _continuo_osc7 --on-variable PWD
  printf '\e]7;file://%s%s\a' (hostname) "$PWD"
end

_continuo_osc7
`;

function baseEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: '/Users/test',
    SHELL: '/bin/zsh',
    ...extra,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readBashSnippet(): Promise<{
  actual: string;
  cleanup: () => Promise<void>;
}> {
  const result = await prepareShellIntegrationEnv('/bin/bash', baseEnv());
  const rcfile = result.env.BASH_ENV;
  if (!rcfile) throw new Error('BASH_ENV missing');
  return {
    actual: await fs.readFile(rcfile, 'utf8'),
    cleanup: result.cleanup,
  };
}

async function readFishSnippet(): Promise<{
  actual: string;
  cleanup: () => Promise<void>;
}> {
  const result = await prepareShellIntegrationEnv('/usr/local/bin/fish', baseEnv());
  const configHome = result.env.XDG_CONFIG_HOME;
  if (!configHome) throw new Error('XDG_CONFIG_HOME missing');
  return {
    actual: await fs.readFile(
      path.join(configHome, 'fish', 'conf.d', '_continuo.fish'),
      'utf8',
    ),
    cleanup: result.cleanup,
  };
}

describe('shell integration env helpers', () => {
  it('T13 returns base env unchanged for zsh', async () => {
    const env = baseEnv();

    const result = await prepareShellIntegrationEnv('/bin/zsh', env);

    expect(result.env).toBe(env);
    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it('T14 creates bash rcfile env and cleanup removes the temp dir', async () => {
    const env = baseEnv();
    const result = await prepareShellIntegrationEnv('/bin/bash', env);
    const rcfile = result.env.BASH_ENV;
    if (!rcfile) throw new Error('BASH_ENV missing');
    const tmpDir = path.dirname(rcfile);

    expect(await exists(rcfile)).toBe(true);
    expect(result.env._TERMINAL_USER_HOME).toBe(env.HOME);
    expect(result.env._TERMINAL_USER_BASH_RC).toBe('/Users/test/.bashrc');

    await result.cleanup();
    expect(await exists(tmpDir)).toBe(false);
  });

  it('T15 creates fish conf.d env and user config path', async () => {
    const env = baseEnv();
    const result = await prepareShellIntegrationEnv('/usr/local/bin/fish', env);
    const configHome = result.env.XDG_CONFIG_HOME;
    if (!configHome) throw new Error('XDG_CONFIG_HOME missing');

    expect(await exists(path.join(configHome, 'fish', 'conf.d', '_continuo.fish'))).toBe(true);
    expect(result.env._TERMINAL_USER_FISH_CONFIG).toBe(
      '/Users/test/.config/fish/config.fish',
    );

    await result.cleanup();
  });

  it('T16 returns base env unchanged for unsupported shells', async () => {
    const env = baseEnv();

    const result = await prepareShellIntegrationEnv('/some/unknown/shell', env);

    expect(result.env).toBe(env);
    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it('T17 writes byte-identical bash rcfile content', async () => {
    const { actual, cleanup } = await readBashSnippet();
    try {
      expect(actual).toBe(EXPECTED_BASH_SNIPPET);
    } finally {
      await cleanup();
    }
  });

  it('T17a bash rcfile does not contain legacy Continuo env names', async () => {
    const { actual, cleanup } = await readBashSnippet();
    try {
      expect(actual).not.toContain('_CONTINUO_');
    } finally {
      await cleanup();
    }
  });

  it('T18 writes byte-identical fish conf content', async () => {
    const { actual, cleanup } = await readFishSnippet();
    try {
      expect(actual).toBe(EXPECTED_FISH_SNIPPET);
    } finally {
      await cleanup();
    }
  });

  it('T18a fish conf does not contain legacy Continuo env names', async () => {
    const { actual, cleanup } = await readFishSnippet();
    try {
      expect(actual).not.toContain('_CONTINUO_');
    } finally {
      await cleanup();
    }
  });
});
