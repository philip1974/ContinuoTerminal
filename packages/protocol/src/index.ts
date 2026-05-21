// Public entrypoint for @continuo-terminal/protocol.
// Consumers import everything via `from '@continuo-terminal/protocol'`.
// Schemas, types and tool name constants live in ./schemas.ts (semantically
// mirrored from Continuo). Keep this barrel minimal: it should not introduce
// new exports beyond what schemas.ts already defines.

export * from './schemas.js';
