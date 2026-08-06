import { expandThickWall, type TreeEdge } from './_expandThickWall';
import { shuffle4Directions } from './_randomWalk';

// Parallel Recursive Backtracker on a thick-wall grid.
//
// Each cell starts in its own "frontier" (a unique color id). All cells
// are initially active. Repeatedly:
//   1. Pick a random active cell c.
//   2. Try the 4 neighbors in random order. For the first neighbor n
//      whose color differs from c's:
//        - Emit edge c → n.
//        - Union: every cell of n's color takes c's color.
//        - If n is not already active, push it.
//   3. If no such neighbor exists, c is "complete" — remove from active.
//
// When all cells are in one color group, the algorithm terminates. The
// result is a spanning tree.
//
// The visual style: multiple frontier trees growing in parallel; when
// two frontiers meet, they merge. Compared to the textbook RB (which
// is a single walker and produces a "spaghetti" pattern), the parallel
// variant produces more regular "comb" shapes.
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generateParallelBacktracker(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildParallelBacktrackerTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildParallelBacktrackerTree(size: number, rng: () => number): TreeEdge[] {
  const N = size * size;
  const edges: TreeEdge[] = [];
  // color[c] = frontier group id of cell c. Initially each cell is its own
  // group (color === flat index). When two groups merge, all cells of the
  // smaller-indexed (loser) id take the larger (winner) id.
  const color = new Int32Array(N);
  for (let i = 0; i < N; i++) color[i] = i;
  // inActive[c] = 1 if cell c is still in the active list. Maintained as
  // a bitset so we can avoid the linear search that an indexOf would
  // require after splice.
  const inActive = new Uint8Array(N).fill(1);
  // active = flat indices currently in the frontier.
  const active: number[] = new Array(N);
  for (let i = 0; i < N; i++) active[i] = i;

  while (active.length > 0) {
    // Pick a random active cell.
    const idx = Math.floor(rng() * active.length);
    const c = active[idx];
    const cx = c % size;
    const cz = Math.floor(c / size);

    // Try the 4 directions in random order (Fisher–Yates shuffle, 3 rng
    // calls — matches the original inline pattern exactly) until we
    // find a neighbor whose color differs from c's.
    let found = false;
    for (const { dx, dz } of shuffle4Directions(rng)) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
      const n = nz * size + nx;
      if (color[c] === color[n]) continue;
      // Merge frontier n into frontier c: emit edge and union.
      edges.push({ ax: cx, az: cz, bx: nx, bz: nz });
      const oldColor = color[n];
      const newColor = color[c];
      // O(N) scan per union; for our logical sizes (≤ 25) this is fine.
      for (let k = 0; k < N; k++) {
        if (color[k] === oldColor) color[k] = newColor;
      }
      if (!inActive[n]) {
        inActive[n] = 1;
        active.push(n);
      }
      found = true;
      break;
    }
    if (!found) {
      // c is complete: no more different-color neighbors.
      inActive[c] = 0;
      active.splice(idx, 1);
    }
  }

  return edges;
}
