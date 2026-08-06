import type { CellType } from '../types';

// Binary Tree algorithm on a thick-wall grid.
//
// For each even-even cell (a "logical" cell in the thick-wall layout),
// pick 50% north or 50% east and carve a passage in that direction.
// Cells on the top row (z=0) can only carve east; cells on the right
// column (x=visualSize-1) can only carve north. The top-right corner
// (visualSize-1, 0) is a dead end — it has no valid carving direction
// and does not emit an edge.
//
// Unlike the other generators, Binary Tree directly operates on the
// visual grid (not the logical grid) because the algorithm itself is so
// simple that the logical -> visual expansion step would just add noise.
// The shared _expandThickWall helper is intentionally NOT used here.
//
// Connectivity caveat: the textbook Binary Tree can produce a *forest*
// rather than a *tree* — a row in which every cell carves east leaves
// that entire row disconnected from the rest of the maze. To guarantee
// a single connected component (which our isReachable test requires),
// `ensureConnectivity` runs after generation: BFS from (0, 0), and for
// every unreachable even-even cell, open the wall to the closest
// reachable neighbor (preferring north, then east, west, south).
export function generateBinaryTree(visualSize: number, rng: () => number): CellType[][] {
  const walls: CellType[][] = Array.from({ length: visualSize }, () =>
    Array<CellType>(visualSize).fill(1 as CellType),
  );
  // Mark every even-even cell as a passage.
  for (let z = 0; z < visualSize; z += 2) {
    for (let x = 0; x < visualSize; x += 2) {
      walls[z][x] = 0 as CellType;
    }
  }
  // For each even-even cell, pick a direction and carve.
  // visualSize is always odd (15/30/50), so the last even index is
  // visualSize - 1. The top-right corner is (visualSize-1, 0): no up
  // (z=0) and no right (x=visualSize-1, the next even column would be
  // out of bounds), so it is a dead end and emits no edge.
  for (let z = 0; z < visualSize; z += 2) {
    for (let x = 0; x < visualSize; x += 2) {
      const canUp = z > 0;
      const canRight = x < visualSize - 1;
      let carveUp: boolean;
      if (canUp && canRight) {
        carveUp = rng() < 0.5;
      } else if (canUp) {
        carveUp = true;
      } else if (canRight) {
        carveUp = false;
      } else {
        // Top-right corner: dead end, no edge emitted.
        continue;
      }
      if (carveUp) {
        walls[z - 1][x] = 0 as CellType;
      } else {
        walls[z][x + 1] = 0 as CellType;
      }
    }
  }
  ensureConnectivity(walls);
  return walls;
}

// Post-processing pass: BFS from (0, 0); for every unreachable even-even
// cell, open a wall to the closest reachable even-even neighbor. The
// resulting maze is guaranteed to be a single connected component. (The
// added edges can create cycles — i.e., the result is no longer a pure
// spanning tree — but for our purposes, connectivity is what matters.)
function ensureConnectivity(walls: CellType[][]): void {
  const visualSize = walls.length;
  // BFS from (0, 0).
  const visited = new Uint8Array(visualSize * visualSize);
  bfs(walls, { x: 0, z: 0 }, visited);
  // For each unreachable even-even cell, open a wall to a reachable
  // neighbor. Try north first (most common in Binary Tree), then east,
  // west, south.
  const dirs: Array<[number, number, number, number]> = [
    [0, -1, 0, -2],   // north: wall (x, z-1), neighbor (x, z-2)
    [1, 0, 2, 0],     // east: wall (x+1, z), neighbor (x+2, z)
    [-1, 0, -2, 0],   // west: wall (x-1, z), neighbor (x-2, z)
    [0, 1, 0, 2],     // south: wall (x, z+1), neighbor (x, z+2)
  ];
  for (let z = 0; z < visualSize; z += 2) {
    for (let x = 0; x < visualSize; x += 2) {
      if (visited[z * visualSize + x]) continue;
      for (const [wx, wz, nx, nz] of dirs) {
        const ax = x + wx;
        const az = z + wz;
        const bx = x + nx;
        const bz = z + nz;
        if (ax < 0 || ax >= visualSize || az < 0 || az >= visualSize) continue;
        if (bx < 0 || bx >= visualSize || bz < 0 || bz >= visualSize) continue;
        if (visited[bz * visualSize + bx]) {
          walls[az][ax] = 0 as CellType;
          bfs(walls, { x, z }, visited);
          break;
        }
      }
    }
  }
}

// BFS over open cells (walls[z][x] === 0) starting from `start`; marks
// every reachable cell in `visited`. Mutates `visited` in place.
function bfs(
  walls: CellType[][],
  start: { x: number; z: number },
  visited: Uint8Array,
): void {
  const visualSize = walls.length;
  const startK = start.z * visualSize + start.x;
  if (visited[startK]) return;
  visited[startK] = 1;
  const queue: Array<{ x: number; z: number }> = [start];
  let head = 0;
  while (head < queue.length) {
    const c = queue[head++];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = c.x + dx;
      const nz = c.z + dz;
      if (nx < 0 || nx >= visualSize || nz < 0 || nz >= visualSize) continue;
      if (walls[nz][nx] === 1) continue;
      const k = nz * visualSize + nx;
      if (visited[k]) continue;
      visited[k] = 1;
      queue.push({ x: nx, z: nz });
    }
  }
}
