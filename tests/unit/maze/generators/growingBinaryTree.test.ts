import { describe } from 'vitest';
import { assertGeneratorContract } from './_testHelpers';
import { generateGrowingBinaryTree } from '../../../../src/maze/generators/growingBinaryTree';

describe('generateGrowingBinaryTree (P2-21)', () => {
  assertGeneratorContract({
    name: 'growing-binary-tree',
    generate: generateGrowingBinaryTree,
  });
});
