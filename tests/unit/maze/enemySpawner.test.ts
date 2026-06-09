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
      expect(openMaze.walls[s.z][s.x]).toBe(0);
    }
  });
});
