import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface Token {
  readonly tokenId: string;
  readonly subject: string;
  readonly scope?: string;
  readonly workspaceRoot?: string;
  readonly metadata?: Record<string, string>;
  readonly issuedAt: number;
  readonly expiresAt?: number;
}

export interface IssueInput {
  readonly subject: string;
  readonly scope?: string;
  readonly workspaceRoot?: string;
  readonly metadata?: Record<string, string>;
  /** undefined = default 30min; null = no expiry; > 0 = explicit ms; <= 0 throws. */
  readonly ttlMs?: number | null;
}

export interface IssueResult {
  /**
   * Opaque bearer plaintext (256-bit base64url, 43 chars).
   * Caller injects into agent env (MCP_TOKEN). NOT retained anywhere internally.
   */
  readonly value: string;
  readonly token: Token;
}

interface TokenEntry {
  readonly digest: Buffer; // SHA-256 of plaintext value
  readonly metadata: Token; // read-only public-shape metadata
}

/**
 * Opaque bearer token authority for @continuo-terminal/host.
 *
 * Plaintext token value is NEVER retained internally — only the SHA-256 digest
 * plus read-only metadata are stored. Validate uses crypto.timingSafeEqual for
 * constant-time comparison. Expired entries are pruned actively on each
 * mutation (issue/revoke) and lazily on validate, so long-lived hosts do not
 * leak expired records before A2/A3 wire validation into HTTP/MCP requests.
 *
 * Localhost-first invariant: token issuance + tracking is local in-process;
 * actual HTTP/MCP request authorization is a separate concern that A2/A3
 * mini-topics wire in via server-policy-hooks + host-auth-integration.
 *
 * codex ADR 0005 Q3 invariant: opaque bearer only, not JWT/HMAC/mTLS.
 */
export class TokenStore {
  private readonly entries = new Map<string, TokenEntry>();

  issue(input: IssueInput): IssueResult {
    this.pruneExpired();
    const ttl = this.resolveTtl(input.ttlMs);
    const tokenId = randomUUID();
    const value = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(value).digest();
    const issuedAt = Date.now();
    const expiresAt = ttl === null ? undefined : issuedAt + ttl;
    // Freeze the metadata (and the nested metadata record) before it is both
    // stored and returned. `readonly` is compile-time only — without freezing,
    // the same object reference is shared with the caller, who could mutate
    // `expiresAt` (bypassing TTL), `subject`/`scope` (privilege escalation), or
    // the nested metadata at runtime and corrupt the internal auth state that
    // validate()/pruneExpired() rely on.
    const metadata: Token = Object.freeze({
      tokenId,
      subject: input.subject,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
      ...(input.metadata !== undefined ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
      issuedAt,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    this.entries.set(tokenId, { digest, metadata });
    return { value, token: metadata };
  }

  validate(plainValue: string): Token | null {
    if (typeof plainValue !== 'string' || plainValue.length === 0) return null;
    const candidate = createHash('sha256').update(plainValue).digest();
    const now = Date.now();
    for (const [tokenId, entry] of this.entries) {
      if (entry.metadata.expiresAt !== undefined && entry.metadata.expiresAt < now) {
        this.entries.delete(tokenId);
        continue;
      }
      if (candidate.length !== entry.digest.length) continue;
      if (timingSafeEqual(candidate, entry.digest)) {
        return entry.metadata;
      }
    }
    return null;
  }

  revokeById(tokenId: string): boolean {
    this.pruneExpired();
    return this.entries.delete(tokenId);
  }

  revokeBySubject(subject: string): number {
    this.pruneExpired();
    let count = 0;
    for (const [tokenId, entry] of this.entries) {
      if (entry.metadata.subject === subject) {
        this.entries.delete(tokenId);
        count += 1;
      }
    }
    return count;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [tokenId, entry] of this.entries) {
      if (entry.metadata.expiresAt !== undefined && entry.metadata.expiresAt < now) {
        this.entries.delete(tokenId);
      }
    }
  }

  private resolveTtl(ttlMs: number | null | undefined): number | null {
    if (ttlMs === null) return null;
    if (ttlMs === undefined) return DEFAULT_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive finite number or null (no expiry)');
    }
    return ttlMs;
  }
}
