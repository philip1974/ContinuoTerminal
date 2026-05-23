# 0003: 7-step Continuo terminal migration — core-done retrospective + remaining cleanup roadmap

- **Status**: Accepted
- **Date**: 2026-05-23
- **Builds on**: ADR 0001 (Step 1 PTY handover) + ADR 0002 (Step 2 buffer merge)
- **Closes**: topic 21 superseded-by-baseline
- **Audit trail**: `.claude/dev-loop/{16-19, 21}/` + `{18, 20}/`(core delivery topics)

## Context

7-step Continuo terminal migration 原定 roadmap(ADR 0001 § Context):
- Step 0:pnpm workspace + electron-vite externalize + postinstall electron-rebuild
- Step 0.5:server-node `SessionManagerOptions` + Kill API + 4 runtime API
- Step 0.6:server-node `SessionManagerCreateInput` + `onExit` 4 fields
- Step 1:Continuo `terminal.service.ts` PTY ownership → SessionManager singleton
- Step 2:删 Continuo `terminal-buffer.service.ts` + SessionManager 单 buffer 源
- Step 3-7:terminal-buffer 合并 / sessions service / mcp-tools / renderer / etc.(follow-up)

Topic 21(Step 3a)实操中发现:**Step 3 内容大部分已被 Step 1/2 baseline deliver**,继续 dev-loop 是过度 overhead。本 ADR 总结 core-done 状态 + 列出 remaining真正需要的 cleanup work。

## Decision

**Declare 7-step migration core-done**(Step 0-2 deliver 主体架构,Step 3-7 大部分 baseline-equivalent)。剩余 work 改作 cleanup follow-up topics,不再按 "Step N" 编号驱动。

### Why Step 3a/3b 都已 baseline-equivalent

**Step 3a — terminal-sessions consolidation**(topic 21 baseline 探查发现):
- Continuo `terminal-sessions.service.ts` 现状已是 **authoritative metadata store**(window-scoped + UI shape fields)
- SessionManager `onExit` callback(Step 0.6 commit `96275e4` 加)→ Continuo `handleExit` → `terminalSessions.setExited(id, exitCode)` **已 live-update exitCode**(Step 1 既定)
- Lifecycle state machine(live / exited-retained / removed)**已隐式实现**(setExited 不删 entry,只有 remove/removeByOwner/window close 删 — baseline 行为 Step 1 既定)
- Reservation/rollback(`createTerminal` PHASE 1 add → PHASE 2 sm.create → PHASE 3 catch rollback)**Step 1 commit `dffc5e0` 已实现**
- Plan-v1 thin-overlay 路线被 red-team-v1 BLOCK(P0-1 `(sm as any).sessions` private cast);plan-v2 降级版仅文档化 + 1 个与 existing `list()` 重复的 sync API
- **Real value remaining = 0**;topic 21 closed-superseded-by-baseline

**Step 3b — MCP tools deps migration**:
- `mcp-terminal-host.ts` `MakeTerminalMcpToolsDeps` interface 现状已是:
  ```ts
  readonly sessionStore: Pick<typeof terminalSessions, 'get' | 'getAll'>;
  readonly service: Pick<typeof termService, 'has' | 'write' | 'interrupt' | 'kill' | 'forceKill' | 'readOutput'>;
  ```
- 全部 MCP tool factories(`makeListSessionsTool` / `makeCreateSessionTool` / `makeSendInputTool` / `makeSendTextTool` / `makePressKeyTool` / `makeReadOutputTool` / `makeKillTool`)早已 dependency-injected `service.*`,**不直接 import `SessionManager`**
- Step 2 加 `service.readOutput` wrapper 完成 MCP read_output 路径;**其他 7 个 tool 全走 Step 1 既定 `service.*` wrapper**
- Continuo MCP wiring 早已 server-node-agnostic;`mcp-terminal-host` deps inject 是单一替换点
- **Real value remaining = 0**(已 deliver by Step 1+2)

### Migrated state summary

| Concern | baseline (pre-migration) | post-migration | Topic / commit |
|---|---|---|---|
| PTY spawn | `pty.spawn()` direct in terminal.service.ts | `SessionManager.create()` via singleton | Topic 18 `dffc5e0` |
| PTY buffer | `terminal-buffer.service.ts` 8000-entry line buffer + auto-strip ANSI | `SessionManager.SessionBuffer` 4MB byte ring (Continuo override 64KB);raw byte preserved | Topic 20 `a2fe4ee` |
| read_history IPC | `terminalBuffer.readRaw(id)` | `terminal.service.getBufferSnapshot(id)` wrapper → `SessionManager.getBufferSnapshot()` (Topic 20 add)| Topic 20 + ContinuoTerminal `fe0b529` |
| MCP read_output | `buffer.read(id, opts)` returns `{lines, nextSeq, truncated}` | `service.readOutput(id, opts)` async wrapper → `SessionManager.readOutput()` | Topic 20 `a2fe4ee` |
| BUFFER_SESSION_NOT_FOUND | error code + 3 i18n locales + mapping | **deleted全链** — wrapper 直接抛 TERMINAL_SESSION_NOT_FOUND | Topic 20 `a2fe4ee` |
| onExit live-update | Continuo handleExit manual wiring | `SessionManagerOptions.onExit` callback (Step 0.6) → handleExit → setExited | Topic 19 `96275e4` |
| Kill grace | `setTimeout` + `pty.kill('SIGTERM')` + `pty.kill('SIGKILL')` manual | `SessionManagerKillInput.gracePeriodMs` option (Step 0.5) | Topic 17 `07bccd4` |
| maxBytes config | hard-coded | `SessionManagerOptions.maxBytes` (Step 0.5) | Topic 17 `07bccd4` |
| onData callback | manual `pty.onData` subscription in service | `SessionManagerOptions.onData` constructor option (Step 0.5) | Topic 17 `07bccd4` |
| Session id | random uuid each call | `SessionManagerCreateInput.session_id` opt (Step 0.6) | Topic 19 `96275e4` |
| args / env | hard-coded | `SessionManagerCreateInput.args` + `.env` (Step 0.6) | Topic 19 `96275e4` |
| MCP tool deps | direct sm reference | `service.*` + `sessionStore.*` Pick injection | Step 1 既定 (Topic 18) |
| Lifecycle state machine | implicit | implicit (same)— state machine documented in red-team-v1 P1-2 analysis 但未 promote 到 source JSDoc | Step 1 既定 + ADR 0003 documented |
| Reservation/rollback | implicit | implicit (PHASE 1/2/3 pattern in createTerminal)| Step 1 既定 (Topic 18) |

### Remaining cleanup follow-ups(not "Step N" migration topics)

| ID | Concern | Priority | Type |
|---|---|---|---|
| ~~**C1**~~ | ~~Continuo `package.json` direct dep `node-pty` 删(transitively via server-node)~~ | ~~low~~ | **DEFERRED** — `vi.mock('node-pty')` in `ansi-strip-regression.spec.ts:6` 依赖 direct dep path 解析;删 dep 后 spec 6/6 FAIL;需独立 vi.mock path migration topic |
| **C2** | ~~Continuo `terminal-sessions.service.ts` lifecycle state machine JSDoc promote(red-team-v1 P1-2 insight)~~ | ~~low~~ | **DONE** Continuo commit `f467907` |
| **C3** | renderer `useTerminal.ts` attach 改走 server-node MCP channel(future external IDE / standalone CLI 嵌入铺路)| high if external embedding pursued | architectural |
| **C4** | `terminal-window-isolation` 机制 evaluate — Continuo internal vs server-node abstraction(目前 Continuo internal 工作良好,无 immediate need)| nice-to-have | design review |
| **C5** | ~~Manual GUI attestation 历史 topics(Topic 18 6 scenarios + Topic 20 3 scenarios)~~ | ~~low~~ | **DONE** Topic 18 PASS-6/6 (2026-05-22 user 实操) + Topic 20 PASS-3/3 (2026-05-23 user 实操,S3 by-BDD-equivalent);F1 paste-stuck follow-up observed,unrelated to migration scope |
| **C6** | Step 2 plan-v4 Op20 typecheck gate ordering issue 反映在 future plan templates 上 — gate 位置规约(已 in ADR 0002)| done | meta |

### Cross-repo invariants 总结

ADR 0001 + 0002 invariants 仍 hold(Step 1+2 ship 实证):
- ContinuoTerminal `packages/server-node` API 先 commit,Continuo `file:` dep pickup 后 commit
- `packages/cli` / `packages/protocol` / `packages/react-terminal` zero-touch unless 显式 IN scope
- 议题 D.3 plan↔red-team limit 3 + manual override path(Step 1)+ 常规 integrate path(Step 2)
- 议题 H.7.3 manual_checkpoint mode user-driven
- Single commit per repo (N5);多 commit only if cross-repo necessity

## Consequences

### Positive

- **Migration core 完成**:从 `pty.spawn()` direct 到 `@continuo-terminal/server-node` SessionManager singleton + MCP server-node 抽象 — 主架构 deliver
- **dev-loop cost saved**:topic 21 close 节省 plan-v3 + red-team v2/v3 + execute 17+ ops + verify rounds
- **Roadmap clarity**:剩余 work 不再 "Step N" 编号驱动,而是按 concrete cleanup concerns(C1-C6)— 各 cleanup 独立小 topic 触发
- **server-node API library 成熟**:`SessionManagerOptions` + `Create/Kill Input` + `getBufferSnapshot` + `readOutput` 已 ship,future MCP / standalone CLI / external IDE 消费者直接用
- **Lessons learned promoted**:议题 D.3 escalation path duality(manual override Step 1 / 常规 integrate Step 2 / close-superseded-by-baseline Topic 21)三种合规 outcomes 都已实证

### Trade-offs / Open items

- **renderer attach 仍走 Electron IPC**(not server-node MCP)— C3 follow-up;不是核心 migration goal,但 external embedding scenario 才需要
- **terminal-window-isolation 仍 Continuo internal**(server-node 不知 Electron window)— C4 design review pending
- **node-pty direct dep 未清**(C1)— low priority,functional 无影响
- **Manual GUI attestation deferred**(C5)— 议题 H.7.3 合规但 closure-ish
- **Step 3a/3b lessons**:future migration plan 应先做 **baseline gap analysis**(测真实 delta 与目标 architecture 的差距),避免 over-claimed step scope

### Risks

- **server-node API surface 增长** without library users(本 repo 唯一 consumer 是 Continuo)— 抽象成本 vs benefit ratio 需 monitor
- **C3 renderer MCP refactor 推迟**:若 external embedding 短期不优先,延迟无影响;若优先,该 topic 设计 + execute 估 4-6 周
- **Manual GUI attestation closure pressure**:Topic 18 + Topic 20 共 9 scenarios pending;若 user 无时间实操,Step 1/2 verdict 永远停在 `PASS-pending-manual-attestation`(实际 BDD 已 cover automated layer,production 行为已 vetted by CI)

## References

- ADR 0001:Step 1 PTY handover(`fe0b529 + a2fe4ee + da397d3`)
- ADR 0002:Step 2 buffer merge(`fe0b529 + a2fe4ee + da397d3`)
- Topic 16:Step 0 preflight(`3c2cf3b / 5d865c0`)
- Topic 17:Step 0.5 SessionManager runtime API(`07bccd4`)
- Topic 19:Step 0.6 SessionManagerCreateInput + onExit(`96275e4`)
- Topic 18:Step 1 PTY handover Continuo commit(`dffc5e0`)
- Topic 20:Step 2 buffer merge Continuo commit(`a2fe4ee`)
- Topic 21:Step 3a closed-superseded-by-baseline(本 ADR 记录原因)
- 议题 D.1 + D.3 + H.7.3 + F.2(cross-repo invariants):dev-loop-design.md

## Cleanup follow-up tracking

For C1-C6 cleanup concerns:create individual `/dl-req` topics on demand,not bundle。建议优先序:
1. C5(manual GUI attestation user 实操)— closure of Topic 18/20
2. C2(lifecycle state machine JSDoc)— ~30min mechanical
3. C1(node-pty direct dep 删)— ~1 hour with verify
4. C3(renderer MCP refactor)— major topic if external embedding 优先
5. C4(window-isolation server-node abstraction)— design review only
