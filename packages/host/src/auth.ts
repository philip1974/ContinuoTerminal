import type { AuthContext, AuthenticateRequest, AuthorizeToolCall } from '@continuo-terminal/server-node';

import type { TokenStore } from './token.js';

export type BootstrapAuthOptions = {
  readonly tokenTtlMs?: number | null;
  /**
   * Advanced escape hatch: replaces default TokenStore validation.
   * Most callers should leave this undefined.
   */
  readonly authenticateRequestOverride?: AuthenticateRequest;
  readonly authorizeToolCall?: AuthorizeToolCall;
};

const BEARER_RE = /^Bearer\s+([A-Za-z0-9_-]+)$/i;

export function defaultAuthenticate(tokens: TokenStore): AuthenticateRequest {
  return ({ authorizationHeader }) => {
    if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
      return null;
    }

    const match = BEARER_RE.exec(authorizationHeader);
    if (!match) {
      return null;
    }
    const plain = match[1];
    if (!plain) {
      return null;
    }

    const token = tokens.validate(plain);
    if (!token) {
      return null;
    }

    const auth: AuthContext = {
      subject: token.subject,
      scope: token.scope ?? 'default',
      tokenId: token.tokenId,
      ...(token.metadata !== undefined ? { metadata: token.metadata } : {}),
    };

    return auth;
  };
}
