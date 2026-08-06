import { expandThickWall, type TreeEdge } from './_expandThickWall';
import type { CellType } from '../types';

// Sidewinder algorithm on a thick-wall grid.
//
// Each row is processed left-to-right:
//   1. First row: always carve east. The standard textbook Sidewinder uses
//      a 50% probability per pair here, but that can produce multiple
//      disjoint "corridors" in the first row — and subsequent rows' up
//      carves only connect to the same column, so the resulting maze is
//      not guaranteed to be a single connected component. Forcing the
//      first row into a single corridor makes the first row the unique
//      "root" of all subsequent runs and guarantees connectivity.
//   2. Subsequent rows:
//      - Maintain a "run" of consecutive cells (the cells that have
//        right-unioned together).
//      - For each cell: 50% chance of a right union (the cell continues
//        the run).
//      - Otherwise: pick a random cell from the run and carve up to the
//        row above. Reset the run.
//      - At the end of the row, close any remaining run (carve up).
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generateSidewinder(visualSize: number, rng: () => number): CellType[][] {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildSidewinderTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildSidewinderTree(size: number, rng: () => number): TreeEdge[] {
  const edges: TreeEdge[] = [];
  for (let r = 0; r < size; r++) {
    // run = flat list of cell column-indices in the current run.
    let run: number[] = [];
    for (let c = 0; c < size; c++) {
      if (r === 0) {
        // First row: always carve east (see header comment).
        if (c < size - 1) {
          edges.push({ ax: c, az: r, bx: c + 1, bz: r });
        }
      } else {
        // Subsequent rows: track the run, 50% right union or close it.
        run.push(c);
        if (c < size - 1 && rng() < 0.5) {
          // Right union, continue the run.
          edges.push({ ax: c, az: r, bx: c + 1, bz: r });
        } else {
          // Close the run: pick a random cell from the run and carve up.
          const pick = run[Math.floor(rng() * run.length)];
          edges.push({ ax: pick, az: r, bx: pick, bz: r - 1 });
          run = [];
        }
      }
    }
    // End of non-first row: close any remaining run.
    if (r > 0 && run.length > 0) {
      const pick = run[Math.floor(rng() * run.length)];
      edges.push({ ax: pick, az: r, bx: pick, bz: r - 1 });
    }
  }
  return edges;
}
