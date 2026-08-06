import { describe, it, expect, vi } from 'vitest';
import { assertGeneratorContract, exitCell } from './_testHelpers';
import {
  generateGrowingTree,
  parseStrategy,
} from '../../../../src/maze/generators/growingTree';
import { isReachable } from '../../../../src/maze/reachability';
import { mulberry32 } from '../../../../src/utils/seed';

describe('generateGrowingTree (P2-19)', () => {
  // generateGrowingTree takes an optional `strategySpec` 3rd arg, so we adapt
  // it to the (size, rng) → walls signature the contract helper expects.
  assertGeneratorContract({
    name: 'growing-tree',
    generate: (size, rng) => generateGrowingTree(size, rng),
  });

  // ---- Strategy presets ----

  it('random:100 produces a valid 30×30 maze', () => {
    const walls = generateGrowingTree(30, mulberry32(42), 'random:100');
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('oldest:100 produces a valid 30×30 maze', () => {
    const walls = generateGrowingTree(30, mulberry32(42), 'oldest:100');
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('middle:100 produces a valid 30×30 maze', () => {
    const walls = generateGrowingTree(30, mulberry32(42), 'middle:100');
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('newest:50,random:50 produces a valid 30×30 maze', () => {
    const walls = generateGrowingTree(30, mulberry32(42), 'newest:50,random:50');
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('falls back to newest:100 on invalid strategy name (with console.warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // All parts invalid -> fallback. Should still produce a valid maze.
      const walls = generateGrowingTree(30, mulberry32(42), 'foo:100,bar:50');
      expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// parseStrategy: pickIndex behavior
// ---------------------------------------------------------------------------

describe('parseStrategy', () => {
  it('newest:100 always returns the last index', () => {
    const pick = parseStrategy('newest:100', mulberry32(1));
    expect(pick([10, 20, 30])).toBe(2);
    expect(pick([1])).toBe(0);
  });

  it('oldest:100 always returns index 0', () => {
    const pick = parseStrategy('oldest:100', mulberry32(1));
    expect(pick([10, 20, 30])).toBe(0);
  });

  it('middle:100 returns the middle index', () => {
    const pick = parseStrategy('middle:100', mulberry32(1));
    expect(pick([10, 20, 30])).toBe(1); // floor(3/2) = 1
    expect(pick([10, 20, 30, 40, 50])).toBe(2); // floor(5/2) = 2
  });

  it('empty / invalid spec falls back to newest:100', () => {
    const pick = parseStrategy('', mulberry32(1));
    expect(pick([10, 20, 30])).toBe(2);
  });
});
