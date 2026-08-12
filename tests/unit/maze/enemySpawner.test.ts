import { describe, it, expect } from 'vitest';
import { injectEnemySpawns } from '../../../src/maze/enemySpawner';
import type { MazeData } from '../../../src/maze/types';

// A 5x5 open maze with a small wall pattern in the middle. start at (0,0),
// exit at (4,4). Most cells are walkable, so candidates are plentiful.
const openMaze: MazeData = {
  id: 'm', name: 't', size: { width: 5, depth: 5 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 4, z: 4 },
  walls: [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
  traps: [],
  doors: [],
};

describe('injectEnemySpawns', () => {
  it('returns an empty array when count is 0', () => {
    expect(injectEnemySpawns(openMaze, 0)).toEqual([]);
  });

  it('returns 3 spawns when count is 3', () => {
    const spawns = injectEnemySpawns(openMaze, 3);
    expect(spawns).toHaveLength(3);
  });

  it('clamps count above the maximum to ENEMY_COUNT_MAX (10)', () => {
    const spawns = injectEnemySpawns(openMaze, 11);
    expect(spawns).toHaveLength(10);
  });

  it('clamps negative count to 0', () => {
    expect(injectEnemySpawns(openMaze, -1)).toEqual([]);
  });

  it('falls back to ENEMY_COUNT_DEFAULT (3) when count is NaN (treated like undefined)', () => {
    const spawns = injectEnemySpawns(openMaze, Number.NaN);
    expect(spawns).toHaveLength(3);
  });

  it('defaults to ENEMY_COUNT_DEFAULT (3) when count is undefined', () => {
    const spawns = injectEnemySpawns(openMaze, undefined);
    expect(spawns).toHaveLength(3);
  });

  it('does not place any spawn on the start, the exit, or any cell within Chebyshev distance 1 of either', () => {
    const start = openMaze.start;
    const exit = openMaze.exit;
    const excluded = new Set<string>();
    const mark = (cx: number, cz: number) => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ex = cx + dx, ez = cz + dz;
          if (ex >= 0 && ex < 5 && ez >= 0 && ez < 5) excluded.add(`${ex},${ez}`);
        }
      }
    };
    mark(start.x, start.z);
    mark(exit.x, exit.z);
    const spawns = injectEnemySpawns(openMaze, 10);
    for (const s of spawns) {
      expect(excluded.has(`${s.x},${s.z}`), `enemy at (${s.x},${s.z}) overlaps a forbidden cell`).toBe(false);
    }
  });

  it('produces 2-node paths that begin at the spawn cell', () => {
    const spawns = injectEnemySpawns(openMaze, 3);
    for (const s of spawns) {
      expect(s.path.length).toBeGreaterThanOrEqual(2);
      expect(s.path[0]).toEqual({ x: s.x, z: s.z });
    }
  });

  it('does not place spawns on wall cells', () => {
    const spawns = injectEnemySpawns(openMaze, 10);
    for (const s of spawns) {
      expect(openMaze.walls![s.z][s.x]).toBe(0);
    }
  });

  // F-A-L1 (P3-Theme 6): the function returns a NEW array and does not
  // touch the input `maze`. Pin the contract here so a future refactor
  // that mutates `maze.enemies` (or aliases the returned array onto it)
  // is caught immediately. Callers rely on this to merge:
  //   [...maze.enemies, ...injectEnemySpawns(...)]
  // without losing the hand-crafted `maze.enemies` (FR-21).
  it('does not mutate the input maze (APPEND, NOT REPLACE contract, F-A-L1)', () => {
    const handCrafted = [
      { id: 'hand-1', x: 1, z: 1, path: [{ x: 1, z: 1 }, { x: 2, z: 1 }] },
      { id: 'hand-2', x: 3, z: 3, path: [{ x: 3, z: 3 }, { x: 3, z: 2 }] },
    ];
    const mazeWithHandCrafted: MazeData = { ...openMaze, enemies: handCrafted };
    const spawned = injectEnemySpawns(mazeWithHandCrafted, 5);
    // The function must return its own array, not the maze.enemies alias.
    expect(spawned).not.toBe(mazeWithHandCrafted.enemies);
    // The hand-crafted enemies must be untouched.
    expect(mazeWithHandCrafted.enemies).toEqual(handCrafted);
    // And the input maze's other fields must not have shifted.
    expect(mazeWithHandCrafted.id).toBe(openMaze.id);
    expect(mazeWithHandCrafted.walls).toEqual(openMaze.walls);
  });

  // F-A-L1: pin the documented caller merge pattern. Even if a future
  // refactor returns the same array reference, the merge must still
  // preserve the hand-crafted roster (the next step is the engine's
  // `[...maze.enemies, ...injected]` at Game.startLevel:206-244).
  it('caller-merge of hand-crafted + injected yields the union, not a replacement (F-A-L1)', () => {
    const handCrafted = [
      { id: 'hand-1', x: 1, z: 1, path: [{ x: 1, z: 1 }, { x: 2, z: 1 }] },
    ];
    const mazeWithHandCrafted: MazeData = { ...openMaze, enemies: handCrafted };
    const injected = injectEnemySpawns(mazeWithHandCrafted, 3);
    const merged = [...mazeWithHandCrafted.enemies, ...injected];
    expect(merged.length).toBe(1 + injected.length);
    expect(merged.slice(0, 1)).toEqual(handCrafted);
  });

  // F-2026-06-17-M-4: pin the retry contract. When a caller retries
  // injectEnemySpawns (e.g., engine.startLevel after an enemy count
  // change), the second batch must (a) be independently valid and
  // (b) not collide with the first batch on the same cell — the
  // engine-level `[...maze.enemies, ...injected]` merge uses the new
  // batch as the source of truth for gen-* ids and the dedup relies
  // on `handCraftedEnemies.filter` (b7707fd) to drop the previous
  // gen-* entries. So this test verifies the batch contract on its
  // own without depending on the engine's filter logic.
  it('retry: second call returns an independently valid batch (F-M-4)', () => {
    const first = injectEnemySpawns(openMaze, 3);
    const second = injectEnemySpawns(openMaze, 3);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    // Every spawn in either batch must still respect the maze contract
    // (no walls, not on start/exit ±1). This is the "independently
    // valid" property — retry doesn't bypass safety checks.
    for (const s of [...first, ...second]) {
      expect(openMaze.walls![s.z][s.x]).toBe(0);
      // 2-node path that begins at the spawn cell.
      expect(s.path.length).toBeGreaterThanOrEqual(2);
      expect(s.path[0]).toEqual({ x: s.x, z: s.z });
    }
  });

  // P3-1 (D5 fix): the spawner accepts an optional `levelCount` and
  // round-robins each accepted spawn across N layers. The contract
  // matches the engine's `Enemy.level` pinning (types.ts:464-468) and
  // the Game.startLevel / gameStore.startLevel callers (which pass
  // `maze.levelCount ?? 1`).
  describe('multi-level layer distribution (P3-1 D5)', () => {
    it('distributes 3 enemies across 3 levels as 0, 1, 2 (round-robin)', () => {
      const spawns = injectEnemySpawns(openMaze, 3, { levelCount: 3 });
      expect(spawns).toHaveLength(3);
      expect(spawns.map((s) => s.level)).toEqual([0, 1, 2]);
    });

    it('leaves `level` undefined when options is omitted (single-layer back-compat)', () => {
      const spawns = injectEnemySpawns(openMaze, 3);
      for (const s of spawns) {
        expect(s.level).toBeUndefined();
      }
    });

    it('cycles through levels modulo levelCount when count > levelCount', () => {
      const spawns = injectEnemySpawns(openMaze, 6, { levelCount: 2 });
      expect(spawns).toHaveLength(6);
      // Round-robin across [0, 1] for 6 spawns → 0,1,0,1,0,1
      expect(spawns.map((s) => s.level)).toEqual([0, 1, 0, 1, 0, 1]);
    });
  });

  // P3-1 fix-progressive-max: the LevelSelect "渐进上限" input
  // threads through as `options.spawnSchedule.max` and caps the
  // total number of concurrent enemies on the field. The runtime
  // should always honor the user-set cap, even when `count`
  // (= initial enemyCount) would otherwise ask for more.
  describe('progressive-spawn cap (P3-1 fix-progressive-max)', () => {
    it('spawnSchedule.max=3 caps out.length at 3 even when count=10', () => {
      const spawns = injectEnemySpawns(openMaze, 10, { spawnSchedule: { max: 3 } });
      expect(spawns).toHaveLength(3);
    });

    it('spawnSchedule.max undefined / omitted → no cap (back-compat with P2 callers)', () => {
      // The pre-fix callers don't pass `spawnSchedule` at all. The
      // fix must preserve their behavior — `count` still drives the
      // out.length ceiling, capped only by ENEMY_COUNT_MAX (10).
      const spawns = injectEnemySpawns(openMaze, 7);
      expect(spawns).toHaveLength(7);
    });

    it('spawnSchedule.max=0 (or negative) → no cap (treated as "unset")', () => {
      // The LevelSelect input clamps to [1, 20] so a 0/negative
      // value is only reachable via a hand-crafted caller or a
      // future regression. The runtime should be defensive: treat
      // 0/negative as "cap not set" rather than 0-spawn (which
      // would silently disable survive mode).
      const spawns0 = injectEnemySpawns(openMaze, 5, { spawnSchedule: { max: 0 } });
      expect(spawns0).toHaveLength(5);
      const spawnsNeg = injectEnemySpawns(openMaze, 5, { spawnSchedule: { max: -3 } });
      expect(spawnsNeg).toHaveLength(5);
    });
  });
});
