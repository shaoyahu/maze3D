import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateRecursiveDivision } from '../../../../src/maze/generators/recursiveDivision';

describe('generateRecursiveDivision (P2-20)', () => {
  assertGeneratorContract({
    name: 'recursive-division',
    generate: generateRecursiveDivision,
  });
});
