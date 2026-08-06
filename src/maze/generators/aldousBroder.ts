import { expandThickWall, type TreeEdge } from './_expandThickWall';
import { randomFlatNeighbor } from './_randomWalk';

// Aldous-Broder algorithm on a thick-wall grid.
//
// Random walk: start at any cell (we use (0, 0)). Repeatedly pick a
// random neighbor of the current cell. If the neighbor is unvisited,
// add an edge current→neighbor and mark the neighbor visited. Either
// way, the walker moves to the neighbor.
//
// The result is a UNIFORM spanning tree: every spanning tree on the
// grid is equally likely. Visually, the maze has no long corridors
// or "long straight" sections — it's a uniform random mess. The
// distribution is the same as Wilson's but the algorithm is much
// simpler (and slower; O(N²) expected time).
//
// Boundary handling: when the walker picks an out-of-bounds neighbor,
// the standard textbook variant is to *stay put* (don't move, just
// try again next step). This makes the walker bounce off walls.
//
// Performance: 50×50 has 625 cells, expected ~390K random-walk steps.
// The unit-test perf budget is widened to 1500ms (vs the 500ms budget
// for the other algorithms); see spec §9 for the rationale.
//
// The tree is then expanded into the visualSize x visualSize walls
// matrix by the shared _expandThickWall helper.
export function generateAldousBroder(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const N = logicalSize * logicalSize;
  const { tree } = _buildAldousBroderTree(logicalSize, rng, (c) => c === N);
  return expandThickWall(visualSize, mapToTreeEdges(tree, logicalSize));
}

// Internal entry point shared with Houston's algorithm (P2-21): runs the
// Aldous-Broder random walk and returns an adjacency map. `stopCondition`
// lets callers terminate early (Houston's phase 1 stops at the
// "halfway visited" mark; the default stops when every cell is visited).
//
// `_` prefix: not part of the public API — Houston's is the only
// in-tree consumer; future callers should prefer the public
// `generateAldousBroder` and reach for this only if they need the
// half-built visited set (e.g. to feed into Wilson's).
export function _buildAldousBroderTree(
  size: number,
  rng: () => number,
  stopCondition?: (visitedCount: number) => boolean,
): { tree: Map<number, Set<number>>; visited: Uint8Array } {
  const N = size * size;
  const tree = new Map<number, Set<number>>();
  const visited = new Uint8Array(N);
  const addEdge = (a: number, b: number) => {
    let s = tree.get(a);
    if (!s) {
      s = new Set();
      tree.set(a, s);
    }
    s.add(b);
  };

  // Start at (0, 0).
  let current = 0;
  visited[0] = 1;
  let visitedCount = 1;

  const shouldStop = stopCondition ?? ((c) => c === N);

  while (!shouldStop(visitedCount)) {
    // Pick a random neighbor (3 rng() calls via randomFlatNeighbor).
    // Stay-put on all-OOB (degenerate; only happens when size < 1).
    const neighbor = randomFlatNeighbor(current, size, rng);
    if (neighbor === null) continue;
    const next = neighbor.nz * size + neighbor.nx;
    if (!visited[next]) {
      addEdge(current, next);
      addEdge(next, current);
      visited[next] = 1;
      visitedCount++;
    }
    current = next;
  }

  return { tree, visited };
}

// Convert an undirected adjacency map into the TreeEdge[] shape that
// _expandThickWall expects. Each edge is emitted exactly once (a < b)
// so the per-edge logical→visual midpoint is unambiguous.
function mapToTreeEdges(tree: Map<number, Set<number>>, size: number): TreeEdge[] {
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
