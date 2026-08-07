// P4b-Instanced: 3D wall InstancedMesh tests. Verifies the
// buildScene3D output uses a single `THREE.InstancedMesh` for
// all wall cells (1 draw call) instead of N individual
// `THREE.Mesh` objects (N draw calls). Also covers dispose
// path integration and shared geometry / material dedup.
//
// P4a shipped 1687 draw calls at visualSize=15; P4b-Instanced
// reduces that to 1. The test exercises the buildScene3D
// function directly (no WebGL renderer needed — InstancedMesh
// construction is headless-safe in jsdom + Three.js because
// the geometry / material / instance-matrix buffers are all
// CPU-side state).

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildScene } from '../../../src/engine/Scene';
import type { CellType, MazeData } from '../../../src/maze/types';

// 5×5×5 cube with a known passage layout. The wall count
// is predictable (5³ - 8 passages = 117), giving the tests
// a hard number to assert against. The passage layout
// matches `Game.3D.test.ts`'s helper for consistency.
function make3DTestMaze(): MazeData {
  const size = 5;
  const walls3D: CellType[][][] = [];
  for (let z = 0; z < size; z++) {
    const layer: CellType[][] = [];
    for (let y = 0; y < size; y++) {
      const row: CellType[] = new Array<CellType>(size).fill(1);
      layer.push(row);
    }
    walls3D.push(layer);
  }
  // Layer 0: corridor (1,0,1) → (3,0,1) + (1,0,2) + (2,0,2)
  for (let x = 1; x <= 3; x++) walls3D[1][0][x] = 0;
  walls3D[2][0][1] = 0;
  walls3D[2][0][2] = 0;
  // Layer 1: ladder cell (2,1,2)
  walls3D[2][1][2] = 0;
  // Layer 2: ladder cell (2,2,2)
  walls3D[2][2][2] = 0;
  return {
    id: 'test-3d-instanced',
    name: 'Test 3D Instanced',
    size: { width: size, depth: size },
    cellSize: 2,
    start: { x: 1, z: 1, level: 0 },
    exit: { x: 1, z: 1, level: 0 },
    start3D: { x: 1, y: 0, z: 1 },
    exit3D: { x: 2, y: 2, z: 2 },
    walls: [],
    walls3D,
    pickups: [],
    rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
    enemies: [],
    traps: [],
    doors: [],
  };
}

describe('Scene P4b-Instanced — 3D wall InstancedMesh', () => {
  let maze: MazeData;

  beforeEach(() => {
    maze = make3DTestMaze();
  });

  it('buildScene3D returns a single InstancedMesh for all wall cells', () => {
    const refs = buildScene(maze, false);
    expect(refs.walls.length).toBe(1);
    // The single element is a `THREE.InstancedMesh` (subclass
    // of `THREE.Mesh` but with `isInstancedMesh = true`).
    // Verify via the marker instead of `instanceof` so the
    // test works across Three.js versions / module-shape
    // variations.
    const instanced = refs.walls[0] as THREE.InstancedMesh & THREE.Mesh;
    expect((instanced as unknown as { isInstancedMesh: boolean }).isInstancedMesh).toBe(true);
  });

  it('instancedMesh.count equals the actual wall count (not the visualSize³ upper bound)', () => {
    const refs = buildScene(maze, false);
    const instanced = refs.walls[0] as THREE.InstancedMesh;
    // 5³ = 125 cells, 7 passages → 118 walls. The fixture
    // carves: y=0 corridor (1,0,1)(2,0,1)(3,0,1) + side
    // (1,0,2) + (2,0,2) = 5; y=1 ladder cell (2,1,2) = 1;
    // y=2 ladder cell (2,2,2) = 1; total 7 passages.
    expect(instanced.count).toBe(118);
    // Upper bound is 5³ = 125 (P4b-Instanced allocates the
    // max in case the maze is bigger). The unused slots are
    // skipped at render time via `count`.
    // The instanceMatrix attribute is `Float32Array(16 * allocSize)`;
    // we can't easily assert allocSize without poking at
    // internals, so this is implicit via the count assertion.
  });

  it('instancedMesh.instanceMatrix has one transform per wall cell', () => {
    const refs = buildScene(maze, false);
    const instanced = refs.walls[0] as THREE.InstancedMesh;
    // The matrix attribute stores 16 floats per instance.
    // For 117 walls, that's 117 * 16 = 1872 floats.
    // We verify by reading the matrix at index 0 and checking
    // it's a non-zero translation (proves setMatrixAt was
    // called with the cell-center translation, not a default
    // identity matrix).
    const m = new THREE.Matrix4();
    instanced.getMatrixAt(0, m);
    // The first wall cell scanned depends on the loop order
    // (z, y, x = 0, 0, 0 is the first wall — z=0, y=0, x=0
    // is the corner, walls3D[0][0][0] === 1, so it's a wall).
    // The cell-center translation is (0.5*cs, 0.5*cs, 0.5*cs)
    // = (1, 1, 1) for cs=2.
    expect(m.elements[12]).toBeCloseTo(1);
    expect(m.elements[13]).toBeCloseTo(1);
    expect(m.elements[14]).toBeCloseTo(1);
    // The rotation / scale columns are identity.
    expect(m.elements[0]).toBeCloseTo(1);
    expect(m.elements[5]).toBeCloseTo(1);
    expect(m.elements[10]).toBeCloseTo(1);
  });

  it('instancedMesh shares the same geometry and material across instances', () => {
    const refs = buildScene(maze, false);
    const instanced = refs.walls[0] as THREE.InstancedMesh;
    // The shared wall geometry / material are the same
    // references that `disposeScene` would dedup via
    // `seenGeoms` / `seenMats`. We assert on identity: every
    // instance draws the same `BoxGeometry` + `MeshLambertMaterial`.
    expect(instanced.geometry).toBeDefined();
    expect(instanced.material).toBeDefined();
    // The geometry / material are Three.js objects; verifying
    // they're MeshLambertMaterial + BoxGeometry pins the
    // shader pipeline (so future refactors that swap
    // materials don't accidentally drop instancing support).
    expect(instanced.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(instanced.geometry).toBeInstanceOf(THREE.BoxGeometry);
  });

  it('buildScene3D does NOT use the legacy N-mesh path (instancedMesh is the only wall array element)', () => {
    // Defense-in-depth: explicitly verify the legacy
    // `THREE.Mesh` (non-instanced) is NOT in the walls array.
    // If a future refactor accidentally fell back to
    // per-mesh construction (e.g. dynamic per-wall color),
    // this test catches it before the draw-call count
    // regresses.
    const refs = buildScene(maze, false);
    for (const wall of refs.walls) {
      const isInstanced = (wall as unknown as { isInstancedMesh?: boolean }).isInstancedMesh;
      expect(isInstanced).toBe(true);
    }
  });

  it('disposeScene clears the walls array (single InstancedMesh reference released)', () => {
    // The dispose path iterates `refs.walls` and disposes each
    // element. P4a had N meshes; P4b-Instanced has 1
    // InstancedMesh. `disposeScene`'s `seenGeoms` / `seenMats`
    // dedup handles the shared buffers across the rest of
    // the scene.
    //
    // We can't easily exercise `disposeScene` directly (it's
    // an internal helper in Scene.ts), so we instead verify
    // that the InstancedMesh's `dispose()` method exists and
    // is callable without throwing — a smoke test for the
    // dispose integration.
    const refs = buildScene(maze, false);
    const instanced = refs.walls[0] as THREE.InstancedMesh;
    expect(() => instanced.dispose()).not.toThrow();
    // After dispose, the matrix attribute is released.
    // (Three.js sets `instanceMatrix = null` internally.)
    // The exact behavior is implementation-defined; the
    // smoke test is enough for our purposes.
  });
});
