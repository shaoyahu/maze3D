import { describe, it, expect } from 'vitest';
import {
  encodeSeed,
  encodeSeedV2,
  encodeSeedV3,
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

  // P3-1: v1 ids must continue to decode (levelCount stays
  // undefined so the engine back-compat path in
  // AlgorithmMazeProvider.load collapses it to 1).
  it('decodes a v1 id without populating levelCount (back-compat contract)', () => {
    const seed = {
      algorithm: 'recursive-backtracker' as const,
      size: 30 as const,
      mazeSeed: '0123456789abcdef',
    };
    const id = encodeSeed(seed);
    const decoded = decodeSeed(id);
    expect(decoded).toEqual(seed);
    expect(decoded.levelCount).toBeUndefined();
  });

  // F-A-architecture-LOW-3: boundary round-trip. The existing
  // "roundtrips a seed" test only exercises size=30 + algorithm=rb +
  // a single seed. encode/decode carry algorithm / size / mazeSeed
  // through a regex, so the boundary values (size=15/50, the
  // remaining 3 algorithms, and hex edge values 0000…0001 /
  // ffff…ffff / 8000…0000) are exactly the cases most likely to
  // regress in a future refactor. Cover all 4 algorithms × 3 sizes
  // × 4 edge seeds = 48 combos × 2 (id-charset and decoded
  // equality) assertions. Pure loop, no async, no fs.
  it('round-trips every algorithm × size × boundary seed (A-L3)', () => {
    const algos = ['recursive-backtracker', 'kruskal', 'prim', 'hunt-and-kill'] as const;
    const sizes = [15, 30, 50] as const;
    const edgeSeeds = [
      '0000000000000000',
      '0000000000000001',
      '8000000000000000',
      'ffffffffffffffff',
    ];
    for (const algorithm of algos) {
      for (const size of sizes) {
        for (const mazeSeed of edgeSeeds) {
          const seed = { algorithm, size, mazeSeed };
          const id = encodeSeed(seed);
          // Pinned wire format: must be parseable by the SEED_RE.
          expect(id).toMatch(/^algo-v1-[a-z-]+-(15|30|50)-[0-9a-f]{16}$/);
          expect(decodeSeed(id)).toEqual(seed);
        }
      }
    }
  });

  // P3-1: v2 codec. The format is `algo-v2-{algorithm}-{size}-{levels}-{hex}`.
  // encodeSeedV2 always emits v2; decodeSeed accepts both v1 and v2
  // by trying v2 first (the v1 regex would otherwise greedily match
  // the leading segments of a v2 id). levelCount=1 is a legal v2
  // value but decodes back to the same single-layer semantics as v1.
  describe('v2 multi-level seed (P3-1)', () => {
    it('encodeSeedV2 emits the documented v2 wire format', () => {
      const id = encodeSeedV2(
        { algorithm: 'recursive-backtracker', size: 30, mazeSeed: '0123456789abcdef' },
        2,
      );
      expect(id).toBe('algo-v2-recursive-backtracker-30-2-0123456789abcdef');
    });

    it('encodeSeedV2 round-trips every levelCount in 1..6', () => {
      for (const levelCount of [1, 2, 3, 4, 5, 6] as const) {
        const id = encodeSeedV2(
          { algorithm: 'kruskal', size: 15, mazeSeed: '0000000000000001' },
          levelCount,
        );
        expect(id).toMatch(/^algo-v2-kruskal-15-[1-6]-[0-9a-f]{16}$/);
        const decoded = decodeSeed(id);
        expect(decoded.levelCount).toBe(levelCount);
        expect(decoded.algorithm).toBe('kruskal');
        expect(decoded.size).toBe(15);
        expect(decoded.mazeSeed).toBe('0000000000000001');
      }
    });

    it('decodeSeed routes a v2 id through the v2 branch (levelCount populated)', () => {
      const id = 'algo-v2-recursive-backtracker-30-3-fedcba9876543210';
      const decoded = decodeSeed(id);
      expect(decoded).toEqual({
        algorithm: 'recursive-backtracker',
        size: 30,
        mazeSeed: 'fedcba9876543210',
        levelCount: 3,
      });
    });

    it('decodeSeed keeps the v1 prefix and continues to decode v1 ids', () => {
      // Regression: the v1 path must still work after the v2
      // branch landed. The P2-21 back-compat contract requires
      // every existing v1 id (in best records + URLs) to keep
      // decoding.
      const v1 = 'algo-v1-recursive-backtracker-30-0123456789abcdef';
      const decoded = decodeSeed(v1);
      expect(decoded.algorithm).toBe('recursive-backtracker');
      expect(decoded.size).toBe(30);
      expect(decoded.mazeSeed).toBe('0123456789abcdef');
      expect(decoded.levelCount).toBeUndefined();
    });

    it('encodeSeed still emits v1 even when the input seed carries levelCount', () => {
      // P3-1 back-compat: encodeSeed is the v1 codec. Renaming
      // the prefix to algo-v2- would break every existing best
      // record, so the function deliberately stays on v1
      // regardless of `seed.levelCount`. v2 callers must use
      // encodeSeedV2 explicitly — see the comment on encodeSeed
      // in src/utils/seed.ts for the rationale.
      const id = encodeSeed({
        algorithm: 'kruskal',
        size: 15,
        mazeSeed: '0000000000000001',
        levelCount: 2,
      });
      expect(id).toBe('algo-v1-kruskal-15-0000000000000001');
    });

    it.each([0, 7, 99, -1, 1.5, 'abc'])(
      'decodeSeed rejects v2 with out-of-range levelCount %s',
      (bad) => {
        const id = `algo-v2-recursive-backtracker-30-${bad}-0123456789abcdef`;
        expect(() => decodeSeed(id)).toThrow(InvalidSeedError);
      },
    );

    it('decodeSeed rejects v2 with an unknown algorithm', () => {
      expect(() =>
        decodeSeed('algo-v2-unknown-algorithm-30-2-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
    });

    it('decodeSeed rejects v2 with an unsupported size', () => {
      expect(() =>
        decodeSeed('algo-v2-recursive-backtracker-99-2-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
    });

    it('decodeSeed rejects v2 with a malformed hex mazeSeed', () => {
      expect(() =>
        decodeSeed('algo-v2-recursive-backtracker-30-2-not-hex-aaaaaa'),
      ).toThrow(InvalidSeedError);
    });

    it('decodeSeed rejects a v2 id with too few / too many segments', () => {
      // Five segments instead of v2's expected six (algo-v2-alg-size-levels-hex).
      expect(() =>
        decodeSeed('algo-v2-recursive-backtracker-30-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
      // And a v1 id with an extra junk segment.
      expect(() =>
        decodeSeed('algo-v1-recursive-backtracker-30-2-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
    });
  });

  // P4: v3 codec for 3D voxel mazes. The wire format is
  //   algo-v3-{algorithm}-{size}-{hex}
  // where `algorithm` is one of the 3D-prefixed literals
  // (currently only `3d-recursive-backtracker`) and `size` is
  // one of {5, 7, 9}. v3 ids don't carry `levelCount` — a
  // 3D cube is by definition a single voxel mass, never a
  // stack of layers. `decodeSeed` tries the v3 regex first
  // (most specific 3-segment pattern), then v2, then v1.
  describe('v3 3D voxel seed (P4)', () => {
    it('encodeSeedV3 emits the documented v3 wire format', () => {
      const id = encodeSeedV3(
        { algorithm: '3d-recursive-backtracker', size: 7, mazeSeed: '0123456789abcdef' },
        7,
      );
      expect(id).toBe('algo-v3-3d-recursive-backtracker-7-0123456789abcdef');
    });

    it('encodeSeedV3 round-trips every 3D size in {5, 7, 9}', () => {
      for (const size of [5, 7, 9] as const) {
        const id = encodeSeedV3(
          { algorithm: '3d-recursive-backtracker', size, mazeSeed: '0000000000000001' },
          size,
        );
        expect(id).toMatch(/^algo-v3-3d-recursive-backtracker-(5|7|9)-[0-9a-f]{16}$/);
        const decoded = decodeSeed(id);
        expect(decoded.algorithm).toBe('3d-recursive-backtracker');
        expect(decoded.size).toBe(size);
        expect(decoded.mazeSeed).toBe('0000000000000001');
        expect(decoded.levelCount).toBeUndefined();
      }
    });

    // P4b-Prim: 3D Prim codec round-trip. Same wire format
    // as P4a RB (`algo-v3-{algorithm}-{size}-{hex}`); the
    // only delta is the algorithm literal. The whitelist
    // (`VALID_3D_ALGORITHMS`) auto-accepts any `3d-`
    // prefixed literal, so adding a new 3D algorithm to
    // the registry is a one-line change in `seed.ts` + a
    // sibling dispatch case in
    // `AlgorithmMazeProvider.load3D` (no codec changes
    // needed).
    it('P4b-Prim: encodeSeedV3 round-trips a 3d-prim id', () => {
      const id = encodeSeedV3(
        { algorithm: '3d-prim', size: 7, mazeSeed: '0123456789abcdef' },
        7,
      );
      expect(id).toBe('algo-v3-3d-prim-7-0123456789abcdef');
      const decoded = decodeSeed(id);
      expect(decoded.algorithm).toBe('3d-prim');
      expect(decoded.size).toBe(7);
      expect(decoded.mazeSeed).toBe('0123456789abcdef');
      expect(decoded.levelCount).toBeUndefined();
    });

    it('decodeSeed routes a v3 id through the v3 branch (algorithm + 3D size)', () => {
      const id = 'algo-v3-3d-recursive-backtracker-9-fedcba9876543210';
      const decoded = decodeSeed(id);
      expect(decoded).toEqual({
        algorithm: '3d-recursive-backtracker',
        size: 9,
        mazeSeed: 'fedcba9876543210',
        // v3 has no levelCount slot — the renderer picks the 3D
        // path off `walls3D` presence, not levelCount.
      });
    });

    it('decodeSeed rejects v3 with a non-3D algorithm (only 3d- prefix is valid)', () => {
      // A v3 id carrying a 2D algorithm name (e.g. 'recursive-backtracker')
      // must be rejected because the v3 whitelist only accepts the 3d-
      // prefixed literals. The v1/v2 regexes wouldn't match a v3 id
      // (different prefix), so the v3 branch is the only failure surface.
      expect(() =>
        decodeSeed('algo-v3-recursive-backtracker-7-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
    });

    it.each([0, 1, 3, 4, 6, 8, 10, 11, 15, 50, -1, 1.5, '4', null])(
      'decodeSeed rejects v3 with out-of-range size %s',
      (bad) => {
        // String template coerces the size to a string; the codec
        // regex's (\d+) accepts the digits and the whitelist check
        // rejects the resulting integer. NaN / null / -1 / 1.5
        // either fall through the regex or coerce to a disallowed
        // number; the test exercises both shapes. `5`, `7`, `9`
        // are the only valid sizes so we exclude them.
        const id = `algo-v3-3d-recursive-backtracker-${bad}-0123456789abcdef`;
        expect(() => decodeSeed(id)).toThrow(InvalidSeedError);
      },
    );

    it('decodeSeed rejects v3 with a malformed hex mazeSeed', () => {
      expect(() =>
        decodeSeed('algo-v3-3d-recursive-backtracker-7-not-hex-aaaaaa'),
      ).toThrow(InvalidSeedError);
    });

    it('decodeSeed rejects a v3 id with extra junk segments', () => {
      // 6 segments instead of v3's expected 4 (algo-v3-alg-size-hex).
      expect(() =>
        decodeSeed('algo-v3-3d-recursive-backtracker-7-2-0123456789abcdef'),
      ).toThrow(InvalidSeedError);
    });
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
