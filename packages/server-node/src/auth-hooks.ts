/**
 * Generic auth context propagated from transport-layer authentication into
 * MCP tool-call authorization. Carries no Electron/window/panel specifics -
 * the `subject` / `scope` / `tokenId` / `metadata` shape is intentional per
 * ADR 0005 generic-terms invariant (S7).
 *
 * Host packages own tokens (A1) + wire hooks (A3); server-node only consumes
 * the callable shape - it never validates a token itself.
 */
export interface AuthContext {
  readonly subject: string;
  readonly scope: string;
  readonly tokenId: string;
  readonly metadata?: Record<string, string>;
}

/**
 * Hooks may return sync or async values. Implementations are not forced into
 * Promise-returning shapes when validation is local + synchronous (for
 * example `TokenStore.validate(...)`). Internal call-sites `await` regardless.
 */
type MaybePromise<T> = T | Promise<T>;

/**
 * HTTP layer authenticate hook. Called once per HTTP request before any MCP
 * traffic. Returning `null` makes the server respond with 401.
 *
 * `authorizationHeader` is the raw `Authorization:` header value (for example
 * `'Bearer <token>'`); hook implementation owns parsing. Header is
 * `undefined` if not provided by the client.
 */
export type AuthenticateRequest = (input: {
  readonly authorizationHeader: string | undefined;
  readonly method: string;
  readonly url: string;
}) => MaybePromise<AuthContext | null>;

export type AuthorizationDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason?: string };

/**
 * MCP tool authorize hook. Invoked inside the `tools/call` handler before
 * dispatching to the underlying tool handler - and BEFORE the unknown-tool
 * branch, so authorize can deny unknown tool names without leaking which
 * tools exist.
 *
 * `auth` is `null` when the server is constructed without an authenticate
 * hook upstream (for example stdio CLI direct lib use); HTTP layer enforces
 * authorize + authenticate to ship together via startup config validation.
 */
export type AuthorizeToolCall = (input: {
  readonly auth: AuthContext | null;
  readonly toolName: string;
  readonly arguments: unknown;
}) => MaybePromise<AuthorizationDecision>;
