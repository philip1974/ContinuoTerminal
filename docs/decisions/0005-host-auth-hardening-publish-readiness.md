# 0005: Host auth hardening and publish-readiness gate

- **Status**: Accepted
- **Date**: 2026-05-23
- **Builds on**: ADR 0004(agent-host-abstraction-lift phase complete:M1+M5+M3+M2+M4+M4b)
- **Phase**: **NEW** — host-auth-hardening-and-publish-readiness(NOT "publish now"— publish itself deferred to future ADR 0006)
- **Strategic basis**: ADR 0004 ship 5 mini-topics + M4b;`@continuo-terminal/host` 仍 `@experimental` + `private:true` + token "NOT AUTH" placeholder。M2 token = opaque `randomUUID()` in-memory Set,无 cryptographic guarantee。D3 publish gate 仍 closed(M5 = 1 non-Electron consumer,缺 2nd + auth not real)
- **Advisor**: codex(独立第二意见,verdict `GO-WITH-CHANGES`,session `term-fb2c5dd2`,2026-05-23 advisory)

## Context

ADR 0004 phase **完整 ship**:
- ContinuoTerminal `packages/server-node` 加 bin + StreamableHTTP transport
- ContinuoTerminal `packages/host` 新 package(`bootstrapAgentHost` / `AgentHost` / token store / env composer)
- `examples/minimal-agent-host/` non-Electron demo(M5,Option C launcher)
- Continuo Electron 通过 adapter 适配(M4 + M4b physical dep)

**关键 gaps**(per M2 README + M4 advisory + M4b 报告):
1. Token = `randomUUID()` placeholder,**no cryptographic validation**(`@experimental` warning 醒目)
2. **Auth policy hook 缺**(server-node MCP request 不验 token / tool call 不 authorize)
3. **TLS 缺**(M3 HTTP localhost-first;production-ready 不入 ADR 0005)
4. **D3 publish gate 仍 closed**:M5 = 1 non-Electron consumer,缺 2nd
5. `@continuo-terminal/{server-node,host}` 仍 `private:true` + `@experimental`

User 战略目标(ADR 0004 Strategic basis):future X 项目用 host package 实现 agent-controls-agent。但 placeholder token + missing auth + 单一 demo consumer 不足以 publish credible。

## Decision

**采纳 codex advisory verdict `GO-WITH-CHANGES`**:启动新 phase **host-auth-hardening-and-publish-readiness**(NOT "publish now")。Goal = **make the current private experimental packages credible publish candidates,not publish them prematurely**。

**Phase scope(per codex Q1 modified C)**:

**Include**:
- Real local **bearer-token authority**(opaque token + SHA-256 hash + constant-time compare)替代 M2 placeholder semantics
- Generic **auth + policy hooks**(2 layers:HTTP authenticate + MCP tool authorize)
- 2nd non-Electron consumer(`examples/standalone-cli-host/`)
- **Publish-readiness audit**(package metadata + LICENSE + README + dry-run + gate tracker)

**Exclude(deferred to future ADR 0006/0007)**:
- **TLS**(self-signed cert UX 易扩散为 phase 主体,defer 直到 user-provided cert path 需求出现)
- **Actual npm publish**(ADR 0006 — only if all gates satisfied + no API churn remaining)

### 关键设计 invariants(codex 建议)

#### 1. Token scheme — opaque bearer,not JWT/HMAC/mTLS

```typescript
// Recommended shape:
const tokenValue = crypto.randomBytes(32).toString('base64url');  // 256-bit entropy
const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
// Store only hash internally; constant-time compare on validate
```

- Storage:**hashed material only**(SHA-256 digest);clear-text never persists
- Compare:**constant-time**(`crypto.timingSafeEqual`)
- Metadata:`{ subject, scope, workspaceRoot?, metadata?, issuedAt, expiresAt? }`
- Revocation:by token id / subject / all
- **Why not JWT**:validation is local in-process — stateless signing adds complexity without benefit
- **Why not mTLS**:overkill for localhost
- **Why not HMAC signed tokens**:only useful for stateless multi-process validation;ContinuoTerminal currently single-process

#### 2. Auth/policy hooks — 2 layers,generic types

```typescript
type AuthContext = {
  subject: string;
  scope: string;
  tokenId: string;
  metadata?: Record<string, string>;
};

type AuthenticateRequest = (input: {
  authorizationHeader?: string;
  method: string;
  url: string;
}) => Promise<AuthContext | null>;

type AuthorizeToolCall = (input: {
  auth: AuthContext;
  toolName: string;
  arguments: unknown;
}) => Promise<{ allow: true } | { allow: false; reason?: string }>;
```

- **HTTP layer**:authenticate request → AuthContext
- **MCP/tool layer**:authorize operation → allow/deny
- **server-node should NOT issue tokens**;it accepts hooks
- **host owns token authority**

#### 3. 2nd non-Electron consumer — `examples/standalone-cli-host/`

**Why standalone-cli-host(per codex Q6)**:
- Validates real host package consumption(workspace file: dep + bootstrap + agent spawn)
- Exercises auth env + HTTP transport without VS Code packaging complexity
- Close to future `@continuo-terminal/cli`(但 NOT prematurely create that package)
- Can accumulate 3+ meaningful commits quickly

**Rejected alternatives**:
- `vscode-extension-host`:高 strategic value 但 too much host-specific surface 易扭曲 API(defer to future)
- `web-demo`:browser + local auth + CORS misleading constraints

#### 4. Publish gate codification(not unlock)

ADR 0005 **codifies + tracks** gate,not promises publish:
- **M5 must reach 3 meaningful commits OR 2 weeks exercised**(currently 1 commit)
- **New 2nd consumer same requirement**
- **Auth/policy hardening complete**(A1-A3 ship)
- **`pnpm pack --dry-run` / `npm publish --dry-run` clean**(package metadata + LICENSE + files)
- **`private:true` removal + versioning plan reviewed**

**Actual `private:true → public` + npm publish 是 ADR 0006**(unless ADR 0005 中所有 gates 已满足 + no API churn remaining)

## Roadmap — 5 mini-topics(per codex Q2)

| # | Mini-topic | Content | Time |
|---|---|---|---|
| **A1** | `token-authority` | Replace M2 placeholder with opaque scoped bearer tokens in host(crypto.randomBytes + SHA-256 hash + timingSafeEqual + expiresAt + revocation by token-id/subject/all)| 2-3 days |
| **A2** | `server-policy-hooks` | Add HTTP auth + MCP tool policy hooks in server-node(generic types per § "Auth/policy hooks");server-node consumes hooks injected by host | 3-5 days |
| **A3** | `host-auth-integration` | Wire host HTTP transport to token validation;host issues real tokens + injects to agent env + validates incoming HTTP MCP requests via A2 hooks | 3-5 days |
| **A4** | `second-consumer` | New `examples/standalone-cli-host/` consuming `@continuo-terminal/host`(real bootstrap + auth + agent spawn);exercise APIs 3+ commits worth | ~1 week |
| **A5** | `publish-readiness` | Package metadata audit + LICENSE + README polish + files allow-list + `pnpm pack --dry-run` + gate tracker(M5 + A4 commit counts + auth-complete + dry-run clean)| 3-5 days |

**Total estimate**:**2.5-4 weeks implementation**(or **4-6 weeks calendar** if "2-week exercised" path used instead of "3+ commits" per consumer)

### Strict dependency 顺序

A1 → A2 → A3 → A4 → A5(no skipping;A2 needs A1 token shape;A3 wires A1+A2;A4 exercises A3 ship;A5 audits after A4 done)

A1 ships real opaque bearer authority replacing M2 placeholder UUID Set.
Plaintext token value uses `crypto.randomBytes(32)` base64url (256-bit,
43 chars);storage is SHA-256 digest only (plaintext never retained);
validate uses `crypto.timingSafeEqual` constant-time;default 30min TTL
with active pruning on issue/revoke + lazy on validate;`ttlMs: null`
supports no-expiry local demos;revocation by tokenId/subject/clear.
Public `AgentHost.createAgentEnv` shape unchanged (S1). **A1 token
authority — HTTP/MCP request enforcement pending A2/A3.** Next:A2
server-policy-hooks.

A2 ships generic 2-layer auth policy hook shape per codex Q2 design.
`AuthenticateRequest` (HTTP layer) + `AuthorizeToolCall` (MCP tools) are
both optional + sync/async via `MaybePromise<T>`. 401 uses JSON-RPC
envelope + `WWW-Authenticate: Bearer`. `authorizeToolCall` runs before the
unknown-tool check (oracle-leak guard). HTTP layer startup config
validation: `authorizeToolCall` must pair with `authenticateRequest`
(no-silent-bypass) — lib direct use allows `auth: null` caller-owned.
server-node remains independent of `@continuo-terminal/host` (S3).
Next:A3 host-auth-integration wires `bootstrapAgentHost.auth` options into
these hooks.

A3 ships host-side auth integration wiring A1 token authority into A2
server-node hooks through `bootstrapAgentHost({ auth })`. HTTP hosts opt in
to request enforcement; `auth` undefined preserves the M3 unauthenticated
local HTTP path. `defaultAuthenticate` parses strict bearer headers,
validates through `TokenStore.validate`, and maps token metadata to generic
`AuthContext`. `authenticateRequestOverride` is an advanced escape hatch
that replaces default validation. `stdio-child` plus `auth` fails fast with
`HostAuthConfigError` because that transport keeps the parent-process trust
boundary. TLS and multi-host signing remain future ADR scope.

## Deliverable Template(post-ADR 0005)

```typescript
const host = await bootstrapAgentHost({
  transport: { kind: 'http', host: '127.0.0.1', port: 0 },
  auth: {
    tokenTtlMs: 30 * 60 * 1000,  // 30min default
    authorizeToolCall: async ({ auth, toolName }) => {
      if (toolName === 'terminal.create_session' && auth.scope !== 'trusted') {
        return { allow: false, reason: 'scope denied' };
      }
      return { allow: true };
    },
  },
});

const env = host.createAgentEnv({
  subject: 'cli-agent',
  scope: 'trusted',
  workspaceRoot: process.cwd(),
});

spawn('agent-binary', [], { env: { ...process.env, ...env } });
// Agent reads MCP_URL + MCP_TOKEN; HTTP requests carry Authorization: Bearer <token>;
// host validates, derives AuthContext, applies authorizeToolCall policy.
```

## Consequences

### Positive

- **Credible publish candidate**:opaque bearer + policy hooks 让 `@continuo-terminal/host` 从 placeholder 升 production-ready 雏形
- **API lock-in 风险 mitigated**:2nd consumer(A4)验证 API surface;publish gate codified
- **Generic terms invariant 保留**:auth/policy hooks 用 `subject` / `scope` / `metadata`(无 Electron 词);server-node 不知 token authority(host owns)
- **TLS defer 防 scope creep**:cert UX 易扩散为 phase 主体;defer 到 ADR 0006/0007 if needed
- **codex independent advisory ROI**:全 9 Q answer + scope shape + mini-topics breakdown + template + risks 直接 inform plan

### Trade-offs / Open items

- **2.5-4 周 implementation + 2-week burn-in**:不是 quick win;但 publish credibility 必须
- **No real TLS**:localhost-only continues;production multi-host scenario waits for ADR 0006/0007
- **No npm publish in ADR 0005**:`private:true` 仍 hold 到 ADR 0006(gate 满足后)
- **standalone-cli-host 不是 `@continuo-terminal/cli` package**:codex 强建议 NOT prematurely 创建 cli package;后续 if pattern 稳定再 promote

### Risks(per codex Q8)

1. **Auth API lock-in**:exposing the wrong token/policy shape will be expensive after publish → mitigated by A2 generic types review + A4 consumer exercise before A5 audit
2. **Tool policy ambiguity**:request-level auth alone does not answer "may this subject call terminal.create_session?" → A2 双层 hooks 设计明确分 authenticate vs authorize
3. **Consumer mismatch**:一 demo may not reveal real host needs → standalone-cli-host 选择(per Q6)balance ROI
4. **TLS scope creep**:cert UX can dominate phase → explicit defer(deliberate 排除)
5. **Publishing source-only TS packages**:npm consumers must tolerate TS source + tsx runtime;A5 audit 评估 是否 ship dist + bin OR keep source-only(可能触发 build step decision)
6. **Breaking changes after `private:false`**:current API is `@experimental` — A4 consumer exercise 必须 prove stable before A5/ADR 0006
7. **False security**:localhost + bearer is better than placeholder,**but not a remote-production security story**(TLS + multi-tenant + scope policy 才完整)— A1-A3 仍 ship **localhost-first invariant**(S8 ADR 0004 carry forward)

## References

- ADR 0001:Step 1 PTY handover + cross-repo invariants
- ADR 0002:Step 2 buffer merge + empty-snapshot semantics
- ADR 0003:7-step migration core-done retrospective + C1-C6 cleanup roadmap
- ADR 0004:agent-host-abstraction-lift roadmap(M1-M5 + M4b complete)
- Codex advisory(2026-05-23 session `term-fb2c5dd2`):9 Q answers + scope shape + mini-topics breakdown + template + 7 risks list

## Roadmap tracking

| Mini-topic | Status | Topic ID | Commits |
|---|---|---|---|
| A1 token-authority | **done** | topic 28 | 99c8e3d (2026-05-23, opaque bearer + SHA-256 + timingSafeEqual + active prune + ttlMs nullable + revocation) |
| A2 server-policy-hooks | **done** | topic 29 | 031509c (2026-05-23, 2-layer hooks: authenticate + authorize + MaybePromise + HTTP no-silent-bypass + oracle-leak guard) |
| A3 host-auth-integration | **done** | topic 30 | de4546a (2026-05-23, host auth option wires TokenStore default authenticate + policy hook + stdio auth config guard) |
| A4 second-consumer(standalone-cli-host)| not started | — | — |
| A5 publish-readiness | not started | — | — |

ADR will be updated to reflect each mini-topic's commit hash + verdict as they complete. Future **ADR 0006** will cover actual npm publish 若 gate 满足 + no API churn。Future **ADR 0007**(or merge with 0006)may cover TLS / production multi-host story if user demand arises.
