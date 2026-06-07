import { describe, it, expect } from 'vitest';
import { findPickupAt, crossesExit } from '../../src/game/Rules';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 1 },
  walls: [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
  pickups: [{ x: 1, z: 1, type: 'time', value: 5 }],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
};

describe('Rules', () => {
  it('findPickupAt returns the matching pickup or null', () => {
    const hit = findPickupAt({ x: 3, z: 3 }, maze, maze.pickups);
    expect(hit).toEqual({ x: 1, z: 1, type: 'time', value: 5 });
    const miss = findPickupAt({ x: 1, z: 1 }, maze, []);
    expect(miss).toBeNull();
  });

  describe('crossesExit', () => {
    it('returns true when start is in the exit cell', () => {
      expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, maze)).toBe(true);
    });

    it('returns true when end is in the exit cell', () => {
      expect(crossesExit({ x: 1, z: 3 }, { x: 5, z: 3 }, maze)).toBe(true);
    });

    it('returns true when midpoint crosses the exit cell (tunneling guard)', () => {
      const start = { x: 3.9, z: 3 };
      const end = { x: 6.1, z: 3 };
      expect(crossesExit(start, start, maze)).toBe(false);
      expect(crossesExit(end, end, maze)).toBe(false);
      expect(crossesExit(start, end, maze)).toBe(true);
    });

    it('returns false when the segment does not touch the exit cell', () => {
      expect(crossesExit({ x: 1, z: 1 }, { x: 3, z: 3 }, maze)).toBe(false);
    });
  });
});
