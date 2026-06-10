import { describe, it, expect } from 'vitest';
import { mulberry32, fnv1a } from '../../../../src/utils/seed';
import { generatePrim } from '../../../../src/maze/generators/prim';
import { isReachable } from '../../../../src/maze/reachability';
import type { CellType } from '../../../../src/maze/types';

function rngFromHexSeed(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

function exitCell(visualSize: number): { x: number; z: number } {
  const logicalSize = Math.ceil(visualSize / 2);
  return { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) };
}

describe('generatePrim', () => {
  it('returns a 2D array of 0/1 cells of the right shape', () => {
    const walls = generatePrim(15, mulberry32(1));
    expect(walls).toHaveLength(15);
    for (const row of walls) {
      expect(row).toHaveLength(15);
      for (const cell of row) {
        expect([0, 1]).toContain(cell);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generatePrim(15, rngFromHexSeed('0123456789abcdef'));
    const b = generatePrim(15, rngFromHexSeed('0123456789abcdef'));
    expect(a).toEqual(b);
  });

  it('produces different outputs for different seeds', () => {
    const a = generatePrim(15, rngFromHexSeed('0000000000000001'));
    const b = generatePrim(15, rngFromHexSeed('0000000000000002'));
    expect(a).not.toEqual(b);
  });

  it('produces a fully connected maze (start reaches exit) at 15×15', () => {
    const walls = generatePrim(15, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(15))).toBe(true);
  });

  it('produces a fully connected maze at 30×30', () => {
    const walls = generatePrim(30, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('produces a fully connected maze at 50×50', () => {
    const walls = generatePrim(50, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(50))).toBe(true);
  });

  it('50×50 generation completes in under 500ms', () => {
    const t0 = performance.now();
    generatePrim(50, mulberry32(7));
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });

  it('start and exit cells are open (walls = 0)', () => {
    const walls = generatePrim(15, mulberry32(1));
    expect(walls[0][0]).toBe(0 as CellType);
    expect(walls[14][14]).toBe(0 as CellType);
  });
});
