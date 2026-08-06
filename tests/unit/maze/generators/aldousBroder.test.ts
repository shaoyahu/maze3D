import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateAldousBroder } from '../../../../src/maze/generators/aldousBroder';

// Aldous-Broder is O(N²) expected — the perf budget is widened to 1500ms
// (vs 500ms for the other algorithms) for the 50×50 size. The 15×15 / 30×30
// sizes still finish in single-digit ms.
describe('generateAldousBroder (P2-20)', () => {
  assertGeneratorContract({
    name: 'aldous-broder',
    generate: generateAldousBroder,
    perfBudgetMs50: 1500,
  });
});
