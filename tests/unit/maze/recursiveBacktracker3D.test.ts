// P4: 3D Recursive Backtracker — determinism + reachability contract.
// The algorithm produces a spanning tree, so any two non-wall cells
// in a 3D RB cube are reachable. The test suite pins the contract
// by:
//
//   1. Determinism — same (visualSize, seed) → byte-identical walls
//      across two calls. Required for the URL round-trip.
//   2. Reachability — start (random passage cell) and exit
//      (pickStartExit3D) are reachable via isReachable3D.
//   3. Whitelist — visualSize must be 5/7/9; even sizes are
//      rejected up front (the thick-wall encoding only works
//      for odd visual sizes, since logicalSize = (visualSize+1)/2
//      would otherwise be a non-integer).

import { describe, it, expect } from 'vitest';
import {
  generateRecursiveBacktracker3D,
  isVoxel3DSize,
  VALID_3D_SIZES,
} from '../../../src/maze/generators/recursiveBacktracker3D';
import { mulberry32, fnv1a } from '../../../src/utils/seed';
import { isReachable3D } from '../../../src/maze/reachability';

function prngFromHex(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

describe('isVoxel3DSize / VALID_3D_SIZES', () => {
  it('whitelist is exactly {5, 7, 9}', () => {
    expect(VALID_3D_SIZES).toEqual([5, 7, 9]);
  });

  it('isVoxel3DSize accepts the whitelist and rejects the rest', () => {
    for (const n of [5, 7, 9]) {
      expect(isVoxel3DSize(n)).toBe(true);
    }
    for (const n of [0, 1, 3, 4, 6, 8, 10, 11, 15, 50, -1, 1.5, NaN, Infinity, '5', null]) {
      expect(isVoxel3DSize(n as unknown)).toBe(false);
    }
  });
});

describe('generateRecursiveBacktracker3D', () => {
  it('throws on an even or out-of-whitelist size (F-P4-1 invariant)', () => {
    for (const bad of [0, 1, 3, 4, 6, 8, 10, 11, 50]) {
      expect(() => generateRecursiveBacktracker3D(bad, prngFromHex('0123456789abcdef')))
        .toThrowError(/visualSize/);
    }
  });

  it('produces a cube of shape [visualSize][visualSize][visualSize]', () => {
    for (const size of VALID_3D_SIZES) {
      const walls = generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'));
      expect(walls).toHaveLength(size);
      for (let z = 0; z < size; z++) {
        expect(walls[z]).toHaveLength(size);
        for (let y = 0; y < size; y++) {
          expect(walls[z][y]).toHaveLength(size);
          for (let x = 0; x < size; x++) {
            // Every cell is 0 or 1 — the cell type invariant.
            expect([0, 1]).toContain(walls[z][y][x]);
          }
        }
      }
    }
  });

  it('keeps the outermost ring as walls (the cube is sealed)', () => {
    const size = 7;
    const walls = generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'));
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        // x = 0 and x = size-1 are the left/right borders.
        expect(walls[z][y][0]).toBe(1);
        expect(walls[z][y][size - 1]).toBe(1);
      }
      for (let x = 0; x < size; x++) {
        // y = 0 and y = size-1 are the bottom/top borders.
        expect(walls[z][0][x]).toBe(1);
        expect(walls[z][size - 1][x]).toBe(1);
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // z = 0 and z = size-1 are the front/back borders.
          expect(walls[0][y][x]).toBe(1);
          expect(walls[size - 1][y][x]).toBe(1);
        }
      }
    }
  });

  // Determinism: same (visualSize, seed) → byte-identical walls.
  // This is the URL-round-trip contract — a refresh must replay
  // the same maze. P4a only ships one algorithm, so the assertion
  // is straightforward (no per-algorithm loop needed).
  it('is deterministic for the same (size, seed) — URL round-trip contract', () => {
    for (const size of VALID_3D_SIZES) {
      const a = generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'));
      const b = generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'));
      expect(a).toEqual(b);
    }
  });

  it('different seeds produce different mazes (entropy flows through)', () => {
    for (const size of VALID_3D_SIZES) {
      const a = generateRecursiveBacktracker3D(size, prngFromHex('0000000000000001'));
      const b = generateRecursiveBacktracker3D(size, prngFromHex('0000000000000002'));
      expect(a).not.toEqual(b);
    }
  });

  // Reachability: the 3D RB is a spanning tree, so any two
  // passage cells are reachable. The pickStartExit3D contract
  // (AlgorithmMazeProvider) picks a random start + an exit
  // far enough away; both are passage cells, so the BFS
  // reaches the exit. We exercise the isReachable3D helper
  // directly here to avoid coupling to pickStartExit3D.
  it('is fully connected: any two passage cells are reachable via isReachable3D', () => {
    for (const size of VALID_3D_SIZES) {
      const walls = generateRecursiveBacktracker3D(size, prngFromHex('feedfacefeedface'));
      // Collect all passage cells.
      const cells: Array<{ x: number; y: number; z: number }> = [];
      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (walls[z][y][x] === 0) cells.push({ x, y, z });
          }
        }
      }
      expect(cells.length).toBeGreaterThan(0);
      // Every pair of passage cells must be reachable. We
      // pick a fixed first cell (cells[0]) and assert the
      // BFS can reach every other passage cell — this is
      // a one-to-many equivalent of the all-pairs check
      // for the spanning-tree invariant.
      const start = cells[0];
      for (const exit of cells.slice(1)) {
        expect(isReachable3D(walls, start, exit)).toBe(true);
      }
    }
  });

  it('isReachable3D returns false when start or exit is on a wall cell', () => {
    const size = 5;
    const walls = generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'));
    // Cell (0, 0, 0) is on the outer ring → guaranteed wall.
    expect(isReachable3D(walls, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })).toBe(false);
    expect(isReachable3D(walls, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 })).toBe(false);
  });

  it('isReachable3D returns true when start and exit are the same passage cell', () => {
    const walls = generateRecursiveBacktracker3D(5, prngFromHex('0123456789abcdef'));
    // Find any passage cell.
    let passage: { x: number; y: number; z: number } | null = null;
    for (let z = 0; z < 5; z++) {
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          if (walls[z][y][x] === 0) { passage = { x, y, z }; break; }
        }
        if (passage) break;
      }
      if (passage) break;
    }
    expect(passage).not.toBeNull();
    expect(isReachable3D(walls, passage!, passage!)).toBe(true);
  });
});
