# ADR 0008 — Contract Testing + Drift Guards(Phase 2 of Proposal 0001)

* **Status**: Accepted(scope locked 2026-05-24)
* **Date**: 2026-05-24
* **Supersedes**: nothing — first contract-testing ADR
* **References**:
  * Proposal 0001 § Phase 2(`docs/proposals/0001-three-way-relationship-perfection-roadmap.md`)
  * ADR 0007(Phase 1 ✓ done;P1 manual UX revealed serde wire mismatch — exactly the kind of drift contract testing 自动 catch)
  * ADR 0006 § 3 invariant(no wholesale replacement;applies)

---

## Context

Proposal 0001 § Phase 2 升级 cross-repo 关系成熟度从 "integration-perfect"(P1 done)→ "contract-perfect"。

**P1 manual UX 暴露的 wire issue** 是契约缺位的直接证据:
- Bug:Rust `serde(rename_all = "lowercase")` 把 `ContinuoTerminal` 序列化为 `"continuoterminal"`,但 frontend 用 `"continuo-terminal"`(kebab-case)
- 影响:AiQ Modal create session 失败,需 P1.6 manual UX 才发现
- 若有 contract test:Rust side 序列化 + frontend deserialize 同 fixture → CI 早 catch

**ContinuoTerminal cross-repo consumer 现状**(post-P1):
- **Continuo** consumes via `@continuo-terminal/server-node` file: dep(electron/main/services/terminal.service.ts:7)
- **AiQ** consumes via sidecar binary spawn(P1 ship — `state/sidecar.rs` + `state/mcp_session.rs` + reqwest MCP client)
- **External X-project** future consumers(undefined — but contract suite makes adoption viable)

**Cross-repo drift surfaces**(每个 silent break 都可能发生):
1. **MCP tool response shape**:eg `terminal.read_output` adds `truncated` field — old AiQ client 解析少字段 OK 但若 type changes 报错
2. **AppError JSON shape**:eg ContinuoTerminal-side error envelope `{ code, message }` contract — Rust enum new variant 破 renderer 反序列化
3. **Tool name namespace**:eg `terminal.send_text` 改名 → 所有 consumers 报 unknown tool
4. **Naming leak**:`packages/server-node/src/` 写出 `windowId` / `panel` / `continuo` 词 → 污染 generic API
5. **Cross-repo version drift**:Continuo / AiQ `package.json` `file:` 指向版本与 ContinuoTerminal `host/server-node` `package.json:version` 不一致 → silently consume stale code

---

## Decision

实施 **4 类自动 guard**:

### 1. Contract testing suite — `packages/*/contract-tests/`

每个 ContinuoTerminal public package(`protocol`, `server-node`, `host`, `react-terminal`)新增 `contract-tests/` directory。Pure TypeScript spec files,assert wire shape:
- MCP tool input/output schema fixture pinning(per-tool;refined by Q&A in /dl-req)
- AppError JSON shape pinning(2-field `{ code, message }` uniform — P1 serde fix 验证 this)
- Tool name namespace pinning(grep packages/*/src/ for `MCP_TOOL_*` constants vs contract-tests/ name list)
- Event payload shape pinning(`pty_output` `{ session_id, data }` etc.)

**Test runner**:vitest with `pnpm test:contract` script at ContinuoTerminal repo root。Each consumer(Continuo / AiQ)CI hook `pnpm test:contract` against installed file: dep。

### 2. Leak guards — `pnpm leak:check`

Repo-root script grep packages/\*/src/(NOT tests/ / examples/)for forbidden words:
- `windowId` / `panel` / `panelId`(Continuo / AiQ multi-window specific)
- `continuo`(case-insensitive;Continuo-product word in server-node generic API is leak)
- `Tauri` / `Electron`(host-specific framework words in server-node)
- `AiQ` / `aiq`(consumer-specific in ContinuoTerminal source)

CI/precommit gate: leak found → fail clear with line context。

### 3. Version drift check — `pnpm version:check`

Repo-root script that:
- Reads ContinuoTerminal `packages/server-node/package.json:version` + `packages/host/package.json:version`
- Scans Continuo `package.json` + AiQ `package.json` for `file:` deps pointing to ContinuoTerminal subpaths
- Warns(not fails — file: model is loose)if downstream consumer references version mismatch the actual file: linked source

Output: actionable list of "consumers that need rebump / refresh" when ContinuoTerminal version bumps。

### 4. CI hooks(Continuo + AiQ)

Both downstream repos run `pnpm test:contract` against their installed file: dep ContinuoTerminal version。In each repo's CI:
- Continuo `.github/workflows/test.yml` adds step:`cd node_modules/@continuo-terminal/server-node && pnpm test:contract`(or equivalent file: dep pointing to local path)
- AiQ same pattern(but AiQ has Rust side too — Rust-side fixture tests for AiQ-consuming MCP wire shape via `cargo test`)

**P1 known limitation also addressed by P2**:
- ContinuoTerminal `terminal.resize` tool addition is **out of P2 scope**(per ADR 0006 §3 — wait for actual consumer demand;P1 fixed-80×24 known limit acceptable for now)
- Protocol `args` / `env` fields on `terminal.create_session` is **out of P2 scope**(shell parity limitation accepted)

### Invariants

1. **既有 ContinuoTerminal source 0 改 by leak guards alone**(scripts/tests as new files;source unchanged unless leak found and explicitly fixed)
2. **Continuo + AiQ CI hooks 不绑 file: schema specifics**(loose contract:if Continuo/AiQ deps switch from file: to npm published in future P4,contract tests still 跑)
3. **Naming consistency**:generic terms(`endpoint` / `session_id` / `scope` / `subject` / `tokenId`)required in `server-node/src/`;product terms(`windowId` / `panel`)forbidden via leak guard
4. **Version drift** is **warning not fail**(file: workspace model intentionally loose;`pnpm version:check` advisory)

### Out of scope

* npm publish wire(P4 territory per Proposal 0001)
* GitHub Actions specific workflow files in ContinuoTerminal repo(local script first;CI integration is per-consumer-repo concern)
* Production-grade contract framework(Pact / openapi-validator) — vitest assertion suffices for P2
* E2E tests(P3 territory — Playwright covers UX e2e)
* AiQ Rust-side fixture tests deeper than the ones added in P1.5(those cover wire shape;P2 might add a few more)

---

## Phase 2 mini-topics(每个独立 dev-loop 6-stage)

| ID | Topic | Scope | Cross-repo? |
|---|---|---|---|
| **P2.1** | ADR 0008 spec | This document | ContinuoTerminal only |
| **P2.2** | dl-req topic 42 | Requirements + Phase D Q&A on contract granularity / leak guard scope / version-check policy | ContinuoTerminal `.claude/42-*/` |
| **P2.3** | dl-plan v1 | Operations list(NEW contract-tests/ dirs + scripts + Continuo/AiQ CI hook designs) | ContinuoTerminal `.claude/` + Continuo + AiQ audit |
| **P2.4** | Codex red-team | Round 1 audit(contract granularity / leak regex completeness / version-check policy semver vs file: dep)| ContinuoTerminal `.claude/` |
| **P2.5** | plan-v2 + execute | Integrate codex findings + actual code writes(ContinuoTerminal contract-tests scripts; Continuo + AiQ CI yaml or equivalent) | **ContinuoTerminal writes(主) + Continuo + AiQ CI 文件 writes** |
| **P2.6** | Verify | `pnpm test:contract` green; `pnpm leak:check` 0 hits; `pnpm version:check` baseline OK; CI observable | Manual + automated |

每个 mini-topic 完成后在本 ADR 下方 "Mini-topic status" 追加 commit hash + 一句话 outcome。

---

## Phase 2 acceptance criteria

P2 全部完成的判定:

* ✓ ContinuoTerminal `packages/*/contract-tests/` directories exist 含 contract specs(per Phase D Q&A 决定的 granularity)
* ✓ `pnpm test:contract` at ContinuoTerminal root runs all contract suites green
* ✓ `pnpm leak:check` at ContinuoTerminal root runs + 0 hits in `packages/*/src/`
* ✓ `pnpm version:check` at ContinuoTerminal root outputs cross-repo file: dep version map(advisory)
* ✓ Continuo CI(若 has)hooks `pnpm test:contract` against installed ContinuoTerminal dep
* ✓ AiQ CI(若 has)hooks `pnpm test:contract` against installed ContinuoTerminal dep
* ✓ Demo:**P1 manual UX-discovered wire bug(serde rename)would have been caught** by appropriate contract test — verified by writing a regression test that fails on the pre-hotfix code shape
* ✓ ADR 0008 mini-topic 表 P2.1-P2.6 全 ✓ Done

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Contract test 写得太严格 → false fail on legitimate additive field add | Med | per Op17 fixture P2-4 pattern:`Value::get()` tolerant additive fields;只 fail required-field-move or type-change |
| `pnpm leak:check` regex too strict catches false positives(eg `Continuo` in docs / readme) | Low | only grep `packages/*/src/`;not docs / readme / examples;refine in P2.3 plan |
| Version drift check noise | Low | warn-not-fail;advisory only |
| Continuo CI may not have package.json scripts setup for cross-repo test | Med | P2.5 execute 内 add scripts;若 Continuo CI 已 mature,leverage existing pattern |
| AiQ Rust-side cargo test 已 cover wire(P1 ship);新增 TS contract test scope 重叠 | Low | TS contract suite covers server-node side;Rust side via cargo test;两边都 cover same wire — double safety,acceptable |

---

## Mini-topic status

| ID | Status | Commit | Outcome note |
|---|---|---|---|
| P2.1 ADR 0008 spec | Done | _this commit_ | Scope + invariants locked;4-guard design |
| P2.2 dl-req topic 42 | Pending | — | — |
| P2.3 dl-plan v1 | Pending | — | — |
| P2.4 Codex red-team | Pending | — | — |
| P2.5 plan-v2 + execute | Pending | — | — |
| P2.6 Verify | Pending | — | — |

---

## Definition of "Phase 2 完成"

Mini-topics P2.1–P2.6 全 done + 此 ADR 顶部 status 切到 `Implemented + Verified` + Proposal 0001 § Phase 2 行表标 `✓ Done`(类比 ADR 0007 Phase 1 close pattern)。

P2 完成后 → trigger P3(UX e2e hardening — Playwright)per Proposal 0001 roadmap。
