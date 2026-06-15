/**
 * P2-8: enforce that `zh.ts` and `en.ts` carry the same set of keys.
 */
import { describe, it, expect } from 'vitest';
import { zh } from '../../../src/i18n/resources/zh';
import { en } from '../../../src/i18n/resources/en';

describe('i18n resource parity', () => {
  it('zh and en expose the exact same set of keys', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('every key/value is a non-empty string', () => {
    for (const [k, v] of Object.entries(zh)) {
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('every key uses the dotted namespace convention', () => {
    const validDomain =
      /^(app|controls|hud|overlays|settings|levels|editor|common)(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
    for (const k of Object.keys(zh)) {
      expect(k, `key "${k}" must match dotted namespace`).toMatch(validDomain);
    }
  });
});