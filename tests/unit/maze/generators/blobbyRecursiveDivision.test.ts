import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateBlobbyRecursiveDivision } from '../../../../src/maze/generators/blobbyRecursiveDivision';

describe('generateBlobbyRecursiveDivision (P2-21)', () => {
  assertGeneratorContract({
    name: 'blobby-recursive-division',
    generate: generateBlobbyRecursiveDivision,
  });
});
