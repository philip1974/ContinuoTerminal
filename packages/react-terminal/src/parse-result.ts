export function parseCallToolResult<O>(raw: unknown): O {
  const result = raw as { structuredContent?: O; content?: Array<{ type?: string; text?: string }> };
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const block = result.content?.[0];
  if (block?.type === 'text' && typeof block.text === 'string') {
    return JSON.parse(block.text) as O;
  }

  throw new Error('callTool: no parseable result (missing structuredContent and text)');
}
