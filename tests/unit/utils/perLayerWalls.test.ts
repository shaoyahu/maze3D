import { describe, it, expect } from 'vitest';
import type { MazeData } from '../../../src/maze/types';
import {
  getCurrentLayerWalls,
  promoteToMultiLayer,
  collapseToSingleLayer,
  createEmptyGrid,
} from '../../../src/utils/perLayerWalls';

// 3x3 grid with a single wall at (1, 1) — used as the L0 fixture
// across the perLayerWalls tests. The wall gives every "did we
// preserve the grid" assertion a concrete cell to read.
const grid3x3: import('../../../src/maze/types').CellType[][] = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];

function makeSingleLayer(): MazeData {
  return {
    id: 'level-x',
    name: 'X',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: grid3x3.map((r) => r.slice()),
    pickups: [],
    enemies: [],
    traps: [],
    doors: [],
    levelCount: 1,
    transitions: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
  };
}

function makeMultiLayer(layers: 2 | 3 = 2): MazeData {
  const ws = Array.from({ length: layers }, () => grid3x3.map((r) => r.slice()));
  return {
    ...makeSingleLayer(),
    levelCount: layers,
    walls: undefined,
    walls2d: ws,
  };
}

describe('perLayerWalls', () => {
  describe('getCurrentLayerWalls', () => {
    it('returns the single-layer `walls` field for a single-layer level', () => {
      const lv = makeSingleLayer();
      const got = getCurrentLayerWalls(lv, 0);
      expect(got).toBe(lv.walls);
    });

    it('returns walls2d[currentLevel] for a multi-layer level', () => {
      const lv = makeMultiLayer(3);
      const got = getCurrentLayerWalls(lv, 2);
      expect(got).toBe(lv.walls2d![2]);
    });

    it('falls back to L0 when currentLevel is OOB (post-collapse safety)', () => {
      // The collapse + addLevel dance can leave a stale currentLevel
      // briefly; getCurrentLayerWalls must never throw.
      const lv = makeMultiLayer(2);
      const got = getCurrentLayerWalls(lv, 5);
      expect(got).toBe(lv.walls2d![0]);
    });
  });

  describe('promoteToMultiLayer', () => {
    it('promotes a single-layer level: walls → walls2d[0], clone as walls2d[1]', () => {
      const lv = makeSingleLayer();
      const promoted = promoteToMultiLayer(lv, { clone: 'clone' });
      // Strict mutex: `walls` must be gone after promote.
      expect(promoted.walls).toBeUndefined();
      expect(promoted.walls2d).toHaveLength(2);
      // L0 is the original grid (same data, fresh copy so callers
      // can mutate without aliasing the source).
      expect(promoted.walls2d![0]).toEqual(grid3x3);
      // L1 is a deep clone of L0 — equal value, not the same
      // array reference (so editing L1 won't touch L0).
      expect(promoted.walls2d![1]).toEqual(grid3x3);
      expect(promoted.walls2d![1]).not.toBe(promoted.walls2d![0]);
      // Existing fields flow through verbatim.
      expect(promoted.id).toBe(lv.id);
      expect(promoted.start).toEqual(lv.start);
    });

    it('is a no-op for a multi-layer level (idempotent)', () => {
      const lv = makeMultiLayer(2);
      const promoted = promoteToMultiLayer(lv);
      // Same reference returned — a programmer error, but the
      // helper stays safe and the editor's `addLevel` doesn't
      // double-promote.
      expect(promoted).toBe(lv);
    });
  });

  describe('collapseToSingleLayer', () => {
    it('collapses walls2d[0] to `walls` and drops walls2d (mutex flip)', () => {
      const lv = makeMultiLayer(3);
      const collapsed = collapseToSingleLayer(lv);
      expect(collapsed.walls).toEqual(grid3x3);
      expect(collapsed.walls2d).toBeUndefined();
      // Defensive copy: the new `walls` is not the same reference
      // as the old `walls2d[0]` so callers can mutate safely.
      expect(collapsed.walls).not.toBe(lv.walls2d![0]);
    });

    it('is a no-op for a single-layer level (idempotent)', () => {
      const lv = makeSingleLayer();
      const collapsed = collapseToSingleLayer(lv);
      expect(collapsed).toBe(lv);
    });
  });

  describe('createEmptyGrid', () => {
    it('builds a width × depth grid of zeros', () => {
      const g = createEmptyGrid(2, 3);
      expect(g).toHaveLength(3);
      for (const row of g) expect(row).toHaveLength(2);
      for (const row of g) for (const c of row) expect(c).toBe(0);
    });
  });
});
