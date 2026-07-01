import { InvalidArgumentError } from 'commander';

/**
 * Parse a CLI option value as a positive integer, rejecting anything else with
 * commander's InvalidArgumentError so the CLI reports bad input instead of
 * letting it degrade silently. Used for size args (--cols/--rows, matching the
 * protocol createSessionInputSchema constraint) and for --poll-ms, where
 * Number.parseInt('abc')/0/-1 would otherwise flow into setInterval and get
 * clamped to ~1ms (busy polling).
 */
export function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return n;
}

/**
 * Parse a CLI option value as a non-negative integer (allows 0). Used for
 * `--since-seq`, which is a read cursor where 0 is valid. `Number.parseInt`
 * accepted partial input ('1abc'/'1.5' → 1), silently reading from the wrong
 * cursor; reject anything that isn't a clean non-negative integer.
 */
export function parseNonNegativeInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('must be a non-negative integer');
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new InvalidArgumentError('must be a non-negative integer');
  }
  return n;
}
