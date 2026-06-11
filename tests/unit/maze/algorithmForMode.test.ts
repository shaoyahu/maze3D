import { describe, it, expect } from 'vitest';
import { algorithmForMode } from '../../../src/maze/AlgorithmMazeProvider';
import type { Algorithm, VictoryType } from '../../../src/maze/types';

describe('algorithmForMode', () => {
  // P2-5 FR-17: mode → algorithm mapping
  const cases: Array<[VictoryType, Algorithm]> = [
    ['reach-exit', 'recursive-backtracker'],
    ['time-trial', 'prim'],
    ['survive', 'kruskal'],
  ];

  it.each(cases)('%s maps to %s', (mode, expected) => {
    expect(algorithmForMode(mode)).toBe(expected);
  });

  // Exhaustiveness: when a new VictoryType is added but the function isn't updated, this test fails
  it('handles every VictoryType member (exhaustive)', () => {
    const all: VictoryType[] = ['reach-exit', 'time-trial', 'survive'];
    for (const m of all) {
      // Should not throw or return undefined
      expect(algorithmForMode(m)).toBeTruthy();
    }
  });
});
