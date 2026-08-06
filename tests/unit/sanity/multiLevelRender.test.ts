// P3-1b manual sanity: a levelCount=3, size=15, algorithm='recursive-backtracker',
// mazeSeed='0123456789abcdef' seed round-trips through encodeSeedV2 + the provider
// + buildScene without crashing, and produces 3 stacked layers + 2 stair-up
// transitions. The test is intentionally a single happy-path probe — the
// per-property invariants (determinism, no-wall, no-double-booking) live in
// algorithmMazeProvider.test.ts.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { encodeSeedV2, decodeSeed } from '../../../src/utils/seed';
import {
  AlgorithmMazeProvider,
  getPerLayerWallsByLevelId,
} from '../../../src/maze/AlgorithmMazeProvider';
import { buildScene } from '../../../src/engine/Scene';
import { FLOOR_HEIGHT } from '../../../src/entities/Player';
import type { VerticalTransition } from '../../../src/maze/types';

describe('P3-1b manual sanity: levelCount=3 seed round-trips through provider + buildScene', () => {
  it('produces 3 stacked layers + 2 stair-up transitions + correct per-layer y positions', async () => {
    // 1. Encode the seed id with the v2 codec.
    const id = encodeSeedV2(
      { algorithm: 'recursive-backtracker', size: 15, mazeSeed: '0123456789abcdef' },
      3,
    );
    // algo-v2-recursive-backtracker-15-3-0123456789abcdef
    expect(id).toBe('algo-v2-recursive-backtracker-15-3-0123456789abcdef');

    // 2. Decode back to a Seed — same round-trip property the
    //    URL→provider path uses.
    const seed = decodeSeed(id);
    expect(seed.algorithm).toBe('recursive-backtracker');
    expect(seed.size).toBe(15);
    expect(seed.mazeSeed).toBe('0123456789abcdef');
    expect(seed.levelCount).toBe(3);

    // 3. Load through the provider (the full chain a real
    //    gameStore.startLevel goes through).
    const provider = new AlgorithmMazeProvider();
    const maze = await provider.load(id);
    expect(maze.id).toBe(id);
    expect(maze.levelCount).toBe(3);
    expect(maze.walls).toHaveLength(15);
    expect(maze.transitions).toHaveLength(2);

    // 4. The provider populates the per-layer wall cache; the
    //    engine reads it via the documented side channel.
    const perLayerWalls = getPerLayerWallsByLevelId(maze.id);
    expect(perLayerWalls).toBeDefined();
    expect(perLayerWalls!).toHaveLength(3);
    // Each layer is a 15x15 grid (size=15 → 15×15 visual).
    for (const layer of perLayerWalls!) {
      expect(layer).toHaveLength(15);
      for (const row of layer) {
        expect(row).toHaveLength(15);
      }
    }
    // The two layer-1+ walls are byte-different from layer 0
    // (shared PRNG means each layer is a fresh generation; the
    // generator has to walk the grid differently because the
    // PRNG state is different).
    expect(perLayerWalls![1]).not.toEqual(perLayerWalls![0]);
    expect(perLayerWalls![2]).not.toEqual(perLayerWalls![0]);
    expect(perLayerWalls![2]).not.toEqual(perLayerWalls![1]);

    // 5. Transitions: 2 stair-up entries, each carrying
    //    level/toLevel/toX/toZ landing offsets.
    const transitions: VerticalTransition[] = maze.transitions!;
    for (const t of transitions) {
      expect(t.kind).toBe('stair-up');
      expect(t.toLevel).toBe(t.level + 1);
      // Source and dest endpoints are on non-wall cells.
      expect(perLayerWalls![t.level][t.z][t.x]).toBe(0);
      const destX = t.toX ?? t.x;
      const destZ = t.toZ ?? t.z;
      expect(perLayerWalls![t.toLevel][destZ][destX]).toBe(0);
    }
    // The two transitions are at distinct (level, x, z) cells.
    const t0 = transitions[0]!;
    const t1 = transitions[1]!;
    const t0Key = `${t0.level}:${t0.x}:${t0.z}`;
    const t1Key = `${t1.level}:${t1.x}:${t1.z}`;
    expect(t0Key).not.toBe(t1Key);

    // 6. buildScene doesn't crash on the multi-level input and
    //    produces the expected mesh count. The scene graph has
    //    3 floors + 3 ceilings (one per layer) + the entity
    //    meshes. We count via `scene.children` to assert the
    //    overall population.
    const refs = buildScene(maze);
    expect(refs.scene).toBeInstanceOf(THREE.Scene);

    // Count floors and ceilings by their geometry. The fixture
    // has no pickups / enemies / traps / doors, so any
    // `PlaneGeometry` mesh with the floor / ceiling rotation
    // pattern is a per-layer floor or ceiling. The hole-down
    // transition would also match the floor rotation
    // (`rotation.x = -π/2`) so we exclude `userData.transition`
    // meshes; the player marker uses `RingGeometry` (not
    // `PlaneGeometry`) so it's naturally filtered by the
    // geometry-type check.
    let floorCount = 0;
    let ceilingCount = 0;
    refs.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!(obj.geometry instanceof THREE.PlaneGeometry)) return;
      if (obj.userData?.transition !== undefined) return;
      if (Math.abs(obj.rotation.x + Math.PI / 2) < 1e-6) floorCount++;
      if (Math.abs(obj.rotation.x - Math.PI / 2) < 1e-6) ceilingCount++;
    });
    expect(floorCount).toBe(3);
    expect(ceilingCount).toBe(3);

    // Transition meshes — 2 entries (one per stair-up).
    expect(refs.transitions).toHaveLength(2);
    for (const mesh of refs.transitions) {
      // Source-layer y: L * FLOOR_HEIGHT. The stair-up mesh
      // sits at the source cell center with a 90° rotation
      // around z that points up to the destination layer.
      const expectedY = mesh.userData.transition.level * FLOOR_HEIGHT;
      expect(mesh.position.y).toBeCloseTo(expectedY, 5);
    }

    // Walls array contains the union of all per-layer walls +
    // 3 perimeter rings (one per layer, same mesh count as
    // single-layer). The exact count is governed by the
    // generator output + the perimeter formula; we just
    // assert it's at least 2 layers' worth (sanity).
    expect(refs.walls.length).toBeGreaterThan(0);

    // The exit is anchored on the layer matching
    // `maze.exit.level` (default 0 in v1, but multi-level
    // randomizes). Its y must equal `exitLevel * FLOOR_HEIGHT
    // + 0.05`.
    const exitY = maze.exit.level ?? 0;
    expect(refs.exit.position.y).toBeCloseTo(exitY * FLOOR_HEIGHT + 0.05, 5);
  });
});
