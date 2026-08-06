import { describe, it, expect } from 'vitest';
import {
  createEmptyParchment,
  recordVisit,
  maybeRecordDamage,
  openMap,
  closeMap,
  toggleMap,
  resetMap,
  getAllVisitedCells,
  hasVisitedAnyLevel,
  DAMAGE_TRIGGER_PROBABILITY,
  DAMAGE_RADIUS_MIN,
  DAMAGE_RADIUS_MAX,
  DAMAGE_TYPES,
  type ParchmentState,
} from '../../../src/engine/ParchmentState';

// F-2026-06-30: P2-16 — exhaustive coverage of the pure-function
// ParchmentState module. The prng is always stubbed so each branch
// is pinned to a known draw sequence. When a test needs the engine
// to follow a specific path (e.g. "the probability gate fails"),
// it hands in a prng that returns 0.0 (always below the threshold)
// or 0.99 (always above). When a test needs a specific radius /
// type, it builds a 3-element stub: [triggerRoll, radiusRoll, typeRoll].
//
// P3-1: per-level bookkeeping. `recordVisit` and `maybeRecordDamage`
// now take a `level` argument; the visited-cell map is
// `Map<level, Set<cell>>` and damage regions carry a `level` field.
// For levelCount=1 (the only level currently exercised by the
// engine), every test passes `level: 0` and the per-level map
// collapses to a single-entry structure that mirrors the pre-P3-1
// behavior.

// F-2026-06-30: stub a deterministic prng from a fixed sequence.
// When the sequence runs out, the stub loops back to the start
// — most tests use a 3-element sequence (one draw per internal
// prng call inside `maybeRecordDamage`).
function stubPrng(seq: number[]): () => number {
  let i = 0;
  return () => {
    const v = seq[i % seq.length] ?? 0;
    i += 1;
    return v;
  };
}

describe('ParchmentState — factory', () => {
  it('createEmptyParchment returns a fresh empty state', () => {
    const s = createEmptyParchment();
    expect(s.visitedCells.size).toBe(0);
    expect(s.damageRegions).toEqual([]);
    expect(s.isOpen).toBe(false);
  });

  it('createEmptyParchment returns a NEW map each call (no shared refs)', () => {
    const a = createEmptyParchment();
    const b = createEmptyParchment();
    expect(a.visitedCells).not.toBe(b.visitedCells);
  });
});

describe('ParchmentState — recordVisit (P2-16, P3-1 per-level)', () => {
  it('adds a new cell to the level-0 visited set', () => {
    const s0 = createEmptyParchment();
    const s1 = recordVisit(s0, 0, 3, 5);
    expect(s1.visitedCells.get(0)?.has('3,5')).toBe(true);
    expect(s1.visitedCells.size).toBe(1);
  });

  it('returns the SAME reference when the cell was already visited on the same level', () => {
    // F-2026-06-30: critical — referential equality is what lets the
    // engine's bridge skip a re-render when the player stands still.
    const s0 = createEmptyParchment();
    const s1 = recordVisit(s0, 0, 3, 5);
    const s2 = recordVisit(s1, 0, 3, 5);
    expect(s2).toBe(s1);
  });

  it('records multiple distinct cells across calls on the same level', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 0, 0);
    s = recordVisit(s, 0, 1, 0);
    s = recordVisit(s, 0, 2, 0);
    expect(s.visitedCells.get(0)?.size).toBe(3);
    expect(s.visitedCells.get(0)?.has('0,0')).toBe(true);
    expect(s.visitedCells.get(0)?.has('1,0')).toBe(true);
    expect(s.visitedCells.get(0)?.has('2,0')).toBe(true);
  });

  it('does not mutate the input state', () => {
    const s0 = createEmptyParchment();
    const s1 = recordVisit(s0, 0, 1, 1);
    expect(s0.visitedCells.size).toBe(0);
    expect(s1.visitedCells.size).toBe(1);
    expect(s0).not.toBe(s1);
  });

  // P3-1: per-level visit bookkeeping. A visit to (3, 5) on L0
  // does NOT count as a visit to (3, 5) on L1; the per-level
  // subsets are independent.
  it('treats a cell visit on a different layer as a fresh cell (P3-1)', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 3, 5);
    s = recordVisit(s, 1, 3, 5);
    expect(s.visitedCells.size).toBe(2);
    expect(s.visitedCells.get(0)?.has('3,5')).toBe(true);
    expect(s.visitedCells.get(1)?.has('3,5')).toBe(true);
  });

  it('returns the SAME reference when the cell is already visited on the matching level (P3-1)', () => {
    // A visit to (3, 5) on L0 then a duplicate visit on L0 must
    // short-circuit. The same (3, 5) visited on L1 is independent.
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 3, 5);
    const sL0 = recordVisit(s, 0, 3, 5);
    expect(sL0).toBe(s); // same-level duplicate → same ref
    const sL1 = recordVisit(s, 1, 3, 5);
    expect(sL1).not.toBe(s); // cross-level → new ref
  });

  it('preserves other-level subsets across a per-level write', () => {
    // P3-1: copy-on-write for both the per-level Set and the
    // outer Map. The unchanged level subsets are shared with
    // the previous state.
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 0, 0);
    s = recordVisit(s, 1, 0, 0);
    const l0Before = s.visitedCells.get(0);
    const s2 = recordVisit(s, 0, 1, 0);
    // L0 was written — new ref. L1 must be reference-equal to
    // the previous L1 (the unchanged subset is reused).
    expect(s2.visitedCells.get(0)).not.toBe(l0Before);
    expect(s2.visitedCells.get(1)).toBe(s.visitedCells.get(1));
  });
});

describe('ParchmentState — maybeRecordDamage (probability gate)', () => {
  it('skips damage when the first prng draw is >= 0.5', () => {
    const s0 = createEmptyParchment();
    // Sequence: [0.99, ...] — first draw fails the probability gate.
    const s1 = maybeRecordDamage(s0, 0, 0, 0, 100, stubPrng([0.99]));
    expect(s1).toBe(s0);
    expect(s1.damageRegions).toHaveLength(0);
  });

  it('creates a damage region when the first prng draw is < 0.5', () => {
    const s0 = createEmptyParchment();
    // Sequence: [0.1, 0.0, 0.0] — trigger succeeds, radius = 1, type[0] = 'water'.
    const s1 = maybeRecordDamage(s0, 0, 4, 2, 100, stubPrng([0.1, 0.0, 0.0]));
    expect(s1.damageRegions).toHaveLength(1);
    const r = s1.damageRegions[0]!;
    expect(r.cx).toBe(4);
    expect(r.cz).toBe(2);
    expect(r.radius).toBe(1);
    expect(r.type).toBe('water');
    expect(r.createdAtTick).toBe(100);
    expect(r.level).toBe(0);
  });

  it('does not mutate the input state on a successful record', () => {
    const s0 = createEmptyParchment();
    const s1 = maybeRecordDamage(s0, 0, 0, 0, 0, stubPrng([0.0, 0.0, 0.0]));
    expect(s0.damageRegions).toHaveLength(0);
    expect(s1.damageRegions).toHaveLength(1);
  });
});

describe('ParchmentState — maybeRecordDamage (radius sampling)', () => {
  it('radius is in [DAMAGE_RADIUS_MIN, DAMAGE_RADIUS_MAX]', () => {
    // F-2026-06-30: exhaustive coverage of the 2-radius window
    // (DAMAGE_RADIUS_MIN=1, MAX=2). Each test pins a different
    // radius-roll to confirm the floor formula matches the doc.
    const cases: Array<[number, number]> = [
      [0.0, 1], // floor(0.0 * 2) = 0 → 1
      [0.4, 1], // floor(0.4 * 2) = 0 → 1
      [0.5, 2], // floor(0.5 * 2) = 1 → 2
      [0.99, 2], // floor(0.99 * 2) = 1 → 2
    ];
    for (const [roll, expected] of cases) {
      const s = maybeRecordDamage(
        createEmptyParchment(),
        0,
        0,
        0,
        0,
        stubPrng([0.0, roll, 0.0]),
      );
      expect(s.damageRegions[0]?.radius).toBe(expected);
    }
  });

  it(`DAMAGE_RADIUS_MIN (${DAMAGE_RADIUS_MIN}) and DAMAGE_RADIUS_MAX (${DAMAGE_RADIUS_MAX}) stay in sync`, () => {
    // F-2026-06-30: regression guard for the constant values themselves.
    expect(DAMAGE_RADIUS_MIN).toBe(1);
    expect(DAMAGE_RADIUS_MAX).toBe(2);
  });
});

describe('ParchmentState — maybeRecordDamage (type sampling)', () => {
  it('each of the 3 documented types can be sampled', () => {
    // Index → type mapping via `Math.floor(typeRoll * 3)`:
    //   typeRoll in [0, 0.333..) → 0 → 'water'
    //   typeRoll in [0.333.., 0.666..) → 1 → 'burn'
    //   typeRoll in [0.666.., 1)      → 2 → 'tear'
    const expected: Array<[number, 'water' | 'burn' | 'tear']> = [
      [0.0, 'water'],
      [0.33, 'water'],
      [0.34, 'burn'],
      [0.66, 'burn'],
      [0.67, 'tear'],
      [0.99, 'tear'],
    ];
    for (const [roll, type] of expected) {
      const s = maybeRecordDamage(
        createEmptyParchment(),
        0,
        0,
        0,
        0,
        stubPrng([0.0, 0.0, roll]),
      );
      expect(s.damageRegions[0]?.type).toBe(type);
    }
  });

  it('DAMAGE_TYPES contains the 3 documented types in order', () => {
    expect(DAMAGE_TYPES).toEqual(['water', 'burn', 'tear']);
  });
});

describe('ParchmentState — maybeRecordDamage (no-stack rule)', () => {
  it('does NOT add a second damage region on a cell that already has one (same level)', () => {
    // Pin the trigger-roll to 0.0 so the function would otherwise
    // record a region — the no-stack rule is the only thing that
    // can short-circuit it.
    const s0 = createEmptyParchment();
    const s1 = maybeRecordDamage(s0, 0, 2, 2, 0, stubPrng([0.0, 0.0, 0.0]));
    expect(s1.damageRegions).toHaveLength(1);
    const s2 = maybeRecordDamage(s1, 0, 2, 2, 1, stubPrng([0.0, 0.0, 0.0]));
    expect(s2).toBe(s1);
    expect(s2.damageRegions).toHaveLength(1);
  });

  it('adds a damage region on a DIFFERENT cell even if another is saturated', () => {
    const s0 = createEmptyParchment();
    const s1 = maybeRecordDamage(s0, 0, 0, 0, 0, stubPrng([0.0, 0.0, 0.0]));
    const s2 = maybeRecordDamage(s1, 0, 5, 5, 1, stubPrng([0.0, 0.0, 0.0]));
    expect(s2.damageRegions).toHaveLength(2);
    expect(s2.damageRegions[0]?.cx).toBe(0);
    expect(s2.damageRegions[1]?.cx).toBe(5);
  });

  // P3-1: no-stack is per-level. A region on L0 at (2, 2) does
  // NOT block a new region on L1 at the same (2, 2) — the layers
  // are independent 2D planes (spec §3 decision 2).
  it('does not stack across layers (P3-1): a region on L0 does not block L1 at the same cell', () => {
    const s0 = createEmptyParchment();
    const s1 = maybeRecordDamage(s0, 0, 2, 2, 0, stubPrng([0.0, 0.0, 0.0]));
    expect(s1.damageRegions).toHaveLength(1);
    expect(s1.damageRegions[0]?.level).toBe(0);
    const s2 = maybeRecordDamage(s1, 1, 2, 2, 1, stubPrng([0.0, 0.0, 0.0]));
    expect(s2.damageRegions).toHaveLength(2);
    expect(s2.damageRegions[1]?.level).toBe(1);
    expect(s2.damageRegions[1]?.cx).toBe(2);
    expect(s2.damageRegions[1]?.cz).toBe(2);
  });
});

describe('ParchmentState — damage region metadata', () => {
  it('records the engine tick at the moment of damage', () => {
    const s = maybeRecordDamage(
      createEmptyParchment(),
      0,
      0,
      0,
      12345,
      stubPrng([0.0, 0.0, 0.0]),
    );
    expect(s.damageRegions[0]?.createdAtTick).toBe(12345);
  });

  it('records a non-negative integer seed (stable for re-renders)', () => {
    const s = maybeRecordDamage(
      createEmptyParchment(),
      0,
      0,
      0,
      0,
      stubPrng([0.0, 0.0, 0.0]),
    );
    const seed = s.damageRegions[0]?.seed ?? -1;
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(seed)).toBe(true);
  });

  it('records the level on the damage region (P3-1)', () => {
    const s = maybeRecordDamage(
      createEmptyParchment(),
      3,
      0,
      0,
      0,
      stubPrng([0.0, 0.0, 0.0]),
    );
    expect(s.damageRegions[0]?.level).toBe(3);
  });
});

describe('ParchmentState — open / close / toggle', () => {
  it('openMap flips isOpen from false to true', () => {
    const s0 = createEmptyParchment();
    const s1 = openMap(s0);
    expect(s1.isOpen).toBe(true);
    expect(s1).not.toBe(s0);
  });

  it('openMap returns the SAME reference when already open', () => {
    const s0 = createEmptyParchment();
    const s1 = openMap(s0);
    const s2 = openMap(s1);
    expect(s2).toBe(s1);
  });

  it('closeMap flips isOpen from true to false', () => {
    const s0 = openMap(createEmptyParchment());
    const s1 = closeMap(s0);
    expect(s1.isOpen).toBe(false);
  });

  it('closeMap returns the SAME reference when already closed', () => {
    const s0 = createEmptyParchment();
    const s1 = closeMap(s0);
    expect(s1).toBe(s0);
  });

  it('toggleMap alternates isOpen on each call', () => {
    const s0 = createEmptyParchment();
    const s1 = toggleMap(s0);
    expect(s1.isOpen).toBe(true);
    const s2 = toggleMap(s1);
    expect(s2.isOpen).toBe(false);
  });
});

describe('ParchmentState — resetMap', () => {
  it('clears visitedCells + damageRegions but preserves isOpen', () => {
    let s: ParchmentState = openMap(createEmptyParchment());
    s = recordVisit(s, 0, 0, 0);
    s = recordVisit(s, 0, 1, 0);
    s = maybeRecordDamage(s, 0, 0, 0, 0, stubPrng([0.0, 0.0, 0.0]));
    expect(s.visitedCells.size).toBeGreaterThan(0);
    expect(s.damageRegions.length).toBeGreaterThan(0);
    expect(s.isOpen).toBe(true);

    const r = resetMap(s);
    expect(r.visitedCells.size).toBe(0);
    expect(r.damageRegions).toEqual([]);
    expect(r.isOpen).toBe(true);
  });

  it('returns the SAME reference when there is nothing to clear', () => {
    const s0 = createEmptyParchment();
    const s1 = resetMap(s0);
    expect(s1).toBe(s0);
  });

  // P3-1: resetMap drops every per-level entry, not just the
  // level-0 one. A parchment with visits on L0 and L1 ends up
  // with an empty map after the reset.
  it('drops every per-level entry (P3-1)', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 0, 0);
    s = recordVisit(s, 1, 0, 0);
    s = recordVisit(s, 2, 0, 0);
    expect(s.visitedCells.size).toBe(3);
    const r = resetMap(s);
    expect(r.visitedCells.size).toBe(0);
  });
});

describe('ParchmentState — constants', () => {
  it('DAMAGE_TRIGGER_PROBABILITY is the spec-pinned 0.5', () => {
    expect(DAMAGE_TRIGGER_PROBABILITY).toBe(0.5);
  });
});

// P2-18: forceType parameter in maybeRecordDamage
describe('ParchmentState — maybeRecordDamage (forceType) (P2-18)', () => {
  it('uses the forced type instead of random sampling', () => {
    const s0 = createEmptyParchment();
    // Stub prng: first draw < 0.5 (pass probability gate),
    // second draw for radius. We only need 2 draws because
    // forceType skips the third (type) draw.
    const prng = stubPrng([0.1, 0.5]);
    const s1 = maybeRecordDamage(s0, 0, 5, 5, 0, prng, 'burn');
    expect(s1.damageRegions).toHaveLength(1);
    expect(s1.damageRegions[0]?.type).toBe('burn');
  });

  it('uses water as forced type', () => {
    const s0 = createEmptyParchment();
    const prng = stubPrng([0.1, 0.5]);
    const s1 = maybeRecordDamage(s0, 0, 3, 7, 0, prng, 'water');
    expect(s1.damageRegions).toHaveLength(1);
    expect(s1.damageRegions[0]?.type).toBe('water');
  });

  it('still respects the probability gate even with forceType', () => {
    const s0 = createEmptyParchment();
    // First draw >= 0.5 → gate fails → no damage recorded
    const prng = stubPrng([0.99]);
    const s1 = maybeRecordDamage(s0, 0, 5, 5, 0, prng, 'burn');
    expect(s1.damageRegions).toHaveLength(0);
    expect(s1).toBe(s0);
  });

  it('still respects the no-stack rule with forceType', () => {
    const s0 = createEmptyParchment();
    const prng1 = stubPrng([0.1, 0.5]);
    const s1 = maybeRecordDamage(s0, 0, 5, 5, 0, prng1, 'burn');
    expect(s1.damageRegions).toHaveLength(1);
    // Second call on the same cell → no-stack → same reference
    const prng2 = stubPrng([0.1, 0.5]);
    const s2 = maybeRecordDamage(s1, 0, 5, 5, 0, prng2, 'water');
    expect(s2).toBe(s1);
    expect(s2.damageRegions).toHaveLength(1);
  });
});

// P3-1: cross-layer helpers. These are the public surface the
// ParchmentMap UI component uses to render a single canvas
// that flattens every layer's visited cells.
describe('ParchmentState — getAllVisitedCells / hasVisitedAnyLevel (P3-1)', () => {
  it('getAllVisitedCells flattens every per-level subset', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 0, 0);
    s = recordVisit(s, 0, 1, 0);
    s = recordVisit(s, 1, 2, 2);
    const flat = getAllVisitedCells(s);
    expect(flat.size).toBe(3);
    expect(flat.has('0,0')).toBe(true);
    expect(flat.has('1,0')).toBe(true);
    expect(flat.has('2,2')).toBe(true);
  });

  it('getAllVisitedCells returns an empty set when no level has visits', () => {
    const flat = getAllVisitedCells(createEmptyParchment());
    expect(flat.size).toBe(0);
  });

  it('hasVisitedAnyLevel returns true when ANY layer recorded the cell', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 3, 3);
    expect(hasVisitedAnyLevel(s, 3, 3)).toBe(true);
    s = recordVisit(s, 2, 4, 4);
    expect(hasVisitedAnyLevel(s, 4, 4)).toBe(true);
    expect(hasVisitedAnyLevel(s, 3, 3)).toBe(true);
  });

  it('hasVisitedAnyLevel returns false when no layer recorded the cell', () => {
    let s: ParchmentState = createEmptyParchment();
    s = recordVisit(s, 0, 0, 0);
    expect(hasVisitedAnyLevel(s, 5, 5)).toBe(false);
  });
});
