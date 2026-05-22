# 0001: Cross-repo PTY handover via SessionManager + manual override path

- **Status**: Accepted
- **Date**: 2026-05-22
- **Topic**: 18-migration-step1-continuo-pty-handover
- **Continuo commit**: `dffc5e0246cfcb30204386f3838686aa655e743c`
- **ContinuoTerminal commit**: 0 changes (S4 invariant maintained)
- **Audit trail**: `.claude/dev-loop/18-migration-step1-continuo-pty-handover/`(plan-v1/v2/v3, plan-v3-patches, red-team-v1/v2/v3, execute-log, verify)

## Context

ContinuoTerminal `@continuo-terminal/server-node` 是 Continuo Electron app 的 terminal MCP server,与 Continuo 共享 PTY 抽象层。原 Continuo `electron/main/services/terminal.service.ts` 直接调 `pty.spawn()`(node-pty),没有通过 server-node。

7-step migration 计划把 Continuo terminal 主权完全转给 server-node:
- Step 0(topic 16):pnpm workspace + electron-vite externalize + postinstall electron-rebuild — done
- Step 0.5(topic 17):server-node `SessionManagerOptions` + `SessionManagerKillInput` + 4 runtime API(resize / kill grace / onData / maxBytes)— done
- Step 0.6(topic 19):server-node `SessionManagerCreateInput` + `SessionManagerOptions.onExit` 4 fields — done
- **Step 1(topic 18 — THIS ADR)**:Continuo `terminal.service.ts` 内部 PTY ownership 从 `pty.spawn()` 改为 `SessionManager` singleton
- Step 2-7:terminal-buffer 合并 / sessions service / mcp-tools / renderer / etc. — follow-up

## Decision

**`terminal.service.ts` 内部用 `SessionManager` singleton 替 `pty.spawn`,外表 6 method signature 全 baseline,IPC 13 channels payload shape 全保留,ContinuoTerminal 仓库 0 改动**。

### Key implementation patterns

1. **Module-level `SessionManager` singleton(lazy)**:
   ```ts
   let sessionManager: SessionManager | null = null;
   function getSessionManager(): SessionManager {
     if (sessionManager) return sessionManager;
     sessionManager = new SessionManager({ onData: handleChunk, onExit: handleExit, maxBytes: 64*1024 });
     return sessionManager;
   }
   ```

2. **Per-session `WebContents` routing**:`sessionTargets: Map<sessionId, WebContents>` + `safeSend(id, channel, ...args)` variadic helper with `isDestroyed()` guard — 替换 module-level ipcSender,防多窗口串流。

3. **`cleanupSessionLocal(id, exitCode)` idempotent helper**:同步 setExited + IPC `terminal:exit` push + clear timers(killTimer / flushTimer / throttleInterval)+ shellCleanup async catch + mcpRevokers().byToken + instances/sessionTargets cleanup。Idempotent invariant — 多次调直接 return on `!instances.has(id)`。

4. **`forceKill` / `killTimer-grace` sync cleanup BEFORE sm.kill SIGKILL**:这是 P0-1 关键修复 — `SessionManager.kill(SIGKILL)` 立即 `removeSession` + dispose onExit listener,所以 Continuo 必须**在 sm.kill 之前**同步调用 cleanupSessionLocal,否则 Continuo 一侧 cleanup 永不触发。

5. **`createTerminal` PHASE 1 register state BEFORE await sm.create + PHASE 3 catch rollback**:`instances.set / sessionTargets.set / terminalBuffer.ensure / throttleInterval setInterval` 在 PHASE 1,`await sm.create()` 在 PHASE 2,PHASE 3 catch 内回滚所有 PHASE 1 state + shellCleanup + mcpToken revoke。

6. **Baseline `createTerminal` 7-param signature preserved**:`(id, win, shell, args, cwd, env, meta)` — 因为 terminal.ipc.ts 调用方依赖这个签名。

7. **Baseline `makeWindowClosedCleanup` orchestration preserved unchanged**:`terminalSessions.removeByOwner(ownerId) → mcpRevokers().byWindow(ownerId) → service.kill(id) per id`(graceful Ctrl+C+3s)— terminal.ipc.ts 0 改动。

8. **4 new BDD specs in Continuo `src/__tests__/migration-step1-pty-handover/`** cover 4 P0 paths:
   - `multi-window-routing.spec.ts`(P0-2)
   - `force-kill-cleanup.spec.ts`(P0-1)
   - `create-failure-rollback.spec.ts`(P0-3)
   - `window-close-cleanup.spec.ts`(P0-4)
   
   每 spec `beforeEach` 调 `terminalService.__resetForTest()` reset singleton。

### Cross-repo invariants

- **ContinuoTerminal**:0 改动(`packages/server-node` API 在 topic 17/19 已 ready)。Op20 verify `git status --porcelain` empty。
- **Continuo**:single commit `dffc5e0` 含 7 files(+745/-119)— terminal.service.ts 主改 + 5 new BDD files + INDEX.md auto-update。`terminal.ipc.ts` 不动一字(verify-only Op12)。

## Consequences

### Positive

- **Server-node 真正被 Electron 消费**:7-step migration 关键 step done。
- **测试基线维护**:ContinuoTerminal 103 tests 不动;Continuo 2461/2468 tests pass;新 4 BDD spec 永久保护 4 P0 path。
- **Manual override 透明先例**:议题 D.3 plan↔red-team limit 3 reached 后,如果剩余 P0 是 surface-level mechanical fixes(不是 strategic / architectural)— user authorized override path 合法。verify-time 双 verification(automated tests + manual GUI)防 hidden regression。
- **Cross-repo dev-loop 模型成熟**:`EXTERNAL_C:` / `EXTERNAL_CT:` prefix marker + 双 repo commit 边界(本 topic Continuo single + ContinuoTerminal zero)pattern 可复用 Step 2-7。

### Trade-offs / Open items

- **Continuo `terminal.service.ts` 有 module-level singleton state** — 测试需 `__resetForTest()` export(本 topic 加了)。其他模块如需 reset 应跟随相同 pattern。
- **Step 2 才合并 buffer**:本 topic 之后 SessionManager 内 buffer(64KB ring)与 Continuo `terminal-buffer.service.ts`(8000 entries)双 buffer 并存。Step 2 (topic 21+) 才合并。
- **`node-pty` direct dep retained**:Continuo `package.json` 仍 list node-pty 作为 direct dep(transitively via server-node 已用)。删 direct dep 是 follow-up cleanup topic。
- **议题 D.3 escalation 路径**:本 topic plan↔red-team 3 rounds 全 BLOCK,user 在 round 3 后 authorized Option A manual override。这是议题 D.3 limit 3 + manual override 路径的第一次实战使用。未来 dev-loop topics 如类似 escalation,可参考本 ADR 路径(透明 patch document `plan-vN-patches.md` + audit trail preserved + verify 阶段独立 double check)。

### Risks

- **3s graceful kill timing**:AC2-d 测试中 cooperative shell 立即 Ctrl+C 返回。但 stuck/hung shell 路径仅 by code review(plan-v3 + force-kill-cleanup.spec.ts P0-1)+ no real shell hang test。If 后续 Step 2-7 改 buffer/sessions/mcp-tools 时影响 grace path,可能需 reverify。

- **Multi-window cleanup**:AC2-f manual PASS,但 `terminal-window-isolation.spec.ts` baseline + 新 `window-close-cleanup.spec.ts` 覆盖关键路径。Continuo 极端多窗口 race(eg 同时关多 window)未直接 test。

## References

- Migration plan(7 steps):`.claude/dev-loop/16-migration-step0-preflight/` 起始
- Topic 18 audit trail:`.claude/dev-loop/18-migration-step1-continuo-pty-handover/`
- Topic 17(SessionManagerOptions / Kill API):commit `07bccd4`
- Topic 19(SessionManagerCreateInput / onExit):commit `96275e4`
- Topic 18(本 ADR 主体):Continuo commit `dffc5e0`,ContinuoTerminal 0 changes
- Continuo CLAUDE.md(中文 / BDD+TDD / 极简)
- 议题 D.3:plan ↔ red-team limit 3,manual override escalation path
