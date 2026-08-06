import { expandThickWall, type TreeEdge } from './_expandThickWall';
import { randomFlatNeighbor } from './_randomWalk';

// Wilson's algorithm on a thick-wall grid.
//
// Produces a UNIFORM spanning tree (same distribution as Aldous-Broder,
// but much faster in practice):
//   1. Start with one visited cell (we use (0, 0)).
//   2. Repeatedly pick a random unvisited cell as a walk start.
//   3. Walk randomly until reaching a visited cell. At each step:
//        - If the step enters a cell already in the current walk path,
//          "loop erase" (truncate the path to before that cell).
//        - If the step enters a visited cell outside the walk path,
//          the walk is complete; add the entire path as tree edges.
//   4. Mark all cells in the path as visited.
//
// Loop erase implementation: maintain `path: number[]` (the walk's
// cell sequence, in order) and `pathIndex: Map<number, number>` (cell
// → position in `path`). When a step would re-enter a cell in the
// current path, truncate `path` to before that cell. The walk then
// continues from the step's target cell.
//
// The tree is then expanded into the visualSize x visualSize walls
// matrix by the shared _expandThickWall helper.
export function generateWilsons(visualSize: number, rng: () => number) {
  const logicalSize = Math.ceil(visualSize / 2);
  const N = logicalSize * logicalSize;
  const seedVisited = new Uint8Array(N);
  seedVisited[0] = 1; // (0, 0) is the seed by convention
  const { tree } = _buildWilsonsTree(logicalSize, rng, seedVisited);
  return expandThickWall(visualSize, mapToTreeEdges(tree, logicalSize));
}

// Internal entry point shared with Houston's algorithm (P2-21): runs
// Wilson's loop-erased random walks until the visited set covers every
// cell, starting from `preVisited` (caller-supplied so Houston's can
// resume from the half-visited state left by Aldous-Broder).
//
// `_` prefix: not part of the public API — Houston's is the only
// in-tree consumer; future callers should prefer the public
// `generateWilsons` and reach for this only if they need to seed the
// visited set themselves.
export function _buildWilsonsTree(
  size: number,
  rng: () => number,
  preVisited: Uint8Array,
): { tree: Map<number, Set<number>>; visited: Uint8Array } {
  const N = size * size;
  const tree = new Map<number, Set<number>>();
  const visited = new Uint8Array(preVisited); // copy
  const addEdge = (a: number, b: number) => {
    let s = tree.get(a);
    if (!s) {
      s = new Set();
      tree.set(a, s);
    }
    s.add(b);
  };

  while (true) {
    // Find an unvisited cell to start a walk from. Pick uniformly at
    // random by scanning and counting unvisited cells first; an
    // indexed reservoir pick would be O(N) anyway on a small grid, so
    // this is fine.
    let unvisitedCount = 0;
    for (let i = 0; i < N; i++) {
      if (!visited[i]) unvisitedCount++;
    }
    if (unvisitedCount === 0) break;
    const target = Math.floor(rng() * unvisitedCount); // 1 rng() call
    let start = -1;
    let seen = 0;
    for (let i = 0; i < N; i++) {
      if (visited[i]) continue;
      if (seen === target) {
        start = i;
        break;
      }
      seen++;
    }
    if (start === -1) break;

    // Random walk from `start` until we hit a visited cell. On an
    // OOB neighbor pick the walk simply doesn't advance (continue);
    // the OOB step is not added to the path.
    const path: number[] = [start];
    const pathIndex = new Map<number, number>();
    pathIndex.set(start, 0);
    let curr = start;

    while (!visited[curr]) {
      const neighbor = randomFlatNeighbor(curr, size, rng);
      if (neighbor === null) continue; // all 4 OOB (shouldn't happen for size ≥ 1)
      const next = neighbor.nz * size + neighbor.nx;
      if (pathIndex.has(next)) {
        // Loop detected: erase the loop by truncating the path.
        const loopStart = pathIndex.get(next)!;
        while (path.length > loopStart + 1) {
          const removed = path.pop()!;
          pathIndex.delete(removed);
        }
        curr = next;
      } else {
        path.push(next);
        pathIndex.set(next, path.length - 1);
        curr = next;
      }
    }

    // Walk reached a visited cell. Add the path edges to the tree and
    // mark all path cells as visited.
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      addEdge(a, b);
      addEdge(b, a);
      visited[a] = 1;
    }
    visited[curr] = 1; // the final visited cell the walk reached
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
