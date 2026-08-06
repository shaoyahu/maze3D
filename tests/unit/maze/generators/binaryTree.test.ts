import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateBinaryTree } from '../../../../src/maze/generators/binaryTree';

describe('generateBinaryTree (P2-19)', () => {
  assertGeneratorContract({
    name: 'binary-tree',
    generate: generateBinaryTree,
  });
});
