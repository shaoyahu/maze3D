import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateParallelBacktracker } from '../../../../src/maze/generators/parallelBacktracker';

describe('generateParallelBacktracker (P2-20)', () => {
  assertGeneratorContract({
    name: 'parallel-backtracker',
    generate: generateParallelBacktracker,
  });
});
