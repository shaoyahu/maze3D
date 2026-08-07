// P4: 3D Recursive Backtracker — single-cube voxel maze generator.
//
// Algorithm: depth-first search on a 3D cubic lattice with 6
// neighbors (±x, ±y, ±z), spanning 2 cells per step (thick-wall
// encoding: odd-indexed cells are the spanning tree nodes,
// even-indexed cells are the wall borders that get carved out
// as passage). This is the same shape as the 2D `recursiveBacktracker.ts`
// lifted into 3D; the data layout and the cell convention are
// the only deltas, not the algorithm itself.
//
// "Thick-wall" encoding (same as 2D, in 3D):
//   - visualSize is odd (5 / 7 / 9 for the P4a MVP sizes).
//   - Odd indices (1, 3, ..., visualSize - 2) are the spanning
//     tree's logical cells; the algorithm operates on these.
//   - Even indices (0, 2, ..., visualSize - 1) are the wall
//     borders that surround each logical cell. When the DFS
//     carves a step from `(cx, cy, cz)` to `(nx, ny, nz)` (both
//     odd, 2 cells apart), the midpoint cell becomes passage (0).
//   - The outermost ring (index 0 and visualSize - 1 on each
//     axis) stays wall (1) so the maze has a solid border.
//
// Determinism: the function consumes `rng` in a stable order
// (start cell pick, then DFS push order, then random neighbor
// pick per step), so a fixed `(visualSize, rngSeed)` always
// returns the same maze. The provider constructs the rng via
// `mulberry32(fnv1a(mazeSeedHex))` (P3-1 convention) so the
// URL round-trip is reproducible.
//
// Reachability: the algorithm produces a spanning tree, so
// every carved cell is connected. The validator's
// `bfs3DReachable` (P4a follow-up) confirms start ↔ exit reachability
// — for a hand-crafted 3D JSON, BFS still catches non-tree
// cells that were set to 0 by mistake.

import type { CellType } from '../types';

// P4: 3D size whitelist mirrors the 2D MAZE_SIZE_VALUES but in odd
// integers. P4a ships 5 / 7 / 9 (the smallest three — wall-count
// per cell grows fast and 9 already draws ~700 cuboids / 729
// cells). P4b-CellSize widens this set to 11 / 13 / 15 — the
// P4a spec §15 budget (5s) is large enough to cover 15³
// (3375 cells, ~1687 cuboids) under the O(N) 3D RB / 3D Prim
// family. The whitelist order is preserved (smallest → largest)
// so a `for (const size of VALID_3D_SIZES)` consumer iterates
// in increasing visual-size order. P4b-CellSize §4 perf
// budget: 11³ < 1.5s, 13³ < 3s, 15³ < 5s.
const VALID_3D_SIZES = [5, 7, 9, 11, 13, 15] as const;
export type Voxel3DSize = (typeof VALID_3D_SIZES)[number];

export function isVoxel3DSize(n: unknown): n is Voxel3DSize {
  return typeof n === 'number' && (VALID_3D_SIZES as readonly number[]).includes(n);
}

/**
 * Generate a 3D voxel maze via recursive backtracker.
 *
 * @param visualSize odd integer (5 / 7 / 9). Even sizes would
 *   produce ambiguous thick-wall encodings and are rejected up
 *   front — a `generateMultiLevel` caller is expected to pass
 *   the seed's size (which the seed codec already filters through
 *   `isVoxel3DSize`).
 * @param rng deterministic PRNG (mulberry32 in the provider path).
 *   The function calls rng() once for the start cell and once
 *   per DFS branch (random neighbor pick), so the rng-consume
 *   order is part of the contract — a refactor that re-orders
 *   the calls would silently change the URL round-trip output.
 * @returns a `CellType[][][]` of shape `[visualSize][visualSize][visualSize]`
 *   with 0 = passage, 1 = wall. The outermost ring stays wall
 *   so the cube is sealed.
 */
export function generateRecursiveBacktracker3D(
  visualSize: number,
  rng: () => number,
): CellType[][][] {
  if (!isVoxel3DSize(visualSize)) {
    throw new Error(
      `generateRecursiveBacktracker3D: visualSize (${visualSize}) must be one of ${VALID_3D_SIZES.join(', ')}`,
    );
  }
  // F-P4-1: 3D array allocation. For visualSize=9 this is 9×9×9 = 729
  // cells. With each cell as a 4-byte number (CellType is `0 | 1`,
  // JS numbers are 8 bytes) that's ~5.8 KB per maze — comfortably
  // small. We build the array cell-by-cell (vs. a single
  // `Array.from({ length: 9 }, () => ...)` triple) so the
  // `[z][y][x]` dimension order is obvious at the call site
  // and future readers don't have to mentally unfold the
  // one-liner.
  const walls: CellType[][][] = [];
  for (let z = 0; z < visualSize; z++) {
    const layer: CellType[][] = [];
    for (let y = 0; y < visualSize; y++) {
      const row: CellType[] = new Array<CellType>(visualSize).fill(1);
      layer.push(row);
    }
    walls.push(layer);
  }

  // F-P4-2: thick-wall coordinate helpers. `oddIdx(i)` returns
  // the i-th odd index (1, 3, 5, ..., visualSize-2). The DFS
  // operates on odd indices only; even indices are wall borders
  // that get carved out as passage mid-step.
  const oddIdx = (i: number): number => 1 + 2 * i;
  const maxIdx = (visualSize - 1) / 2; // = oddIdx(count-1) where count = (visualSize+1)/2

  // Pick the start cell. The center cube (maxIdx/2) is a reasonable
  // default that avoids a long DFS run to the corner; using rng()
  // here means the start is still deterministic per seed.
  const startLogical = Math.floor(rng() * maxIdx);
  const startX = oddIdx(startLogical);
  const startY = oddIdx(startLogical);
  const startZ = oddIdx(startLogical);
  walls[startZ][startY][startX] = 0;

  // F-P4-3: 6 neighbor offsets, each spanning 2 cells (thick-wall
  // step). Stored as a static const because the per-step inner
  // loop is hot and a re-allocated array would add GC churn.
  // The y±1 delta (up/down) is new in 3D — the 2D algorithm has
  // only the 4 horizontal neighbors and the y component is zero.
  const DIRS: ReadonlyArray<readonly [number, number, number]> = [
    [2, 0, 0],   // +x
    [-2, 0, 0],  // -x
    [0, 2, 0],   // +y (up)
    [0, -2, 0],  // -y (down)
    [0, 0, 2],   // +z
    [0, 0, -2],  // -z
  ];

  // F-P4-4: explicit stack-based DFS. Recursive DFS would blow the
  // call stack for visualSize=9 (the worst case is a single-path
  // labyrinth; depth could approach N=729). Iterative DFS with
  // a plain array stack is fine — push/pop are O(1) and the stack
  // is bounded by N.
  const stack: Array<[number, number, number]> = [[startX, startY, startZ]];

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const cx = top[0];
    const cy = top[1];
    const cz = top[2];

    // Collect unvisited neighbors (still wall, in-bounds, odd
    // step away). The list is built fresh each iteration so the
    // unvisited set shrinks as the tree grows.
    const neighbors: Array<[number, number, number]> = [];
    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[i];
      const nx = cx + d[0];
      const ny = cy + d[1];
      const nz = cz + d[2];
      if (
        nx >= 0 && nx < visualSize &&
        ny >= 0 && ny < visualSize &&
        nz >= 0 && nz < visualSize &&
        walls[nz][ny][nx] === 1
      ) {
        neighbors.push([nx, ny, nz]);
      }
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    // F-P4-5: random neighbor pick consumes exactly one rng()
    // per branch. A previous version of this function picked
    // `Math.floor(rng() * neighbors.length)` directly; that
    // worked but was harder to read. The explicit `pickIdx`
    // variable documents the contract.
    const pickIdx = Math.floor(rng() * neighbors.length);
    const nx = neighbors[pickIdx][0];
    const ny = neighbors[pickIdx][1];
    const nz = neighbors[pickIdx][2];

    // F-P4-6: carve the step. The midpoint (between the two odd
    // cells, one even cell on each axis) becomes passage (0);
    // the destination odd cell becomes passage (0). The origin
    // odd cell is already 0 from the previous step (or the
    // start cell). After this, both `walls[cx][cy][cz]` and
    // `walls[nx][ny][nz]` are 0, and the midpoint is 0 — three
    // cells in a straight line are all passage.
    walls[(cz + nz) / 2][(cy + ny) / 2][(cx + nx) / 2] = 0;
    walls[nz][ny][nx] = 0;
    stack.push([nx, ny, nz]);
  }

  return walls;
}

export { VALID_3D_SIZES };
