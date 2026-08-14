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

  it('each enemy Group has 5 child meshes: body + head + 2 arms (PBR) + fovCone (Phase 2)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    // P1-4 Phase 2 adds the 5th child (FOV cone). The order is
    // body → head → armL → armR → fovCone; the fovCone's material
    // is MeshBasicMaterial (transparent + state-driven opacity)
    // and does NOT cast/receive shadow.
    expect(group.children).toHaveLength(5);
    const [body, head, armL, armR, fovCone] = group.children as THREE.Mesh[];
    // body is a capsule
    expect(body.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    // head is a sphere
    expect(head.geometry).toBeInstanceOf(THREE.SphereGeometry);
    // arms are capsules
    expect(armL.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    expect(armR.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    // fovCone is a cone (Phase 2)
    expect(fovCone.geometry).toBeInstanceOf(THREE.ConeGeometry);
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

  it('body / head / arms use MeshStandardMaterial (PBR-ish), fovCone uses MeshBasicMaterial', () => {
    // P1-4 Phase 2: the FOV cone is intentionally MeshBasicMaterial
    // (not MeshStandardMaterial) because it must stay unlit and
    // color-uniform regardless of scene lighting — the cone is a
    // state-based UI affordance, not a physical object. The body
    // group is still PBR so the humanoid reads correctly under
    // the main directional light.
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const [body, head, armL, armR, fovCone] = group.children as THREE.Mesh[];
    for (const pbrMesh of [body, head, armL, armR]) {
      expect(pbrMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    expect(fovCone.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('body / head / arms have castShadow + receiveShadow; fovCone does not', () => {
    // FOV cone is a translucent state UI — it shouldn't cast or
    // receive shadows. The humanoid body parts should.
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    const [body, head, armL, armR, fovCone] = group.children as THREE.Mesh[];
    for (const shadowMesh of [body, head, armL, armR]) {
      expect(shadowMesh.castShadow).toBe(true);
      expect(shadowMesh.receiveShadow).toBe(true);
    }
    expect(fovCone.castShadow).toBe(false);
    expect(fovCone.receiveShadow).toBe(false);
  });

  it('shared geometry across enemies (body/head/arms instances reused)', () => {
    // The wall/pickup pattern is to share geometry so a level
    // with 50 enemies doesn't pay 50× geometry upload cost.
    // P1-4 preserved that: every enemy body shares the same
    // bodyGeom, every head shares headGeom, etc.
    //
    // P1-7: body + arms MATERIALS are per-enemy (cloned) so
    // the chase-flash lerp can mutate each enemy's body color
    // independently. Geometry is still shared — material is
    // what differs. Head material stays shared (constant color
    // 0x886666 regardless of state, no per-instance need).
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

  // P1-7: per-enemy body + arms material instances (not shared).
  // The head material is still shared (constant color across
  // states). Without per-enemy material, the Game tick would
  // mutate the same bodyMat for every enemy in lockstep — no
  // per-enemy chase flash possible.
  it('P1-7: per-enemy body + arms materials are NOT shared (chase flash needs per-instance mutation)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
        { id: 'e2', x: 2, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const bodyMats = enemies.map(
      (g) => (g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial,
    );
    const armMats = enemies.map(
      (g) => (g.children[2] as THREE.Mesh).material as THREE.MeshStandardMaterial,
    );
    // Per-enemy: each enemy has its own material instance. We
    // verify via `not.toBe` (different references), not just
    // `not.toEqual` — different instances with the same color
    // would still pass the equality check, but they're the
    // wrong shape for per-instance color mutation.
    for (let i = 1; i < bodyMats.length; i++) {
      expect(bodyMats[i]).not.toBe(bodyMats[0]);
      expect(armMats[i]).not.toBe(armMats[0]);
    }
    // Mutating one enemy's body color must NOT affect the
    // other — this is the actual behavioral contract for
    // per-enemy chase flash.
    bodyMats[0]!.color.setHex(0xff0000);
    expect(bodyMats[1]!.color.getHex()).not.toBe(0xff0000);
  });

  it('P1-7: head material IS shared (constant color, no per-instance need)', () => {
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
        { id: 'e2', x: 2, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const headMats = enemies.map(
      (g) => (g.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial,
    );
    // Heads share the same material instance (P1-4 锁: head
    // color 0x886666 is constant across states, so per-instance
    // material would just burn memory).
    expect(headMats[1]).toBe(headMats[0]);
  });

  it('P1-7: per-enemy bodyMat ref is cached on group.userData for fast tick access', () => {
    // The Game tick reads group.userData.bodyMat + armMat every
    // frame. If the refs are missing, the chase-flash lerp is
    // a no-op (graceful fallback) — this test pins the contract.
    const maze = makeMaze({
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
      ],
    });
    const { enemies } = buildScene(maze);
    const group = enemies[0];
    expect(group.userData.bodyMat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(group.userData.armMat).toBeInstanceOf(THREE.MeshStandardMaterial);
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
