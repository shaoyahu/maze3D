import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateSidewinder } from '../../../../src/maze/generators/sidewinder';

describe('generateSidewinder (P2-19)', () => {
  assertGeneratorContract({
    name: 'sidewinder',
    generate: generateSidewinder,
  });
});
