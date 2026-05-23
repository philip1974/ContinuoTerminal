import {
  SessionManager,
  startHttpTransport,
  type HttpTransportHandle,
} from '@continuo-terminal/server-node';

import { defaultAuthenticate } from './auth.js';
import { composeAgentEnv } from './env-composer.js';
import { HostAuthConfigError, HostDisposedError } from './errors.js';
import { TokenStore } from './token.js';
import { resolveBinPath } from './transports/stdio-child.js';
import type { AgentEnv, AgentHost, BootstrapOptions, CreateAgentEnvInput, TransportInfo } from './types.js';

export class AgentHostImpl implements AgentHost {
  private readonly tokens = new TokenStore();
  private readonly sessions = new SessionManager();
  private readonly opts: BootstrapOptions;
  private disposed = false;
  private httpHandle: HttpTransportHandle | undefined;
  private info: TransportInfo | undefined;

  constructor(opts: BootstrapOptions) {
    this.opts = opts;
  }

  get transportInfo(): TransportInfo {
    if (!this.info) throw new Error('AgentHost has not been initialized');
    return this.info;
  }

  async initialize(): Promise<void> {
    if (this.opts.transport.kind === 'stdio-child') {
      if (this.opts.auth) {
        throw new HostAuthConfigError(
          '@continuo-terminal/host: auth options are only valid with HTTP transport; stdio-child uses parent process trust boundary. See ADR 0005 §A3.',
        );
      }

      const binPath = resolveBinPath(this.opts.transport.binPath);
      this.info = { kind: 'stdio-child', endpoint: binPath };
      return;
    }

    const host = this.opts.transport.host ?? '127.0.0.1';
    const port = this.opts.transport.port ?? 0;
    const authenticateRequest =
      this.opts.auth?.authenticateRequestOverride ?? (this.opts.auth ? defaultAuthenticate(this.tokens) : undefined);
    this.httpHandle = await startHttpTransport({
      sessions: this.sessions,
      host,
      port,
      ...(authenticateRequest ? { authenticateRequest } : {}),
      ...(this.opts.auth?.authorizeToolCall ? { authorizeToolCall: this.opts.auth.authorizeToolCall } : {}),
    });
    this.info = {
      kind: 'http',
      endpoint: `http://${this.httpHandle.address}:${this.httpHandle.port}/mcp`,
    };
  }

  createAgentEnv(input: CreateAgentEnvInput): AgentEnv {
    if (this.disposed) throw new HostDisposedError();
    const issued = this.tokens.issue({
      subject: input.subject,
      scope: input.scope,
      workspaceRoot: input.workspaceRoot,
      metadata: input.metadata,
      ...(this.opts.auth && 'tokenTtlMs' in this.opts.auth ? { ttlMs: this.opts.auth.tokenTtlMs } : {}),
    });
    return composeAgentEnv({
      ...input,
      transportInfo: this.transportInfo,
      token: issued.value,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    try {
      await this.httpHandle?.shutdown();
    } finally {
      try {
        await this.sessions.dispose();
      } finally {
        this.tokens.clear();
      }
    }
  }
}
