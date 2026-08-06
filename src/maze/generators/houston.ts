import { expandThickWall, type TreeEdge } from './_expandThickWall';
import { _buildAldousBroderTree } from './aldousBroder';
import { _buildWilsonsTree } from './wilsons';

// Houston's algorithm on a thick-wall grid.
//
// A hybrid of Aldous-Broder (P2-20) and Wilson's (P2-20):
//   1. PHASE 1 (Aldous-Broder): random-walk from (0, 0) until at least
//      half the cells are visited. AB gives O(N) edges in O(N²) time.
//   2. PHASE 2 (Wilson's): loop-erased random walks from the remaining
//      unvisited cells until the tree is complete. Wilson's typically
//      finishes quickly once the visited set is already large.
//
// Houston's is faster in practice than pure Wilson's (which often has
// very long first walks) and faster than pure AB (which is O(N²) total).
// It produces uniform spanning trees, same distribution as the two
// underlying algorithms.
//
// Per P2-21 spec FR-11, the AB and Wilson cores are reused (not
// re-implemented) via the `_buildAldousBroderTree` and `_buildWilsonsTree`
// internal exports from `aldousBroder.ts` / `wilsons.ts`. The internal
// exports return adjacency maps; we convert the combined map to the
// TreeEdge[] shape that _expandThickWall expects.
//
// The tree is then expanded into the visualSize x visualSize walls
// matrix by the shared _expandThickWall helper.
export function generateHouston(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const N = logicalSize * logicalSize;
  const halfCount = Math.floor(N / 2);

  // Phase 1: AB until at least half visited. The stopCondition is the
  // only behavioral difference from the public generateAldousBroder
  // path, which terminates at c === N.
  const { tree: tree1, visited: visitedAfterPhase1 } = _buildAldousBroderTree(
    logicalSize,
    rng,
    (c) => c >= halfCount,
  );

  // Phase 2: Wilson's loop-erased walks, resuming from the half-visited
  // state left by phase 1. preVisited is copied inside the helper.
  const { tree: tree2 } = _buildWilsonsTree(logicalSize, rng, visitedAfterPhase1);

  // Merge the two adjacency maps. Insertion order: phase 1 first, then
  // phase 2 — this matches the deterministic output of the previous
  // inline implementation.
  const merged = new Map<number, Set<number>>(tree1);
  for (const [k, neighbors] of tree2) {
    let s = merged.get(k);
    if (!s) {
      s = new Set<number>();
      merged.set(k, s);
    }
    for (const n of neighbors) s.add(n);
  }

  // Convert the merged map to TreeEdge[] (each undirected edge once).
  return expandThickWall(visualSize, mapToTreeEdges(merged, logicalSize));
}

function mapToTreeEdges(
  tree: Map<number, Set<number>>,
  size: number,
): TreeEdge[] {
  const edges: TreeEdge[] = [];
  for (const [a, neighbors] of tree) {
    const ax = a % size;
    const az = Math.floor(a / size);
    for (const b of neighbors) {
      if (a >= b) continue;
      edges.push({
        ax,
        az,
        bx: b % size,
        bz: Math.floor(b / size),
      });
    }
  }
  return edges;
}
