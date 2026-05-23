export class HostDisposedError extends Error {
  constructor() {
    super('AgentHost has been disposed');
    this.name = 'HostDisposedError';
  }
}

export class TokenInvalidError extends Error {
  constructor() {
    super('Token is not valid for this host');
    this.name = 'TokenInvalidError';
  }
}
