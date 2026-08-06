import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateEller } from '../../../../src/maze/generators/eller';

describe('generateEller (P2-19)', () => {
  assertGeneratorContract({
    name: 'eller',
    generate: generateEller,
  });
});
