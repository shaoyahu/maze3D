import { ENEMY_COUNT_MAX, ENEMY_COUNT_MIN, clampEnemyCount } from './types';
import type { EnemySpawn, MazeData } from './types';

// Walks every walkable cell, drops any cell within Chebyshev distance 1 of
// the start or the exit (so an enemy can't spawn directly in front of the
// player or block the goal), then picks up to `count` cells. Path is the
// 2-node minimum the Enemy class requires; we only emit a spawn when the
// cell has at least one walkable neighbor, so the enemy visibly patrols
// between two cells instead of standing still on a self-loop. A hand-
// crafted level with a single isolated walkable cell is skipped — without
// this, the spawner would emit a degenerate `path: [{x,z},{x,z}]` and the
// enemy's `moveToward` would return `true` immediately, locking it in a
// permanent dwell at the spawn cell.
//
// F-L14: `count` is `number | undefined` (NOT optional-with-default) so
// callers MUST be explicit. `undefined` falls through `clampEnemyCount` to
// `ENEMY_COUNT_DEFAULT` (3). Pass an explicit number for any other value.
//
// P3-1: `options.levelCount` distributes the spawned enemies across the
// level's vertical layers. When `levelCount >= 2`, the i-th enemy gets
// `level: i % levelCount` (round-robin), so a 6-enemy spawn on a 3-level
// level pins 2 enemies to each layer. When omitted, or when
// `levelCount <= 1`, the field is left undefined so the enemy renders on
// the legacy single-layer contract (P2-era `EnemySpawn` shape). The
// distribution is deterministic and the function is otherwise pure — same
// `(maze, count, options)` input → same output. See `Enemy.level` in
// types.ts for the engine-side consumer contract.
//
// F-A-L1 (P3-Theme 6): APPEND, NOT REPLACE. This function returns a
// NEW array of spawns and does not touch the input `maze`. The caller
// is responsible for merging: `[...maze.enemies, ...injectEnemySpawns(...)]`.
// The function does NOT know about game modes — passing a non-zero
// `count` will always generate spawns. Callers MUST gate on
// `mode === 'survive'` (FR-18) so non-survive modes (reach-exit,
// time-trial) never receive procedural injection. Skipping that gate
// in a future refactor would silently double the enemy roster for
// hand-crafted levels, since hand-crafted `maze.enemies` (FR-21) are
// always preserved. See `Game.startLevel` and `gameStore.startLevel`
// for the canonical mode gate.
export function injectEnemySpawns(
  maze: MazeData,
  count: number | undefined,
  options?: { levelCount?: number; spawnSchedule?: { max?: number } },
): EnemySpawn[] {
  const target = clampEnemyCount(count);
  if (target === 0) return [];

  // P3-1: pin the multi-level distribution. We snapshot the value
  // up front so the `i % levelCount` indexing below is stable for
  // any caller that passes `undefined` / 0 / 1 (single-layer back
  // path: every enemy is left level-less).
  const levelCount = options?.levelCount ?? 1;
  const useLevelDistribution = levelCount >= 2;

  // P3-1 fix-progressive-max: the LevelSelect "渐进上限" input
  // threads through as `options.spawnSchedule.max`. We take the
  // min(target, max) so a user-set cap of 3 trumps an `enemyCount`
  // ask of 10 — the runtime never puts more concurrent enemies on
  // the field than the progressive cap allows. `undefined` /
  // non-positive falls through to `target` (back-compat with the
  // P2-era callers that don't know about progressive).
  const max = options?.spawnSchedule?.max;
  const effective = max !== undefined && max > 0 ? Math.min(target, max) : target;

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
  for (let i = 0; i < candidates.length && out.length < effective; i++) {
    const c = candidates[i];
    const neighbor = findWalkableNeighbor(maze, c.x, c.z);
    // Skip island cells — without a walkable neighbor the Enemy would
    // dwell forever on its spawn point. Walk past the candidate and try
    // the next one; the spec just needs up to `target` distinct cells.
    if (!neighbor) continue;
    // P3-1: round-robin layer distribution across multi-level levels.
    // The index is `out.length` (NOT `i` in the candidate loop) so the
    // distribution tracks accepted spawns, not iteration count — if
    // an island cell gets skipped, the next accepted spawn still lands
    // on the layer its successor would have. Single-layer levels
    // (levelCount <= 1, the default) leave `level` undefined for
    // back-compat with the P2-era EnemySpawn shape.
    const level = useLevelDistribution ? out.length % levelCount : undefined;
    out.push({
      id: `gen-${out.length + 1}`,
      x: c.x,
      z: c.z,
      path: [
        { x: c.x, z: c.z },
        { x: neighbor.x, z: neighbor.z },
      ],
      level,
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
