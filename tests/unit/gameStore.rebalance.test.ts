import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { SPAWN_SCHEDULE_DEFAULT, type MazeData } from '../../src/maze/types';

function makeMaze(overrides: Partial<MazeData> = {}): MazeData {
  return {
    id: 'test-1',
    name: 'test',
    size: { width: 15, depth: 15 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 14, z: 14 },
    walls: Array.from({ length: 15 }, () => new Array(15).fill(0)),
    pickups: [],
    rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
    enemies: [],
    traps: [],
    doors: [],
    ...overrides,
  };
}

describe('gameStore.startLevel P2-5 rebalance', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentMode: 'reach-exit',
      currentEnemyCount: 0,
      progressiveEnemyCount: 0,
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT },
    });
  });

  // FR-18
  it('clamps enemyCount to 0 in reach-exit mode', () => {
    useGameStore.getState().startLevel(makeMaze(), { mode: 'reach-exit', enemyCount: 3 });
    expect(useGameStore.getState().currentEnemyCount).toBe(0);
  });

  it('clamps enemyCount to 0 in time-trial mode', () => {
    useGameStore.getState().startLevel(makeMaze(), { mode: 'time-trial', enemyCount: 5 });
    expect(useGameStore.getState().currentEnemyCount).toBe(0);
  });

  it('preserves the user-chosen enemyCount in survive mode', () => {
    useGameStore.getState().startLevel(makeMaze(), { mode: 'survive', enemyCount: 4 });
    expect(useGameStore.getState().currentEnemyCount).toBe(4);
  });

  // FR-21: hand-crafted enemies (maze.enemies) must always be present
  it('counts hand-crafted maze.enemies even in reach-exit mode', () => {
    const handCrafted = [
      { id: 'e1', x: 5, z: 5, path: [{ x: 5, z: 5 }, { x: 6, z: 5 }] },
      { id: 'e2', x: 7, z: 7, path: [{ x: 7, z: 7 }, { x: 7, z: 8 }] },
    ];
    useGameStore.getState().startLevel(makeMaze({ enemies: handCrafted }), { mode: 'reach-exit', enemyCount: 3 });
    expect(useGameStore.getState().currentEnemyCount).toBe(2);
  });

  // FR-20: spawn schedule is no-op in non-survive (currentEnemyCount stays at
  // hand-crafted + 0 injected = hand-crafted count)
  it('currentEnemyCount never exceeds hand-crafted count in non-survive, even with schedule on', () => {
    const handCrafted = [
      { id: 'e1', x: 1, z: 1, path: [{ x: 1, z: 1 }, { x: 2, z: 1 }] },
    ];
    useGameStore.getState().startLevel(
      makeMaze({ enemies: handCrafted }),
      { mode: 'reach-exit', enemyCount: 3, spawnSchedule: { intervalSec: 15, onPickup: true, enabled: true } },
    );
    expect(useGameStore.getState().currentEnemyCount).toBe(1);
  });

  // F-N6 (P3-Theme 6, C-M11): the progressive spawn trigger must be a no-op
  // in non-survive modes, even when the schedule is enabled and the level
  // has elapsed past the interval. Without the `currentMode === 'survive'`
  // gate, the helper would still fire and ghost-increment
  // progressiveEnemyCount — dead state with no scene effect, but a real
  // contract violation.
  it('progressiveEnemyCount stays at 0 in reach-exit even after a long tick (F-N6)', () => {
    useGameStore.getState().startLevel(
      makeMaze(),
      { mode: 'reach-exit', enemyCount: 3, spawnSchedule: { intervalSec: 15, onPickup: true, enabled: true } },
    );
    expect(useGameStore.getState().progressiveEnemyCount).toBe(0);
    // 30s elapsed: well past the 15s interval trigger; in survive mode this
    // would bump to 4. In reach-exit the gate must short-circuit it.
    useGameStore.getState().tick(30);
    expect(useGameStore.getState().progressiveEnemyCount).toBe(0);
  });

  it('progressiveEnemyCount stays at 0 in time-trial even after a long tick (F-N6)', () => {
    useGameStore.getState().startLevel(
      makeMaze(),
      { mode: 'time-trial', enemyCount: 5, spawnSchedule: { intervalSec: 15, onPickup: true, enabled: true } },
    );
    expect(useGameStore.getState().progressiveEnemyCount).toBe(0);
    useGameStore.getState().tick(30);
    expect(useGameStore.getState().progressiveEnemyCount).toBe(0);
  });
});
