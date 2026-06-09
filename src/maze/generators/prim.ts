import { expandThickWall, type TreeEdge } from './_expandThickWall';

// Randomized Prim's algorithm on a thick-wall grid.
//
// Start at (0,0) and grow the tree by repeatedly picking a random edge from
// the frontier (the set of edges that cross from a visited cell to an
// unvisited cell). Adding a cell pulls its outgoing edges into the frontier.
// Stops once every cell is visited; the result is a spanning tree.
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generatePrim(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildPrimTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildPrimTree(size: number, rng: () => number): TreeEdge[] {
  const visited = new Uint8Array(size * size);
  // Frontier as a flat array; for O(1) random removal we pick an index, swap
  // it with the last element, and pop. This avoids the O(n) cost of an
  // array.shift() and keeps the data structure cache-friendly.
  const frontier: TreeEdge[] = [];
  const seedX = 0;
  const seedZ = 0;
  visited[0] = 1;
  pushNeighbors(seedX, seedZ, visited, frontier);

  const tree: TreeEdge[] = [];
  while (frontier.length > 0) {
    const idx = Math.floor(rng() * frontier.length);
    const e = frontier[idx];
    // Swap-and-pop removal.
    frontier[idx] = frontier[frontier.length - 1];
    frontier.pop();
    const bk = e.bz * size + e.bx;
    if (visited[bk]) continue; // edge already consumed by a prior pick
    visited[bk] = 1;
    tree.push(e);
    pushNeighbors(e.bx, e.bz, visited, frontier);
  }
  return tree;
}

function pushNeighbors(
  x: number,
  z: number,
  visited: Uint8Array,
  frontier: TreeEdge[],
): void {
  const size = Math.sqrt(visited.length);
  if (x + 1 < size && !visited[z * size + x + 1]) {
    frontier.push({ ax: x, az: z, bx: x + 1, bz: z });
  }
  if (x - 1 >= 0 && !visited[z * size + x - 1]) {
    frontier.push({ ax: x, az: z, bx: x - 1, bz: z });
  }
  if (z + 1 < size && !visited[(z + 1) * size + x]) {
    frontier.push({ ax: x, az: z, bx: x, bz: z + 1 });
  }
  if (z - 1 >= 0 && !visited[(z - 1) * size + x]) {
    frontier.push({ ax: x, az: z, bx: x, bz: z - 1 });
  }
}
