// P4b-Prim: 3D Randomized Prim — determinism + reachability contract.
// Mirrors the test layout of `recursiveBacktracker3D.test.ts` (P4a)
// so the two 3D algorithms share a verification surface. The
// test suite pins the contract by:
//
//   1. Determinism — same (visualSize, seed) → byte-identical walls
//      across two calls. Required for the URL round-trip.
//   2. Reachability — start (random passage cell) and exit
//      (pickStartExit3D) are reachable via isReachable3D.
//   3. Whitelist — visualSize must be 5/7/9; even sizes are
//      rejected up front.
//   4. Cube shape + outer ring walls (the cube is sealed).
//   5. Different seeds produce different mazes (entropy flows).

import { describe, it, expect } from 'vitest';
import {
  generatePrim3D,
  VALID_3D_SIZES,
} from '../../../src/maze/generators/prim3D';
import { isVoxel3DSize } from '../../../src/maze/generators/recursiveBacktracker3D';
import { mulberry32, fnv1a } from '../../../src/utils/seed';
import { isReachable3D } from '../../../src/maze/reachability';

function prngFromHex(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

describe('isVoxel3DSize (P4a whitelist, reused by P4b-Prim)', () => {
  // F-P4B-PRIM-WHITELIST: P4a set {5, 7, 9} is reused
  // verbatim. P4b-CellSize (11/13/15) is a future scope
  // that will widen this set; until then both P4a RB and
  // P4b-Prim share one whitelist via re-export from
  // `recursiveBacktracker3D.ts`.
  it('P4a whitelist is {5, 7, 9} (unchanged by P4b-Prim)', () => {
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

describe('generatePrim3D', () => {
  it('throws on an even or out-of-whitelist size (P4a invariant, reused)', () => {
    for (const bad of [0, 1, 3, 4, 6, 8, 10, 11, 50]) {
      expect(() => generatePrim3D(bad, prngFromHex('0123456789abcdef')))
        .toThrowError(/visualSize/);
    }
  });

  it('produces a cube of shape [visualSize][visualSize][visualSize]', () => {
    for (const size of VALID_3D_SIZES) {
      const walls = generatePrim3D(size, prngFromHex('0123456789abcdef'));
      expect(walls).toHaveLength(size);
      for (let z = 0; z < size; z++) {
        expect(walls[z]).toHaveLength(size);
        for (let y = 0; y < size; y++) {
          expect(walls[z][y]).toHaveLength(size);
          for (let x = 0; x < size; x++) {
            expect([0, 1]).toContain(walls[z][y][x]);
          }
        }
      }
    }
  });

  it('keeps the outermost ring as walls (the cube is sealed, same as P4a RB)', () => {
    const size = 7;
    const walls = generatePrim3D(size, prngFromHex('0123456789abcdef'));
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        expect(walls[z][y][0]).toBe(1);
        expect(walls[z][y][size - 1]).toBe(1);
      }
      for (let x = 0; x < size; x++) {
        expect(walls[z][0][x]).toBe(1);
        expect(walls[z][size - 1][x]).toBe(1);
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          expect(walls[0][y][x]).toBe(1);
          expect(walls[size - 1][y][x]).toBe(1);
        }
      }
    }
  });

  // Determinism: same (visualSize, seed) → byte-identical walls.
  // This is the URL-round-trip contract — a refresh must replay
  // the same maze. P4b-Prim shares the contract with P4a RB but
  // has a different PRNG-consumption shape (frontier picks
  // instead of stack pushes), so the test is structurally
  // identical but the byte output differs.
  it('is deterministic for the same (size, seed) — URL round-trip contract', () => {
    for (const size of VALID_3D_SIZES) {
      const a = generatePrim3D(size, prngFromHex('0123456789abcdef'));
      const b = generatePrim3D(size, prngFromHex('0123456789abcdef'));
      expect(a).toEqual(b);
    }
  });

  it('different seeds produce different mazes (entropy flows through)', () => {
    for (const size of VALID_3D_SIZES) {
      const a = generatePrim3D(size, prngFromHex('0000000000000001'));
      const b = generatePrim3D(size, prngFromHex('0000000000000002'));
      expect(a).not.toEqual(b);
    }
  });

  // Spanning-tree reachability: 3D Prim produces a spanning
  // tree (every passage cell is connected to every other).
  // Mirror P4a RB's reachability test — pick the first
  // passage cell as the start and verify every other passage
  // cell is reachable via isReachable3D.
  it('is fully connected: any two passage cells are reachable via isReachable3D', () => {
    for (const size of VALID_3D_SIZES) {
      const walls = generatePrim3D(size, prngFromHex('feedfacefeedface'));
      const cells: Array<{ x: number; y: number; z: number }> = [];
      for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (walls[z][y][x] === 0) cells.push({ x, y, z });
          }
        }
      }
      expect(cells.length).toBeGreaterThan(0);
      const start = cells[0];
      for (const exit of cells.slice(1)) {
        expect(isReachable3D(walls, start, exit)).toBe(true);
      }
    }
  });

  it('isReachable3D returns false when start or exit is on a wall cell', () => {
    const walls = generatePrim3D(5, prngFromHex('0123456789abcdef'));
    // Cell (0, 0, 0) is on the outer ring → guaranteed wall.
    expect(isReachable3D(walls, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })).toBe(false);
    expect(isReachable3D(walls, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 })).toBe(false);
  });

  it('isReachable3D returns true when start and exit are the same passage cell', () => {
    const walls = generatePrim3D(5, prngFromHex('0123456789abcdef'));
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

  // P4b-Prim vs P4a RB: different algorithms produce different
  // mazes for the same seed. The 3D Prim's outer loop
  // (frontier-based random pick) is fundamentally different
  // from 3D RB's (stack-based DFS), so even with the same
  // PRNG seed the resulting wall patterns differ. This test
  // pins the contract that "Prim and RB are siblings, not
  // aliases" — a future refactor that accidentally collapses
  // them into one generator would fail this assertion.
  it('produces different walls from P4a RB for the same seed (algorithm matters)', async () => {
    const { generateRecursiveBacktracker3D } = await import(
      '../../../src/maze/generators/recursiveBacktracker3D'
    );
    const seed = prngFromHex('0123456789abcdef');
    const rbWalls = generateRecursiveBacktracker3D(7, seed);
    // P4b-Prim needs its own prng because RB and Prim
    // consume rng() in different orders — a shared prng
    // would conflate "algorithm" and "rng-state" in the
    // comparison. The deterministic contract is per-algorithm
    // (same algorithm + same seed → same walls), not
    // cross-algorithm.
    const primWalls = generatePrim3D(7, prngFromHex('0123456789abcdef'));
    expect(primWalls).not.toEqual(rbWalls);
  });
});
