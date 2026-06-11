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
});
