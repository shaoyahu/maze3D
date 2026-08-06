// Shared BSP subdivide for the two recursive-division-style generators.
//
// Both `recursiveDivision` (P2-20) and `blobbyRecursiveDivision` (P2-21)
// start with an empty visual grid and recursively subdivide a logical
// sub-rectangle by drawing a wall (a single row or column of wall cells)
// and leaving one pass. The subdivision tree is identical between the
// two — the only difference is the post-draw decoration: the plain
// variant carves a solid wall + 1 pass; the blobby variant then drops
// 0-2 random holes in the wall for a "natural cave" look.
//
// This module is the shared subdivision driver. The actual wall pixels
// are written by a `drawWall` callback supplied by the caller, so each
// generator controls its own "holes" (or no holes) without forking the
// subdivision logic.
//
// Visual encoding for visualSize = 15, logicalSize = 8 (matches the
// thick-wall convention used by `_expandThickWall` and the rest of the
// generators):
//   - A "horizontal" wall sits at z = 2*lzWall + 1 (odd row), x = 2*lx
//     for each logical column lx in [lx0, lx1]. The pass cell is at
//     x = 2*lxPass (even column), z = 2*lzWall + 1.
//   - A "vertical" wall sits at x = 2*lxWall + 1 (odd column),
//     z = 2*lz for each logical row lz in [lz0, lz1]. The pass cell
//     is at x = 2*lxWall + 1, z = 2*lzPass (even row).
//
// Connectivity: the subdivide algorithm itself does NOT add a perimeter
// wall (the outer ring stays open). Both callers intentionally follow
// this convention — adding a perimeter would either isolate the start
// cell (0, 0) on odd visual sizes or force an aggressive post-process
// that ends up opening nearly every wall.
export interface SubdivideBspOptions<TWall> {
  rng: () => number;
  region: { lx0: number; lz0: number; lx1: number; lz1: number };
  walls: TWall;
  drawWall: (
    walls: TWall,
    wallCells: ReadonlyArray<{ x: number; z: number }>,
    passCell: { x: number; z: number },
  ) => void;
}

export function subdivideBsp<TWall>(opts: SubdivideBspOptions<TWall>): TWall {
  divide(
    opts.region.lx0,
    opts.region.lz0,
    opts.region.lx1,
    opts.region.lz1,
    opts.walls,
    opts.rng,
    opts.drawWall,
  );
  return opts.walls;
}

function divide<TWall>(
  lx0: number,
  lz0: number,
  lx1: number,
  lz1: number,
  walls: TWall,
  rng: () => number,
  drawWall: SubdivideBspOptions<TWall>['drawWall'],
): void {
  const width = lx1 - lx0 + 1;
  const height = lz1 - lz0 + 1;
  // Termination: a 1x1 region cannot be subdivided.
  if (width < 2 && height < 2) return;

  let horizontal: boolean;
  if (width > height) horizontal = false;
  else if (height > width) horizontal = true;
  else horizontal = rng() < 0.5;

  if (horizontal) {
    if (height < 2) return;
    // Pick a wall row (one of the `height - 1` possible gaps between
    // logical rows). Visual z of the wall is 2*lzWall + 1.
    const numWallRows = height - 1;
    const lzWall = lz0 + Math.floor(rng() * numWallRows);
    const zWall = 2 * lzWall + 1;
    // Pick a pass column (one of the `width` logical cells in the row).
    const lxPass = lx0 + Math.floor(rng() * width);
    const xPass = 2 * lxPass;
    const wallCells: Array<{ x: number; z: number }> = [];
    for (let lx = lx0; lx <= lx1; lx++) {
      wallCells.push({ x: 2 * lx, z: zWall });
    }
    drawWall(walls, wallCells, { x: xPass, z: zWall });
    divide(lx0, lz0, lx1, lzWall - 1, walls, rng, drawWall);
    divide(lx0, lzWall + 1, lx1, lz1, walls, rng, drawWall);
  } else {
    if (width < 2) return;
    // Symmetric to the horizontal case.
    const numWallCols = width - 1;
    const lxWall = lx0 + Math.floor(rng() * numWallCols);
    const xWall = 2 * lxWall + 1;
    const lzPass = lz0 + Math.floor(rng() * height);
    const zPass = 2 * lzPass;
    const wallCells: Array<{ x: number; z: number }> = [];
    for (let lz = lz0; lz <= lz1; lz++) {
      wallCells.push({ x: xWall, z: 2 * lz });
    }
    drawWall(walls, wallCells, { x: xWall, z: zPass });
    divide(lx0, lz0, lxWall - 1, lz1, walls, rng, drawWall);
    divide(lxWall + 1, lz0, lx1, lz1, walls, rng, drawWall);
  }
}
