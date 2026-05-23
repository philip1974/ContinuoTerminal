import { randomUUID } from 'node:crypto';

/**
 * PLACEHOLDER ONLY: this in-memory token store is not authentication.
 * It gives demos and future host code a stable shape to pass through env,
 * but it does not protect any transport or authorize any operation.
 */
export class TokenStore {
  private readonly tokens = new Set<string>();

  issue(): string {
    const token = randomUUID();
    this.tokens.add(token);
    return token;
  }

  validate(token: string): boolean {
    return this.tokens.has(token);
  }

  clear(): void {
    this.tokens.clear();
  }
}
