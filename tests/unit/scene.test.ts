import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
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
  enemies: [],
};

describe('buildScene', () => {
  it('returns a Three.js Scene with a floor, walls, exit, pickup, and player marker', () => {
    const { scene, walls, exit, pickups, playerMarker } = buildScene(maze);
    expect(scene).toBeTruthy();
    // 3 (row 0) + 1 (row 1, x=2) + 3 (row 2) = 7 interior walls,
    // plus a perimeter ring of (w+2)*2 + d*2 = 5*2 + 3*2 = 16 boundary walls.
    expect(walls.length).toBe(7 + 16);
    expect(exit).toBeTruthy();
    expect(pickups.length).toBe(2);
    expect(playerMarker).toBeTruthy();
    expect(playerMarker.geometry).toBeInstanceOf(THREE.RingGeometry);
    // Marker sits flat on the floor at the start cell center.
    expect(playerMarker.position.x).toBeCloseTo(maze.start.x * maze.cellSize + maze.cellSize / 2);
    expect(playerMarker.position.z).toBeCloseTo(maze.start.z * maze.cellSize + maze.cellSize / 2);
  });

  it('builds one capsule mesh per MazeData.enemies entry, anchored at the cell center', () => {
    const mazeWithEnemies: MazeData = {
      ...maze,
      enemies: [
        { id: 'e1', x: 0, z: 2, path: [{ x: 0, z: 2 }, { x: 2, z: 2 }] },
        { id: 'e2', x: 2, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 0 }] },
      ],
    };
    const { enemies, scene } = buildScene(mazeWithEnemies);
    expect(enemies).toHaveLength(2);
    for (const m of enemies) {
      expect(m.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
      // Bottom of capsule sits on the floor (y=0), so center y = height/2 = 0.8.
      expect(m.position.y).toBeCloseTo(0.8);
    }
    // First enemy at grid (0,2) -> cell center (1, _, 5); maze is 3x3 with cs=2.
    const e1 = enemies.find(
      (m) => Math.abs(m.position.x - 1) < 1e-6 && Math.abs(m.position.z - 5) < 1e-6,
    );
    expect(e1, 'enemy mesh at grid (0,2) cell center (1, _, 5)').toBeTruthy();
    // And the mesh is actually added to the scene graph.
    expect(scene.children).toContain(e1);
  });

  it('exposes an empty enemies array when the level has no enemies', () => {
    const { enemies } = buildScene(maze);
    expect(enemies).toEqual([]);
  });

  it('disposeScene releases enemy geometry/material along with the rest', () => {
    const mazeWithEnemies: MazeData = {
      ...maze,
      enemies: [
        { id: 'e1', x: 0, z: 2, path: [{ x: 0, z: 2 }, { x: 2, z: 2 }] },
      ],
    };
    const { scene, walls, pickups, enemies } = buildScene(mazeWithEnemies);
    expect(() => disposeScene(scene, walls, pickups, enemies)).not.toThrow();
    expect(enemies).toEqual([]);
  });

  it('places perimeter wall meshes one cell outside the grid so OOB collisions have a visible wall', () => {
    // Collision treats x<0, x>=w, z<0, z>=d as wall. Without a visible mesh
    // at those positions, the player can walk against the map edge, get
    // stopped, and see nothing — the player-marker (which shows the player's
    // collision volume) appears to float in the middle of an open floor.
    // The fix: add a perimeter ring of wall meshes at the OOB cells.
    const { walls } = buildScene(maze);
    const cs = maze.cellSize;
    // Spot-check: a perimeter wall at grid (-1, 1) is at world
    // ((-1+0.5)*cs, _, (1+0.5)*cs) = (-1, _, 3).
    const westEdge = walls.find(
      (m) => Math.abs(m.position.x - (-1 + 0.5) * cs) < 0.001 && Math.abs(m.position.z - (1 + 0.5) * cs) < 0.001,
    );
    expect(westEdge, 'perimeter wall at grid (-1,1) (west of cell (0,1))').toBeTruthy();
    // NW corner at grid (-1, -1) → world (-1, _, -1).
    const nw = walls.find(
      (m) => Math.abs(m.position.x - (-1 + 0.5) * cs) < 0.001 && Math.abs(m.position.z - (-1 + 0.5) * cs) < 0.001,
    );
    expect(nw, 'perimeter wall at grid (-1,-1) (NW corner)').toBeTruthy();
  });

  it('positions wall, exit, and pickup meshes at cell centers so they align with the collision grid', () => {
    // Collision.collidesAt treats cell (cx, cz) as the world AABB
    // [cx*cs, (cx+1)*cs) × [cz*cs, (cz+1)*cs). The player position uses
    // cell-center ((cx+0.5)*cs, _, (cz+0.5)*cs). Wall, exit, and pickup
    // MESHES must therefore be centered on (cx+0.5)*cs in x and z too,
    // otherwise the 3D world is offset by cs/2 from the collision grid:
    // the user sees an open corridor in 3D while the engine reports a wall
    // dead ahead, and vice versa.
    const { walls, exit, pickups } = buildScene(maze);
    const cs = maze.cellSize;
    // Wall at grid (2, 1) — the only wall in row z=1. Cell center is
    // ((2+0.5)*2, _, (1+0.5)*2) = (5, _, 3).
    const expectedWallCenterX = (2 + 0.5) * cs;
    const expectedWallCenterZ = (1 + 0.5) * cs;
    const wall21 = walls.find(
      (m) =>
        Math.abs(m.position.x - expectedWallCenterX) < 0.001 &&
        Math.abs(m.position.z - expectedWallCenterZ) < 0.001,
    );
    expect(wall21, 'wall mesh at grid (2,1) should be at cell center (5, _, 3)').toBeTruthy();
    // Exit at grid (2, 1): same cell-center.
    expect(exit.position.x).toBeCloseTo((maze.exit.x + 0.5) * cs);
    expect(exit.position.z).toBeCloseTo((maze.exit.z + 0.5) * cs);
    // Pickup at grid (1, 1) → cell-center (3, _, 3).
    const pickup = pickups[0];
    expect(pickup.position.x).toBeCloseTo((maze.pickups[0].x + 0.5) * cs);
    expect(pickup.position.z).toBeCloseTo((maze.pickups[0].z + 0.5) * cs);
  });

  it('disposeScene releases geometry/material without throwing', () => {
    const { scene, walls, pickups } = buildScene(maze);
    expect(() => disposeScene(scene, walls, pickups)).not.toThrow();
  });

  it('disposeScene disposes shared geometry/material/texture exactly once', () => {
    const geomSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const matSpy = vi.spyOn(THREE.Material.prototype, 'dispose');
    const texSpy = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const { scene, walls, pickups } = buildScene(maze);
    geomSpy.mockClear();
    matSpy.mockClear();
    texSpy.mockClear();
    disposeScene(scene, walls, pickups);
    // 5 unique geometries (floor, wall, ceiling, exit, pickup) and
    // 5 unique materials, despite 11 meshes (7 walls share wallGeom/wallMat).
    expect(geomSpy).toHaveBeenCalledTimes(6);
    expect(matSpy).toHaveBeenCalledTimes(6);
    // 3 textures (floor, wall, ceiling-cloud) bound to the floor, wall, and
    // ceiling materials.
    expect(texSpy).toHaveBeenCalledTimes(3);
    geomSpy.mockRestore();
    matSpy.mockRestore();
    texSpy.mockRestore();
  });

  describe('setDarkMode (P2-2 #5)', () => {
    it('enables a dark FogExp2 with density under 0.6 when turned on', () => {
      const refs = buildScene(maze);
      refs.setDarkMode(true);
      expect(refs.scene.fog).toBeInstanceOf(THREE.FogExp2);
      const fog = refs.scene.fog as THREE.FogExp2;
      expect(fog.density).toBeLessThanOrEqual(0.6);
    });

    it('removes the fog when turned back off', () => {
      const refs = buildScene(maze);
      refs.setDarkMode(true);
      refs.setDarkMode(false);
      expect(refs.scene.fog).toBeNull();
    });

    it('swaps the background color between the two palettes', () => {
      const refs = buildScene(maze);
      const lightBg = (refs.scene.background as THREE.Color).getHex();
      refs.setDarkMode(true);
      const darkBg = (refs.scene.background as THREE.Color).getHex();
      expect(darkBg).not.toBe(lightBg);
      refs.setDarkMode(false);
      const restoredBg = (refs.scene.background as THREE.Color).getHex();
      expect(restoredBg).toBe(lightBg);
    });
  });
});
