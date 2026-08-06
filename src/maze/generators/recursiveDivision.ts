import type { CellType } from '../types';
import { subdivideBsp } from './_subdivideBsp';

// Recursive Division on a thick-wall grid.
//
// "Reverse" algorithm: start with the entire interior open, then
// recursively subdivide each region by adding a wall (one of the
// in-region rows/columns of wall cells) and leaving exactly one pass.
//
// Operates on the LOGICAL grid (ceil(visualSize/2) x ceil(visualSize/2)
// cells) and directly writes to the visual grid. Wall cells in the
// "horizontal" wall are at (even x, odd z) — the wall between two
// adjacent rows of logical cells. Wall cells in the "vertical" wall
// are at (odd x, even z) — between two columns. Each wall leaves one
// cell set to 0 (the pass) and the rest set to 1.
//
// The shared _expandThickWall helper is intentionally NOT used here:
// Recursive Division's domain is the visual grid, not the logical tree
// (the algorithm doesn't produce a spanning tree in the same sense as
// the other generators — it produces a hierarchical partition of the
// cells). The BSP subdivision itself IS shared with
// `blobbyRecursiveDivision` (P2-21) via `_subdivideBsp`; only the
// `drawWall` callback differs (this variant draws a solid wall, the
// blobby variant adds 0-2 random holes).
//
// Visual style: rooms in the interior, with a walkable outer ring
// (boundary is all passage). The start and exit are at the corners;
// the player can either walk around the perimeter or cut through the
// interior via the algorithm's passes. The textbook "outer boundary
// is wall" variant is not implemented here — adding it would either
// isolate the start (forcing aggressive post-processing that ends up
// opening nearly all walls) or compromise the room aesthetic.
export function generateRecursiveDivision(visualSize: number, rng: () => number): CellType[][] {
  const walls: CellType[][] = Array.from({ length: visualSize }, () =>
    Array<CellType>(visualSize).fill(0 as CellType),
  );
  const logicalSize = Math.ceil(visualSize / 2);
  subdivideBsp({
    rng,
    walls,
    region: { lx0: 0, lz0: 0, lx1: logicalSize - 1, lz1: logicalSize - 1 },
    drawWall: (w, wallCells, passCell) => {
      for (const { x, z } of wallCells) {
        w[z][x] = (x === passCell.x && z === passCell.z ? 0 : 1) as CellType;
      }
    },
  });
  return walls;
}
