import type { BootstrapAuthOptions } from './auth.js';

export type TransportKind = 'stdio-child' | 'http';

export type StdioChildTransportOption = {
  kind: 'stdio-child';
  binPath?: string;
};

export type HttpTransportOption = {
  kind: 'http';
  host?: string;
  port?: number;
};

export type BootstrapOptions = {
  transport: StdioChildTransportOption | HttpTransportOption;
  auth?: BootstrapAuthOptions;
};

export type TransportInfo =
  | {
      kind: 'stdio-child';
      endpoint: string;
    }
  | {
      kind: 'http';
      endpoint: string;
    };

export type CreateAgentEnvInput = {
  subject: string;
  scope?: string;
  workspaceRoot?: string;
  metadata?: Record<string, string>;
};

export type AgentEnv = Record<string, string>;

export interface AgentHost {
  readonly transportInfo: TransportInfo;
  createAgentEnv(input: CreateAgentEnvInput): AgentEnv;
  dispose(): Promise<void>;
}

export type { IssueInput, IssueResult, Token } from './token.js';
export type { BootstrapAuthOptions } from './auth.js';
export type {
  AuthContext,
  AuthenticateRequest,
  AuthorizationDecision,
  AuthorizeToolCall,
} from '@continuo-terminal/server-node';
