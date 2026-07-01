// F-2026-06-30: P2-16 — pure-function module backing the "hand-held
// parchment map" feature. Tracks (a) every cell the player has walked
// into and (b) the damage regions accumulated from taking hits. Both
// are kept engine-side because they're a function of the gameplay
// timeline; the UI subscribes via `gameStore` and re-renders.
//
// No React / Zustand / Three.js imports — this file is a pure TS
// module, the same shape as `game/Rules.ts`. Functions are referentially
// transparent: same input → same output, with the `prng` parameter
// being the only non-deterministic input. This lets the unit tests
// drive every branch with a stub prng.

export type DamageType = 'water' | 'burn' | 'tear';

export interface DamageRegion {
  type: DamageType;
  // Center cell coordinates. Stored as integers to match the rest of
  // the level's cell-indexing convention (`Math.floor(pos / cellSize)`).
  cx: number;
  cz: number;
  // Radius in cells. 1 or 2 — a 3x3 or 5x5 footprint, kept small so a
  // level with 3-5 hits doesn't blank out the entire map.
  radius: number;
  // Seed for the procedural shape (tear / burn polygons). Kept
  // separate from the runtime PRNG so the visual stays stable across
  // re-renders even though the damage is added at game-time.
  seed: number;
  // Engine tick at the moment the damage was recorded. Reserved for
  // future animation work (ripple / spread); the static P2-16
  // renderer ignores it.
  createdAtTick: number;
}

export interface ParchmentState {
  // "x,z" string keys — Set for O(1) membership checks. Readonly
  // because every mutator returns a new state rather than touching
  // this set in place; the immutability is what lets React skip
  // re-renders via reference comparison.
  visitedCells: ReadonlySet<string>;
  damageRegions: readonly DamageRegion[];
  isOpen: boolean;
}

// F-2026-06-30: P2-16 — the single source of truth for the parchment
// tuning constants. Exposed as named exports so both the engine and
// the tests can import them; the spec / plan freeze the values.

// 50% chance of leaving a mark on a successful damage tick. With
// maxHealth = 3-5 this caps the worst-case damage density at 2-3
// regions per run — enough to feel the pressure, not enough to
// blank the map.
export const DAMAGE_TRIGGER_PROBABILITY = 0.5;

// Damage radius in cells (inclusive). The ParchmentState API renders
// the radius as a square footprint; future P2-N could swap to a
// circular mask without changing the data shape.
export const DAMAGE_RADIUS_MIN = 1;
export const DAMAGE_RADIUS_MAX = 2;

// F-2026-06-30: ordered list of damage types. The index chosen by
// `pickDamageType` is `Math.floor(prng() * length)`, so reordering
// changes the visual distribution — keep this list stable.
export const DAMAGE_TYPES: readonly DamageType[] = ['water', 'burn', 'tear'];

export function createEmptyParchment(): ParchmentState {
  return {
    visitedCells: new Set<string>(),
    damageRegions: [],
    isOpen: false,
  };
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

// F-2026-06-30: `recordVisit` is the workhorse — called every frame
// from `Game.update()` with the player's current cell. The function
// returns the SAME state reference when the cell is already known, so
// downstream `useEffect` / `useMemo` / `React.memo` can short-circuit
// on referential equality without having to deep-compare the set.
//
// This is also why the result is typed as `ParchmentState` rather
// than a Promise / Observable: it's a synchronous value, safe to
// call from the render loop.
export function recordVisit(
  state: ParchmentState,
  cellX: number,
  cellZ: number,
): ParchmentState {
  const key = cellKey(cellX, cellZ);
  if (state.visitedCells.has(key)) {
    // F-2026-06-30: critical — return the SAME object reference. The
    // engine's bridge callback only fires when the reference changes,
    // so a player standing still must not spam the React tree with
    // re-renders.
    return state;
  }
  const next = new Set(state.visitedCells);
  next.add(key);
  return {
    ...state,
    visitedCells: next,
  };
}

// F-2026-06-30: `maybeRecordDamage` is the second half of the
// engine-side per-tick work. Called on every successful damage tick
// (currently: enemy contact). The function is `maybe` because the
// 50% probability gate means most calls return the input unchanged.
//
// All randomness is funneled through the `prng` argument so the tests
// can pin specific branches with a deterministic stub:
//
//   const stubPrng = (() => { let i = 0; const seq = [0.1, 0.9, 0.4];
//                            return () => seq[i++ % seq.length]; })();
//
// Returns the input state unchanged when:
//   - the prng's first draw is >= DAMAGE_TRIGGER_PROBABILITY (no trigger)
//   - the cell already has any damage region (no stacking)
export function maybeRecordDamage(
  state: ParchmentState,
  cellX: number,
  cellZ: number,
  nowTick: number,
  prng: () => number,
): ParchmentState {
  // 1. Probability gate.
  const roll = prng();
  if (roll >= DAMAGE_TRIGGER_PROBABILITY) {
    return state;
  }

  // 2. No stacking: a cell that already has any damage region is
  //    considered "saturated" and gets no further marks. The
  //    rationale: stacking a water stain on a burn just looks
  //    messy, and a single 3x3 region per cell already conveys
  //    "this place is wrecked".
  for (const r of state.damageRegions) {
    if (r.cx === cellX && r.cz === cellZ) {
      return state;
    }
  }

  // 3. Sample radius in [DAMAGE_RADIUS_MIN, DAMAGE_RADIUS_MAX].
  //    The prng is called a second time here. The exact draw
  //    sequence doesn't matter for the visual — what matters is
  //    that it's deterministic given a stub prng, so the test
  //    suite can pin the radius independently of the probability.
  const radiusRoll = prng();
  const radiusSpan = DAMAGE_RADIUS_MAX - DAMAGE_RADIUS_MIN + 1;
  const radius = DAMAGE_RADIUS_MIN + Math.floor(radiusRoll * radiusSpan);

  // 4. Sample the damage type uniformly.
  const typeRoll = prng();
  const typeIndex = Math.floor(typeRoll * DAMAGE_TYPES.length);
  const type = DAMAGE_TYPES[typeIndex] ?? DAMAGE_TYPES[0];

  // 5. Stable seed for the procedural shape (tear polygon vertices,
  //    burn hole edges). A second `Math.floor(prng() * 1e9)` keeps
  //    it deterministic but well-distributed.
  const seed = Math.floor(prng() * 1_000_000_000);

  const region: DamageRegion = {
    type,
    cx: cellX,
    cz: cellZ,
    radius,
    seed,
    createdAtTick: nowTick,
  };

  return {
    ...state,
    damageRegions: [...state.damageRegions, region],
  };
}

// F-2026-06-30: lifecycle setters. Kept as separate exports (not
// inside `createEmptyParchment`) so the engine doesn't need to know
// about the open / close / reset semantics — it just calls these.
export function openMap(state: ParchmentState): ParchmentState {
  if (state.isOpen) return state;
  return { ...state, isOpen: true };
}

export function closeMap(state: ParchmentState): ParchmentState {
  if (!state.isOpen) return state;
  return { ...state, isOpen: false };
}

export function toggleMap(state: ParchmentState): ParchmentState {
  return { ...state, isOpen: !state.isOpen };
}

// F-2026-06-30: `resetMap` is called on `startLevel` and (when
// `parchmentLifecycle === 'reset-on-death'`) on every death. It
// clears visited + damage but preserves the open / closed state —
// the modal stays in whatever state the player left it, only the
// content resets.
export function resetMap(state: ParchmentState): ParchmentState {
  if (state.visitedCells.size === 0 && state.damageRegions.length === 0) {
    return state;
  }
  return {
    ...state,
    visitedCells: new Set<string>(),
    damageRegions: [],
  };
}
