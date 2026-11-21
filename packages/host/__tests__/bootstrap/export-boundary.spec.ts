import { describe, expect, it } from 'vitest';

import { startHttpTransport } from '@continuo-terminal/server-node';

describe('server-node export boundary', () => {
  it('imports startHttpTransport from the public package entry', () => {
    expect(startHttpTransport).toEqual(expect.any(Function));
  });
});
