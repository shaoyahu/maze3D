import { ENEMY_COUNT_MAX, ENEMY_COUNT_MIN, clampEnemyCount } from './types';
import type { EnemySpawn, MazeData } from './types';

// Walks every walkable cell, drops any cell within Chebyshev distance 1 of
// the start or the exit (so an enemy can't spawn directly in front of the
// player or block the goal), then picks up to `count` cells. Path is the
// 2-node minimum the Enemy class requires; we always include a walkable
// neighbor when one exists, so the enemy visibly patrols between two
// cells instead of standing still on a single point. When no neighbor
// is available (a single isolated walkable cell — shouldn't happen in
// any real generated maze, but a malformed hand-crafted level could
// produce it), the path collapses to a self-loop and the enemy dwells
// in place.
export function injectEnemySpawns(maze: MazeData, count: number | undefined): EnemySpawn[] {
  const target = clampEnemyCount(count);
  if (target === 0) return [];

  const w = maze.size.width;
  const d = maze.size.depth;
  const excluded = new Set<string>();
  const mark = (cx: number, cz: number) => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ex = cx + dx;
        const ez = cz + dz;
        if (ex >= 0 && ex < w && ez >= 0 && ez < d) {
          excluded.add(`${ex},${ez}`);
        }
      }
    }
  };
  mark(maze.start.x, maze.start.z);
  mark(maze.exit.x, maze.exit.z);

  const candidates: Array<{ x: number; z: number }> = [];
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (maze.walls[z][x] === 1) continue;
      if (excluded.has(`${x},${z}`)) continue;
      candidates.push({ x, z });
    }
  }
  // Deterministic order: sort by (x, z). The alternative (Math.random
  // shuffle) would make the test "injection positions don't overlap
  // start/exit" flaky without a seed, and the planner just needs N
  // distinct candidates — the order doesn't matter for the spec.
  candidates.sort((a, b) => (a.x - b.x) || (a.z - b.z));

  const out: EnemySpawn[] = [];
  for (let i = 0; i < candidates.length && out.length < target; i++) {
    const c = candidates[i];
    const neighbor = findWalkableNeighbor(maze, c.x, c.z);
    out.push({
      id: `gen-${out.length + 1}`,
      x: c.x,
      z: c.z,
      path: [
        { x: c.x, z: c.z },
        { x: neighbor?.x ?? c.x, z: neighbor?.z ?? c.z },
      ],
    });
  }
  return out;
}

function findWalkableNeighbor(
  maze: MazeData,
  x: number,
  z: number,
): { x: number; z: number } | null {
  const w = maze.size.width;
  const d = maze.size.depth;
  for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx >= 0 && nx < w && nz >= 0 && nz < d && maze.walls[nz][nx] === 0) {
      return { x: nx, z: nz };
    }
  }
  return null;
}

export { ENEMY_COUNT_MAX, ENEMY_COUNT_MIN };
