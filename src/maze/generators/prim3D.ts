// P4b-Prim: 3D Randomized Prim — second 3D voxel maze generator.
//
// Algorithm: maintain a `frontier` of candidate wall edges
// (visited-cell → unvisited-cell pairs), each with an unvisited
// endpoint. Repeatedly pick a random edge, and if the endpoint
// is still unvisited, carve through and pull its unvisited
// neighbors into the frontier. The result is a spanning tree
// over the visualSize × visualSize × visualSize cube.
//
// Data layout: `CellType[][][]` in `[z][y][x]` order, same as
// `recursiveBacktracker3D.ts` (P4a). The thick-wall encoding
// (odd indices = spanning-tree nodes, even = wall borders
// carved out as passage mid-step) is identical to P4a. The
// outer ring (x ∈ {0, visualSize-1}, y ∈ {0, visualSize-1},
// z ∈ {0, visualSize-1}) stays wall so the cube is sealed.
//
// Determinism: same (visualSize, rng) → byte-identical walls
// across two calls. PRNG consumption order is part of the
// contract: (1) one `rng()` for the start cell pick, (2) one
// `rng()` per frontier pick (a swap-and-pop removal that
// reads `frontier.length` to compute the random index).
// A refactor that re-orders the calls silently changes the
// URL round-trip output.
//
// 1:1 translation of `prim.ts` (2D) lifted to 6 neighbors.
// Uses the `walls` array as the visited indicator (a cell
// is "unvisited" iff `walls[z][y][x] === 1`) — same pattern
// as P4a's `recursiveBacktracker3D` and the 2D Prim's
// `visited` set is also redundant with the `walls` state
// (kept for clarity there). The 3D Prim collapses the two
// states into the `walls` array to keep the per-iteration
// check O(1) without a parallel `visited` allocation.
//
// A previous version of this function introduced a separate
// `visited: Uint8Array` indexed by `cellKey(x, y, z)` and
// hit two bugs: (1) the start-cell pick could land on the
// outer ring (used `rng() * logicalSize` instead of
// `rng() * maxIdx`), and (2) `cellKey` was applied to
// VISUAL odd indices when it was designed for LOGICAL
// indices — so `cellKey(1, 1, 3)` for visualSize=5
// (logicalSize=3) returned 31, blowing past the 27-cell
// `visited` length. Both fixes landed; the 3D Prim now
// mirrors the 2D Prim's pure-`walls` pattern verbatim.

import type { CellType } from '../types';
import { isVoxel3DSize, VALID_3D_SIZES, type Voxel3DSize } from './recursiveBacktracker3D';

// P4b-Prim: same whitelist as P4a RB. P4a's `VALID_3D_SIZES`
// is the single source of truth — re-exported from
// `recursiveBacktracker3D.ts` so P4a-P4b-Prim-P4b-... all
// share one whitelist (3D is 5/7/9 only; P4b-CellSize
// (11/13/15) will widen this set when it ships).
export { VALID_3D_SIZES, isVoxel3DSize };
export type { Voxel3DSize };

// F-P4B-PRIM-DIR: 6-neighbor offsets for the frontier
// expansion. Each offset spans 2 cells in the visual grid
// (thick-wall encoding: odd → odd via a midpoint even cell).
// Same shape as P4a RB's DIRS but with a third axis (y for
// the vertical direction). Static const so the per-step
// inner loop is hot and a re-allocated array would add GC
// churn. The 2D Prim's `pushNeighbors` is inlined into the
// frontier push here; the loop body fuses both 2D's "check
// in-bounds + push" steps into one block.
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [2, 0, 0],   // +x
  [-2, 0, 0],  // -x
  [0, 2, 0],   // +y
  [0, -2, 0],  // -y
  [0, 0, 2],   // +z
  [0, 0, -2],  // -z
];

// F-P4B-PRIM-EDGE: a candidate wall in the frontier. The
// `a`-cell is visited (already part of the tree); the
// `b`-cell is the unvisited neighbor we'd be carving
// through to. We track the full (ax, ay, az, bx, by, bz)
// tuple so a swap-and-pop removal doesn't lose the
// edge's anchor when we later look up `a`'s neighbors
// (we don't re-push from `a` — each edge is a one-way
// candidate into `b`'s unvisited set).
//
// The 2D Prim's `TreeEdge` is a 4-tuple `{ax, az, bx, bz}`.
// The 3D version extends to 6 by adding `ay, by`.
interface Prim3DEdge {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
}

/**
 * Generate a 3D voxel maze via Randomized Prim's algorithm.
 *
 * @param visualSize odd integer (5/7/9 — same whitelist as P4a RB).
 *   Even sizes are rejected up front by `isVoxel3DSize`.
 * @param rng deterministic PRNG. Consumed in the order:
 *   (1) start cell pick (1 call), (2) per-frontier-pick
 *   `Math.floor(rng() * frontier.length)` (1 call per pick,
 *   whether the pick is a no-op or a carve). Total PRNG
 *   calls = 1 + number-of-frontier-picks. A refactor that
 *   changes this order breaks URL round-trip equivalence.
 * @returns a `CellType[][][]` of shape
 *   `[visualSize][visualSize][visualSize]` with 0 = passage,
 *   1 = wall. Outer ring stays wall (cube is sealed).
 */
export function generatePrim3D(
  visualSize: number,
  rng: () => number,
): CellType[][][] {
  if (!isVoxel3DSize(visualSize)) {
    throw new Error(
      `generatePrim3D: visualSize (${visualSize}) must be one of ${VALID_3D_SIZES.join(', ')}`,
    );
  }
  // F-P4B-PRIM-INIT: 3D array allocation. Same shape as
  // P4a RB: visualSize³ cells, all wall by default. We
  // use the same cell-by-cell build so the `[z][y][x]`
  // dimension order is obvious at the call site.
  const walls: CellType[][][] = [];
  for (let z = 0; z < visualSize; z++) {
    const layer: CellType[][] = [];
    for (let y = 0; y < visualSize; y++) {
      const row: CellType[] = new Array<CellType>(visualSize).fill(1);
      layer.push(row);
    }
    walls.push(layer);
  }

  // F-P4B-PRIM-START: pick the start cell. The "is the
  // cell still a wall?" check below doubles as the
  // visited indicator (no separate `visited: Uint8Array`),
  // so the start just needs to be a valid odd index.
  //
  // F-P4B-PRIM-MAXIDX: the random range is `maxIdx` (NOT
  // `logicalSize`). `maxIdx = (visualSize - 1) / 2` is
  // the last *valid* odd index — for visualSize=5,
  // `logicalSize = 3` but `maxIdx = 2`, and
  // `oddIdx(2) = 5` is the outer ring (always wall, the
  // cube's sealed border). P4a RB explicitly uses
  // `maxIdx` for the same reason. A naive
  // `rng() * logicalSize` would silently land the start
  // on the wall ~33% of the time for visualSize=5.
  const oddIdx = (i: number): number => 1 + 2 * i;
  const maxIdx = (visualSize - 1) / 2;
  const startLogical = Math.floor(rng() * maxIdx);
  const startX = oddIdx(startLogical);
  const startY = oddIdx(startLogical);
  const startZ = oddIdx(startLogical);
  walls[startZ][startY][startX] = 0;

  // F-P4B-PRIM-FRONTIER: candidate edges. Flat array;
  // swap-and-pop removal for O(1) random pick + O(1)
  // deletion. 2D Prim uses the same pattern; the 3D
  // version uses 6-tuple edges instead of 4-tuple.
  const frontier: Prim3DEdge[] = [];
  pushNeighbors3D(startX, startY, startZ, walls, visualSize, frontier);

  while (frontier.length > 0) {
    // F-P4B-PRIM-PICK: random index into frontier. 1
    // rng() call per pick (whether the pick is a no-op
    // or a carve). A no-op still consumes rng() because
    // the index was rolled; the seed's determinism
    // contract is "same (size, seed) → same call
    // order" so the no-op rolls have to land on the
    // same indices.
    const pickIdx = Math.floor(rng() * frontier.length);
    const e = frontier[pickIdx];
    // Swap-and-pop removal. P4a RB does the same on its
    // stack; 2D Prim does the same on its frontier.
    frontier[pickIdx] = frontier[frontier.length - 1];
    frontier.pop();

    // F-P4B-PRIM-STALE: a candidate `b` may have been
    // claimed by a prior pick (the same edge is in the
    // frontier twice — once from `a`'s push, once from a
    // neighbor's push). The `walls` check (still wall =
    // unvisited) is the single source of truth here,
    // same as P4a RB's `walls[z][y][x] === 1` DFS check.
    if (walls[e.bz][e.by][e.bx] === 0) continue;

    // F-P4B-PRIM-CARVE: open `a`, the midpoint, and
    // `b`. The midpoint is the average (a + b) / 2 on
    // each axis — in the thick-wall encoding that's
    // exactly the even cell between two odd cells.
    // After this, all three cells in the straight line
    // are 0; the rest of the wall ring stays 1. Same
    // shape as P4a RB's carve but with y (up/down)
    // added as a third axis.
    const midX = (e.ax + e.bx) / 2;
    const midY = (e.ay + e.by) / 2;
    const midZ = (e.az + e.bz) / 2;
    walls[e.az][e.ay][e.ax] = 0;
    walls[midZ][midY][midX] = 0;
    walls[e.bz][e.by][e.bx] = 0;

    // F-P4B-PRIM-PUSH: pull `b`'s unvisited neighbors
    // into the frontier. Same shape as 2D's
    // `pushNeighbors` lifted to 6 directions; `b` is
    // now visited (carved), so the new edges will be
    // from `b` to its unvisited neighbors.
    pushNeighbors3D(e.bx, e.by, e.bz, walls, visualSize, frontier);
  }

  return walls;
}

// F-P4B-PRIM-PUSH: push the 6 candidate edges from
// `(x, y, z)` into `frontier`. The 2D version's
// `pushNeighbors` accepted `(x, z)` and walked 4
// directions; the 3D version walks 6 (the 3D
// `DIRS` const). The same in-bounds + `walls` check
// (still wall = valid candidate) shape keeps the
// no-op rate low — most calls push 0-3 edges,
// depending on how many of the candidate cells are
// unvisited.
//
// F-P4B-PRIM-PUSH-WALLS-CHECK: only `walls` is checked
// (not a parallel `visited` set). The candidate cell
// `b` is always at an odd index, and
// `walls[b] === 0` ⟺ "already carved" ⟺ "don't push
// again". A previous version of this function also
// kept a parallel `visited: Uint8Array` and applied
// `cellKey(x, y, z)` to the visual odd indices —
// `cellKey(1, 1, 3)` for visualSize=5 returned 31,
// blowing past the 27-cell `visited` length. The
// `walls` check is the only "is `b` a valid candidate"
// check, just like the 2D Prim and P4a RB. (The 2D
// Prim does keep a `visited` Uint8Array, but its
// index is `z * size + x` where `size = logicalSize`
// and the check is `!visited[z * size + x + 1]`, an
// additive offset that doesn't have the multiplicative
// cross-axis bug. The 3D translation went
// `(z * logicalSize + y) * logicalSize + x` — same
// formula, but a different (multiplicative + 1) bug
// is masked. To stay safe and simple, the 3D Prim
// uses the `walls` array directly.)
function pushNeighbors3D(
  x: number, y: number, z: number,
  walls: CellType[][][],
  visualSize: number,
  frontier: Prim3DEdge[],
): void {
  for (let i = 0; i < DIRS.length; i++) {
    const d = DIRS[i];
    const nx = x + d[0];
    const ny = y + d[1];
    const nz = z + d[2];
    // Bounds check: out-of-bounds = wall (the outer
    // ring of `walls3D` is wall, so a 2-cell step
    // from an odd index lands on `visualSize - 1`
    // which is a wall anyway). Both checks together
    // make the candidate uninteresting — skip the
    // frontier push.
    if (nx < 0 || nx >= visualSize) continue;
    if (ny < 0 || ny >= visualSize) continue;
    if (nz < 0 || nz >= visualSize) continue;
    // Walls check: the candidate endpoint `b` is a wall
    // cell (still unvisited). We push; the main loop
    // checks `walls[b] === 0` for "already carved" and
    // continues. Together these two checks collapse
    // what would be a `visited` set into the `walls`
    // array itself.
    if (walls[nz][ny][nx] === 0) continue;
    frontier.push({ ax: x, ay: y, az: z, bx: nx, by: ny, bz: nz });
  }
}
