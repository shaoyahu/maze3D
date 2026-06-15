import { expandThickWall, type TreeEdge } from './_expandThickWall';

// Hunt-and-Kill algorithm on a thick-wall grid.
//
// Walk phase: from the current cell, randomly pick an unvisited neighbor and
// carve a passage to it; move there and repeat. If no unvisited neighbors
// exist, the walk "dies".
//
// Hunt phase: scan the grid row-by-row for an unvisited cell that has at
// least one visited neighbor. Pick one of those visited neighbors at random,
// carve a passage, and resume the walk from the unvisited cell.
//
// Stops once every cell is visited; the result is a spanning tree.
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generateHuntAndKill(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildHuntAndKillTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildHuntAndKillTree(size: number, rng: () => number): TreeEdge[] {
  const visited = new Uint8Array(size * size);
  const tree: TreeEdge[] = [];
  let curX = 0;
  let curZ = 0;
  visited[0] = 1;

  while (true) {
    // Walk: try to extend from curX,curZ.
    const unvisitedNeighbors = unvisitedNeighborList(curX, curZ, visited, size);
    if (unvisitedNeighbors.length > 0) {
      const [dx, dz] = unvisitedNeighbors[Math.floor(rng() * unvisitedNeighbors.length)];
      const nx = curX + dx;
      const nz = curZ + dz;
      tree.push({ ax: curX, az: curZ, bx: nx, bz: nz });
      visited[nz * size + nx] = 1;
      curX = nx;
      curZ = nz;
      continue;
    }
    // Hunt: scan row-by-row for an unvisited cell that borders a visited one.
    let found = false;
    for (let z = 0; z < size && !found; z++) {
      for (let x = 0; x < size && !found; x++) {
        if (visited[z * size + x]) continue;
        const visitedNeighbors = visitedNeighborList(x, z, visited, size);
        if (visitedNeighbors.length === 0) continue;
        const [dx, dz] = visitedNeighbors[Math.floor(rng() * visitedNeighbors.length)];
        const vx = x + dx;
        const vz = z + dz;
        tree.push({ ax: x, az: z, bx: vx, bz: vz });
        visited[z * size + x] = 1;
        curX = x;
        curZ = z;
        found = true;
      }
    }
    if (!found) break; // every cell visited
  }
  return tree;
}

// F-2026-06-15-L-5.5: accept `size` as a parameter instead of recomputing
// `Math.sqrt(visited.length)` on every call. The walk + hunt phases call
// these helpers O(cells × degree) times per generation.
function unvisitedNeighborList(
  x: number,
  z: number,
  visited: Uint8Array,
  size: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (x + 1 < size && !visited[z * size + x + 1]) out.push([1, 0]);
  if (x - 1 >= 0 && !visited[z * size + x - 1]) out.push([-1, 0]);
  if (z + 1 < size && !visited[(z + 1) * size + x]) out.push([0, 1]);
  if (z - 1 >= 0 && !visited[(z - 1) * size + x]) out.push([0, -1]);
  return out;
}

function visitedNeighborList(
  x: number,
  z: number,
  visited: Uint8Array,
  size: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (x + 1 < size && visited[z * size + x + 1]) out.push([1, 0]);
  if (x - 1 >= 0 && visited[z * size + x - 1]) out.push([-1, 0]);
  if (z + 1 < size && visited[(z + 1) * size + x]) out.push([0, 1]);
  if (z - 1 >= 0 && visited[(z - 1) * size + x]) out.push([0, -1]);
  return out;
}
