import { describe, it, expect } from 'vitest';
import { isAtExit, findPickupAt } from '../../src/game/Rules';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 1 },
  walls: [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
  pickups: [{ x: 1, z: 1, type: 'time', value: 5 }],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
};

describe('Rules', () => {
  it('isAtExit returns true when player is in the exit cell', () => {
    // cellSize=2, cell (2,1) center is (5, 3)
    expect(isAtExit({ x: 5, z: 3 }, maze)).toBe(true);
  });

  it('isAtExit returns false when player is in another cell', () => {
    expect(isAtExit({ x: 1, z: 1 }, maze)).toBe(false);
  });

  it('findPickupAt returns the matching pickup or null', () => {
    const hit = findPickupAt({ x: 3, z: 3 }, maze, maze.pickups);
    expect(hit).toEqual({ x: 1, z: 1, type: 'time', value: 5 });
    const miss = findPickupAt({ x: 1, z: 1 }, maze, []);
    expect(miss).toBeNull();
  });
});
