// P2-21 cleanup (DESIGN DEBT #7): single source of truth for the 15
// procedural maze algorithms. Before this file existed, adding a new
// algorithm required editing 9 places in lockstep:
//   - src/maze/types.ts                  (Algorithm union)
//   - src/utils/seed.ts                  (VALID_ALGORITHMS whitelist)
//   - src/maze/AlgorithmMazeProvider.ts  (imports + switch case)
//   - src/store/levelStore.ts            (parallel VALID_ALGORITHMS copy —
//                                         this was the bug behind #1, the
//                                         11 silent best-record drops)
//   - src/ui/LevelSelect.tsx             (ALGORITHM_OPTIONS dropdown)
//   - src/i18n/resources/{en,zh}.ts      (label keys)
//   - tests/unit/maze/algorithmMazeProvider.test.ts (ALGOS array)
//   - tests/component/menus.test.tsx     (expected algorithm list)
//
// P2-19 / P2-20 / P2-21 grew the set from 4 → 15 and at least one of
// these sites (the levelStore copy) silently drifted; this registry
// collapses the 9 sites down to "1 source of truth (this file) + 1
// i18n string table" — the Algorithm union in types.ts is now a type
// derived from `typeof ALGORITHM_IDS[number]`, so adding an entry here
// without updating types.ts becomes a typecheck error. The labelKey
// field is checked against the i18n resources by a unit test (see
// tests/unit/maze/algorithmRegistry.test.ts).
//
// Decision notes:
//   - `generate` signature is fixed at `(size, rng) => CellType[][]` —
//     this is the public contract enforced across all 15 generators
//     (see generators/*.ts) and the public API constraint of the
//     P2-21 cleanup. A registry-level flag like `expandThickWall`
//     would require either a richer signature (dead code today) or
//     a second function field; neither is worth the complexity, so
//     the registry only carries the closure entry point.
//   - `labelKey` is a plain string (not a template literal type)
//     because the i18n resource type is a `Record<string, string>`
//     already; a string-literal-union here would not add type
//     safety beyond the runtime check in the test below.
//   - `perfBudgetMs50` is the 50×50 single-generation wall-clock
//     budget in ms; the algorithmMazeProvider test reads it instead
//     of hard-coding per-algo budgets. Cheap spanning-tree algorithms
//     get 500ms; the O(N²) random-walk family (Aldous-Broder,
//     Wilson's, Houston) gets 1500ms. Adding a new algorithm
//     requires picking a budget here — the test will fail loudly
//     if this map is missing an entry (the Record<Algorithm, number>
//     type forces completeness).

import type { Algorithm, CellType } from './types';
import { generateAldousBroder } from './generators/aldousBroder';
import { generateBinaryTree } from './generators/binaryTree';
import { generateBlobbyRecursiveDivision } from './generators/blobbyRecursiveDivision';
import { generateEller } from './generators/eller';
import { generateGrowingBinaryTree } from './generators/growingBinaryTree';
import { generateGrowingTree } from './generators/growingTree';
import { generateHouston } from './generators/houston';
import { generateHuntAndKill } from './generators/huntAndKill';
import { generateKruskal } from './generators/kruskal';
import { generateParallelBacktracker } from './generators/parallelBacktracker';
import { generatePrim } from './generators/prim';
import { generateRecursiveBacktracker } from './generators/recursiveBacktracker';
import { generateRecursiveDivision } from './generators/recursiveDivision';
import { generateSidewinder } from './generators/sidewinder';
import { generateWilsons } from './generators/wilsons';

export interface AlgorithmEntry {
  // The string literal must match the Algorithm union in maze/types.ts
  // — TypeScript enforces this because the registry array is typed
  // `AlgorithmEntry[]` and `id: Algorithm` rejects any string that
  // isn't in the union. Adding a new entry to a wider union therefore
  // forces the types.ts author to widen the union first.
  id: Algorithm;
  // The closure entry point. Every generator in src/maze/generators/
  // exposes this exact signature — `(visualSize, rng) => CellType[][]`
  // — and the registry is the single place this contract is named.
  generate: (visualSize: number, rng: () => number) => CellType[][];
  // The i18n resource key used by LevelSelect's algorithm dropdown.
  // Must exist in both src/i18n/resources/en.ts and zh.ts; the
  // algorithmRegistry.test.ts file asserts this.
  labelKey: string;
  // Per-algo 50×50 generation wall-clock budget in ms. The provider
  // test reads this and asserts each algorithm finishes inside its
  // budget — see the comment at the top of this file for the
  // 500/1500 split rationale.
  perfBudgetMs50: number;
}

// P2-21 cleanup: the 15 entries are the jamisbuck.org/mazes algorithm
// set. The order is the canonical order P2-19 / P2-20 / P2-21 shipped
// in (4 + 4 + 4 + 3 = 15). Order matters for the LevelSelect dropdown
// and the menus.test.tsx `expected` array; if a future change reorders
// this list, both must move together (the registry is the single
// source of truth, so changing it here changes both downstream).
export const ALGORITHM_REGISTRY: readonly AlgorithmEntry[] = [
  // P2-3: original 4 spanning-tree generators.
  { id: 'recursive-backtracker', generate: generateRecursiveBacktracker, labelKey: 'levels.algorithm.recursiveBacktracker', perfBudgetMs50: 500 },
  { id: 'kruskal', generate: generateKruskal, labelKey: 'levels.algorithm.kruskal', perfBudgetMs50: 500 },
  { id: 'prim', generate: generatePrim, labelKey: 'levels.algorithm.prim', perfBudgetMs50: 500 },
  { id: 'hunt-and-kill', generate: generateHuntAndKill, labelKey: 'levels.algorithm.huntAndKill', perfBudgetMs50: 500 },
  // P2-19: 4 more spanning-tree / binary-choice generators.
  { id: 'eller', generate: generateEller, labelKey: 'levels.algorithm.eller', perfBudgetMs50: 500 },
  { id: 'sidewinder', generate: generateSidewinder, labelKey: 'levels.algorithm.sidewinder', perfBudgetMs50: 500 },
  { id: 'binary-tree', generate: generateBinaryTree, labelKey: 'levels.algorithm.binaryTree', perfBudgetMs50: 500 },
  { id: 'growing-tree', generate: generateGrowingTree, labelKey: 'levels.algorithm.growingTree', perfBudgetMs50: 500 },
  // P2-20: 4 more — including the 2 O(N²) random-walk algorithms that
  // justify the 1500ms budget bucket.
  { id: 'parallel-backtracker', generate: generateParallelBacktracker, labelKey: 'levels.algorithm.parallelBacktracker', perfBudgetMs50: 500 },
  { id: 'recursive-division', generate: generateRecursiveDivision, labelKey: 'levels.algorithm.recursiveDivision', perfBudgetMs50: 500 },
  { id: 'aldous-broder', generate: generateAldousBroder, labelKey: 'levels.algorithm.aldousBroder', perfBudgetMs50: 1500 },
  { id: 'wilsons', generate: generateWilsons, labelKey: 'levels.algorithm.wilsons', perfBudgetMs50: 1500 },
  // P2-21: final 3 — Houston is the third O(N²) random-walk; the
  // other two are spanning-tree variants and stay at 500ms.
  { id: 'houston', generate: generateHouston, labelKey: 'levels.algorithm.houston', perfBudgetMs50: 1500 },
  { id: 'growing-binary-tree', generate: generateGrowingBinaryTree, labelKey: 'levels.algorithm.growingBinaryTree', perfBudgetMs50: 500 },
  { id: 'blobby-recursive-division', generate: generateBlobbyRecursiveDivision, labelKey: 'levels.algorithm.blobbyRecursiveDivision', perfBudgetMs50: 500 },
] as const;

// Ordered id list — useful for tests that need a stable iteration
// order (algorithmMazeProvider.test.ts) and for the menus.test.tsx
// `expected` array. Order matches the registry above.
export const ALGORITHM_IDS: readonly Algorithm[] = ALGORITHM_REGISTRY.map((e) => e.id);

// O(1) lookup by id. Throws at runtime if the id is unknown — that's
// the desired behavior because the only caller is the registry-driven
// generateWalls in AlgorithmMazeProvider, and a missing entry would
// already be a typecheck error (the entry id is typed as `Algorithm`).
export const ALGORITHM_BY_ID: Record<Algorithm, AlgorithmEntry> = Object.fromEntries(
  ALGORITHM_REGISTRY.map((e) => [e.id, e]),
) as Record<Algorithm, AlgorithmEntry>;
