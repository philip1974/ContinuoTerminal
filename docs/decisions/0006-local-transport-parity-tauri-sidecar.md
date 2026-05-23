# 0006: Local MCP transport parity + Tauri sidecar readiness

- **Status**: Accepted
- **Date**: 2026-05-23
- **Builds on**: ADR 0005(host-auth-hardening-and-publish-readiness complete:A1+A2+A3+A4+A5)
- **Phase**: **NEW** — local-transport-parity-and-tauri-sidecar-readiness(NOT actual npm publish — that 仍 deferred to a future ADR if/when warranted)
- **Strategic basis**: 战略目标 P1 Continuo 真依赖 ContinuoTerminal 完整功能;P2 `/Users/RiGang/Desktop/AiQ`(Tauri+Rust+React)也使用本项目 terminal 功能。**用户决定不走 npm publish 路径**(ADR 0005 计划的 ADR 0006 publish 推迟),继续打磨 host + transport 给 future X 项目 file: 消费。
- **Advisor**: codex(strategic audit verdict `GO-WITH-CHANGES`,session `term-fb2c5dd2`,2026-05-23,20th mode switch)

## Context

用户的 audit 发现:
- Continuo 仅 1 处 import `createContinuoMcpEnv` —— **错误**
- 假设 Continuo 有完整 parallel 实现,可删 1500-2300 LOC

codex 独立 audit **三个关键纠正**:

1. **Continuo 实际已真依赖 ContinuoTerminal 三块**:
   - `@continuo-terminal/server-node` `SessionManager`(PTY runtime core 已迁,见 `Continuo/electron/main/services/terminal.service.ts:7`)
   - `@continuo-terminal/protocol`(shared schema 已迁,见 `Continuo/electron/shared/mcp-terminal-schemas.ts` re-export)
   - `@continuo-terminal/host`(M4 adapter,env/type boundary)
2. **ADR 0003 已记录 PTY spawn、buffer、read_history、MCP read_output 等已迁到 SessionManager/server-node API**(`docs/decisions/0003-migration-core-done-roadmap-retrospective.md:48`)。**P1 终端 runtime 大部分 done**。
3. **可删 LOC 严重高估**:短期 100-300 / 中期 300-700,而非 1500-2300。Continuo unique 不该迁:
   - `agent-auth.service.ts`(142 LOC,反向 IPC UX)
   - window ownership / attach target
   - StatusBar "复制 MCP 配置" UX
   - plugin-mcp-bridge / plugins.service(Continuo plugin system)
   - settings / startup-mode / shell exec / shell-integration / pty-lang

## Decision

采纳 codex advisor verdict `GO-WITH-CHANGES`:启动新 phase **local-transport-parity-and-tauri-sidecar-readiness**。Goal = **让 ContinuoTerminal 具备 (a) Continuo 既有 socket UX parity 不破 + (b) Tauri sidecar 可消费场景**;**不**对 Continuo 做 wholesale replacement。

### 关键设计 invariants(codex 建议)

#### 1. Continuo socket UX 是不可破的 anchor

- Continuo 现 stdio socket 设计:Claude Code config 只存 spawn 命令,**无 token / 无端口 / 重启不失效**
- Capability 鉴权(unix socket file perm 0600),非 Bearer token
- 见 `Continuo/electron/main/services/mcp-stdio-server.service.ts` + 配置入口 `Continuo/electron/main/index.ts:536`
- ContinuoTerminal 现有 stdio bin "每 client spawn 新 server 实例" **不能连回 Continuo app 内同一个 SessionManager**

→ ContinuoTerminal 需加 **generic local socket / named-pipe transport**(命名严守 generic — no `Continuo` / `window`)。

#### 2. AiQ 不动 Rust portable-pty

- AiQ ARCHITECTURE 明确 Rust portable-pty 管 PTY(见 `AiQ/docs/ARCHITECTURE.md:39`,`AiQ/src-tauri/Cargo.toml:20`)
- AiQ **不依赖** Continuo P2 路径
- AiQ 用 ContinuoTerminal 的可行路径:
  - **路径 A**:Rust spawn `continuo-terminal-server` sidecar,前后端通过 HTTP MCP 调它(绕过 Rust PTY,与 AiQ 当前架构冲突 — 但对 future X/Tauri sidecar 很有价值)
  - **路径 B**:保 Rust PTY,前端用 `@continuo-terminal/react-terminal` / `protocol` adapter(更贴 AiQ 当前架构)

→ CT-B2 ship `examples/tauri-sidecar` 真 demo(路径 A 验证;路径 B 是 future option)。

#### 3. 不做 wholesale Continuo replacement

- agent-auth / window ownership / attach / StatusBar / plugin bridge 是 Continuo 产品逻辑
- ContinuoTerminal 只 ship parity bridge 与 transport primitives
- Continuo 内部逐步用 ContinuoTerminal primitives 替换 transport/framing,**不动**业务逻辑

## Roadmap — 5 mini-topics(per codex)

| # | Mini-topic | Content | Time |
|---|---|---|---|
| **CT-B1** | `local-socket-transport` | ContinuoTerminal 加 generic local socket(unix socket / named-pipe)NDJSON MCP server transport;file-perm capability 鉴权 default;可选 A2/A3 hooks 复用 | 3-5 days |
| **CT-B2** | `tauri-sidecar-example` | NEW `examples/tauri-sidecar/`(Rust + minimal Tauri 壳)spawn `continuo-terminal-server` HTTP sidecar,Rust 用 reqwest 走 MCP HTTP client;验证 AiQ 路径 A 可行 | 5-7 days |
| **CT-B3** | `continuo-socket-adapter` | Continuo `mcp-stdio-server.service.ts` adopts CT-B1 framing + socket-safety primitives while keeping its own `_continuo/hello`, dispatch, and **"复制 MCP 配置" UX byte-compatible**;不动 mcp-host.service / agent-auth | 3-5 days |
| **CT-B4** | `plugin-bridge-compat-audit` | Evaluate `plugin-mcp-bridge.service.ts` 动态 tool 注册 + `tools/list_changed` 在 ContinuoTerminal primitives 下兼容性;**仅 audit,可能不改代码** | 2-3 days |
| **CT-B5** | `mcp-host-retirement-eval` | After B1-B4,决定 `mcp-host.service.ts`(618 LOC)哪些可退役;若 ROI 不够,documented decision 保留 parallel implementation | 3-5 days |

**Total estimate**:**3-5 weeks implementation**(or **calendar weeks** if 有 burn-in)。

### Strict dependency 顺序

CT-B1 → CT-B2 / CT-B3(可并行,B2 不依 B3 也不依 Continuo)→ CT-B4 → CT-B5。**CT-B1 是 transport primitive 基础**;CT-B2 / B3 是两个独立 consumer of B1。

## Deliverable Template(post-ADR 0006 CT-B1)

```typescript
import { startLocalSocketTransport } from '@continuo-terminal/server-node';

const sock = await startLocalSocketTransport({
  socketPath: '/tmp/my-mcp.sock',  // OR Windows named pipe path
  sessions: new SessionManager(),
  // Optional A2/A3 hooks reuse:
  authenticateRequest: undefined,  // capability-based by socket file perm
  authorizeToolCall: undefined,
});

// CLI proxy(Claude Code spawns this script,relays stdio ⇆ socket):
const proxy = await connectLocalSocketStdioProxy({
  socketPath: process.env.MCP_SOCKET_PATH!,
});
```

## Consequences

### Positive

- **Continuo 既有 UX 保留** + **逐步真依赖 ContinuoTerminal transport primitive**
- **AiQ Tauri sidecar 路径明确** + 有 reference demo(CT-B2)
- **不做 wholesale replacement** — 风险 manageable,2440 Continuo tests + 既有 ContinuoTerminal 217 tests(host 43 + server-node 97 + A4 + M5 + others)都 invariant
- **codex advisor ROI 兑现**:strategic audit 拨正了"P2 替换 1500 LOC"的错误方向

### Trade-offs / Open items

- **不删 Continuo LOC** — 短期 LOC 数没变化;value 在 architecture 清晰 + future X/AiQ 可消费
- **不 publish npm** — ADR 0005 publish 路径推迟;file: workspace 是当前模型
- **CT-B5 可能输出 "不退役"决定** — 文档化 parallel implementation 也是可接受 outcome

### Risks(per codex)

1. **直接替换 Continuo `mcp-host.service` 会破用户可见路径**(Claude Code config / StatusBar UX)→ mitigated by CT-B3 only swap plumbing,not host
2. **CT-B1 socket transport 设计 leak Continuo-specific naming** → mitigation:strict generic terms invariant(socket path / framing / hello,不写 window / Continuo / panel)
3. **CT-B2 Tauri demo 拖入 Rust toolchain dep** → mitigation:demo 是 example,不是 package dep;`tauri-cli` 仅 devDep
4. **plugin bridge dynamic tools 与 ContinuoTerminal tools/list 静态不兼容** → CT-B4 audit-only,不强迫迁
5. **Continuo unix socket file-perm 0600 capability 鉴权** 与 ContinuoTerminal A2/A3 Bearer 是两套模型 → CT-B1 default 用 file-perm,A2/A3 hooks 是 opt-in 而非 mandatory

## References

- ADR 0001-0005(尤其 A1-A5 ship)
- ADR 0003 § "Step migration core done"(PTY runtime 已迁记录)
- codex strategic audit(session `term-fb2c5dd2`,20th mode switch,verdict `GO-WITH-CHANGES`)
- Continuo `mcp-stdio-server.service.ts`(socket UX anchor)+ `mcp-host.service.ts` + `mcp-tools-terminal.ts`
- AiQ `ARCHITECTURE.md` + `Cargo.toml`(portable-pty 依赖)

## Roadmap tracking

| Mini-topic | Status | Topic ID | Commits |
|---|---|---|---|
| CT-B1 local-socket-transport | **done** | topic 33 | bfcd13d (2026-05-23, local Unix socket NDJSON transport, SDK client transport, injectable stdio proxy, private-dir capability guard) |
| CT-B2 tauri-sidecar-example | **done** | topic 34 | a36e6c8 (2026-05-23, Rust binary sidecar demo: spawn continuo-terminal-server HTTP + reqwest MCP client + idempotent cleanup; Tauri 2 plugin-shell integration guide) |
| CT-B3 continuo-socket-adapter | **done** | topic 35 | 4dbfbfb (Continuo) + this ADR backfill (2026-05-23, Continuo adopts CT-B1 framing/safety primitives; copy-config UX byte-compatible; packages/source zero-touch except host strictness fix 01cf467) |
| CT-B4 plugin-bridge-compat-audit | not started | — | — |
| CT-B5 mcp-host-retirement-eval | not started | — | — |

ADR 将随每 mini-topic ship 更新 commit hash + verdict。

### CT-B1 ship note

CT-B1 adds the first ADR 0006 transport primitive inside
`@continuo-terminal/server-node`: a generic macOS/Linux Unix socket MCP
listener using SDK stdio NDJSON framing, a matching SDK client transport,
and an injectable stdio proxy for future local process bridges. The listener
uses per-connection fresh MCP SDK servers with one shared `SessionManager`,
matching the M3 HTTP multi-client invariant. Capability safety is explicit:
the parent directory must be private (`0700`), the socket is chmodded `0600`,
and stale path cleanup only unlinks existing socket nodes. A2/A3 hooks remain
optional, but `authorizeToolCall` requires `authenticateRequest` to avoid a
silent-bypass configuration. Windows named-pipe support remains a follow-up.

### CT-B2 ship note

CT-B2 ships `examples/tauri-sidecar/`, an independent Cargo binary that
validates the Rust sidecar consumption path: it spawns `continuo-terminal-server`
in HTTP mode, parses the dynamic `/mcp` endpoint from stdout, and drives MCP
with `reqwest` raw JSON-RPC POST requests. The client sets both required
Streamable HTTP headers (`Content-Type: application/json` and
`Accept: application/json, text/event-stream`) per the SDK transport
requirement. Cleanup is idempotent through a shared `Arc<Mutex<Option<Sidecar>>>`
used by normal completion, panic hook, and Ctrl-C handling. Scope is reduced:
this is not a full webview app or production packaging recipe. The README
documents the Tauri 2 integration path using `tauri-plugin-shell`,
`bundle.externalBin`, and shell capabilities, validating ADR 0006 invariant 2
for a Rust desktop sidecar consumer while leaving `continuo-terminal-server`
and server-node HTTP transport unchanged.

### CT-B3 ship note

CT-B3 deliberately does **not** replace Continuo's stdio socket listener with
`startLocalSocketTransport`. Continuo must intercept the private
`_continuo/hello` notification before generic MCP notification discard so it
can bind a socket connection to a window-scoped context; CT-B1's listener
hands the first message directly to an SDK MCP server and cannot preserve
that Continuo-specific handshake. Instead, Continuo adopts the reusable CT-B1
framing and socket-safety primitives while keeping its own dispatch,
`_continuo/hello`, `socketCtx`, and "copy MCP config" UX intact. CT-B3 also
switches Continuo framing to SDK stdio CRLF parity: a trailing `\r` before
`\n` is stripped. The old CR-retention behavior was an accidental legacy
detail, not a feature contract. ContinuoTerminal packages/source are
zero-touch for the adapter itself; this ADR update is doc-only. CT-B3 scope
expanded by one defensive source fix: ContinuoTerminal
`packages/host/src/auth.ts` now guards the `BEARER_RE.exec(...)[1]` capture
before passing it to `TokenStore.validate`, making the host package safe under
downstream `noUncheckedIndexedAccess` typechecking. The behavior is equivalent
because the regex capture is non-empty when matched; future file: consumers
benefit from the stricter type compatibility.
