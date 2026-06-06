import { describe, it, expect } from 'vitest';
import { buildScene, disposeScene } from '../../src/engine/Scene';
import type { MazeData, CellType } from '../../src/maze/types';

const walls: CellType[][] = [[1, 1, 1], [0, 0, 1], [1, 1, 1]];

const maze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 1 }, exit: { x: 2, z: 1 },
  // 7 walls total (3 + 1 + 3). Start (0,1) is walkable.
  // Exit (2,1) is on a wall in this fixture, but buildScene does not validate
  // that — JsonMazeProvider handles that concern.
  walls,
  pickups: [{ x: 1, z: 1, type: 'time', value: 15 }],
  rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
};

describe('buildScene', () => {
  it('returns a Three.js Scene with a floor, walls, exit, and pickup', () => {
    const { scene, walls, exit, pickups } = buildScene(maze);
    expect(scene).toBeTruthy();
    // 3 (row 0) + 1 (row 1, x=2) + 3 (row 2) = 7 walls
    expect(walls.length).toBe(7);
    expect(exit).toBeTruthy();
    expect(pickups.length).toBe(1);
  });

  it('disposeScene releases geometry/material without throwing', () => {
    const { scene, walls, exit, pickups } = buildScene(maze);
    expect(() => disposeScene(scene, walls, exit, pickups)).not.toThrow();
  });
});
