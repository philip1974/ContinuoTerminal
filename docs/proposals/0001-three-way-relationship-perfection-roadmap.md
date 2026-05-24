# Proposal 0001 — Three-way Relationship Perfection Roadmap

* **Status**: Accepted(2026-05-24 user 确认 roadmap direction + P1 path + calendar)

* **Date**: 2026-05-24

* **User decisions captured**(2026-05-24):
  * Roadmap direction:全 4 phases 接受
  * Phase 1 path:**Additive 双 backend 并存**(Rust portable-pty + ContinuoTerminal sidecar coexist;AiQ user 可 toggle backend);Full-swap 路径 rejected
  * Total calendar:接受 ~4-5 weeks
  * Phase 2 contract granularity + Phase 4 publish 倾向 — defer 至各 phase 内决断

* **Scope**: ContinuoTerminal + Continuo + AiQ 三方关系成熟度提升

* **基础**: ADR 0001-0006 全 ship + ADR 0003 cleanup C1-C6 全 closed + F1 ✓ + manual UX ✓

***

## "完美"的定义

四个 dimension,优先级递减:

1. **Integration-perfect**(高 value):3 方都 ACTUALLY 用对方的 primitive,不只 pattern reference
2. **Contract-perfect**(中 value):cross-repo API contract 自动 verified;drift 自动检测
3. **UX-perfect**(中 value):e2e regression gate + manual paths automated
4. **Distribution-perfect**(低 value):任何外部 consumer 可 npm install 直接 adopt,无 file:workspace coupling

提案目标:**全 phase 1+2+3 落地**,phase 4(distribution)仍 defer 待具体外部 demand。

***

## Phase 1 — AiQ 真 adoption(target 1-2 weeks calendar)

### 目标

* AiQ 真 spawn ContinuoTerminal sidecar(Path A)+ 至少 1 个 working terminal session 通过 ContinuoTerminal driven

* AiQ frontend 用 `@continuo-terminal/react-terminal` `<Terminal>` 组件(可选,scope 决断 phase 1 内)

* P2 战略目标从 "pattern-level achieved" 升级到 "integration-level achieved"

### Deliverables

1. **AiQ Cargo.toml + tauri-plugin-shell** 配置 sidecar binary(per CT-B2 README guide)
2. **AiQ Rust main.rs** spawn server-node + reqwest MCP client(fork from CT-B2 pattern)
3. **AiQ frontend integration**(2 options,phase 1 决断哪个):

   * **A. 保 Rust portable-pty + 加 ContinuoTerminal sidecar 作 secondary path**(AiQ user 可选哪个 backend)

   * **B. Switch AiQ frontend 用 react-terminal** **`<Terminal>`** **+ HttpMCPClientAdapter**(Path A 完整 swap;Rust portable-pty 退役)
4. **AiQ working demo** — user 实操 launch AiQ + create session + run command + verify output
5. **AiQ docs**(`/Users/RiGang/Desktop/AiQ/docs/`)记录 integration decision + rationale

### Scope decision points

* ✓ **Path A frontend swap vs additive sidecar** — RESOLVED 2026-05-24:**additive(双 backend 并存)**;Rust portable-pty 保留;ContinuoTerminal sidecar 作 secondary backend;AiQ user 可 toggle

* Auth wire(A3 bearer)vs M3 no-auth(localhost 简单)— defer 至 P1 plan-v1 决断

* 用 react-terminal 还是 AiQ 既有 xterm.js stack — defer 至 P1 plan-v1 决断(additive path 下倾向保 AiQ xterm.js,只换 backend)

### 风险 + Mitigation

| Risk                                 | Mitigation                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| Tauri 2 sidecar packaging 跨平台 issue  | CT-B2 README guide + 实测;若 break,Phase 1.1 follow-up                                    |
| AiQ frontend swap 破既有 UX             | Option A additive 路径(双 backend coexist;user toggle)                                    |
| ContinuoTerminal API 不够 cover AiQ 用例 | 发现具体 gap 时,**evaluate 是否扩 server-node OR 留 AiQ 内部 adapter**(per ADR 0006 §3 invariant) |

### Estimated calendar

* 实装:3-5 days

* 测试 + UX verify:2-3 days

* Docs + commit:1 day

* **Total**:**\~1.5 weeks**

***

## Phase 2 — Contract testing + drift 防护(target \~1 week)

### 目标

* ContinuoTerminal API 升级**自动**导致 Continuo + AiQ contract spec 跑 + fail clear

* Continuo词 / Electron-specific naming **不可能** leak 进 ContinuoTerminal `packages/*/src/`(grep-based gate)

* Cross-repo dependency drift detection(`file:` version pin)

### Deliverables

1. **`packages/*/contract-tests/`** in ContinuoTerminal(NEW directory)— 抽 each public package 的 contract assertion 到 standalone runnable
2. **Continuo 端 CI hook**:`pnpm test:contract` runs ContinuoTerminal contract suite against installed file: dep version
3. **AiQ 端 CI hook**:same(若 Phase 1 完成则 AiQ 也有 contract)
4. **ContinuoTerminal repo-level** **`pnpm leak:check`** — grep-based 跨 packages/\*/src/ 防 Continuo/window/panel/Tauri/AiQ/Electron 词出现(README OK,sources 严)
5. **Cross-repo** **`pnpm version:check`** — Continuo + AiQ `package.json` file: 指向 与 ContinuoTerminal 版本一致(若 ContinuoTerminal `host/server-node` package.json version bump,downstream consumers 收 reminder)

### Scope rationale

不引 npm publish,仍 file:workspace。但**加 contract 测试 + leak guards 让 drift 不沉默 break**。

### Estimated calendar

* contract suite 抽 design + impl:3 days

* leak guards + version check scripts:1-2 days

* Continuo + AiQ side adoption(若 P1 done):1-2 days

* Docs + commit:1 day

* **Total**:**\~1 week**

***

## Phase 3 — UX e2e hardening(target \~1 week)

### 目标

* Continuo F1 paste-stuck + similar input pipeline regressions 由 Playwright e2e 自动 catch(不依 user 实操 manual verify)

* ContinuoTerminal CT-B3 "复制 MCP 配置" UX byte-pin(already done 3b6f3d1)+ paste behavior coverage

* AiQ(若 P1 done)session output rendering e2e

### Deliverables

1. **Continuo** **`e2e/terminal-input.spec.ts`** — Playwright spec(Electron app launch + xterm paste long string + Enter + verify command executed)
2. **既有 F1 fix** **`0c46735`** **加 e2e 验证**(unit test 14/14 PASS 仅 covers key-mapping 单元;e2e covers UI 端到端)
3. **AiQ e2e**(若 P1 done):terminal session create + send\_text + read\_output 端到端
4. **CT-B3 "复制 MCP 配置" e2e**(可选;current C7 byte-pin 已 cover automated portion;Playwright e2e 是 nice-to-have)
5. **CI integration** — e2e runs on PR + main(不阻 dev,但 gate merge)

### Scope rationale

F1 fix + manual UX 都 closed,但**没 mechanical 防 future paste-stuck regression**。Playwright e2e 是 standard 解。

### Estimated calendar

* Continuo Playwright setup(若 没现成 base config):1 day

* F1 paste-stuck e2e impl:2 days

* AiQ e2e(若 P1 done):2 days

* CI hook + verify:1 day

* **Total**:**\~1 week**

***

## Phase 4 — Distribution decision re-evaluation(target \~3 days)

### 目标

* Re-evaluate ADR 0005 § A5 publish gate **after** Phase 1-3 done(M5 + A4 + new AiQ consumer burn-in,A3 wired,contract tests,e2e)

* Decision:open ADR 0007(actual npm publish)OR explicit re-defer with updated rationale

### Deliverables

1. **ADR 0005 § A5 snapshot 重新评估** — 6 unblockers 各 row 检查 phase 1-3 后状态
2. **Decision doc**:publish 或 defer 各 case 的 trigger conditions
3. **若 publish**:开 ADR 0007 + npm publish workflow

### Estimated calendar

* Re-evaluate gate:1 day

* Decision write-up:1 day

* ADR 0007 spec(若 publish):1 day

* **Total**:**\~3 days**(若 just re-defer)/ **\~1 week**(若 真 publish)

***

## 全 roadmap 总览

| Phase     | Goal                    | Calendar                 | 完成后状态升级                       | Status |
| --------- | ----------------------- | ------------------------ | ----------------------------- | ------ |
| P1        | AiQ real adoption       | \~1.5 weeks              | 三方都真用对方 primitive             | ✓ Done(2026-05-24;ADR 0007;14 AiQ files;cargo test 26 PASS;manual UX AC1-3 PASS;regression S1 held)|
| P2        | Contract + drift guards | \~1 week                 | API 升级 silent break 不可能       | ✓ Done(2026-05-24;ADR 0008;16 files;commit `f8ffe2b`;6 contract specs / 38 tests / 0 hard-forbidden leak hits / 20-entry baseline / advisory version drift;real Rust serde regression 推 AiQ follow-up topic per Strategy α)|
| P3        | UX e2e hardening        | \~1 week                 | 关键 UX path 自动 regression gate | ⏸ Pending |
| P4        | Distribution re-eval    | \~3 days(或 1 week)       | 决断 publish 或 explicit defer   | ⏸ Pending |
| **Total** | <br />                  | **\~4-5 weeks calendar** | <br />                        | **P1 + P2 done(single-session intensive;3 codex red-team rounds per phase 2 — round limit reached + manual_override resolution)** |

***

## "完美"达成判定(post-phase 1-3)

* ✓ Integration-perfect:Continuo + AiQ 都 runtime consume ContinuoTerminal

* ✓ Contract-perfect:cross-repo contract suite + leak guards 自动 catch drift

* ✓ UX-perfect:F1-like regression 由 e2e gate;关键 UX byte-pin 已 codified

* ⏸ Distribution-perfect(phase 4 决断):npm publish 仍 trigger-by-demand;**file: workspace acceptable mature state**

***

## 风险 + open questions

1. **AiQ adoption may reveal API gap**(P1 高风险)— evaluate case-by-case,don't force into server-node primitive without consumer demand pattern(per ADR 0006 §3)
2. **Phase 1 path A vs B 决断**(Rust PTY 退役 vs additive)— user 在 P1 plan 阶段决断
3. **P2 contract suite 设计**:granularity?per-tool 还是 per-package?会推 codex strategic audit 类似 ADR 0006
4. **P3 Playwright Electron setup**:Continuo 既有可能没 Playwright base(check before P3 plan)
5. **Cross-repo CI**:GitHub Actions in 各 repo separately?或 monorepo unified?(out of scope for now,各 repo own CI)

***

## 推进 mechanism

每 phase 是独立 dev-loop topic(标准 6-stage discipline):

* `/dl-req` → `/dl-plan` → red-team → integrate → execute → verify

* Cross-repo phases(P1)用本 session 既有 cross-repo pattern(Continuo + ContinuoTerminal 已 实证)

**Phase 1 是 entry point** — user 确认 roadmap 后 trigger `推进 phase 1` 开 ADR 0007 + P1 dev-loop。

***

## 用户决策点(已 closed 2026-05-24)

| # | 问题 | 决策 |
|---|------|------|
| 1 | Roadmap 整体方向接受? | ✓ 全部 4 phases 接受 |
| 2 | Phase 1 path 偏好? | ✓ **Additive 双 backend 并存**(Rust portable-pty + ContinuoTerminal sidecar coexist) |
| 3 | Phase 2 contract granularity? | Defer 至 phase 2 内决断 |
| 4 | Phase 4 publish 倾向? | Defer 至 phase 4 内决断 |
| 5 | Total calendar 4-5 weeks 接受? | ✓ 接受 |

**Next trigger**:user 输入 `推进 phase 1` 开 ADR 0007 + P1 dev-loop topic(标准 6-stage)。

