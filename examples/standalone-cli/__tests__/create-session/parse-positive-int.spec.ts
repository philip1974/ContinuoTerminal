import { InvalidArgumentError } from 'commander';
import { describe, it, expect } from 'vitest';

import { parseNonNegativeInt, parsePositiveInt } from '../../src/parse-args.js';

// Polish (phase 2): shared strict CLI arg parser. --cols/--rows previously used
// Number() + a truthy send guard (abc→NaN, 0 silently dropped → 80x24 fallback);
// --poll-ms used Number.parseInt with no validation (abc/0/-1 → setInterval
// clamps to ~1ms busy-poll). Both now reject non-positive-integers up-front.
describe('parsePositiveInt (shared --cols / --rows / --poll-ms parser)', () => {
  it('accepts positive integers', () => {
    expect(parsePositiveInt('80')).toBe(80);
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('200')).toBe(200);
  });

  it.each(['abc', '0', '1.5', '-5', '', ' ', '10px', 'NaN'])(
    'rejects invalid value %j with InvalidArgumentError',
    (bad) => {
      expect(() => parsePositiveInt(bad)).toThrow(InvalidArgumentError);
    },
  );
});

describe('parseNonNegativeInt (--since-seq)', () => {
  it('accepts non-negative integers including 0', () => {
    expect(parseNonNegativeInt('0')).toBe(0);
    expect(parseNonNegativeInt('1')).toBe(1);
    expect(parseNonNegativeInt('4096')).toBe(4096);
  });

  it.each(['1abc', '1.5', '-5', '', ' ', '999junk', 'abc'])(
    'rejects invalid cursor %j with InvalidArgumentError',
    (bad) => {
      expect(() => parseNonNegativeInt(bad)).toThrow(InvalidArgumentError);
    },
  );
});
