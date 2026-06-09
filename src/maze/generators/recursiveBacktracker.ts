import type { CellType } from '../types';

// Recursive Backtracker on a "thick-wall" grid.
//
// The renderer's convention (JsonMazeProvider): walls[z][x] === 1 means the
// cell (x,z) is a wall, 0 means passage. A standard RB spanning tree on the
// visualSize × visualSize grid would mark every cell as a passage (the tree
// covers them all), producing an empty box. To get a real maze, we run RB
// on a *logical* grid half the size (so adjacent logical cells are
// separated by a 1-cell wall in the visual grid) and expand the result back
// to the visual grid with corridors between connected logical cells.
//
// Visual encoding for visualSize = 15, logicalSize = 8:
//   visual[2*lx][2*lz]            = passage (always)
//   visual[2*lx+1][2*lz] / ...+1  = wall unless logical (lx,lz) <-> (lx+1,lz)
//                                   or (lx,lz+1) is a tree edge, in which
//                                   case the wall is opened.
//   visual[2*lx+1][2*lz+1]        = always wall (corner)
//
// Mapping 15 -> 8, 30 -> 15, 50 -> 25 via logicalSize = Math.ceil(visualSize / 2).
export function generateRecursiveBacktracker(visualSize: number, rng: () => number): CellType[][] {
  const logicalSize = Math.ceil(visualSize / 2);
  // 1. RB spanning tree on the logicalSize x logicalSize grid.
  //    edges[x][z] is a 4-bit bitmask: bit 0 = +x, bit 1 = -x, bit 2 = +z, bit 3 = -z.
  const edges = generateLogicalTree(logicalSize, rng);
  // 2. Expand to the visual grid.
  const walls: CellType[][] = Array.from({ length: visualSize }, () =>
    Array<CellType>(visualSize).fill(1 as CellType),
  );
  for (let lz = 0; lz < logicalSize; lz++) {
    for (let lx = 0; lx < logicalSize; lx++) {
      const vx = 2 * lx;
      const vz = 2 * lz;
      if (vx < visualSize && vz < visualSize) {
        walls[vz][vx] = 0 as CellType;
      }
      const e = edges[lz][lx];
      // Edge +x: open the cell to the right (vx+1, vz) unless the right cell
      // is at the edge of the visual grid (visualSize is odd: e.g. 15 -> 8
      // logical, so the last logical cell is at vx=14, and vx+1=15 is out
      // of bounds; we never open that cell).
      if (e & 0b0001 && vx + 1 < visualSize) walls[vz][vx + 1] = 0 as CellType;
      if (e & 0b0010 && vx - 1 >= 0) walls[vz][vx - 1] = 0 as CellType;
      if (e & 0b0100 && vz + 1 < visualSize) walls[vz + 1][vx] = 0 as CellType;
      if (e & 0b1000 && vz - 1 >= 0) walls[vz - 1][vx] = 0 as CellType;
    }
  }
  // Force-open start (0,0) and exit (visualSize-1, visualSize-1). On the
  // canonical visual sizes (15/30/50) both are even indices, so they are
  // always logical (0,0) / (last,last) passages already; the defensive
  // re-assignment handles odd visual sizes if the API ever grows.
  walls[0][0] = 0 as CellType;
  walls[visualSize - 1][visualSize - 1] = 0 as CellType;
  return walls;
}

// Iterative recursive-backtracker on the logical grid. Returns a 2D bitmask
// grid where each cell lists which of its 4 neighbors are connected by a
// tree edge.
function generateLogicalTree(size: number, rng: () => number): number[][] {
  const edges: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const visited = new Uint8Array(size * size);
  const stack: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  visited[0] = 1;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const dirs = orderedDirs(rng);
    let advanced = false;
    for (const [dx, dz, bit] of dirs) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
      if (visited[nz * size + nx]) continue;
      edges[cur.z][cur.x] |= bit;
      edges[nz][nx] |= OPPOSITE_BIT[bit];
      visited[nz * size + nx] = 1;
      stack.push({ x: nx, z: nz });
      advanced = true;
      break;
    }
    if (!advanced) stack.pop();
  }
  return edges;
}

const OPPOSITE_BIT: Record<number, number> = {
  0b0001: 0b0010,
  0b0010: 0b0001,
  0b0100: 0b1000,
  0b1000: 0b0100,
};

// Pick a random starting direction, then iterate the other 3 in a fixed
// order. A full Fisher–Yates shuffle burns 3 rng() calls per cell even
// though we only consume the first unvisited direction; the trailing 2-3
// calls collapse to wasted entropy and let neighboring seeds collide on
// the first cell.
function orderedDirs(rng: () => number): Array<[number, number, number]> {
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0b0001],
    [-1, 0, 0b0010],
    [0, 1, 0b0100],
    [0, -1, 0b1000],
  ];
  const first = Math.floor(rng() * dirs.length) % dirs.length;
  const out: Array<[number, number, number]> = [dirs[first]];
  for (let i = 0; i < dirs.length; i++) {
    if (i !== first) out.push(dirs[i]);
  }
  return out;
}
