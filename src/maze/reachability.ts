import type { CellType, VerticalTransition } from './types';

// BFS over open cells (walls[z][x] === 0). Used by the generator tests to
// assert the algorithm's "fully connected maze" guarantee, and by the
// editor's design validator to flag unreachable exits. Public utility.
//
// P3-1: this is the historical single-layer helper — kept verbatim for
// back-compat. The 3D version (which threads `transitions` between
// layers) lives in `isReachableMultiLevel` below. The two functions
// share the same 4-neighbor + visited pattern; the multi-level variant
// adds the per-layer wall lookup and the transition edge graph.
export function isReachable(
  walls: CellType[][],
  start: { x: number; z: number },
  exit: { x: number; z: number },
): boolean {
  const depth = walls.length;
  const width = depth > 0 ? walls[0].length : 0;
  if (depth === 0 || width === 0) return false;
  // F-2026-06-17-C-H-1: guard start/exit coordinates against the grid bounds
  // before any array access. Without this, `walls[start.z][start.x]` would
  // silently return undefined (treating out-of-bounds as a floor) and the
  // visited[z*width+x] write at line 21 would also leak past the array's
  // actual length on a jagged (non-rectangular) input. Returning false on
  // out-of-bounds keeps the BFS contract honest: unreachable from a cell we
  // never owned.
  if (start.x < 0 || start.x >= width || start.z < 0 || start.z >= depth) return false;
  if (exit.x < 0 || exit.x >= width || exit.z < 0 || exit.z >= depth) return false;
  if (walls[start.z][start.x] === 1 || walls[exit.z][exit.x] === 1) return false;
  const visited = new Uint8Array(width * depth);
  // F-L12: head-index FIFO instead of `Array.shift()` (O(n) per pop).
  // The whole BFS drops from O(n²) to O(n) on a width*depth grid.
  const queue: Array<{ x: number; z: number }> = [start];
  let head = 0;
  visited[start.z * width + start.x] = 1;
  while (head < queue.length) {
    const c = queue[head++];
    if (c.x === exit.x && c.z === exit.z) return true;
    const neighbors = [
      { x: c.x + 1, z: c.z },
      { x: c.x - 1, z: c.z },
      { x: c.x, z: c.z + 1 },
      { x: c.x, z: c.z - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.z < 0 || n.z >= depth) continue;
      if (walls[n.z][n.x] === 1) continue;
      const k = n.z * width + n.x;
      if (visited[k]) continue;
      visited[k] = 1;
      queue.push(n);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// P3-1: 3D reachability (4 horizontal neighbors per layer + vertical
// transitions between layers). The contract mirrors `isReachable` (the
// 1-layer variant above) but threads the `level` dimension and the
// `transitions` graph:
//
//   - The BFS state is `(level, x, z)` — one byte of the visited array
//     encodes both the layer and the (x, z) cell.
//   - The 4 horizontal neighbors are the same as the 1-layer case,
//     looked up against the source layer's wall grid (NOT the
//     destination's — see `wallsForLayer` parameter).
//   - The vertical edges come from the `transitions` array. Each
//     transition `{ level, x, z, toLevel, toX, toZ }` adds an edge
//     from `(level, x, z)` to `(toLevel, toX ?? x, toZ ?? z)`. The
//     BFS traverses the edge when it visits the source node, then
//     continues from the destination cell.
//   - Self-loop transitions (level === toLevel) are silently
//     ignored — they're invalid by construction and would create
//     a 0-length edge the BFS would loop on.
//   - Transition endpoints that point to a wall cell are NOT pruned
//     at parse time; the BFS's wall check at the destination node
//     rejects them at search time. This keeps the function's
//     contract honest: an unreachable exit via a bad transition
//     returns false, not "throw" or "skip".
//
// The single-layer back-compat: pass `wallsForLayer = (l) =>
// [maze.walls]` and `levelCount = 1` and the function behaves
// identically to `isReachable` (the transitions table is empty,
// so no vertical edges exist; the BFS is a flat 1-layer search).
//
// Performance: the visited array is sized `width * depth *
// levelCount` and is the bound on the BFS. The spec budget is
// `levelCount <= 6, width/depth <= 50`, so the array is at most
// 15000 bytes; well within the spec's < 1 ms / level budget for
// the documented test sizes.
// ---------------------------------------------------------------------------

// P3-1: a per-layer wall lookup. Implementations can either index
// into a per-level array (the procedural provider's
// `perLayerWallsByLevelId` cache) or fall back to a single grid
// (the historical `maze.walls` field). The function is pure —
// no side effects, no caching.
export type WallsForLayer = (level: number) => CellType[][];

// P3-1: enumerate the four horizontal neighbors of a cell on a
// given layer. Exposed for the multi-level tests + any future
// caller that wants to walk the per-cell adjacency list (e.g. the
// transition placement generator in P3-1b workstream 1's
// `generateMultiLevel`).
export function getCellConnections(
  wallsForLayer: WallsForLayer,
  level: number,
  levelCount: number,
  width: number,
  depth: number,
  x: number,
  z: number,
  transitions: ReadonlyArray<VerticalTransition>,
): Array<{ level: number; x: number; z: number }> {
  const out: Array<{ level: number; x: number; z: number }> = [];
  if (x < 0 || x >= width || z < 0 || z >= depth) return out;
  // P3-1: refuse to expand from a wall cell. The BFS contract
  // is "open cells only" — a wall has no neighbors. The start /
  // exit guards in `isReachableMultiLevel` short-circuit the
  // common case, but this helper is exported for callers that
  // may not pre-validate (e.g. tests that exercise the
  // transition graph without a real maze).
  if (level < 0 || level >= levelCount) return out;
  const walls = wallsForLayer(level);
  if (walls === undefined) return out;
  if (walls[z] === undefined) return out;
  if (walls[z][x] === 1) return out;
  // P3-1: four horizontal neighbors. Same order as the single-
  // layer BFS (E, W, S, N) so the test that cross-checks
  // `isReachable` against `isReachableMultiLevel` with
  // `transitions=[]` is stable.
  const horizontal: Array<[number, number]> = [
    [x + 1, z],
    [x - 1, z],
    [x, z + 1],
    [x, z - 1],
  ];
  for (const [nx, nz] of horizontal) {
    if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
    const wallRow = walls[nz];
    if (wallRow === undefined) continue;
    if (wallRow[nx] === 1) continue;
    out.push({ level, x: nx, z: nz });
  }
  // P3-1: vertical edges from the transitions table. A transition
  // whose source matches `(level, x, z)` contributes one
  // destination. Self-loops (toLevel === level) are filtered here
  // to keep the BFS from looping on a no-op edge.
  for (const t of transitions) {
    if (t.level !== level || t.x !== x || t.z !== z) continue;
    if (t.toLevel === level) continue;
    out.push({ level: t.toLevel, x: t.toX ?? x, z: t.toZ ?? z });
  }
  return out;
}

// P3-1: 3D BFS reachability across N layers + a transitions table.
// `start` and `exit` carry their own `level` field; the BFS
// succeeds when it reaches `(exit.level, exit.x, exit.z)`. A
// levelCount=1 maze with `transitions=[]` is identical to
// `isReachable(wallsForLayer(0), start, exit)` — the 1-layer
// back-compat is exact.
//
// Inputs are validated up-front: start / exit are in-bounds AND
// on an open cell, levelCount is a positive integer, the
// per-layer wall grid is rectangular. The function never throws
// for an out-of-bounds coordinate; the contract is "return
// false" (matches `isReachable`).
export function isReachableMultiLevel(
  wallsForLayer: WallsForLayer,
  width: number,
  depth: number,
  levelCount: number,
  start: { level: number; x: number; z: number },
  exit: { level: number; x: number; z: number },
  transitions: ReadonlyArray<VerticalTransition>,
): boolean {
  if (levelCount <= 0) return false;
  if (width <= 0 || depth <= 0) return false;
  if (
    start.x < 0 || start.x >= width || start.z < 0 || start.z >= depth ||
    start.level < 0 || start.level >= levelCount
  ) return false;
  if (
    exit.x < 0 || exit.x >= width || exit.z < 0 || exit.z >= depth ||
    exit.level < 0 || exit.level >= levelCount
  ) return false;
  const startWalls = wallsForLayer(start.level);
  if (startWalls === undefined) return false;
  if (startWalls[start.z]?.[start.x] === 1) return false;
  const exitWalls = wallsForLayer(exit.level);
  if (exitWalls === undefined) return false;
  if (exitWalls[exit.z]?.[exit.x] === 1) return false;
  // P3-1: visited as a flat Uint8Array. Index = level * (width *
  // depth) + z * width + x. Same encoding as the spec
  // performance budget; the array size is at most 6 * 50 * 50
  // = 15000 bytes for a full-mesh multi-level maze.
  const layerSize = width * depth;
  const visited = new Uint8Array(layerSize * levelCount);
  type Node = { level: number; x: number; z: number };
  // P3-1: head-index FIFO, same pattern as `isReachable`. The
  // per-frame `Array.shift()` cost would dominate a 15000-node
  // search; the head-index is O(1) per pop and keeps the BFS
  // O(N) in the visited-set size.
  const queue: Node[] = [{ level: start.level, x: start.x, z: start.z }];
  let head = 0;
  const startIndex = start.level * layerSize + start.z * width + start.x;
  visited[startIndex] = 1;
  while (head < queue.length) {
    const c = queue[head++];
    if (c.level === exit.level && c.x === exit.x && c.z === exit.z) return true;
    const neighbors = getCellConnections(
      wallsForLayer,
      c.level,
      levelCount,
      width,
      depth,
      c.x,
      c.z,
      transitions,
    );
    for (const n of neighbors) {
      const k = n.level * layerSize + n.z * width + n.x;
      if (visited[k]) continue;
      visited[k] = 1;
      queue.push(n);
    }
  }
  return false;
}
