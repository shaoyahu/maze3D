export interface WallGrid {
  width: number;
  depth: number;
  cellSize: number;
  get(x: number, z: number): 0 | 1;
}

export interface PlayerPos {
  x: number;
  z: number;
  r: number;
}

export interface Delta {
  dx: number;
  dz: number;
}

export function resolveMove(
  p: PlayerPos,
  d: Delta,
  grid: WallGrid,
): { x: number; z: number } {
  let { x, z, r } = p;
  // Resolve X axis
  const newX = x + d.dx;
  if (!collidesAt(newX, z, r, grid)) x = newX;
  // Resolve Z axis
  const newZ = z + d.dz;
  if (!collidesAt(x, newZ, r, grid)) z = newZ;
  return { x, z };
}

function collidesAt(
  px: number,
  pz: number,
  r: number,
  grid: WallGrid,
): boolean {
  const cs = grid.cellSize;
  const minCellX = Math.floor((px - r) / cs);
  const maxCellX = Math.floor((px + r) / cs);
  const minCellZ = Math.floor((pz - r) / cs);
  const maxCellZ = Math.floor((pz + r) / cs);
  for (let cz = minCellZ; cz <= maxCellZ; cz++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.depth) {
        return true;
      }
      if (grid.get(cx, cz) === 1) {
        return true;
      }
    }
  }
  return false;
}
