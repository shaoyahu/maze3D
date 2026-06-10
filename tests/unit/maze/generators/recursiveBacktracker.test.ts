import { describe, it, expect } from 'vitest';
import { mulberry32, fnv1a } from '../../../../src/utils/seed';
import { generateRecursiveBacktracker } from '../../../../src/maze/generators/recursiveBacktracker';
import { isReachable } from '../../../../src/maze/reachability';
import type { CellType } from '../../../../src/maze/types';

function rngFromHexSeed(hex: string): () => number {
  // 64-bit hex -> 32-bit via FNV-1a hash of the string. FNV mixes the input
  // bits well, so adjacent hex strings (e.g. "0001" vs "0002") produce
  // 32-bit seeds that differ by more than a single bit, which is what
  // mulberry32 needs to emit different first values.
  return mulberry32(fnv1a(hex));
}

// In thick-wall encoding, passages sit at even-even positions. The natural
// "far corner" of the maze is the last logical cell, not the matrix corner
// (which is at an odd-odd wall position for even visualSize). For visualSize
// 15/30/50 these are (14,14)/(28,28)/(48,48).
function exitCell(visualSize: number): { x: number; z: number } {
  const logicalSize = Math.ceil(visualSize / 2);
  return { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) };
}

describe('generateRecursiveBacktracker', () => {
  it('returns a 2D array of 0/1 cells of the right shape', () => {
    const walls = generateRecursiveBacktracker(15, mulberry32(1));
    expect(walls).toHaveLength(15);
    for (const row of walls) {
      expect(row).toHaveLength(15);
      for (const cell of row) {
        expect([0, 1]).toContain(cell);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const rng1 = rngFromHexSeed('0123456789abcdef');
    const rng2 = rngFromHexSeed('0123456789abcdef');
    const a = generateRecursiveBacktracker(15, rng1);
    const b = generateRecursiveBacktracker(15, rng2);
    expect(a).toEqual(b);
  });

  it('produces different outputs for different seeds', () => {
    const a = generateRecursiveBacktracker(15, rngFromHexSeed('0000000000000001'));
    const b = generateRecursiveBacktracker(15, rngFromHexSeed('0000000000000002'));
    expect(a).not.toEqual(b);
  });

  it('produces a fully connected maze (start reaches exit) at 15×15', () => {
    const walls = generateRecursiveBacktracker(15, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(15))).toBe(true);
  });

  it('produces a fully connected maze at 30×30', () => {
    const walls = generateRecursiveBacktracker(30, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(30))).toBe(true);
  });

  it('produces a fully connected maze at 50×50', () => {
    const walls = generateRecursiveBacktracker(50, mulberry32(42));
    expect(isReachable(walls, { x: 0, z: 0 }, exitCell(50))).toBe(true);
  });

  it('50×50 generation completes in under 500ms', () => {
    const t0 = performance.now();
    generateRecursiveBacktracker(50, mulberry32(7));
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });

  it('start and exit cells are open (walls = 0)', () => {
    const walls = generateRecursiveBacktracker(15, mulberry32(1));
    expect(walls[0][0]).toBe(0 as CellType);
    expect(walls[14][14]).toBe(0 as CellType);
  });

  it('encodes a deterministic per-(size,hex) fingerprint via fnv1a', () => {
    // Fingerprint: hash the whole walls matrix. Useful for the E2E to assert
    // "same seed = same maze" without diffing 2500 cells.
    const walls = generateRecursiveBacktracker(15, rngFromHexSeed('deadbeefcafebabe'));
    const fp = fnv1a(JSON.stringify(walls));
    const walls2 = generateRecursiveBacktracker(15, rngFromHexSeed('deadbeefcafebabe'));
    const fp2 = fnv1a(JSON.stringify(walls2));
    expect(fp).toBe(fp2);
  });
});
