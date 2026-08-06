import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateHouston } from '../../../../src/maze/generators/houston';

// Houston's runs Aldous-Broder up to half + Wilson's for the rest —
// O(N) + O(N log N) = O(N log N) expected. The unit-test perf budget is
// widened to 1500ms (vs 500ms for cheaper algorithms); see P2-21 spec §9
// for the rationale.
describe('P2-21 Houston generator', () => {
  assertGeneratorContract({
    name: 'houston',
    generate: generateHouston,
    perfBudgetMs50: 1500,
  });
});
