# 0002: Step 2 buffer merge — empty-snapshot semantics + BUFFER_SESSION_NOT_FOUND retirement

- **Status**: Accepted
- **Date**: 2026-05-23
- **Topic**: 20-migration-step2-buffer-merge
- **Continuo commit**: `a2fe4ee2…`
- **ContinuoTerminal commit**: `fe0b529…`(server-node API)
- **Audit trail**: `.claude/dev-loop/20-migration-step2-buffer-merge/`(req / plan-v1..v4 / red-team-v1..v3 / execute-log / verify)
- **Builds on**: ADR 0001 cross-repo PTY handover

## Context

Step 1(ADR 0001)把 Continuo PTY ownership 转给 `SessionManager`,但 Continuo `electron/main/services/terminal-buffer.service.ts`(8000 entry line buffer + 自有 `BUFFER_SESSION_NOT_FOUND` 错误码)仍并存 — 双 buffer。Step 2 砍掉 Continuo 一侧,统一以 `SessionManager` 内 `SessionBuffer` 为唯一源。

涉及两条 consumer 链:
1. **renderer attach replay**:`useTerminal.ts:261` 调 `coApi.terminal.readHistory(id)` → `terminal:read_history` IPC → 原 `terminalBuffer.readRaw(id)` 返回 `{data, truncated}`(byte concat,含 ANSI)
2. **MCP `terminal.read_output` 工具**:`mcp-tools-terminal.ts:464` 调 `buffer.read(id, opts)` 返回 `{lines, nextSeq, truncated}`(line-split + 可选 stripAnsi)

Step 2 必须为这两条链各提供 SessionManager 替代,并处理边界(PTY exit / SESSION_NOT_FOUND / ANSI 截断)。

## Decision

**双 wrapper 在 Continuo `electron/main/services/terminal.service.ts`,封装唯一 `SessionManager` singleton**:

1. **`getBufferSnapshot(id): { data, truncated }`**(renderer 路径)
   - 内部调 `sm.getBufferSnapshot(id)`(ContinuoTerminal Step 2 新加 class method,raw byte concat,ANSI preserved)
   - **`SESSION_NOT_FOUND` → 映射成 `{data:'', truncated:false}` empty snapshot**(与 baseline `terminalBuffer.readRaw` missing buffer 行为等价)
   - `truncated === true` 时 prefix `\x1b[0m` 重置 ANSI(防 retained CSI/OSC tail sticky style)
   - IPC channel `terminal:read_history` payload shape 100% 不变(S1)

2. **`async readOutput(id, opts): Promise<{ lines, nextSeq, truncated }>`**(MCP 路径)
   - 内部 `await sm.readOutput(...)`,将 `next_seq`(snake_case from server-node)映射成 `nextSeq`(camelCase library convention,与 `ReadOutputToolDeps.read` 一致)
   - `SESSION_NOT_FOUND` → **重抛 `TERMINAL_SESSION_NOT_FOUND` with `{cause}`**(preserve original message via `new Error(msg, { cause: e })`)
   - 上层 `makeReadOutputTool` 的 `BUFFER_SESSION_NOT_FOUND` mapping 删除

### Error-code 全链清理

`BUFFER_SESSION_NOT_FOUND` 既已不再产生(wrapper 直接抛 `TERMINAL_SESSION_NOT_FOUND`),其全链删除:
- `electron/shared/error-codes.ts` enum entry
- `electron/shared/i18n-locales/{en,zh,ko}.ts` 3 个 locale 翻译
- `unified-toast-notification/error-codes-enum.spec.ts` 路径引用 + enumerated count 同步

## Empty-snapshot semantic 边界(NEED-INFO-1 = b)

**baseline 行为(`terminal-buffer.service` v1)**:`readRaw(id)` 在 buffer 不存在时返回 `{data:'', truncated:false}`(显式注释:"不存在 buffer → 返回空,允许 mount-before-spawn 的安全 race")。PTY exit 后 buffer **不**自动释放,需 IPC `TERMINAL_REMOVE` 显式调用 `destroy(id)`。

**Step 2 行为**:`SessionManager.onExit` 内部立即 `removeSession(id)`,buffer 跟着 GC。但 Continuo wrapper `getBufferSnapshot(id)` catch `SESSION_NOT_FOUND` → 返回 empty,**对 renderer 端无感知**。

**已知行为偏移**(documented for future readers):
- baseline:PTY exit ≤ T < IPC `TERMINAL_REMOVE` 时间窗内,renderer 可读最后一行(eg shell exit code 之前的 stderr)
- Step 2:同时间窗内,renderer 拿 empty(buffer 已 GC)
- **acceptable**:因 Continuo UX 关 panel / new panel 立即触发 cleanup,实际用户感知差异小;未来如有客诉,可在 SessionManager 侧加 `retainAfterExit: number` 选项

## Implementation patterns

### 跨 repo commit 顺序

按 ADR 0001 invariant:**ContinuoTerminal `packages/server-node` API 必须先 ship**(fe0b529),Continuo `file:` dep `pnpm install` pickup,然后 Continuo commit(a2fe4ee)。Op27 Recovery 段:若 CT commit fail,**禁止进入 Continuo phase**;若已进 Continuo phase,`git stash push -u` 保 work,修 CT,`pnpm install`,`git stash pop`(冲突 user 解决)。

### Test 设计

- **真 server-node stripAnsi 回归测**(`ansi-strip-regression.spec.ts`):不 mock SessionManager,真 spawn shell + 真 ANSI input,验 server-node 正则与 Continuo 旧 `stripAnsi` 行为一致
- **exited-session-replay 直接 mock catch branch**(`exited-session-replay.spec.ts`):用 `vi.spyOn(sm, 'getBufferSnapshot').mockImplementation(() => { throw ... })` 直接触发 wrapper catch,不依赖真 PTY exit timing
- **no-dangling-import 用 Python multiline-aware**(`no-dangling-import.spec.ts`):`vi.mock(...)` 跨行写法 single-line `grep` 漏判,用 Python helper script(`re.DOTALL`)兜底

### Op20 plan ordering 教训

plan-v4 Op20(typecheck gate)放在 Op19(delete `terminal-buffer.service.ts`)之后、Op21(spec migrations)之前 — **必然 fail**(specs 仍 import deleted module)。Execute 阶段 codex 正确报 `OP20-FAIL`,Claude 识别为 shallow(议题 D.1),指示 skip → 进 Op21。Op24 final 真正 gate。**未来 plan 设计应避免 dangling gate position**(eg gate should sit after all dependent migrations)。

## Cross-repo invariants(继承 ADR 0001 + 本 topic 补充)

- ContinuoTerminal `packages/server-node` API 是 IN scope;packages/cli / protocol / react-terminal **zero-touch**(S2 invariant 第二次 enforce)
- Continuo single commit + ContinuoTerminal single commit(N5);本 topic 两 repo 各 1 commit
- 议题 H real-test required + manual GUI scenario user-driven(议题 H.7.3 manual_checkpoint mode + ADR 0001 Step 1 precedent)
- 议题 D.3 plan↔red-team limit 3:本 topic 用满 3 rounds(BLOCK / BLOCK / REVISE)— Step 1 走 manual override path(round 3 BLOCK + Option A authorize),Step 2 走常规 integrate path(round 3 REVISE → plan-v4 → execute);**两种 path 都合规,topic-by-topic 适配**

## Consequences

### Positive

- **Continuo 内存简化**:删 143 LOC buffer service + 357 LOC 自有测(net -500 LOC for buffer concern),SessionManager 4MB buffer 默认(Continuo override 64KB)统一管理
- **MCP agent 路径完整**:`terminal.read_output` 改 async + camelCase,与 server-node 直接 API shape 一致
- **Error code 全链干净**:删 `BUFFER_SESSION_NOT_FOUND` + 3 i18n locales,降低 future contributor cognitive load
- **跨 repo wrapper pattern 模板**:Step 3-7 各 service 都可 follow `terminal.service.ts` 双 wrapper / catch-and-rethrow / IPC shape preservation 模式

### Trade-offs / Open items

- **PTY exit 到 IPC TERMINAL_REMOVE 时间窗内 buffer 不可读**(decision (b) trade-off,acceptable per UX 评估)
- **`SessionManager.getBufferSnapshot` 默认抛 SESSION_NOT_FOUND**;Continuo wrapper map empty 是 application-level decision,**不进 server-node**(其他 consumer 可自决)— README + JSDoc documented
- **server-node maxBytes per-session config 未暴露**:Continuo `getSessionManager()` 仍硬 64KB;Step 3+ 若需 per-panel config,可加 `SessionManagerCreateInput.maxBytes`(目前 `SessionManagerOptions.maxBytes` 是 per-instance)

### Risks

- **server-node stripAnsi 正则与 Continuo baseline 不完全等价**:`ansi-strip-regression.spec.ts` 是回归 safety net;若 future server-node 改正则,该 spec 会 fail-loud
- **Empty-snapshot UX feedback**:若 user 报告 "看不到 exited session 最后输出",可调 (a) SessionManager retain-after-exit option 或 (b) Continuo 一侧 cache buffer locally before exit
- **plan ordering 自洽**:Op20 typecheck gate 设计错位是 plan-v4 已知 issue;execute 阶段已识别 + recover

## References

- ADR 0001:`docs/decisions/0001-cross-repo-pty-handover-manual-override.md`(Step 1 architecture)
- 7-step migration plan:`.claude/dev-loop/16-migration-step0-preflight/`(starting topic)
- Topic 20 audit trail:`.claude/dev-loop/20-migration-step2-buffer-merge/`(req / 4 plans / 3 red-teams / execute / verify)
- ContinuoTerminal Step 2:commit `fe0b529 feat(server-node): add SessionManager.getBufferSnapshot for raw byte replay`
- Continuo Step 2:commit `a2fe4ee refactor(electron): delete terminal-buffer.service in favor of SessionManager wrappers`
- 议题 D.1 + D.3 + H.7.3:plan-revision + manual_checkpoint pattern
- NEED-INFO-1 决策路径:req.md → plan-v2 § U10 → plan-v3 → plan-v4 § Approach U10
