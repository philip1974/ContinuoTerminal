# ADR 0007 — AiQ Real Adoption via Additive Sidecar(Phase 1 of Proposal 0001)

* **Status**: Accepted(scope locked 2026-05-24)
* **Date**: 2026-05-24
* **Supersedes**: nothing — first AiQ-side adoption ADR
* **References**:
  * Proposal 0001 § Phase 1(`docs/proposals/0001-three-way-relationship-perfection-roadmap.md`)
  * ADR 0006 § CT-B2(Tauri 2 sidecar parity reference)
  * ADR 0006 § 3 invariant(no wholesale Continuo replacement;applies to AiQ similarly)
  * ADR 0005 § A1–A3(host auth surface — wire decision defer)

---

## Context

Proposal 0001 § Phase 1 elevates AiQ from "pattern reference" to "real integration". User decision 2026-05-24:**additive path locked**(Rust portable-pty 保留;ContinuoTerminal sidecar 作为 secondary backend)。Full-swap path rejected。

AiQ repo state(snapshot 2026-05-24 by Explore agent):

| 项 | 现状 |
|---|---|
| Tauri | 2.x |
| Capabilities | `dialog`, `global-shortcut`(无 shell) |
| Backend | `portable-pty` only;commands `pty_write/pty_resize`;event `pty_output` |
| Frontend | `src/components/Terminal/XtermView.tsx` + xterm.js + `src/ipc/pty.ts` |
| Agent kind enum | `Claude / Codex / LegacyShell`(`src-tauri/src/agent.rs`)+ modal selector |
| `tauri-plugin-shell` | not present |
| `reqwest` | not present |
| Prior sidecar pattern | none |

---

## Decision

**Add `ContinuoTerminal` as a new variant of `StoredAgentKind` / `CreateAgentKind`**,routing session creation for that kind to a ContinuoTerminal `server-node` sidecar spawned via `tauri-plugin-shell`。所有既有 agent kind(Claude / Codex / LegacyShell)继续走既有 `portable-pty` 路径,**零变更**。

### Why agent-kind-as-backend(option β over backend toggle UI option α)

| 项 | β agent kind | α backend toggle |
|---|---|---|
| UX 复杂度 | +1 option in existing modal selector | new toggle UI control |
| 既有 PTY 代码 | zero touch(routing only) | likely needs branching in session_create |
| Frontend state | inherits agent kind state shape | new orthogonal state slice |
| 用户心智 | "选 ContinuoTerminal 这种 agent" | "用 ContinuoTerminal backend 跑 Claude" |
| 真实 use case | ContinuoTerminal kind == 远程/sidecar 终端 | rare:user 一般不 care backend |

User 选 "ContinuoTerminal" agent kind 时,语义清晰:**这个 session 由 ContinuoTerminal sidecar 提供**。后续若有 "用 Claude CLI 跑在 ContinuoTerminal sidecar 之上" 这种用例(目前无),可加 backend toggle 作为正交 feature(out of P1 scope)。

### Invariants

1. **既有 PTY 路径零回归** — Claude / Codex / LegacyShell session 行为 byte-identical to pre-P1。
2. **不在 ContinuoTerminal `server-node` 加 AiQ 特定 primitive** — 同 ADR 0006 § 3 不做 wholesale 替换。
3. **Sidecar binary 不引 vendor lock** — 通过 Tauri 2 `bundle.externalBin` + `app.shell().sidecar("server-node")` 路径,CT-B2 README 同款。
4. **Auth wire decision = M3 no-auth localhost first**(P1.3 plan-v1 内 confirm);A3 bearer wire 作为 follow-up(若需)。
5. **Frontend UI** 保留 AiQ 既有 xterm.js stack(`XtermView.tsx`);不引 `@continuo-terminal/react-terminal`(orthogonal feature,P1 范围外)。

### Out of scope

* 不做 `react-terminal <Terminal>` 组件 swap(additive 不动 frontend UI)
* 不做 A3 bearer wire(P1 走 M3 no-auth localhost;若 P1 顺利可单独 follow-up)
* 不做 backend toggle(orthogonal feature;若需 future)
* 不做 ContinuoTerminal `server-node` 新增 primitive(consumer-led demand 检验后再说)

---

## Phase 1 mini-topics(每个独立 dev-loop 6-stage)

| ID | Topic | Scope | Cross-repo? |
|---|---|---|---|
| **P1.1** | ADR 0007 spec | This document | ContinuoTerminal only |
| **P1.2** | dl-req topic 40 | Requirements 冻结 + AiQ-side gap inventory | ContinuoTerminal repo `.claude/dev-loop/40-*/` |
| **P1.3** | dl-plan v1 | Operations list(AiQ Cargo.toml + main.rs + agent.rs + modal + frontend ipc layer)+ sub-decisions | ContinuoTerminal `.claude/` + AiQ read-only audit |
| **P1.4** | Codex red-team | Independent audit(Tauri 2 sidecar packaging cross-platform / AiQ existing PTY call sites / sidecar discoverability / reqwest dual-Accept) | ContinuoTerminal `.claude/` |
| **P1.5** | plan-v2 + execute | AiQ code changes(Cargo.toml + capabilities + plugin-shell + reqwest + agent.rs + commands routing + modal option) | **AiQ repo writes + ContinuoTerminal CT-B2 README touch-up if needed** |
| **P1.6** | Working demo + UX verify | Launch AiQ → select ContinuoTerminal agent kind → create session → run command → verify output rendering | User manual UX |

每个 mini-topic 完成后在本 ADR 下方"Mini-topic status"追加 commit hash + 一句话 outcome。

---

## Phase 1 acceptance criteria

P1 全部完成的判定:

* ✓ AiQ Cargo.toml 含 `tauri-plugin-shell` + `reqwest`(或等价 HTTP client)
* ✓ AiQ `capabilities/default.json` 含 sidecar 必需 permission
* ✓ AiQ `bundle.externalBin` 配置好 `server-node` sidecar binary 引用(CT-B2 README pattern)
* ✓ AiQ `StoredAgentKind` / `CreateAgentKind` 含 `ContinuoTerminal` 变体
* ✓ AiQ Modal selector 新增 "ContinuoTerminal" 选项
* ✓ Session lifecycle 路由:`ContinuoTerminal` kind → sidecar MCP path;其他 kind 仍 portable-pty
* ✓ ContinuoTerminal sidecar 在 AiQ 启动时 spawn,退出时 cleanup(Arc<Mutex<Option<Sidecar>>> 同 CT-B2 pattern)
* ✓ User 手动 demo PASS:launch AiQ → 选 ContinuoTerminal → create → 运行至少一条命令 → 终端正确渲染输出
* ✓ AiQ docs 留下 integration decision note(`/Users/RiGang/Desktop/AiQ/docs/`)
* ✓ ContinuoTerminal CT-B2 README 若有不准确处更新(downstream feedback loop)

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Tauri 2 sidecar 跨平台 packaging(macOS Gatekeeper / Windows defender)issue | High | CT-B2 README 已记录限制(`cargo install` 路径限制);AiQ 首发用 dev mode `tauri dev`,packaging issue 单独 P1.1 follow-up |
| `server-node` 二进制 discoverability:`bundle.externalBin` 需绝对路径 + 平台后缀 | Med | CT-B2 README `examples/tauri-sidecar/` 同款 scheme;P1.3 plan-v1 复用 |
| AiQ 既有 PTY 路径意外回归(session_create 路由错) | High | P1.3 plan-v1 包含 byte-pin 测试:Claude/Codex/LegacyShell session 创建/写入/读取流程冒烟 |
| Auth wire 决定不当(M3 no-auth localhost 安全性) | Low | localhost-only socket;Tauri 同进程 spawn;不暴露公网;P1 范围接受 M3 无 auth |
| `reqwest` 引入 + Tauri 二进制体积涨 | Low | rustls-tls feature 控体积;measure 后接受 |
| ContinuoTerminal SDK Streamable HTTP `Accept` 双格式 invariant 漏配 → 406 | Med | CT-B2 reqwest client 已实证;直接 fork pattern |
| AiQ `session_create` 内部 enum routing 改动破 Claude/Codex session 创建 | High | byte-pin test + `pnpm typecheck`(AiQ)+ codex red-team P1.4 重点审 |

---

## Mini-topic status

| ID | Status | Commit | Outcome note |
|---|---|---|---|
| P1.1 ADR 0007 spec | Done | _this commit_ | Scope + invariants locked;additive path |
| P1.2 dl-req topic 40 | Pending | — | — |
| P1.3 dl-plan v1 | Pending | — | — |
| P1.4 Codex red-team | Pending | — | — |
| P1.5 plan-v2 + execute | Pending | — | — |
| P1.6 Working demo + UX verify | Pending | — | — |

---

## Definition of "Phase 1 完成"

Mini-topics P1.1–P1.6 全 done + 此 ADR 顶部 status 切到 `Implemented + Verified` + Proposal 0001 § Phase 1 行表标 `✓ Done`。
