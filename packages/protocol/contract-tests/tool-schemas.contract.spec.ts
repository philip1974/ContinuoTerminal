import { describe, expect, it } from 'vitest';
import {
  MCP_TOOL_CREATE_SESSION,
  MCP_TOOL_KILL,
  MCP_TOOL_LIST_SESSIONS,
  MCP_TOOL_PRESS_KEY,
  MCP_TOOL_READ_OUTPUT,
  MCP_TOOL_SEND_INPUT,
  MCP_TOOL_SEND_TEXT,
  createSessionInputSchema,
  createSessionOutputSchema,
  killInputSchema,
  listSessionsInputSchema,
  pressKeyInputSchema,
  readOutputInputSchema,
  readOutputOutputSchema,
  sendInputInputSchema,
  sendTextInputSchema,
} from '@continuo-terminal/protocol';

describe('protocol tool name constants — contract', () => {
  it('MCP_TOOL_* are stable wire strings', () => {
    expect(MCP_TOOL_LIST_SESSIONS).toBe('terminal.list_sessions');
    expect(MCP_TOOL_CREATE_SESSION).toBe('terminal.create_session');
    expect(MCP_TOOL_SEND_INPUT).toBe('terminal.send_input');
    expect(MCP_TOOL_SEND_TEXT).toBe('terminal.send_text');
    expect(MCP_TOOL_PRESS_KEY).toBe('terminal.press_key');
    expect(MCP_TOOL_READ_OUTPUT).toBe('terminal.read_output');
    expect(MCP_TOOL_KILL).toBe('terminal.kill');
  });
});

describe('protocol I/O schemas roundtrip — contract', () => {
  it('listSessions empty input accepted', () => {
    expect(listSessionsInputSchema.safeParse({}).success).toBe(true);
  });

  it('createSession minimal input accepted', () => {
    expect(createSessionInputSchema.safeParse({}).success).toBe(true);
  });

  it('createSession with shell cols rows accepted', () => {
    expect(createSessionInputSchema.safeParse({ shell: '/bin/zsh', cols: 80, rows: 24 }).success).toBe(true);
  });

  it('createSession output requires session_id', () => {
    expect(createSessionOutputSchema.safeParse({ session_id: 's-1' }).success).toBe(true);
    expect(createSessionOutputSchema.safeParse({}).success).toBe(false);
  });

  it('sendInput requires session_id + data', () => {
    expect(sendInputInputSchema.safeParse({ session_id: 's', data: 'x' }).success).toBe(true);
    expect(sendInputInputSchema.safeParse({ session_id: 's' }).success).toBe(false);
  });

  it('sendText requires session_id + text', () => {
    expect(sendTextInputSchema.safeParse({ session_id: 's', text: 'x' }).success).toBe(true);
  });

  it('pressKey rejects unknown key', () => {
    expect(pressKeyInputSchema.safeParse({ session_id: 's', key: 'enter' }).success).toBe(true);
    expect(pressKeyInputSchema.safeParse({ session_id: 's', key: 'nope' }).success).toBe(false);
  });

  it('readOutput accepts since_seq optional', () => {
    expect(readOutputInputSchema.safeParse({ session_id: 's' }).success).toBe(true);
    expect(readOutputInputSchema.safeParse({ session_id: 's', since_seq: 5 }).success).toBe(true);
  });

  it('readOutput output requires lines + next_seq + truncated', () => {
    expect(readOutputOutputSchema.safeParse({ lines: [], next_seq: 0, truncated: false }).success).toBe(true);
    expect(readOutputOutputSchema.safeParse({ lines: [] }).success).toBe(false);
  });

  it('kill accepts optional signal', () => {
    expect(killInputSchema.safeParse({ session_id: 's' }).success).toBe(true);
    expect(killInputSchema.safeParse({ session_id: 's', signal: 'SIGINT' }).success).toBe(true);
    expect(killInputSchema.safeParse({ session_id: 's', signal: 'BOGUS' }).success).toBe(false);
  });
});
