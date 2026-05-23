# 0004: Agent-host-abstraction lift — capability productization roadmap

- **Status**: Accepted
- **Date**: 2026-05-23
- **Builds on**: ADR 0003(7-step migration core-done)
- **Phase**: **NEW** — agent-host-abstraction-lift(NOT "Step 8 of migration";性质是 productization / capability lift,不是 cleanup follow-up)
- **Strategic basis**: user 揭示 ContinuoTerminal 战略目标 = future 所有项目围绕 "CLI Agent 通过 terminal session 控制其他 CLI Agent" 模式开发,ContinuoTerminal 应为通用 library
- **Advisor**: codex(独立第二意见,verdict `GO-WITH-CHANGES`,Continuo terminal session `term-fb2c5dd2`,2026-05-23 2m 03s analysis)

## Context

ADR 0003 declared 7-step migration **core-done**:`pty.spawn` direct → `SessionManager` 抽象 + buffer 单源 + MCP tool deps inject 已 ship(Step 0/0.5/0.6/1/2)。但 baseline 探查发现:

- **核心 PTY library**(server-node + MCP server)✓ delivered
- **Host glue(env injection + token management + auth interceptor + bootstrap helper)** 仍在 Continuo Electron `electron/main/index.ts:setMcpEnvProvider` + `mcp-host.service.ts` + `mcp-terminal-host.ts` 内,**非 ContinuoTerminal**
- 当前 ContinuoTerminal 对 future 非 Electron 项目 X 的可复用度仅 **PTY runtime 层**,host pattern glue 必须 X 自己写

User 战略目标要求把整个 "agent-controls-agent via terminal" 模式产品化为通用 library。

## Decision

**采纳 codex advisory verdict `GO-WITH-CHANGES`**:启动新 phase `agent-host-abstraction-lift`,**拆为 5 mini-topics**(不一口气做),**总 3-5 周**。

### 关键设计 invariants(codex 建议)

#### 1. 三层 package 边界

| Package | 责任 | 不知道 |
|---|---|---|
| `@continuo-terminal/server-node` | terminal runtime + MCP tools + **transports** + **bin entry** | token / window / workspace policy |
| `@continuo-terminal/host`(NEW) | bootstrap / lifecycle / env injection / auth helpers | Electron / window-scoped routing |
| `@continuo-terminal/cli` | **暂缓** | 先 server-node 加 bin;pattern 稳定后从 example promote |

#### 2. Transport 设计

- **stdio default 保留**
- 新增 transport 首选 **MCP SDK `StreamableHTTPServerTransport`**(不是 WebSocket)
  - SDK 本地已有 server-side Streamable HTTP
  - HTTP 更适合 VS Code extension / server backend / sidecar daemon / fetch bridge
- transport 实现属于 **server-node**;host 只**选择和启动**,不实现 protocol transport

#### 3. Generic terms(防 Continuo shape 泄漏)

公共 API **必须用 generic 词汇**,不带 Electron 概念:

| 应抽(generic) | 不应抽(Electron-specific) |
|---|---|
| `subject` | ~~`windowId`~~ |
| `scope` | ~~window-scoped routing~~ |
| `workspaceRoot` | ~~active panel resolution~~ |
| `metadata` | ~~Electron IPC authorization flow~~ |
| token issue / validate | ~~workspace filtering 具体规则~~ |
| env var composition | |
| local URL discovery | |
| host lifecycle | |
| optional policy callback | |

#### 4. Continuo refactor 模式

**Continuo 应该是 host 的一个 adapter consumer**(套上自己的 windowId → subject 映射、UI scope → workspaceRoot 映射),**不是公共 API 的设计源头**。Continuo 的偶然结构**不可冻结进公共库**。

## Roadmap — 5 mini-topics

| # | Mini-topic | 内容 | Commits | 时间 |
|---|---|---|---|---|
| **M1** | `server-node-bin` | server-node 加 `bin` field + standalone CLI entry(stdio default,后续 `--transport` flag);README example 改用 bin | 1-2 | 几天 |
| **M2** | `host-minimal` | 新 `packages/host`:stdio/child-process bootstrap + env provider + local token issuer/validator(API 用 generic terms)| 2-4 | ~1 周 |
| **M3** | `streamable-http` | server-node 加 `StreamableHTTPServerTransport` mode + host transport option | 2-4 | ~1 周 |
| **M4** | `continuo-adopt-host` | Continuo Electron 改用 `@continuo-terminal/host` 替代本地 `setMcpEnvProvider`;Electron routing/window logic **仍在 Continuo**(adapter consumer)| 3-6 | 1-2 周 |
| **M5** | `real-demo` | `examples/minimal-agent-host/` non-Electron demo project(50 行 standalone agent host)| 1-2 | 几天 |

**总量**:**3-5 周**(不一口气做)。

### 替代轻量路径(codex 高度推荐,若只有 Continuo 一个真实 consumer)

**只做 M1 + docs + M5(example)**,**不立刻抽 packages/host**。用 README + example 验证 **2 个非 Electron consumer** 后再抽 M2 host package。

> **理由**:若 host package API 仅由 Continuo 一个 consumer 设计,过早公共化 API 极易 lock-in Continuo 偶然结构。验证 2+ consumer 是 codex 强建议的 productization 边界 invariant。

**本 ADR 的最终路径决策**:先走 **M1 + M5(docs + bin + example)**,验证后再决断 M2/M3/M4 顺序。

M1 final implementation note:the source-only bin uses a pure Node ESM
`src/bin.mjs` wrapper with `createRequire(import.meta.url).resolve('tsx/esm')`
and dynamic import of `src/server.ts`. This was verified from an external
cwd so loader resolution is anchored to `@continuo-terminal/server-node`,
not the caller's working directory.

Before promoting `@continuo-terminal/host` or publishing server-node,
require at least 2 non-Electron consumers merged and exercised for either
2+ weeks or 3+ meaningful commits each. This sharpens the consumer gate so
host APIs are not designed from a single application shape.

M5 ships as a stdio launcher demo (Option C):the host is only a launcher,
and the primary process is the sole MCP controller. The multi-client
same-server scenario waits for M3 HTTP transport. M5 acts as the first
non-Electron consumer candidate for the publish gate above.

## Deliverable Template

**HTTP transport 版**:
```typescript
import { bootstrapAgentHost } from '@continuo-terminal/host';

const host = await bootstrapAgentHost({
  transport: { kind: 'http', host: '127.0.0.1', port: 0 },
});

const env = await host.createAgentEnv({
  subject: 'codex-worker',
  workspaceRoot: process.cwd(),
});

spawn('codex', ['--some-mode'], {
  env: { ...process.env, ...env },
});
// codex 子进程拿 env 中的 MCP URL + token,连回 host,
// 通过 7 个 MCP tools 控制其他 agent。
```

**stdio-first 版**(更简单,M1+M2 完成即可达成):
```typescript
const host = await bootstrapAgentHost({
  transport: { kind: 'stdio-child' },
});

const env = await host.createAgentEnv({
  subject: 'agent-a',
  workspaceRoot,
});

spawn('claude', [], {
  env: { ...process.env, ...env },
});
```

## Consequences

### Positive

- **核心能力产品化**:ContinuoTerminal 从"PTY library + MCP server" 升级到 "完整 agent-controls-agent host primitive"
- **复用度跨项目**:future X 项目 3-5 行起 host,无需重新实现 token/env/auth
- **抽象边界守得住**:3 层 package + generic terms + adapter consumer pattern 防 Continuo shape 泄漏
- **风险控制**:5 mini-topics 拆开,每步可独立 verify;若 M2 设计错可在 M3 前 revert
- **codex independent advisory**:与 Claude 初步意见的 6 处分歧(scope / transport / generic terms / 编号 / Continuo refactor risk / replace path)全采纳 codex 路径

### Trade-offs / Open items

- **总周期 3-5 周**:不是 quick win,但合 codex "不要一口气做" 建议
- **M2 host package API 设计 lock-in 风险**:codex 强建议先 M1+M5 验证 ≥2 consumer 后才 commit M2 API
- **M4 Continuo refactor 风险**:`setMcpEnvProvider(windowId, ...)` 形状不能原样 lift;Continuo 需写 adapter 层映射 Electron 概念到 generic terms
- **C1 node-pty direct dep 删**(ADR 0003 deferred)与本 roadmap 无关,仍 pending(单独 vi.mock path migration topic)
- **C3 renderer MCP refactor**(ADR 0003)与本 roadmap 部分相关:M3 streamable-http 完成后,renderer 走 HTTP MCP 才有意义;否则 C3 仍走 Electron IPC

### Risks

- **Continuo shape 泄漏到 public API**(codex 标为最大风险):mitigated by 三层边界 + generic terms 命名规范 + M4 adapter pattern + 验证 ≥2 consumer 后才 commit M2 API
- **HTTP transport 选 Streamable vs WebSocket**:codex 明确 Streamable HTTP(SDK 已 ship);WebSocket 留 future 扩展
- **过早 commit `@continuo-terminal/cli` package**:codex 建议**暂缓**,先 server-node bin 自己满足;真正用户 facing CLI 等 pattern 稳定后再 promote
- **Mini-topic 顺序错乱**(M3 在 M2 前做 OR M4 在 M1 前做)会破坏 dependency 链:strict 顺序 M1 → M2 → M3 → M4 → M5,或 codex 替代路径 M1 → M5 → review → M2+

## References

- ADR 0001:Step 1 PTY handover + cross-repo invariants
- ADR 0002:Step 2 buffer merge + empty-snapshot semantics
- ADR 0003:7-step migration core-done retrospective + C1-C6 cleanup roadmap
- Codex advisory verdict(2026-05-23 2m 03s):session `term-fb2c5dd2-39cd-47d3-b8f4-ca5bf673372e`,8 Q answers + GO-WITH-CHANGES + final template
- `packages/server-node/src/server.ts`:`createTerminalMcpServer` + `main()` 现状
- Continuo `electron/main/index.ts:setMcpEnvProvider`(M4 改造目标)
- MCP SDK `@modelcontextprotocol/sdk/server/stdio.js` + `streamableHttp.d.ts`(M3 依赖)

## Roadmap tracking

| Mini-topic | Status | Topic ID | Commits |
|---|---|---|---|
| M1 server-node-bin | **done** | topic 22 | `1a1b592` (2026-05-23) |
| M2 host-minimal | not started(可能跳到 M5 先做)| — | — |
| M3 streamable-http | not started | — | — |
| M4 continuo-adopt-host | not started | — | — |
| M5 real-demo | **done** | topic 23 | `18476b8` (2026-05-23, Option C launcher-only) |

ADR will be updated to reflect each mini-topic's commit hash + verdict as they complete.
