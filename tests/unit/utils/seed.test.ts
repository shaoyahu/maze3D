import { describe, it, expect } from 'vitest';
import {
  encodeSeed,
  decodeSeed,
  fallbackRandomHexSeed,
  fnv1a,
  mulberry32,
  parseHexSeed,
  toHexSeed,
  InvalidSeedError,
} from '../../../src/utils/seed';

describe('fnv1a', () => {
  it('returns 0x811c9dc5 for empty string', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('matches known FNV-1a hash for "a"', () => {
    // FNV-1a 32-bit: "a" = 0xe40c292c
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  it('matches known FNV-1a hash for "foobar"', () => {
    // FNV-1a 32-bit: "foobar" = 0xbf9cf968
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('produces different hashes for different inputs', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });

  it('is deterministic', () => {
    expect(fnv1a('maze3d-seed')).toBe(fnv1a('maze3d-seed'));
  });
});

describe('mulberry32', () => {
  it('returns a function', () => {
    expect(typeof mulberry32(42)).toBe('function');
  });

  it('produces identical sequences for identical seeds', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns numbers in [0, 1)', () => {
    const rng = mulberry32(0xdeadbeef);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('toHexSeed / parseHexSeed', () => {
  it('roundtrips a 64-bit integer', () => {
    const n = 0x0123456789abcdefn;
    const hex = toHexSeed(n);
    expect(hex).toHaveLength(16);
    expect(parseHexSeed(hex)).toBe(n);
  });

  it('pads with leading zeros to 16 chars', () => {
    expect(toHexSeed(1n)).toBe('0000000000000001');
    expect(toHexSeed(0xffn)).toBe('00000000000000ff');
  });

  it('parses valid 16-char hex', () => {
    expect(parseHexSeed('0000000000000001')).toBe(1n);
    expect(parseHexSeed('ffffffffffffffff')).toBe(0xffffffffffffffffn);
  });

  it('throws InvalidSeedError for non-hex input', () => {
    expect(() => parseHexSeed('not-hex!')).toThrow(InvalidSeedError);
    expect(() => parseHexSeed('xyz')).toThrow(InvalidSeedError);
  });

  it('throws InvalidSeedError for wrong length', () => {
    expect(() => parseHexSeed('abc')).toThrow(InvalidSeedError);
    expect(() => parseHexSeed('00000000000000000')).toThrow(InvalidSeedError); // 17 chars
  });
});

describe('encodeSeed / decodeSeed', () => {
  it('roundtrips a seed', () => {
    const seed = {
      algorithm: 'recursive-backtracker' as const,
      size: 30 as const,
      mazeSeed: '0123456789abcdef',
    };
    const id = encodeSeed(seed);
    expect(decodeSeed(id)).toEqual(seed);
  });

  it('encodes all 4 algorithms', () => {
    const algos = ['recursive-backtracker', 'kruskal', 'prim', 'hunt-and-kill'] as const;
    for (const algorithm of algos) {
      const id = encodeSeed({ algorithm, size: 15, mazeSeed: '0000000000000001' });
      expect(id).toMatch(/^algo-v1-(recursive-backtracker|kruskal|prim|hunt-and-kill)-15-[0-9a-f]{16}$/);
    }
  });

  it('encodes all 3 sizes', () => {
    for (const size of [15, 30, 50] as const) {
      const id = encodeSeed({ algorithm: 'kruskal', size, mazeSeed: '0000000000000001' });
      expect(id).toContain(`-${size}-`);
    }
  });

  it('decodes back all 4 algorithms correctly', () => {
    const algos = ['recursive-backtracker', 'kruskal', 'prim', 'hunt-and-kill'] as const;
    for (const algorithm of algos) {
      const id = encodeSeed({ algorithm, size: 50, mazeSeed: 'ffffffffffffffff' });
      expect(decodeSeed(id).algorithm).toBe(algorithm);
    }
  });

  it('throws InvalidSeedError on bad prefix', () => {
    expect(() => decodeSeed('wrong-v1-recursive-backtracker-15-0000000000000001')).toThrow(InvalidSeedError);
  });

  it('throws InvalidSeedError on unknown algorithm', () => {
    expect(() => decodeSeed('algo-v1-unknown-15-0000000000000001')).toThrow(InvalidSeedError);
  });

  it('throws InvalidSeedError on unknown size', () => {
    expect(() => decodeSeed('algo-v1-recursive-backtracker-99-0000000000000001')).toThrow(InvalidSeedError);
  });
});

// ---------------------------------------------------------------------------
// F-D-quality-D-3: deterministic fallback for environments without
// crypto.getRandomValues. The caller passes Date.now() so the function
// stays pure (no system clock inside); the LevelSelect fallback path is
//   crypto.getRandomValues || fallbackRandomHexSeed(Date.now())
// — using mulberry32 seeded by fnv1a(timeMs) gives a 16-hex string that
// is deterministic across browsers (no Math.random()), different per call
// (Date.now() advances), and reproducible for tests via injected timeMs.
// ---------------------------------------------------------------------------
describe('fallbackRandomHexSeed (F-D-quality-D-3)', () => {
  it('returns 16 lowercase hex chars', () => {
    const out = fallbackRandomHexSeed(0);
    expect(out).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same input (no Math.random())', () => {
    // The whole point: same input → same output. If two browsers with no
    // crypto both call fallbackRandomHexSeed at the same ms, they get the
    // same seed string.
    expect(fallbackRandomHexSeed(1_700_000_000_000)).toBe(fallbackRandomHexSeed(1_700_000_000_000));
  });

  it('produces different outputs for different times', () => {
    // Sanity check that time-based seeding actually advances the seed;
    // otherwise the function would always return the same constant.
    expect(fallbackRandomHexSeed(0)).not.toBe(fallbackRandomHexSeed(1));
    expect(fallbackRandomHexSeed(1_700_000_000_000)).not.toBe(fallbackRandomHexSeed(1_700_000_000_001));
  });

  it('emits all 8 bytes in the valid byte range (no overflow)', () => {
    // Hex pairs decode to [0, 256); round-trip via parseHexSeed to assert.
    const out = fallbackRandomHexSeed(42);
    const pairs = out.match(/.{2}/g);
    expect(pairs).not.toBeNull();
    for (const p of pairs!) {
      const n = Number.parseInt(p, 16);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(256);
    }
  });
});
