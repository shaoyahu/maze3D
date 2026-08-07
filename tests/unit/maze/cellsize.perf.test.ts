// P4b-CellSize: 3D cube size perf budget.
//
// The 3D RB and 3D Prim generators are O(N) over the
// `visualSize³` cell grid. P4a's spec §15 reserved 5/7/9
// for the MVP and 11/13/15 for a future scope. P4b-CellSize
// ships the 11/13/15 half and pins a perf budget:
//
//   visualSize=11 (1331 cells) < 1.5s
//   visualSize=13 (2197 cells) < 3s
//   visualSize=15 (3375 cells) < 5s
//
// The budget extrapolates from P4a's [50ms, 200ms, 1s] for
// [5³, 7³, 9³] = [125, 343, 729 cells] — a roughly linear
// scaling with cells, with a constant overhead for
// allocator / typed array init. A conservative 1.5x
// multiplier is folded into each budget (e.g. 9³
// generates 729 cells in 1s; 15³ generates 3375 cells,
// which is 4.6x more, so the budget extrapolates to ~4.6s
// for 15³, capped at the P4a spec §15 5s upper bound).
//
// These are wall-clock budgets; CI jitter can add ~20% on
// cold cache. A future refactor that swaps in a slower
// algorithm (e.g. 3D Aldous-Broder) MUST tighten the budget
// to the algorithm's measured cost, not extrapolate from
// O(N) family.

// F-P4B-CELLSIZE-PERF: 6 cases — 3 sizes × 2 algorithms.
// Marked with `it.fails` if the budget is exceeded so a
// future regression is visible in CI without hiding the
// violation. (vitest 2.x's `it.fails` flips the result: a
// passing test is the failure signal.) We use
// `it.skip + it` with an explicit check instead — the
// `it.skip` pattern is simpler and a 5s budget on a
// 15-cube is plenty of margin for the deterministic
// O(N) algorithm.
//
// The test is intentionally NOT marked as `it.fails` — a
// regression should be loud (the test fails, not the
// test's "should fail" meta-assertion fires).

import { describe, it, expect } from 'vitest';
import { generateRecursiveBacktracker3D } from '../../../src/maze/generators/recursiveBacktracker3D';
import { generatePrim3D } from '../../../src/maze/generators/prim3D';
import { mulberry32, fnv1a } from '../../../src/utils/seed';

function prngFromHex(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

const PERF_BUDGETS_MS: Record<number, number> = {
  // P4b-CellSize §4 budgets. Sized to a 1.5x margin on
  // top of the linear extrapolation from P4a's [50ms,
  // 200ms, 1s] for 5³/7³/9³, capped at 5s per P4a
  // spec §15.
  11: 1500,
  13: 3000,
  15: 5000,
};

describe('P4b-CellSize perf budget (3D RB + 3D Prim × 11/13/15)', () => {
  for (const algoName of ['3d-recursive-backtracker', '3d-prim'] as const) {
    for (const size of [11, 13, 15] as const) {
      const budget = PERF_BUDGETS_MS[size];
      it(`${algoName} visualSize=${size} (${size ** 3} cells) generates under ${budget}ms`, () => {
        const start = performance.now();
        const walls =
          algoName === '3d-recursive-backtracker'
            ? generateRecursiveBacktracker3D(size, prngFromHex('0123456789abcdef'))
            : generatePrim3D(size, prngFromHex('0123456789abcdef'));
        const elapsed = performance.now() - start;
        // Sanity: walls has the right shape (catches
        // "function returned early on a too-large size"
        // regressions).
        expect(walls).toHaveLength(size);
        expect(walls[0]).toHaveLength(size);
        expect(walls[0][0]).toHaveLength(size);
        // F-P4B-CELLSIZE-PERF-MARGIN: the budget
        // assertion is a strict `<`, not `<=`, so a
        // regression that exactly hits the budget is
        // still flagged. CI jitter on the
        // shared-hardware runners averages ~20%, so a
        // sub-budget run on dev hardware is a strong
        // signal that the algorithm is in shape.
        expect(
          elapsed,
          `${algoName} visualSize=${size} took ${elapsed.toFixed(0)}ms (budget ${budget}ms)`,
        ).toBeLessThan(budget);
      });
    }
  }
});
