import { describe, it, expect } from 'vitest';
import { generateId } from '../../../src/utils/id';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns different values on consecutive calls', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it('returns different values across many calls (collision sanity check)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('produces a UUID v4 in the primary path (crypto.randomUUID available in test env)', () => {
    // vitest + happy-dom expose crypto.randomUUID; this asserts the primary
    // path is taken in modern environments.
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // P3-A-L2: when crypto.randomUUID is missing but crypto.getRandomValues
  // is available (older Safari / Node pre-19 fallback world), generateId
  // should produce a 32-char hex string from getRandomValues — NOT a
  // Math.random-based fallback that risks collisions in long sessions.
  it('falls back to crypto.getRandomValues (32-char hex) when crypto.randomUUID is unavailable', () => {
    const originalRandomUUID = (crypto as { randomUUID?: () => string }).randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = generateId();
      // getRandomValues-based fallback: 16 bytes hex-encoded, no dashes.
      expect(id).toMatch(/^[0-9a-f]{32}$/i);
      // Not the Math.random last-resort branch (which would start with 'fallback-').
      expect(id).not.toMatch(/^fallback-/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: originalRandomUUID, configurable: true });
    }
  });
});
