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
import type {
  Algorithm,
  CellType,
  LevelCount,
  MazeData,
  MazeProvider,
  Pickup,
  VerticalTransition,
  VictoryType,
} from './types';

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

// P3-1: module-level cache of per-layer wall grids, keyed by the
// generated MazeData.id. The engine (Scene.ts) needs the walls of
// every layer to render N stacked floors/ceilings/walls, but
// `MazeData.walls` only holds the layer-0 grid (per the spec §4.1
// back-compat decision). The provider keeps the per-layer grids here
// so the engine can `getPerLayerWallsByLevelId(maze.id)` after
// `load(id)` returns, without having to re-run the generator or
// reach into the provider's internals.
//
// The cache is keyed by the same `MazeData.id` the URL round-trips,
// so a refresh / share-link replays the same per-layer walls.
//
// Caching policy:
//   - Set on every successful `load(id)` call.
//   - Read by the engine via `getPerLayerWallsByLevelId`.
//   - Cleared on `clearPerLayerWallsCache()` (exposed for tests and
//     for the engine's `disposeScene` path if it ever needs to drop
//     stale entries; the in-memory bound is small — `levelCount *
//     width * depth` cells, max ~6 * 50 * 50 = 15,000 — and a
//     long-running session won't grow it past the number of distinct
//     procedural levels visited).
const perLayerWallsByLevelId = new Map<string, CellType[][][]>();

/**
 * Look up the per-layer wall grids for a procedurally generated level.
 * Returns `undefined` if the id wasn't produced by `generateMultiLevel`
 * (e.g. a JSON-loaded hand-crafted level, or a cache miss). The engine
 * is expected to fall back to `[maze.walls]` in that case so single-
 * level rendering keeps working.
 */
export function getPerLayerWallsByLevelId(id: string): CellType[][][] | undefined {
  return perLayerWallsByLevelId.get(id);
}

/** Test / dispose hook — drop all cached per-layer grids. */
export function clearPerLayerWallsCache(): void {
  perLayerWallsByLevelId.clear();
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
    // P3-1: v1 seed id implies levelCount=1 (back-compat); v2 id
    // carries the level count explicitly. The `?? 1` collapse is
    // the single source of truth for "v1 = single layer" — see
    // AlgorithmMazeProvider.generateMultiLevel for the matching
    // behavior contract.
    //
    // P4 refactor-fp2d: the 3D voxel path is removed. The
    // provider no longer branches on `algorithm.startsWith('3d-')`
    // because the v3 codec (`algo-v3-…`) and the 3D algorithm
    // literals (`3d-recursive-backtracker` / `3d-prim`) are gone
    // from the seed codec and the Algorithm union. A URL carrying
    // an `algo-v3-…` id fails the v1/v2 regexes in decodeSeed and
    // lands in the `bad-seed` error path at the URL parser
    // boundary; this provider never sees it. The 3D mode the
    // user now sees is a first-person view of the SAME 2D
    // multi-layer data this function produces, dispatched by
    // `view=fp3d` at the GameCanvas layer (not here).
    const levelCount: LevelCount = seed.levelCount ?? 1;
    const prng = prngFromHex(seed.mazeSeed);
    // F-2026-06-17-D-M-1: `pickups` is still `[]` for procedurally
    // generated levels (see the comment on filterPickupsAgainstSpawn
    // below for the rationale). P3-1 keeps that contract — no
    // procedural pickups regardless of levelCount.
    const { maze, perLayerWalls } = generateMultiLevel({
      algorithm: seed.algorithm,
      size: seed.size,
      levelCount,
      prng,
      id,
      mazeSeed: seed.mazeSeed,
    });
    // P3-1: cache the per-layer wall grids so Scene.ts can render
    // every stacked floor / ceiling / wall layer. Single-level
    // levels (levelCount === 1) still go through the cache — the
    // map is `[maze.walls]`, and `getPerLayerWallsByLevelId` will
    // return that. This keeps the engine code path uniform.
    perLayerWallsByLevelId.set(maze.id, perLayerWalls);
    return maze;
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
//
// P3-1b: this helper is no longer used by `generateMultiLevel`
// (which calls `entry.generate(size, prng)` directly to keep the
// per-layer walls on a SHARED PRNG — see the long comment on
// `generateMultiLevel` for the rationale). It stays exported
// for now so any external caller (tests, the editor's preview
// pane) can still get a single-layer wall grid; if no caller
// surfaces we can drop it in P3-1c.

// P3-1: multi-level procedural level generator. The P3-1a scope is
// "data layer + single-layer back-compat" — the engine will start
// rendering N layers in P3-1b, the editor in P3-1c. This function
// is the canonical entry point for "I want a procedurally generated
// level with K vertical layers" and is what AlgorithmMazeProvider.load
// delegates to (after the seed codec splits v1 / v2 and resolves
// `levelCount`).
//
// P3-1b: the implementation now actually builds the per-layer walls
// and randomizes start / exit placement (spec §12 Q10: 70% different
// layers / 30% same, never equal or adjacent on the same layer).
// It also generates N-1 stair-up transitions (spec §5.5 MVP: stair-up
// only, hole-down / ladder are P3-1c+ work). Every layer is generated
// from a SHARED PRNG via the underlying registry entry's `generate`
// closure, so two `generateMultiLevel` calls with the same opts
// produce byte-identical MazeData + perLayerWalls.
//
// The function returns BOTH the MazeData (for back-compat: any
// `MazeProvider` consumer reads the public shape) AND the per-layer
// wall grids (for the engine: `MazeData.walls` is a single grid
// per spec §4.1, so layers 1..N-1 ride alongside on a side channel
// that the provider caches by `MazeData.id`).
//
// Determinism contract:
//   - Same `(algorithm, size, levelCount, prng, mazeSeed, id)` →
//     byte-identical `{ maze, perLayerWalls }`.
//   - `prng` MUST be a freshly seeded mulberry32 (the caller
//     constructs it via `prngFromHex(mazeSeed)`); the function
//     consumes the PRNG in a stable order — first N layer walls,
//     then start / exit layer pick, then start cell, then exit
//     cell, then per-boundary source / dest cell — so a future
//     refactor that adds new PRNG draws has to keep the order or
//     update the cross-reload test in algorithmMazeProvider.test.ts.
//
// MVP scope (P3-1b):
//   - `walls` is layer 0 (back-compat for the `MazeData` type).
//   - `perLayerWalls[i]` is the i-th layer's 2D wall grid.
//   - levelCount=1: `perLayerWalls = [maze.walls]`, transitions=[],
//     start on layer 0, exit on layer 0 (historical single-layer
//     behavior — every existing test continues to pass).
//   - levelCount>=2: 70% different / 30% same start / exit layers,
//     N-1 stair-up transitions, all on non-wall cells, no cell
//     double-booked.
//   - No enemies / pickups / traps / doors are placed (P2-18 +
//     D-M-1 contract preserved; per-layer enemy distribution is
//     P3-1c+ work).
export interface MultiLevelGenOptions {
  algorithm: Algorithm;
  size: number;
  levelCount: LevelCount;
  // Pre-seeded PRNG; the caller (AlgorithmMazeProvider.load) derives
  // it from the hex mazeSeed via prngFromHex so the same id produces
  // the same MazeData across reloads (back-compat for the URL
  // round-trip).
  prng: () => number;
  // Encoded seed id — used as the level's `id` field (and as the
  // v1 / v2 prefix that decodeSeed parsed). Optional so the
  // function is also testable without going through the full
  // provider pipeline.
  id?: string;
  // Raw 16-hex mazeSeed — used to name the level (matches the
  // historical `algo-v1-...-0123456789abcdef` short-form title).
  mazeSeed: string;
}

export interface MultiLevelGenResult {
  maze: MazeData;
  // Per-layer wall grids. `perLayerWalls[0]` is the same array as
  // `maze.walls` (by reference) so single-layer consumers can
  // collapse to `[maze.walls]` without copying. Length is always
  // `levelCount`.
  perLayerWalls: CellType[][][];
}

export function generateMultiLevel(opts: MultiLevelGenOptions): MultiLevelGenResult {
  const { algorithm, size, levelCount, prng, id, mazeSeed } = opts;
  const entry = ALGORITHM_BY_ID[algorithm];

  // 1. Per-layer walls. Each layer is generated from the shared
  //    PRNG via the underlying registry entry — this is the
  //    "call one of the 15 generators N times, sharing the PRNG"
  //    recipe spec §5.5 calls out. We deliberately do NOT use the
  //    `generateWalls` wrapper (which re-seeds the PRNG from the
  //    hex) because every layer would come out identical.
  const perLayerWalls: CellType[][][] = [];
  for (let i = 0; i < levelCount; i++) {
    perLayerWalls.push(entry.generate(size, prng));
  }

  // 2. Pick the start and exit layers. Spec §12 Q10: 70% different
  //    layers / 30% same. When `levelCount === 1` we pin both to
  //    layer 0 — the back-compat promise is "behaves identically to
  //    a v1 single-layer level" and the existing tests pin start /
  //    exit on the historical corner cells of layer 0.
  let startLevel: number;
  let exitLevel: number;
  let startCell: { x: number; z: number };
  let exitCell: { x: number; z: number };
  const logicalSize = Math.ceil(size / 2);
  if (levelCount === 1) {
    // Back-compat: pin to the historical P2-era corner cells.
    // The 15/30/50 generators always open the corner cells (the
    // spanning tree covers them and the thick-wall expansion
    // opens the logical-cell passages through them), so the
    // pickOpenCell check would pass; we hard-code the coords
    // anyway so the test that pins `(0,0) → (corner, corner)`
    // continues to pass.
    startLevel = 0;
    exitLevel = 0;
    startCell = { x: 0, z: 0 };
    exitCell = { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) };
  } else {
    const wantDifferentLayer = prng() < 0.7;
    startLevel = Math.floor(prng() * levelCount);
    if (wantDifferentLayer) {
      // Resample until we land on a different layer. Expected
      // tries ≈ 1 for levelCount >= 2; the loop bound is a
      // safety net so a degenerate PRNG can't infinite-loop.
      let safety = 8;
      do {
        exitLevel = Math.floor(prng() * levelCount);
        safety--;
      } while (exitLevel === startLevel && safety > 0);
      // Fallback if PRNG produced startLevel N times in a row:
      // take the next layer modulo levelCount.
      if (exitLevel === startLevel) {
        exitLevel = (startLevel + 1) % levelCount;
      }
    } else {
      exitLevel = startLevel;
    }

    // 3. Pick the start cell and exit cell. Both must sit on a
    //    non-wall cell. When they're on the same layer, they must
    //    also be distinct AND not adjacent (spec §12 Q10: "start
    //    cell ≠ exit cell 且不相邻"). Adjacency here is the 4
    //    cardinal neighbours; diagonal is allowed (it would still
    //    cost the player a move) but the spec asks for "not
    //    adjacent" so we honour the conservative reading.
    startCell = pickOpenCell(perLayerWalls[startLevel], prng, []);
    const excludeForExit: Array<{ x: number; z: number }> = [startCell];
    exitCell = pickOpenCell(perLayerWalls[exitLevel], prng, excludeForExit);
    if (startLevel === exitLevel) {
      // Resample exit until it satisfies the "different cell +
      // not adjacent" rule. A 15x15 grid has 113 open cells (the
      // typical generator output), so a few hundred attempts is
      // plenty; the bound is a runaway guard.
      let attempts = 0;
      while (
        attempts < 500 &&
        ((exitCell.x === startCell.x && exitCell.z === startCell.z) ||
          isAdjacent(exitCell, startCell))
      ) {
        exitCell = pickOpenCell(perLayerWalls[exitLevel], prng, excludeForExit);
        attempts++;
      }
    }
  }

  // 4. Generate N-1 stair-up transitions. Each one picks a
  //    non-wall source cell on layer i, a non-wall dest cell on
  //    layer i+1, and reserves both cells so no other transition
  //    can re-use them. The "at least 1 per layer" requirement
  //    is implicit: there's exactly one inter-layer transition
  //    per boundary, so every non-top layer has exactly one
  //    outbound stair-up.
  //
  //    The per-cell "max 1 transition" rule covers the case
  //    where a source on layer i would collide with the dest of
  //    the layer (i-1)→i transition, and similarly for the other
  //    direction. We track reservations by `(level, x, z)` keys.
  const reserved = new Set<string>();
  reserveCell(reserved, startLevel, startCell);
  reserveCell(reserved, exitLevel, exitCell);

  const transitions: VerticalTransition[] = [];
  for (let i = 0; i < levelCount - 1; i++) {
    const sourceLayer = i;
    const destLayer = i + 1;
    const sourceCell = pickOpenCellExcluding(
      perLayerWalls[sourceLayer],
      prng,
      (x, z) => reserved.has(cellKey(sourceLayer, x, z)),
    );
    if (!sourceCell) continue; // no walkable cell on this layer
    const destCell = pickOpenCellExcluding(
      perLayerWalls[destLayer],
      prng,
      (x, z) => reserved.has(cellKey(destLayer, x, z)),
    );
    if (!destCell) continue; // no walkable cell on the dest layer
    reserveCell(reserved, sourceLayer, sourceCell);
    reserveCell(reserved, destLayer, destCell);
    transitions.push({
      // Deterministic id: stable across reloads (the same
      // (level, x, z) → same id). Engine + reachability use it
      // to dedupe and to identify the transition in logs.
      id: `t-${sourceLayer}-${sourceCell.x}-${sourceCell.z}-to-${destLayer}-${destCell.x}-${destCell.z}`,
      level: sourceLayer,
      x: sourceCell.x,
      z: sourceCell.z,
      kind: 'stair-up',
      toLevel: destLayer,
      toX: destCell.x,
      toZ: destCell.z,
    });
  }

  // 5. Assemble the public MazeData. `walls` is layer 0 (back-
  //    compat with the `MazeData.walls: CellType[][]` type);
  //    higher layers ride in `perLayerWalls` (the engine-side
  //    cache in this module picks them up).
  const resolvedId = id ?? `algo-multi-${algorithm}-${size}-${levelCount}-${mazeSeed}`;
  const name = `${algorithm} ${size}×${size} × ${levelCount}L (${mazeSeed.slice(0, 8)})`;

  const start = { x: startCell.x, z: startCell.z, level: startLevel };
  const exit = { x: exitCell.x, z: exitCell.z, level: exitLevel };
  const walls = perLayerWalls[0];

  const maze: MazeData = {
    id: resolvedId,
    name,
    size: { width: size, depth: size },
    cellSize: 2,
    start,
    exit,
    walls,
    pickups: filterPickupsAgainstSpawn([], { x: exitCell.x, z: exitCell.z }, { x: startCell.x, z: startCell.z }),
    rules: {
      initialTime: 30,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 15,
    },
    enemies: [],
    traps: [],
    doors: [],
    levelCount,
    transitions,
  };

  return { maze, perLayerWalls };
}

// ---------------------------------------------------------------------------
// Internal helpers — small, pure, and only used by generateMultiLevel
// above. Kept in this file (not exported) so the engine / other
// consumers don't take a dependency on them.
// ---------------------------------------------------------------------------

function cellKey(level: number, x: number, z: number): string {
  return `${level}:${x}:${z}`;
}

function reserveCell(
  reserved: Set<string>,
  level: number,
  cell: { x: number; z: number },
): void {
  reserved.add(cellKey(level, cell.x, cell.z));
}

// True if two cells are 4-neighbour adjacent (N/S/E/W). Diagonals
// don't count — the spec asks for "not adjacent" and we honour the
// strict reading so the player can't end up one step from the exit
// at level start.
function isAdjacent(
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return dx + dz === 1;
}

// Pick a uniformly random walkable cell on a 2D wall grid, with
// an optional set of cells to exclude (used to avoid re-using
// start / exit / reserved transition endpoints).
//
// Strategy: bounded rejection sampling. The 15/30/50 generators
// always produce a spanning tree, so the open-cell density is at
// worst ~50% (and usually 70%+). A 500-attempt cap is plenty; if
// we somehow exhaust the search, fall back to a deterministic
// linear scan so the function NEVER returns `undefined` for a
// generator-output grid (which always has at least one open cell
// — the spanning tree covers every cell, and the thick-wall
// expansion opens the logical cells).
function pickOpenCell(
  walls: CellType[][],
  prng: () => number,
  exclude: ReadonlyArray<{ x: number; z: number }>,
): { x: number; z: number } {
  const w = walls[0]?.length ?? 0;
  const d = walls.length;
  if (w === 0 || d === 0) {
    throw new Error('generateMultiLevel: empty wall grid');
  }
  const excluded = new Set<string>();
  for (const c of exclude) excluded.add(`${c.x}:${c.z}`);

  for (let i = 0; i < 500; i++) {
    const x = Math.floor(prng() * w);
    const z = Math.floor(prng() * d);
    if (walls[z][x] === 0 && !excluded.has(`${x}:${z}`)) {
      return { x, z };
    }
  }
  // Deterministic fallback: linear scan for the first open cell
  // not in the exclude set. The PRNG gave us a few hundred tries
  // already; if we're here the grid is unusually sparse and we
  // accept whatever the scan finds.
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (walls[z][x] === 0 && !excluded.has(`${x}:${z}`)) {
        return { x, z };
      }
    }
  }
  throw new Error('generateMultiLevel: no walkable cell on grid');
}

// Same as `pickOpenCell` but with a predicate instead of a static
// exclude list. Used by the transition generator so it can pass a
// closure over the shared `reserved` set without copying it per
// call.
function pickOpenCellExcluding(
  walls: CellType[][],
  prng: () => number,
  isExcluded: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  const w = walls[0]?.length ?? 0;
  const d = walls.length;
  if (w === 0 || d === 0) return null;
  for (let i = 0; i < 500; i++) {
    const x = Math.floor(prng() * w);
    const z = Math.floor(prng() * d);
    if (walls[z][x] === 0 && !isExcluded(x, z)) {
      return { x, z };
    }
  }
  // Fallback linear scan. Returns null if the grid is so dense
  // with walls / reservations that no open cell is available —
  // the caller (transition generator) interprets null as "skip
  // this boundary, the layer is unreachable from its neighbour".
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (walls[z][x] === 0 && !isExcluded(x, z)) {
        return { x, z };
      }
    }
  }
  return null;
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
