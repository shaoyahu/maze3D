import { describe, it, expect } from 'vitest';
import { encodeSeed, encodeSeedV2, decodeSeed } from '../../../src/utils/seed';
import { parseGameSearchParams, buildGameSearchParams } from '../../../src/utils/gameUrl';

describe('P3-1c workstream 2 manual sanity', () => {
  it('LevelSelect → URL round-trip: algo-v2-recursive-backtracker-15-3-...', () => {
    const hex = '0123456789abcdef';
    const size = 15 as const;
    const algo = 'recursive-backtracker' as const;
    const levels = 3 as const;

    // Simulate LevelSelect composition.
    const id = encodeSeedV2({ algorithm: algo, size, mazeSeed: hex }, levels);
    expect(id).toBe('algo-v2-recursive-backtracker-15-3-0123456789abcdef');

    // Decode back to a Seed (the v2 branch).
    const decoded = decodeSeed(id);
    expect(decoded.levelCount).toBe(3);
    expect(decoded.algorithm).toBe(algo);
    expect(decoded.size).toBe(size);

    // URL deep-link parses as procedural maze (no bad-seed).
    const parsed = parseGameSearchParams(new URLSearchParams(`?seed=${id}`));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.id).toBe(id);
      expect(parsed.parsed.options.seed?.levelCount).toBe(3);
    }

    // Build + re-parse round-trips the level count.
    const built = buildGameSearchParams(id, { mode: 'reach-exit' });
    const reparsed = parseGameSearchParams(built);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.parsed.id).toBe(id);
      expect(reparsed.parsed.options.seed?.levelCount).toBe(3);
      expect(reparsed.parsed.options.mode).toBe('reach-exit');
    }
  });

  it('v1 seed URL still parses (back-compat)', () => {
    const hex = '0123456789abcdef';
    const v1Id = encodeSeed({ algorithm: 'recursive-backtracker', size: 30, mazeSeed: hex });
    expect(v1Id).toBe('algo-v1-recursive-backtracker-30-0123456789abcdef');
    const parsed = parseGameSearchParams(new URLSearchParams(`?seed=${v1Id}`));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.id).toBe(v1Id);
      expect(parsed.parsed.options.seed?.levelCount).toBeUndefined();
    }
  });

  it('tamper: ?seed=algo-v3-… → bad-seed', () => {
    const tamper = parseGameSearchParams(
      new URLSearchParams('?seed=algo-v3-recursive-backtracker-30-0123456789abcdef'),
    );
    expect(tamper.ok).toBe(false);
    if (!tamper.ok) expect(tamper.error).toBe('bad-seed');
  });
});
