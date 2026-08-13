import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildScene } from '../../../src/engine/Scene';
import type { MazeData } from '../../../src/maze/types';

// P1-4 Phase 1: enemy 视觉升级 humanoid.
//   - body (capsule) + head (sphere) + 2 arms (capsule) 合并一个
//     THREE.Group, 共 4 子 mesh per enemy.
//   - MeshStandardMaterial (PBR-ish) 替代 MeshLambertMaterial.
//   - castShadow + receiveShadow 都 true.
//   - Shared body / head / armL / armR geometry + body/head/arms
//     material (跟 wall/pickup pattern 一致).
//   - SceneRefs.enemies: THREE.Group[] (从 THREE.Mesh[] 升级).

function makeMaze(over: Partial<MazeData> = {}): MazeData {
  const base: MazeData = {
    id: 'test-enemy-rendering',
    name: 'Enemy Rendering',
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
    enemies: [],
    traps: [],
    doors: [],
  };
  return { ...base, ...over };
}

describe('P1-4 Phase 1 — enemy 视觉升级 humanoid + PBR + shadow', () => {
  it('exposes enemies as THREE.Group[] (not Mesh[])', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
        { id: 'e2', x: 2, z: 2, path: [{ x: 2, z: 2 }, { x: 0, z: 2 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    expect(enemies).toHaveLength(2);
    for (const group of enemies) {
      expect(group).toBeInstanceOf(THREE.Group);
    }
  });

  it('each enemy Group has 4 child meshes: body (capsule) + head (sphere) + 2 arms (capsule)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    expect(group.children).toHaveLength(4);
    const [body, head, armL, armR] = group.children as THREE.Mesh[];
    // body is a capsule
    expect(body.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    // head is a sphere
    expect(head.geometry).toBeInstanceOf(THREE.SphereGeometry);
    // arms are capsules
    expect(armL.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    expect(armR.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
  });

  it('body is anchored at y = bodyHeight/2 above the group local origin (floor)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const body = group.children[0] as THREE.Mesh;
    // bodyHeight = 1.4 → body center y = 0.7
    expect(body.position.y).toBeCloseTo(0.7);
    // Group's local origin is the floor.
    expect(group.position.y).toBe(0);
  });

  it('head sits on top of body (head.y ≈ bodyHeight + headRadius * 0.6)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const head = group.children[1] as THREE.Mesh;
    // bodyHeight (1.4) + headRadius * 0.6 (0.15 * 0.6 = 0.09) = 1.49
    expect(head.position.y).toBeCloseTo(1.4 + 0.15 * 0.6, 5);
  });

  it('uses MeshStandardMaterial (PBR-ish), not MeshLambertMaterial', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      // Every child uses MeshStandardMaterial.
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
  });

  it('every child mesh has castShadow + receiveShadow enabled', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
  });

  it('shared geometry across enemies (body/head/arms instances reused)', () => {
    // The wall/pickup pattern is to share geometry + material so
    // a level with 50 enemies doesn't pay 50× geometry upload cost.
    // Phase 1 preserves that: every enemy body shares the same
    // bodyGeom, every head shares headGeom, etc.
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
        { id: 'e2', x: 2, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 0 }] },
        { id: 'e3', x: 0, z: 2, path: [{ x: 0, z: 2 }, { x: 2, z: 2 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const bodies = enemies.map((g) => (g.children[0] as THREE.Mesh).geometry);
    const heads = enemies.map((g) => (g.children[1] as THREE.Mesh).geometry);
    const armLs = enemies.map((g) => (g.children[2] as THREE.Mesh).geometry);
    const armRs = enemies.map((g) => (g.children[3] as THREE.Mesh).geometry);
    // All bodies share the same geometry instance.
    for (let i = 1; i < bodies.length; i++) {
      expect(bodies[i]).toBe(bodies[0]);
      expect(heads[i]).toBe(heads[0]);
      expect(armLs[i]).toBe(armLs[0]);
      expect(armRs[i]).toBe(armRs[0]);
    }
  });

  it('multi-layer enemy spawns at the correct y offset (eLevel * FLOOR_HEIGHT)', () => {
    const maze = makeMaze({
      enemies: [
        // Enemy on layer 1 (top floor of a 2-layer level).
        { id: 'e1', x: 0, z: 0, level: 1, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    // FLOOR_HEIGHT = 2.4 (P3-1 锁). Layer 1 enemy sits at y=2.4
    // (its Group's local origin is the floor of layer 1).
    expect(group.position.y).toBeCloseTo(2.4);
  });

  it('enemy with no level field defaults to layer 0 (single-layer back-compat)', () => {
    const maze = makeMaze({
      enemies: [
        // Pre-P3-1 enemy: no `level` field.
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    expect(group.position.y).toBe(0);
  });
});
