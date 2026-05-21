# @continuo-terminal/react-terminal

React 19 + xterm 6 component for Continuo Terminal MCP sessions. Decouples UI from transport via the `MCPClientAdapter` interface - host injects the transport (Tauri sidecar / Electron main / test mock / etc.).

## Quick start

```sh
pnpm install
# (no runnable demo in this package - see examples/minimal-react-host)
```

Host must import xterm CSS once at app entry:

```ts
import '@xterm/xterm/css/xterm.css';
```

## Usage

```tsx
import { Terminal, type MCPClientAdapter } from '@continuo-terminal/react-terminal';

const adapter: MCPClientAdapter = {
  async callTool(name, args) {
    // host-specific transport (Tauri ipc / Electron preload bridge / etc.)
    return invokeMCP(name, args);
  },
};

<Terminal sessionId="abc-123" adapter={adapter} cols={80} rows={24} pollIntervalMs={300} />;
```

## Adapter contract

```ts
interface MCPClientAdapter {
  callTool<O = unknown>(name: string, args: unknown): Promise<O>;
  subscribeOutput?(sessionId: string, onChunk: (lines: string[], nextSeq: number) => void): () => void;
}
```

- `callTool` must return either `{ structuredContent }` or `{ content: [{ type: 'text', text: '<json>' }] }` (matches MCP CallToolResult); the component handles both via `parseCallToolResult`.
- `subscribeOutput` is optional. If present, polling is skipped.

## Props

- `sessionId: string` - MCP terminal session id.
- `adapter: MCPClientAdapter` - see above.
- `cols/rows: number` - default 80/24.
- `pollIntervalMs: number | false` - default 300. Set `false` or `0` to disable polling (only useful with `subscribeOutput`).
- `initialSinceSeq: number` - default 0.
- `className/style` - passed to container div.
- `onError?: (err: unknown) => void` - invoked on polling/send failures.

## Phase 1 trade-offs

- User input is sent via `terminal.send_text` (UTF-8 text). Raw binary input via `terminal.send_input` is Phase 2.
- Real xterm rendering not unit-tested (jsdom has no canvas); unit tests mock `@xterm/xterm`. `examples/minimal-react-host` provides a buildable Vite + React 19 host wired against an **in-memory mock** `MCPClientAdapter` — useful for manual visual checks and as a regression target for the Vite build, but NOT a real browser-render E2E. True browser E2E (real xterm canvas + screenshot or a11y-tree comparison against a live PTY) remains future work.

## Tests

```sh
pnpm --filter @continuo-terminal/react-terminal test
# or root: pnpm test (jsdom env via per-spec annotation)
```
