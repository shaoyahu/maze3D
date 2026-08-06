import type { CellType } from '../types';
import { subdivideBsp } from './_subdivideBsp';

// "Blobby" Recursive Subdivision on a thick-wall grid.
//
// Variant of Recursive Division (P2-20) where each wall row/column
// gets a number of "holes" (extra carved cells beyond the one pass).
// The holes turn the standard straight walls into curvy, organic-
// looking partitions — hence "blobby". Visually distinct from the
// straight-line Recursive Division.
//
// Implementation strategy (this file):
//   - Like P2-20 Recursive Division, operate directly on the visual
//     grid (no expandThickWall): walls are odd-even or even-odd cells.
//   - Run the standard BSP subdivision (shared via `_subdivideBsp`)
//     with a single guaranteed pass.
//   - In addition, on every non-trivial wall, drop 0-2 random "holes"
//     (a wall cell set to 0) so the wall is no longer continuous.
//     Holes are picked uniformly at random from the wall cells (not
//     including the pass). The hole count is bounded by `Math.floor
//     (rng() * 3)` so most walls are still mostly solid; the blobby
//     look is a "spice" on top of the room layout.
//
//   - Like P2-20 Recursive Division, no outer perimeter walls
//     (boundary is the walkable outer ring). This keeps start↔exit
//     connectivity trivial and avoids the P2-20 "post-process goes
//     viral" trap that ended up opening all walls.
//
// The result is connected (every cell is reachable from (0, 0) via
// either the BSP passes or the random holes).
export function generateBlobbyRecursiveDivision(
  visualSize: number,
  rng: () => number,
): CellType[][] {
  const walls: CellType[][] = Array.from({ length: visualSize }, () =>
    Array<CellType>(visualSize).fill(0 as CellType),
  );
  const logicalSize = Math.ceil(visualSize / 2);
  subdivideBsp({
    rng,
    walls,
    region: { lx0: 0, lz0: 0, lx1: logicalSize - 1, lz1: logicalSize - 1 },
    drawWall: (w, wallCells, passCell) => {
      // Step 1: draw the straight wall (1 pass, the rest solid).
      for (const { x, z } of wallCells) {
        w[z][x] = (x === passCell.x && z === passCell.z ? 0 : 1) as CellType;
      }
      // Step 2: drop 0-2 random "holes" so the wall is no longer
      // continuous. The hole count is 0, 1, or 2 (uniform). Skip
      // picks that landed on the pass cell or a cell we already
      // carved (e.g. picked twice).
      //
      // The BSP can hand us an empty wallCells list when a sub-
      // recursion lands on a degenerate region (e.g. a 2-wide, 0-tall
      // slice that slipped past the top-level `width < 2 && height < 2`
      // early return because the relevant axis was still >= 2). The
      // original inline blobby implementation also reached this case
      // and consumed the rng() calls anyway; we preserve that pattern
      // to keep the seed→output mapping stable.
      const numHoles = Math.floor(rng() * 3);
      for (let h = 0; h < numHoles; h++) {
        if (wallCells.length === 0) {
          // Match original: consume the rng but no cell to pick.
          void rng();
          continue;
        }
        const pick = wallCells[Math.floor(rng() * wallCells.length)];
        if (pick.x === passCell.x && pick.z === passCell.z) continue;
        if (w[pick.z][pick.x] === 1) {
          w[pick.z][pick.x] = 0 as CellType;
        }
      }
    },
  });
  return walls;
}
