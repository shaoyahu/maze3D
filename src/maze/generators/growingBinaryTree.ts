import { expandThickWall, type TreeEdge } from './_expandThickWall';

// Growing Binary Tree on a thick-wall grid.
//
// Simplification of the Growing Tree algorithm (P2-19): every cell
// removed from the active list is removed FOREVER (Growing Tree only
// removes a cell once it has no unvisited neighbors). The "binary"
// variant: each cell, when picked, attempts to grow to up to 2
// unvisited neighbors (one per direction) before being removed.
//
// This produces a visual style somewhere between Recursive Backtracker
// (a single walker that backtracks through a stack) and Prim's
// (a frontier that grows uniformly): the walker is "decisive" — it
// commits to its growth, then dies — but the active set can still
// have multiple alive cells at once.
//
// Spec note: the textbook Growing Binary Tree only uses 2 directions
// (north + east), which would only fill half the maze. We use all 4
// directions on the thick-wall grid and keep the "binary" semantics
// as "up to 2 growth steps per cell". This matches the visual intent
// without leaving the maze half-empty.
//
// The tree is then expanded into the visualSize x visualSize walls
// matrix by the shared _expandThickWall helper.
export function generateGrowingBinaryTree(
  visualSize: number,
  rng: () => number,
) {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildGrowingBinaryTreeTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildGrowingBinaryTreeTree(size: number, rng: () => number): TreeEdge[] {
  const N = size * size;
  const edges: TreeEdge[] = [];
  const visited = new Uint8Array(N);
  const active: number[] = [];

  // Start at (0, 0).
  visited[0] = 1;
  active.push(0);

  while (active.length > 0) {
    // Pick a random active cell. **Always remove it** (this is the
    // distinction from the P2-19 Growing Tree, which keeps a cell in
    // active as long as it has unvisited neighbors).
    const idx = Math.floor(rng() * active.length);
    const c = active[idx];
    active.splice(idx, 1);
    const cx = c % size;
    const cz = Math.floor(c / size);

    // Collect unvisited neighbors and try up to 2 of them.
    const unvisited: Array<{ x: number; z: number }> = [];
    if (cx + 1 < size && !visited[c + 1]) unvisited.push({ x: cx + 1, z: cz });
    if (cx - 1 >= 0 && !visited[c - 1]) unvisited.push({ x: cx - 1, z: cz });
    if (cz + 1 < size && !visited[c + size]) unvisited.push({ x: cx, z: cz + 1 });
    if (cz - 1 >= 0 && !visited[c - size]) unvisited.push({ x: cx, z: cz - 1 });

    const numToPush = Math.min(2, unvisited.length);
    for (let i = 0; i < numToPush; i++) {
      // Sample without replacement: pick a random unvisited neighbor
      // and remove it from the candidate list so we don't push the
      // same cell twice.
      const ni = Math.floor(rng() * unvisited.length);
      const next = unvisited[ni];
      edges.push({ ax: cx, az: cz, bx: next.x, bz: next.z });
      visited[next.z * size + next.x] = 1;
      active.push(next.z * size + next.x);
      unvisited.splice(ni, 1);
    }
  }

  return edges;
}
