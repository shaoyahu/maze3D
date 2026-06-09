import { expandThickWall, type TreeEdge } from './_expandThickWall';

// Kruskal's algorithm on a thick-wall grid.
//
// Run on a logicalSize x logicalSize grid (logicalSize = ceil(visualSize/2))
// where each cell starts in its own union-find set. Build the list of all
// candidate edges (between orthogonal neighbors), shuffle with the rng, then
// process in shuffled order: for each edge connecting two cells in different
// sets, add it to the tree and union the sets. Stops naturally once the tree
// has (logicalSize^2 - 1) edges.
//
// The tree is then expanded into the visualSize x visualSize walls matrix
// by the shared _expandThickWall helper.
export function generateKruskal(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const treeEdges = buildKruskalTree(logicalSize, rng);
  return expandThickWall(visualSize, treeEdges);
}

function buildKruskalTree(size: number, rng: () => number): TreeEdge[] {
  // 1. List all candidate edges (cell <-> right neighbor, cell <-> bottom
  //    neighbor). Each undirected edge gets listed exactly once.
  const edges: TreeEdge[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (x + 1 < size) edges.push({ ax: x, az: z, bx: x + 1, bz: z });
      if (z + 1 < size) edges.push({ ax: x, az: z, bx: x, bz: z + 1 });
    }
  }
  // 2. Fisher–Yates shuffle so different rng streams visit edges in different
  //    orders. Full shuffle (n rng calls) is required here — Kruskal is more
  //    sensitive to ordering than recursive backtracker, and we want adjacent
  //    seeds to produce visibly different mazes.
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = edges[i];
    edges[i] = edges[j];
    edges[j] = tmp;
  }
  // 3. Union-find (path-compressed, union by rank).
  const parent = new Int32Array(size * size);
  const rank = new Uint8Array(size * size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]];
      k = parent[k];
    }
    return k;
  };
  // 4. Walk the shuffled list; keep tree edges, drop the rest.
  const tree: TreeEdge[] = [];
  for (const e of edges) {
    const ra = find(e.az * size + e.ax);
    const rb = find(e.bz * size + e.bx);
    if (ra === rb) continue;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
    tree.push(e);
  }
  return tree;
}
