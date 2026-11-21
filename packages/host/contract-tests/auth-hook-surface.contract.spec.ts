import { describe, expectTypeOf, it } from 'vitest';
import type {
  AuthContext,
  AuthenticateRequest,
  AuthorizationDecision,
  AuthorizeToolCall,
} from '@continuo-terminal/host';

describe('host auth hook surface — contract', () => {
  it('AuthContext shape', () => {
    const ctx: AuthContext = { subject: 'sub', scope: 'read', tokenId: 't' };
    expectTypeOf(ctx).toMatchTypeOf<AuthContext>();
  });

  it('AuthenticateRequest signature', () => {
    const fn: AuthenticateRequest = async (_req) => ({ subject: 's', scope: 'default', tokenId: 't' });
    expectTypeOf(fn).toMatchTypeOf<AuthenticateRequest>();
  });

  it('AuthorizeToolCall signature', () => {
    const fn: AuthorizeToolCall = async (_input) => ({ allow: true });
    expectTypeOf(fn).toMatchTypeOf<AuthorizeToolCall>();
  });

  it('AuthorizationDecision shape (allow | denied with reason)', () => {
    const ok: AuthorizationDecision = { allow: true };
    const denied: AuthorizationDecision = { allow: false, reason: 'scope' };
    expectTypeOf(ok).toMatchTypeOf<AuthorizationDecision>();
    expectTypeOf(denied).toMatchTypeOf<AuthorizationDecision>();
  });
});
