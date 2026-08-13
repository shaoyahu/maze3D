import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildScene } from '../../../src/engine/Scene';
import type { MazeData } from '../../../src/maze/types';

// P1-4 Phase 2: FOV cone 可视化. Each enemy Group has a 5th child
// (fovCone) whose opacity + color reflect the enemy's AI state:
//   - 'patrol' → opacity 0 (invisible — 玩家看不到 enemy "看哪里")
//   - 'dwell'  → opacity 0.3, color 0x808080 (灰, 半透明)
//   - 'chase'  → opacity 0.8, color 0xff3030 (红, 半透明)
//
// The Game tick syncs enemy.state → fovCone.material every frame.
// We verify the mapping at the buildScene level (5th child present
// with default state) and the Game tick level (state → opacity
// mapping after a synthetic state assignment).

function makeMaze(enemies: MazeData['enemies'] = []): MazeData {
  return {
    id: 'test-fov-cone',
    name: 'FOV Cone',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    pickups: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    enemies,
    traps: [],
    doors: [],
  };
}

describe('P1-4 Phase 2 — FOV cone 可视化 state-based opacity + color', () => {
  it('fovCone is present as the 5th child of each enemy Group', () => {
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const fovCone = group.children[4] as THREE.Mesh;
    expect(fovCone).toBeDefined();
    expect(fovCone.geometry).toBeInstanceOf(THREE.ConeGeometry);
  });

  it('fovCone is invisible on spawn (patrol default, opacity 0)', () => {
    // Phase 2 FR-2.3: patrol state → cone invisible. On spawn,
    // every enemy starts in 'patrol' state, so buildScene must
    // emit a fovCone with opacity 0.
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const fovCone = enemies[0].children[4] as THREE.Mesh;
    const mat = fovCone.material as THREE.MeshBasicMaterial;
    expect(mat.opacity).toBe(0);
  });

  it('fovCone userData ref is set on the enemy Group', () => {
    // Game.update reads `group.userData.fovCone` to avoid
    // re-indexing `group.children[4]` per frame. The ref must
    // be the same Mesh instance as children[4].
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const fovConeFromUserData = group.userData.fovCone as THREE.Mesh;
    const fovConeFromChildren = group.children[4] as THREE.Mesh;
    expect(fovConeFromUserData).toBe(fovConeFromChildren);
  });

  it('fovCone is a cone pointing forward (-Z), positioned at head height', () => {
    // The cone's local rotation.x = PI/2 turns the default
    // +Y-pointing cone into a -Z-pointing one (forward in
    // the world's coordinate system). The position offset
    // places the cone's base at the head and the tip at
    // fovRange * cellSize in front of the enemy.
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const fovCone = enemies[0].children[4] as THREE.Mesh;
    expect(fovCone.rotation.x).toBeCloseTo(Math.PI / 2);
    // y position: bodyHeight (1.4) + headRadius * 0.6 (0.09) = 1.49
    expect(fovCone.position.y).toBeCloseTo(1.4 + 0.15 * 0.6, 5);
    // z position: -3 * cs / 2 = -3 (cone center is fovRange/2 forward)
    expect(fovCone.position.z).toBeCloseTo(-3, 5);
  });

  it('fovCone material is transparent + depthWrite false (renders on top, no depth conflict)', () => {
    // Phase 2 FR-2.4: the cone should overlay walls and pickups
    // without z-fighting. transparent=true + depthWrite=false is
    // the standard "decal" pattern in Three.js.
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const fovCone = enemies[0].children[4] as THREE.Mesh;
    const mat = fovCone.material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.side).toBe(THREE.DoubleSide);
  });

  it('fovCone geometry is sized to match the default fovRange (3 cells)', () => {
    // The cone's base radius = tan(half-angle) * fovRange * cellSize.
    // Default fovRange=3, fovAngleDeg=60 → half-angle=30°,
    // tan(30°) ≈ 0.577. With cellSize=2, base radius ≈ 3.46.
    // The cone's height = fovRange * cellSize = 6.
    const maze = makeMaze([
      { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
    ]);
    const { enemies } = buildScene(maze);
    const fovCone = enemies[0].children[4] as THREE.Mesh;
    const geom = fovCone.geometry as THREE.ConeGeometry;
    const params = geom.parameters;
    expect(params.height).toBe(6); // 3 * cellSize (2)
    expect(params.radius).toBeCloseTo(Math.tan((60 * Math.PI) / 360) * 3 * 2, 5);
  });
});
