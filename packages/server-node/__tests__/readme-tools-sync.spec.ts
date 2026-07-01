import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_RESIZE,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
} from '@continuo-terminal/protocol';
import { describe, it, expect } from 'vitest';

// Doc/impl-sync guard (polish phase 2). The README "Tools" section drifted twice
// from the tools/list surface (missing terminal.resize, "7 MCP" count). This
// locks every advertised tool name into the README + the accurate count so the
// primary usage doc can't silently under-report the wire surface again.
const IMPLEMENTED_TOOLS = [
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_KILL,
  MCP_TOOL_RESIZE,
];

const readmePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../README.md');
const readme = readFileSync(readmePath, 'utf8');

describe('server-node README stays in sync with the advertised tools', () => {
  it('documents every implemented terminal.* tool', () => {
    const missing = IMPLEMENTED_TOOLS.filter((tool) => !readme.includes(`\`${tool}\``));
    expect(missing).toEqual([]);
  });

  it('states the correct tool count', () => {
    expect(readme).toContain(`## Tools (${IMPLEMENTED_TOOLS.length} MCP)`);
  });
});
