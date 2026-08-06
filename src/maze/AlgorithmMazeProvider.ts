import { decodeSeed, fnv1a, mulberry32 } from '../utils/seed';
// P2-21 cleanup (DESIGN DEBT #7): the 15 generator imports and the
// 15-case switch below are replaced by a single registry lookup. The
// registry file (algorithmRegistry.ts) is the single source of truth
// for "what algorithms exist and how do you call them" — adding a
// new algorithm now means: (1) add the entry to the registry, (2)
// widen the `Algorithm` union in types.ts, (3) add the labelKey in
// i18n/resources/{en,zh}.ts. That's it. No more import statement in
// this file, no more case in `generateWalls`, no more parallel
// whitelist in levelStore. The Registry widens / narrows in lockstep
// with the union via `id: Algorithm` and `ALGORITHM_BY_ID: Record<Algorithm, _>`.
import { ALGORITHM_BY_ID } from './algorithmRegistry';
import type { Algorithm, MazeData, MazeProvider, Pickup, VictoryType } from './types';

// P2-5 FR-17: the algorithm is an implementation detail; the player only
// picks a mode. Returns a static mapping; the exhaustive switch keeps
// it safe when new modes are added.
//
// F-2026-06-17: 'caught-by-enemy' is a teaching-only victory path
// (哨兵回廊 teaching-03 uses JsonMazeProvider, not procedural
// generation), so there is no algorithm choice to make — fall back to
// 'recursive-backtracker' as the default. Without this case the
// `_exhaustive: never` narrowing was tripping typecheck after the
// P2-11 VictoryType widening.
export function algorithmForMode(mode: VictoryType): Algorithm {
  switch (mode) {
    case 'reach-exit':
      return 'recursive-backtracker';
    case 'time-trial':
      return 'prim';
    case 'survive':
      return 'kruskal';
    case 'caught-by-enemy':
      return 'recursive-backtracker';
    default: {
      const _exhaustive: never = mode;
      throw new Error(`AlgorithmMazeProvider.algorithmForMode: unhandled mode ${String(_exhaustive)}`);
    }
  }
}

// MazeProvider for procedurally generated mazes.
//
// load(id) decodes the seed id (e.g. "algo-v1-recursive-backtracker-15-0123456789abcdef"),
// dispatches to the matching algorithm, and assembles a complete MazeData
// (start at (0,0), exit at the last logical cell, default reach-exit rules,
// no pickups — the procedural level is a clean slate that other code can
// decorate if needed).
//
// list() always returns an empty array: procedural mazes have no fixed
// catalog, so there is nothing to enumerate.
export class AlgorithmMazeProvider implements MazeProvider {
  async list(): Promise<string[]> {
    return [];
  }

  async load(id: string): Promise<MazeData> {
    // decodeSeed throws InvalidSeedError on a malformed id, which satisfies
    // the test "throws InvalidSeedError on a malformed seed id".
    const seed = decodeSeed(id);
    const walls = generateWalls(seed.algorithm, seed.size, seed.mazeSeed);
    const logicalSize = Math.ceil(seed.size / 2);
    const start = { x: 0, z: 0 };
    const exit = { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) };
    // F-2026-06-17-D-M-1 (false positive, premise void): the review
    // finding assumed "4 generators randomly place pickups near the
    // exit." In reality every generator only emits `walls`, and this
    // provider returns `pickups: []` below. The guard is implemented as
    // a defensive filter on whatever the source map provides: if a
    // future change ever introduces procedural pickup generation (e.g.
    // a `generatePickups` helper), any pickup within 1 cell of the exit
    // or 2 cells of the start is filtered out. Today the filter is a
    // no-op because `pickups` is hard-coded to `[]`, but the contract
    // is pinned by `AlgorithmMazeProvider.load().pickups === []` in
    // tests/unit/maze/algorithmMazeProvider.test.ts so a future
    // regression that re-introduces the random placement will fail
    // loudly.
    const pickups = filterPickupsAgainstSpawn([], exit, start);
    return {
      id,
      name: `${seed.algorithm} ${seed.size}×${seed.size} (${seed.mazeSeed.slice(0, 8)})`,
      size: { width: seed.size, depth: seed.size },
      // cellSize=2 matches the hand-crafted levels in public/levels/*.json
      // and satisfies the JsonMazeProvider MIN_CELL_SIZE floor for the
      // default player radius.
      cellSize: 2,
      start,
      exit,
      walls,
      pickups,
      rules: {
        initialTime: 30,
        maxHealth: 3,
        victory: 'reach-exit',
        timeOnPickup: 15,
      },
      enemies: [],
      // P2-18: no traps or doors in procedurally generated levels.
      traps: [],
      doors: [],
    };
  }
}

// Convert a 16-char hex seed into a function-typed mulberry32 PRNG. We hash
// the hex string with FNV-1a to get a 32-bit seed, since mulberry32 takes a
// single 32-bit integer. (parseHexSeed returns a bigint, which is wider than
// mulberry32 wants.)
function prngFromHex(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

// P2-21 cleanup (DESIGN DEBT #7): replaced the 15-case switch with a
// single registry lookup. Adding a new algorithm no longer requires
// editing this file — the registry's `id: Algorithm` and the
// `ALGORITHM_BY_ID: Record<Algorithm, _>` type guarantee that a new
// Algorithm union literal is unreachable here (typecheck fails
// before runtime). The previous `_exhaustive: never` narrowing is
// no longer needed because the registry IS the closed set.
function generateWalls(algorithm: Algorithm, size: number, hex: string) {
  const entry = ALGORITHM_BY_ID[algorithm];
  return entry.generate(size, prngFromHex(hex));
}

// F-2026-06-17-D-M-1: defensive spatial guard. Filters out pickups that
// sit within 1 cell of the exit or 2 cells of the start — a pickup
// immediately in front of the exit forces the player to circle around
// before they can win, and one next to the start undermines the
// difficulty curve on the first few steps. Both radii are in `cellSize`
// units (cellSize=2 for procedural levels, so the actual world-space
// distance is 2 / 4 cells respectively, but the rule is expressed in
// grid-cell coordinates to stay aligned with how `walls`, `start`,
// `exit`, and `pickups` all use grid-cell space).
//
// Current `load()` always passes `[]` (no procedural pickup
// generation), so this is a no-op today. Kept as a standalone helper
// so a future generator that introduces procedural pickup placement
// gets the guard for free.
export function filterPickupsAgainstSpawn(
  pickups: readonly Pickup[],
  exit: { x: number; z: number },
  start: { x: number; z: number },
): Pickup[] {
  return pickups.filter((p) => {
    const dxExit = Math.abs(p.x - exit.x);
    const dzExit = Math.abs(p.z - exit.z);
    if (dxExit <= 1 && dzExit <= 1) return false;
    const dxStart = Math.abs(p.x - start.x);
    const dzStart = Math.abs(p.z - start.z);
    if (dxStart <= 2 && dzStart <= 2) return false;
    return true;
  });
}
