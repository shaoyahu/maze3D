import type { CellType } from './types';

// BFS over open cells (walls[z][x] === 0). Used by the generator tests to
// assert the algorithm's "fully connected maze" guarantee, and by the
// editor's design validator to flag unreachable exits. Public utility.
export function isReachable(
  walls: CellType[][],
  start: { x: number; z: number },
  exit: { x: number; z: number },
): boolean {
  const depth = walls.length;
  const width = depth > 0 ? walls[0].length : 0;
  if (depth === 0 || width === 0) return false;
  if (walls[start.z][start.x] === 1 || walls[exit.z][exit.x] === 1) return false;
  const visited = new Uint8Array(width * depth);
  // F-L12: head-index FIFO instead of `Array.shift()` (O(n) per pop).
  // The whole BFS drops from O(n²) to O(n) on a width*depth grid.
  const queue: Array<{ x: number; z: number }> = [start];
  let head = 0;
  visited[start.z * width + start.x] = 1;
  while (head < queue.length) {
    const c = queue[head++];
    if (c.x === exit.x && c.z === exit.z) return true;
    const neighbors = [
      { x: c.x + 1, z: c.z },
      { x: c.x - 1, z: c.z },
      { x: c.x, z: c.z + 1 },
      { x: c.x, z: c.z - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.z < 0 || n.z >= depth) continue;
      if (walls[n.z][n.x] === 1) continue;
      const k = n.z * width + n.x;
      if (visited[k]) continue;
      visited[k] = 1;
      queue.push(n);
    }
  }
  return false;
}
