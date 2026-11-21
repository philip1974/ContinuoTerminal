export class HostDisposedError extends Error {
  constructor() {
    super('AgentHost has been disposed');
    this.name = 'HostDisposedError';
  }
}

export class HostAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostAuthConfigError';
  }
}

export class TokenInvalidError extends Error {
  constructor() {
    super('Token is not valid for this host');
    this.name = 'TokenInvalidError';
  }
}
