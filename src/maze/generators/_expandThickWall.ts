import type { CellType } from '../types';

// Shared thick-wall expansion for the 4 procedural generators.
//
// Each algorithm (recursive-backtracker, kruskal, prim, hunt-and-kill)
// produces a spanning tree on the logicalSize x logicalSize grid; this
// helper turns that tree into a visualSize x visualSize walls matrix using
// the renderer's thick-wall convention.
//
// Visual encoding (matches the JsonMazeProvider convention used by the
// renderer: walls[z][x] === 1 means the cell is a wall, 0 means passage):
//   - Even-even positions (2*lx, 2*lz) are the "logical" cells (passages
//     unless isolated).
//   - Edges between adjacent logical cells open the wall cell at the
//     midpoint (one of the 4 odd neighbors).
//   - Odd-odd positions (corners) and the unused last row/column of an
//     even visualSize stay as walls.
export interface TreeEdge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export function expandThickWall(visualSize: number, treeEdges: TreeEdge[]): CellType[][] {
  const logicalSize = Math.ceil(visualSize / 2);
  const walls: CellType[][] = Array.from({ length: visualSize }, () =>
    Array<CellType>(visualSize).fill(1 as CellType),
  );
  // Mark every logical cell (even-even position) as a passage.
  for (let lz = 0; lz < logicalSize; lz++) {
    for (let lx = 0; lx < logicalSize; lx++) {
      const vx = 2 * lx;
      const vz = 2 * lz;
      if (vx < visualSize && vz < visualSize) walls[vz][vx] = 0 as CellType;
    }
  }
  // Open the wall cell at the midpoint of each tree edge. Both endpoints
  // are even, so (ax + bx) / 2 is an integer pointing at the wall between
  // them.
  for (const e of treeEdges) {
    const mx = (2 * e.ax + 2 * e.bx) >> 1;
    const mz = (2 * e.az + 2 * e.bz) >> 1;
    if (mx >= 0 && mx < visualSize && mz >= 0 && mz < visualSize) {
      walls[mz][mx] = 0 as CellType;
    }
  }
  // Force-open start (0,0) and the last logical cell. Both are even
  // positions for the canonical visual sizes (15/30/50) so they are open
  // already, but the defensive re-assignment handles odd visual sizes.
  walls[0][0] = 0 as CellType;
  const exitVx = 2 * (logicalSize - 1);
  const exitVz = 2 * (logicalSize - 1);
  if (exitVx < visualSize && exitVz < visualSize) {
    walls[exitVz][exitVx] = 0 as CellType;
  }
  return walls;
}
