# ADR 0009 — UX e2e Hardening(Phase 3 of Proposal 0001)

* **Status**: BLOCKED on Continuo baseline e2e environmental issue(2026-05-24;executor attempt failed — entire Continuo `pnpm e2e` suite times out at `electron.launch` setup,既有 `terminal-panel.spec.ts` + `smoke.spec.ts` 全 broken pre-existing;P3 cannot ship F1 regression gate until Continuo baseline e2e infrastructure is fixed)
* **Date**: 2026-05-24
* **Supersedes**: nothing — first UX e2e ADR
* **References**:
  * Proposal 0001 § Phase 3(`docs/proposals/0001-three-way-relationship-perfection-roadmap.md`)
  * ADR 0007(Phase 1 ✓ done;P1 manual UX 暴露 serde wire bug)
  * ADR 0008(Phase 2 ✓ done;commit `f8ffe2b`;contract layer guards drift)
  * Continuo F1 fix `0c46735`(paste-stuck single-shot contract — BDD only,no e2e gate)
  * ADR 0003 C7(CT-B3 "复制 MCP 配置" byte-pin — mechanical regression gate done;e2e nice-to-have)

---

## Context

Proposal 0001 § Phase 3 升级 cross-repo 关系成熟度从 "contract-perfect"(P2 done)→ "UX-perfect"。

**Phase 2 落地的 contract layer 不覆盖什么**:
- Wire shape / API contract / version drift — 全 P2 4-guard 覆盖
- 但 **UX behavior**(用户实际操作时 input pipeline / terminal rendering / paste sequence)**仅靠 manual verify** — P1 manual UX 已实证此 gap(serde wire bug + Continuo F1 paste-stuck 都是 manual UX 发现)

**Phase 3 e2e 必要性的直接证据**:
- Continuo F1 paste-stuck(commit `0c46735`)— **关键 input pipeline regression**,fix 后**仅 BDD reproducer 覆盖,无 Playwright e2e gate**。若 future regress,manual catch only。
- ADR 0008 P2 contract suite **不能 catch UX regression**:contract test 测 wire schema,不模拟用户实际 paste 序列 / xterm 渲染 / 焦点切换。
- AiQ P1 manual UX 实测发现 serde rename bug + visual column distortion(80×24 vs xterm ~200 cols)— **无 UX e2e** 自动 catch 这类。

**当前 3 仓 e2e 基础**(post-P2):
- **Continuo**:**Playwright base ready** ✓(`playwright.config.ts` / `tests/e2e/` / `e2e`+`test:smoke` scripts / Playwright 1.59.1 / tsconfig.e2e.json)— **prime e2e target**
- **AiQ**:**0 test infra**(无 unit/integration/e2e;Tauri 2 e2e tooling 需决断 — `tauri-driver` 或 simplified IPC-level)
- **ContinuoTerminal**:无 GUI;CT-B3 复制 MCP 配置 ADR 0003 C7 byte-pin done(mechanical regression gate),Playwright e2e nice-to-have only

**Phase 3 UX regression surface**(具体可 catch 类型):
1. **Input pipeline regressions**(Continuo F1 paste-stuck 类)— xterm keydown/onData/paste sequence race
2. **Cross-frame focus switching**(panel split + cmd+\ 类)— focus transfer 应 deterministic
3. **Paste mode bracketed sequence completeness**(`\x1b[200~...\x1b[201~`)— shell 不应 stuck-in-paste-mode
4. **AiQ session output rendering**(Tauri pty_output → xterm render)— stream + chunk delivery
5. **CT-B3 复制 MCP 配置 UX**(ContinuoTerminal config copy)— optional;C7 已 cover automated

---

## Decision

实施 **3-target Phase 3 e2e gate**(优先级递减):

### Target 1 — Continuo Playwright e2e(primary)

Continuo `tests/e2e/` 新增 specs:
- **`terminal-input.spec.ts`**(关键 F1 regression gate):Playwright launch Electron + open terminal panel + paste long string with bracketed paste sequence + Enter + verify command executed + verify zsh not stuck in paste mode + verify panel still responsive(input-not-dead)
- **`terminal-shift-enter.spec.ts`**(单 shot contract):Shift+Enter 触发后 paste 进入 → 必须 paste 内容 verbatim 通过,不被 stale pending 劫持(0c46735 root cause regression)
- **`smoke.spec.ts` augmentation**(若 existing):launch + first terminal panel render check

**Why Continuo prime target**:
- F1 fix `0c46735` 当前**仅 unit/BDD 覆盖**;e2e gate 是 standard 解
- Playwright Electron base 已 ready(无 setup overhead)
- F1 类 input pipeline regression 是 manual UX 发现的高频 surface

### Target 2 — AiQ Tauri 2 e2e(secondary;tooling 决断在 plan-v1)

AiQ `tests/e2e/`(NEW;greenfield):
- **`session-create.spec.ts`**:launch AiQ + open Modal + select ContinuoTerminal kind + verify session created + verify pty_output streams
- **`session-output.spec.ts`**:create session + send command + verify rendered output(端到端 — sidecar spawn + MCP HTTP + Tauri event)

**Tooling 选项**(plan-v1 决断):
- **α**:`tauri-driver` + webdriver(Tauri 官方 e2e tool — Edge WebView2/WebKitGTK driver)— 完整 GUI 模拟但 setup heavy
- **β**:**IPC-level e2e**(spawn Tauri binary headless + 直接调 Tauri commands + assert)— 简化但跳 GUI 渲染层
- **γ**:Defer P3 — AiQ application 仅 alpha 用户(P1 ship is single-user demo),P3 仅完成 Continuo + ContinuoTerminal,AiQ e2e 推 P4 territory

### Target 3 — ContinuoTerminal CT-B3 复制 MCP 配置(optional)

- ADR 0003 C7 byte-pin 已 mechanical cover automated portion
- Playwright e2e nice-to-have **若 Continuo 仍含 CT-B3 surface**(确认 Continuo settings UI 含 ContinuoTerminal config copy button)
- **Default decision**:**out of P3 scope**(C7 covered;P3 calendar 1 week 优先 F1 regression)

### Strategy decision matrix

| 维度 | Strategy α(选定) | Strategy β(rejected) |
|---|---|---|
| Continuo F1 e2e | **In scope**(primary)| same |
| AiQ Tauri e2e | **Deferred to P3 plan-v1 decision**(α/β/γ 三选一) | required all 3 |
| ContinuoTerminal CT-B3 e2e | **out of scope**(C7 byte-pin 已 cover) | required |
| Calendar | ~1 week(Continuo focus) | ~2-3 weeks(三仓全 e2e) |
| Risk surface | Continuo Playwright(已 ready)| + AiQ tauri-driver greenfield + ContinuoTerminal CT-B3 setup |

**选 α 理由**:
- Continuo F1 是最高 ROI:Playwright base ready + 单一 regression gate target
- AiQ e2e tooling 是 strategic decision(α tauri-driver / β IPC-level / γ defer)— 留给 plan-v1 + codex red-team 严审
- C7 已 cover ContinuoTerminal 自动 gate;P3 calendar 限内不必加

### Invariants

1. **Continuo F1 regression gate**:`tests/e2e/terminal-input.spec.ts` 必须复现 0c46735 fix 修复前的 paste-stuck bug shape(即把代码 git revert 0c46735 后 spec MUST fail)— P3 motivation 实证
2. **No application code 改动**:P3 仅加 e2e specs;Continuo / AiQ application src 0 改(类比 P2 S1)
3. **既有 e2e suite 不退化**(Continuo `tests/e2e/smoke.spec.ts` 仍 PASS)
4. **CI integration deferred**(per Strategy α — scripts ready,downstream CI yaml 加 step 是 owner decision;类比 P2 N5)
5. **AiQ tooling 决断锁在 plan-v1**(α/β/γ 之一);不 retroactive 改

### Out of scope

* **AiQ Tauri 2 production-grade e2e framework**(`tauri-driver` 完整 setup)— 若 plan-v1 决 α 才 in scope;β/γ rejects
* **Continuo PR-blocking CI hook**(workflow yaml writes)— Strategy α 不触 .github/workflows
* **ContinuoTerminal `pnpm test:e2e` script**(no GUI surface — P3 不 add ContinuoTerminal scripts)
* **Visual regression testing**(screenshot diff)— P4 territory
* **Load / performance e2e**(stress paste 10MB 类)— P4 territory
* **Multi-user / multi-window e2e**(Continuo multi-window pattern test)— deferred

---

## Phase 3 mini-topics(每个独立 dev-loop 6-stage)

| ID | Topic | Scope | Cross-repo? |
|---|---|---|---|
| **P3.1** | ADR 0009 spec | This document | ContinuoTerminal only |
| **P3.2** | dl-req topic 43 | Requirements + Phase D Q&A on(a)F1 e2e granularity (b)AiQ tooling α/β/γ (c)smoke spec augmentation | ContinuoTerminal `.claude/43-*/` |
| **P3.3** | dl-plan v1 | Operations list(Continuo e2e specs + AiQ tooling decision + CI hook design)| ContinuoTerminal `.claude/` + Continuo audit |
| **P3.4** | Codex red-team | Round 1 audit(F1 reproducer 完整性 / AiQ tooling viability / CI hook design)| ContinuoTerminal `.claude/` |
| **P3.5** | plan-v2 + execute | Integrate codex + actual e2e spec writes(Continuo tests/e2e/* writes;AiQ `tests/e2e/*` writes 若 plan-v1 决非 γ)| **Continuo 主 + AiQ 若 in scope** |
| **P3.6** | Verify | `pnpm e2e` green;regression demo(revert 0c46735 → spec fails);CI observable | Manual + automated |

每个 mini-topic 完成后在本 ADR 下方 "Mini-topic status" 追加 commit hash + 一句话 outcome。

---

## Phase 3 acceptance criteria

P3 全部完成的判定:

* ✓ Continuo `tests/e2e/terminal-input.spec.ts` 存在 + paste-stuck regression scenario covered
* ✓ Continuo `pnpm e2e` runs green(`tests/e2e/*` 全 PASS)
* ✓ **F1 regression gate motivation 实证**:checkout previous commit before `0c46735` → run `pnpm e2e tests/e2e/terminal-input.spec.ts` → spec FAILS(证 e2e 真覆盖此 bug shape)
* ✓ AiQ e2e(若 plan-v1 决 α 或 β):session-create + session-output specs 跑通
* ✓ 既有 Continuo `tests/e2e/smoke.spec.ts` 不退化
* ✓ ADR 0009 mini-topic 表 P3.1-P3.6 全 ✓ Done

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Continuo Playwright Electron launch flaky on CI | Med | retries config + serial mode for terminal specs;reuse existing `playwright.config.ts` pattern |
| F1 paste-stuck repro 需 timing-sensitive paste sequence | High | spec 写时多 retry attempts;若仍 flaky,降级 BDD-only;codex red-team 必审 timing 设计 |
| AiQ tauri-driver setup 跨 macOS/Linux 差异(WebKitGTK vs WKWebView) | Med | plan-v1 决断 α/β/γ 时考虑 platform support;若 α 选只 macOS sub-scope |
| AiQ tooling α(tauri-driver)greenfield setup overhead | High | β(IPC-level)是 backup;γ(defer)是 safety net |
| Playwright spec 改动可能 leak Continuo 词 to ContinuoTerminal | Low | spec 不在 ContinuoTerminal 仓 — 写在各自 repo;P2 leak-check 不 grep tests/ 路径 |
| F1 regression demo(git revert 0c46735)若 confilict 当前 main 状态 | Low | demo 用 git stash + temp branch;non-destructive |

---

## Mini-topic status

| ID | Status | Commit | Outcome note |
|---|---|---|---|
| P3.1 ADR 0009 spec | Done | `6ce63c9` | Scope + invariants locked;3-target design + Strategy α |
| P3.2 dl-req topic 43 | Done | (`.claude/` gitignored) | autonomous_mode req with 3 AC + 5 Safeguards + 7 Norms + 6 Unknowns |
| P3.3 dl-plan v1/v2/v3 | Done | (`.claude/` gitignored) | 3 plan rounds (Scenario A 自然 race → BLOCK → Scenario B deterministic hook → BLOCK → all P0+P1+P2 integrated final → REVISE→plan-v3) |
| P3.4 Codex red-team v1/v2 | Done | (terminal session) | R1 BLOCK 4 P0+3 P1+4 P2(自然 race 不 deterministic,clipboard 不可靠,build 缺失,worktree destructive)→ R2 REVISE 0 P0+4 P1+4 P2 all operational |
| P3.5 plan-v3 execute | **BLOCKED** | (rolled back) | **Continuo baseline e2e environmental issue**:全 Continuo `pnpm e2e` suite times out at `electron.launch` setup (verified existing `terminal-panel.spec.ts` + `smoke.spec.ts` 都 fail with my changes stashed);P3 spec设计正确但无法 verify;changes rolled back |
| P3.6 Verify | **Pending follow-up** | — | Requires Continuo baseline e2e fix follow-up topic;then re-execute plan-v3 |

---

## Definition of "Phase 3 完成"

Mini-topics P3.1–P3.6 全 done + 此 ADR 顶部 status 切到 `Implemented + Verified` + Proposal 0001 § Phase 3 行表标 `✓ Done`(类比 ADR 0007 / 0008 close pattern)。

P3 完成后 → trigger P4(Distribution decision re-evaluation)per Proposal 0001 roadmap。
