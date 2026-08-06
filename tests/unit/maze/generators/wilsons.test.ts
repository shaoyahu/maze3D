import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateWilsons } from '../../../../src/maze/generators/wilsons';

describe('generateWilsons (P2-20)', () => {
  assertGeneratorContract({
    name: 'wilsons',
    generate: generateWilsons,
  });
});
