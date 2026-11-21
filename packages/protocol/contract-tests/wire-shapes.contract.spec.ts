import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { attachTargetSchema } from '@continuo-terminal/protocol';
import fixture from '../../../fixtures/consumer-wire/aiq-create-agent-kind.json' with { type: 'json' };

describe('protocol wire shapes — contract', () => {
  describe('attachTargetSchema discriminated union (protocol-actual export)', () => {
    it('accepts {kind:"active"}', () => {
      expect(attachTargetSchema.safeParse({ kind: 'active' }).success).toBe(true);
    });

    it('accepts {kind:"panel", panelId:"X"}', () => {
      expect(attachTargetSchema.safeParse({ kind: 'panel', panelId: 'X' }).success).toBe(true);
    });

    it('accepts {kind:"window", windowId:1}', () => {
      expect(attachTargetSchema.safeParse({ kind: 'window', windowId: 1 }).success).toBe(true);
    });

    it('rejects unknown discriminator', () => {
      expect(attachTargetSchema.safeParse({ kind: 'foo' }).success).toBe(false);
    });
  });

  describe('AiQ create-agent-kind wire fixture (N4 — ContinuoTerminal-side documentation)', () => {
    const kebabPattern = z.string().regex(new RegExp(fixture.regex_pin));
    const knownGoodValues = fixture.good_values as [string, ...string[]];
    const consumerWireSchema = z.enum(knownGoodValues);

    for (const good of fixture.good_values) {
      it(`accepts good value "${good}"`, () => {
        expect(kebabPattern.safeParse(good).success).toBe(true);
        expect(consumerWireSchema.safeParse(good).success).toBe(true);
      });
    }

    for (const bad of fixture.bad_values_known) {
      it(`rejects known-bad value "${bad.value}" — origin: ${bad.from}`, () => {
        expect(consumerWireSchema.safeParse(bad.value).success).toBe(false);
      });
    }
  });
});
