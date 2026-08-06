// F-2026-06-30: P2-16 — pure-function module backing the "hand-held
// parchment map" feature. Tracks (a) every cell the player has walked
// into and (b) the damage regions accumulated from taking hits. Both
// are kept engine-side because they're a function of the gameplay
// timeline; the UI subscribes via `gameStore` and re-renders.
//
// P3-1: per-level bookkeeping. `visitedCells` and `damageRegions`
// are now partitioned by the player's current layer (a `Map<number,
// Set<string>>` and a `Map<number, DamageRegion[]>` respectively).
// For levelCount=1 (the back-compat default) the maps only ever
// have a single key (0), and the read / write behavior is identical
// to the pre-P3-1 single-set version — every existing test continues
// to pass.
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
  // P3-1: which layer this damage region lives on. Always equal to
  // the player's layer at the time of the hit. Pre-P3-1 levels
  // (levelCount=1) always produce 0 here. The UI consumer should
  // display the region on the same minimap view that owns the
  // level (e.g. switching the parchment to L1 hides L0's burns).
  level: number;
}

export interface ParchmentState {
  // P3-1: per-level visited cells. `Map<level, Set<"x,z">>` — the
  // outer key is the player's current layer at the time of the
  // visit. The pre-P3-1 single `Set<string>` is replaced by this
  // map; the engine (Game.update) writes into the per-level
  // subset, the UI reads all subsets when rendering the level
  // tab bar. For levelCount=1 the map has only one entry
  // (level=0) and the read / write pattern matches the pre-P3-1
  // behavior exactly. The `Map` is wrapped as `Readonly` so
  // consumers cannot mutate the per-level subsets in place —
  // every mutator returns a new `ParchmentState` with a new
  // `Map` (sharing the unmodified subsets with the previous
  // state to keep the partial-equality contract intact).
  visitedCells: ReadonlyMap<number, ReadonlySet<string>>;
  // P3-1: per-level damage regions. Same partition convention as
  // `visitedCells`; the per-level arrays are sparse for most
  // levels (only a handful of hits per level) and the read
  // pattern is a `flat()` over all levels when the parchment
  // shows every layer.
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
    // P3-1: start with an empty per-level map. The first
    // `recordVisit` call creates the level-0 entry; subsequent
    // calls reuse it. The empty map is referentially distinct
    // across `createEmptyParchment` calls (each invocation
    // allocates a new `Map`), so the no-shared-refs test in
    // the ParchmentState suite continues to pass.
    visitedCells: new Map(),
    damageRegions: [],
    isOpen: false,
  };
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
//
// P3-1: the `level` argument partitions the visit by layer. Two
// visits to the same (x, z) on different layers are recorded
// separately. For levelCount=1 (the only level currently
// supported by the engine), `level` is always 0 and the
// per-level map degenerates to a single key. The early-return
// short-circuit (already-known cell) compares against the
// level-specific subset, so visiting L0 then L1 then L0
// doesn't trip a "L0 is already known" optimization on the
// L1 → L0 transition.
export function recordVisit(
  state: ParchmentState,
  level: number,
  cellX: number,
  cellZ: number,
): ParchmentState {
  const key = cellKey(cellX, cellZ);
  const levelSet = state.visitedCells.get(level);
  if (levelSet !== undefined && levelSet.has(key)) {
    // F-2026-06-30: critical — return the SAME object reference. The
    // engine's bridge callback only fires when the reference changes,
    // so a player standing still must not spam the React tree with
    // re-renders.
    return state;
  }
  // P3-1: copy-on-write for both the per-level Set and the
  // outer Map. The unchanged level subsets are shared with
  // the previous state (Map.get returns the same reference),
  // so a React component subscribed to a specific level's
  // visited set will see referential equality on the levels
  // it didn't change.
  const nextLevelSet = new Set<string>(levelSet);
  nextLevelSet.add(key);
  const nextMap = new Map(state.visitedCells);
  nextMap.set(level, nextLevelSet);
  return {
    ...state,
    visitedCells: nextMap,
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
// P2-18: `forceType` lets the caller override the random damage-type
// sampling. When provided (e.g. a fire trap forces 'burn', a water trap
// forces 'water'), the `typeRoll` draw is skipped entirely and the
// given type is used directly. This reuses the same probability gate
// and no-stacking rules, so trap damage and enemy damage share one
// pipeline without duplicating logic.
//
// P3-1: `level` partitions the damage region by layer. Pre-P3-1
// levels (levelCount=1) pass `0` and the behavior is identical to
// the pre-P3-1 implementation. The no-stack rule is now
// per-layer too — a damage region on L0 at (x, z) doesn't
// block a new region on L1 at the same (x, z), which matches
// the spec's "independent 2D planes stacked vertically" model.
export function maybeRecordDamage(
  state: ParchmentState,
  level: number,
  cellX: number,
  cellZ: number,
  nowTick: number,
  prng: () => number,
  forceType?: DamageType,
): ParchmentState {
  // 1. Probability gate.
  const roll = prng();
  if (roll >= DAMAGE_TRIGGER_PROBABILITY) {
    return state;
  }

  // 2. No stacking: a cell that already has any damage region on
  //    the SAME layer is considered "saturated" and gets no
  //    further marks. P3-1: the no-stack check is now scoped to
  //    the level; a region on L0 at (x, z) does not block a new
  //    region on L1 at the same (x, z). The rationale: stacking
  //    a water stain on a burn just looks messy, and a single
  //    3x3 region per (layer, cell) already conveys "this place
  //    is wrecked".
  for (const r of state.damageRegions) {
    if (r.level === level && r.cx === cellX && r.cz === cellZ) {
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

  // 4. Determine damage type. When `forceType` is provided (P2-18:
  //    trap-sourced damage), skip the random sampling and use it
  //    directly. Otherwise sample uniformly from DAMAGE_TYPES.
  const type: DamageType = forceType ?? (() => {
    const typeRoll = prng();
    const typeIndex = Math.floor(typeRoll * DAMAGE_TYPES.length);
    return DAMAGE_TYPES[typeIndex] ?? DAMAGE_TYPES[0];
  })();

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
    // P3-1: tag the region with its layer so the parchment can
    // display it on the right tab and the no-stack check can
    // scope correctly. Back-compat default is 0 (the only
    // layer in pre-P3-1 levels).
    level,
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
//
// P3-1: clearing now drops every per-level entry from the visited
// map and every damage region. The map is replaced with a new
// empty `Map` (not a mutation in place) so the referential-
// equality contract holds: a state with all-empty maps is
// distinct from any state that ever held data. The early-return
// optimization (returning the input state when there's nothing
// to clear) is preserved — the new check inspects the map's
// `size` and the array's `length` (which together imply
// "nothing to clear" regardless of how the data is partitioned
// across levels).
export function resetMap(state: ParchmentState): ParchmentState {
  if (state.visitedCells.size === 0 && state.damageRegions.length === 0) {
    return state;
  }
  return {
    ...state,
    visitedCells: new Map(),
    damageRegions: [],
  };
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

// P3-1: helper for UI consumers (ParchmentMap) that need a flat
// view of every visited cell across all layers. The pre-P3-1
// `visitedCells` was a single `Set<string>` containing every cell
// the player walked into; with the per-level Map shape, the
// parchment map (which renders all layers in one canvas) needs
// the union of every layer's set to preserve its draw loop.
//
// The returned set is a fresh `Set` (copy-on-read) so a
// consumer mutating it doesn't poison the source map. The
// operation is O(total visited cells across all levels) — fine
// for the per-frame redraw at 60fps with the per-level
// budget in the spec (a level with thousands of cells per
// layer would be a much bigger problem; we don't optimize
// for that).
export function getAllVisitedCells(state: ParchmentState): ReadonlySet<string> {
  const out = new Set<string>();
  for (const levelSet of state.visitedCells.values()) {
    for (const key of levelSet) out.add(key);
  }
  return out;
}

// P3-1: helper for the same UI consumer — checks whether the
// given (x, z) has been visited on any layer. The pickup /
// damage / visited-cell rendering loops want a single
// boolean answer regardless of which layer recorded the visit.
// Internally it walks the per-level map; for the common
// levelCount=1 case the loop runs once and the answer is the
// pre-P3-1 set membership check.
export function hasVisitedAnyLevel(state: ParchmentState, cellX: number, cellZ: number): boolean {
  const key = cellKey(cellX, cellZ);
  for (const levelSet of state.visitedCells.values()) {
    if (levelSet.has(key)) return true;
  }
  return false;
}
