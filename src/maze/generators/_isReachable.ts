import type { CellType } from '../types';

// BFS over open cells (walls[z][x] === 0). Used by the 4 generator tests to
// assert the algorithm's "fully connected maze" guarantee. Lives in a
// leading-underscore file to signal "test-only helper, not part of the
// provider surface".
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
  const queue: Array<{ x: number; z: number }> = [start];
  visited[start.z * width + start.x] = 1;
  while (queue.length > 0) {
    const c = queue.shift()!;
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
