import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  Terminal,
  createHttpMCPClientAdapter,
  parseCallToolResult,
  type CreateHttpMCPClientAdapterInput,
  type MCPClientAdapter,
  type TerminalProps,
} from '@continuo-terminal/react-terminal';

describe('react-terminal adapter contract', () => {
  describe('MCPClientAdapter interface shape', () => {
    it('callTool signature', () => {
      const adapter: MCPClientAdapter = {
        callTool: async <O,>(_name: string, _args: unknown) => ({} as O),
      };
      expectTypeOf(adapter.callTool).toMatchTypeOf<MCPClientAdapter['callTool']>();
    });

    it('subscribeOutput optional signature', () => {
      const adapter: MCPClientAdapter = {
        callTool: async () => ({} as any),
        subscribeOutput: (_sessionId, _onChunk) => () => {},
      };
      expectTypeOf(adapter.subscribeOutput!).toMatchTypeOf<NonNullable<MCPClientAdapter['subscribeOutput']>>();
    });
  });

  describe('TerminalProps shape', () => {
    it('minimal required fields', () => {
      const props: TerminalProps = {
        sessionId: 's',
        adapter: { callTool: async () => ({} as any) },
      };
      expectTypeOf(props).toMatchTypeOf<TerminalProps>();
    });
  });

  describe('parseCallToolResult runtime behavior', () => {
    it('returns structuredContent when present', () => {
      expect(parseCallToolResult({ structuredContent: { x: 1 } })).toEqual({ x: 1 });
    });

    it('parses content[0].text as JSON when no structuredContent', () => {
      expect(parseCallToolResult({ content: [{ type: 'text', text: '{"y":2}' }] })).toEqual({ y: 2 });
    });

    it('throws when neither shape is present', () => {
      expect(() => parseCallToolResult({})).toThrow('callTool: no parseable result');
    });
  });

  describe('createHttpMCPClientAdapter factory shape', () => {
    it('signature param/return type', () => {
      expectTypeOf(createHttpMCPClientAdapter).parameters.toMatchTypeOf<[CreateHttpMCPClientAdapterInput]>();
      expectTypeOf(createHttpMCPClientAdapter).returns.toMatchTypeOf<MCPClientAdapter>();
    });
  });

  describe('Terminal component export', () => {
    it('is callable (React component)', () => {
      expect(typeof Terminal).toBe('function');
    });
  });
});
