// Shared test contract for maze generators.
//
// All 11 generator test files in this directory used to be near-byte-identical
// copies of the same 8-case contract (shape / determinism / different seeds /
// 3 sizes connectivity / 50×50 perf / start+exit open). This helper centralizes
// the contract so each test file only declares what's unique to its algorithm.
//
// Usage:
//
//   import { describe } from 'vitest';
//   import { assertGeneratorContract } from './_testHelpers';
//   import { generateHouston } from '../../../src/maze/generators/houston';
//
//   describe('P2-21 Houston generator', () => {
//     assertGeneratorContract({
//       name: 'houston',
//       generate: generateHouston,
//       perfBudgetMs50: 1500,
//     });
//   });
//
// Algorithm-specific extras (e.g. growingTree's strategy presets) should be
// written as separate it()s outside the assertGeneratorContract call, so the
// contract stays a stable 8-case block per generator.

import { it, expect } from 'vitest';
import { mulberry32, fnv1a } from '../../../../src/utils/seed';
import { isReachable } from '../../../../src/maze/reachability';
import type { CellType } from '../../../../src/maze/types';

/** Deterministic PRNG seeded from a 16-char hex string (mulberry32 over fnv1a). */
export function rngFromHexSeed(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

/** Convert visualSize → exit cell coords on the thick-wall grid. */
export function exitCell(visualSize: number): { x: number; z: number } {
  const logicalSize = Math.ceil(visualSize / 2);
  return { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) };
}

export interface AssertGeneratorContractOptions {
  /** Short algorithm id (e.g. 'houston', 'eller'). Used as a prefix on it() names. */
  name: string;
  /** Generator under test — must match the (size, rng) → walls signature. */
  generate: (size: number, rng: () => number) => CellType[][];
  /** 50×50 perf budget in ms. Default 500; widen to 1500 for O(N²) algorithms. */
  perfBudgetMs50?: number;
  /** Start cell on the thick-wall grid. Default { x: 0, z: 0 }. */
  startCell?: { x: number; z: number };
}

/**
 * Run the standard 8-case generator contract inside the current describe block.
 * Each it() is prefixed with `name:` so the test name carries the algorithm
 * context even when multiple files share the contract.
 */
export function assertGeneratorContract(opts: AssertGeneratorContractOptions): void {
  const { name, generate, perfBudgetMs50 = 500, startCell = { x: 0, z: 0 } } = opts;

  it(`${name}: returns a 2D array of 0/1 cells of the right shape`, () => {
    const walls = generate(15, mulberry32(1));
    expect(walls).toHaveLength(15);
    for (const row of walls) {
      expect(row).toHaveLength(15);
      for (const cell of row) {
        expect([0, 1]).toContain(cell);
      }
    }
  });

  it(`${name}: is deterministic for the same seed`, () => {
    const a = generate(15, rngFromHexSeed('0123456789abcdef'));
    const b = generate(15, rngFromHexSeed('0123456789abcdef'));
    expect(a).toEqual(b);
  });

  it(`${name}: produces different outputs for different seeds`, () => {
    // Sweep 100 different hex seeds; assert the algorithm yields enough variety
    // (≥ 50 distinct walls) that seed entropy actually flows into the output.
    // Hashing the walls array to a JSON string is fine at visualSize=15
    // (225 cells), and the per-seed cost is single-digit ms.
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const hex = i.toString(16).padStart(16, '0');
      const walls = generate(15, rngFromHexSeed(hex));
      seen.add(JSON.stringify(walls));
    }
    expect(seen.size).toBeGreaterThanOrEqual(50);
  });

  it(`${name}: produces a fully connected maze (start reaches exit) at 15×15`, () => {
    const walls = generate(15, mulberry32(42));
    expect(isReachable(walls, startCell, exitCell(15))).toBe(true);
  });

  it(`${name}: produces a fully connected maze at 30×30`, () => {
    const walls = generate(30, mulberry32(42));
    expect(isReachable(walls, startCell, exitCell(30))).toBe(true);
  });

  it(`${name}: produces a fully connected maze at 50×50`, () => {
    const walls = generate(50, mulberry32(42));
    expect(isReachable(walls, startCell, exitCell(50))).toBe(true);
  });

  it(`${name}: 50×50 generation completes in under ${perfBudgetMs50}ms`, () => {
    const t0 = performance.now();
    generate(50, mulberry32(7));
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(perfBudgetMs50);
  });

  it(`${name}: start and exit cells are open (walls = 0)`, () => {
    const walls = generate(15, mulberry32(1));
    const exit = exitCell(15);
    expect(walls[startCell.z][startCell.x]).toBe(0 as CellType);
    expect(walls[exit.z][exit.x]).toBe(0 as CellType);
  });
}
