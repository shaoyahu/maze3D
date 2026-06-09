import { describe, it, expect } from 'vitest';
import { encodeSeed, decodeSeed, fnv1a, mulberry32, parseHexSeed, InvalidSeedError } from '../../../src/utils/seed';
import { AlgorithmMazeProvider } from '../../../src/maze/AlgorithmMazeProvider';
import type { Algorithm, MazeSize } from '../../../src/maze/types';

const ALGOS: Algorithm[] = ['recursive-backtracker', 'kruskal', 'prim', 'hunt-and-kill'];
const SIZES: MazeSize[] = [15, 30, 50];

function seedId(algorithm: Algorithm, size: MazeSize, hex: string): string {
  return encodeSeed({ algorithm, size, mazeSeed: hex });
}

describe('AlgorithmMazeProvider', () => {
  it('list() returns an empty list (procedural mazes have no fixed catalog)', async () => {
    const provider = new AlgorithmMazeProvider();
    const ids = await provider.list();
    expect(ids).toEqual([]);
  });

  it('load() returns a MazeData for every (algorithm, size) combination', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const algorithm of ALGOS) {
      for (const size of SIZES) {
        const id = seedId(algorithm, size, '0123456789abcdef');
        const data = await provider.load(id);
        expect(data.id).toBe(id);
        expect(data.name).toContain(algorithm);
        expect(data.size.width).toBe(size);
        expect(data.size.depth).toBe(size);
        expect(data.start).toEqual({ x: 0, z: 0 });
        expect(data.exit).toEqual({ x: 2 * (Math.ceil(size / 2) - 1), z: 2 * (Math.ceil(size / 2) - 1) });
        expect(data.walls).toHaveLength(size);
        for (const row of data.walls) {
          expect(row).toHaveLength(size);
          for (const cell of row) {
            expect([0, 1]).toContain(cell);
          }
        }
        expect(data.pickups).toEqual([]);
        expect(data.rules.victory).toBe('reach-exit');
      }
    }
  });

  it('is deterministic: same seed id produces identical walls', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const algorithm of ALGOS) {
      const id = seedId(algorithm, 15, 'deadbeefcafebabe');
      const a = await provider.load(id);
      const b = await provider.load(id);
      expect(a.walls).toEqual(b.walls);
    }
  });

  it('different hex seeds produce different walls', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const algorithm of ALGOS) {
      const a = await provider.load(seedId(algorithm, 15, '0000000000000001'));
      const b = await provider.load(seedId(algorithm, 15, '0000000000000002'));
      expect(a.walls).not.toEqual(b.walls);
    }
  });

  it('50×50 generation for every algorithm completes in under 500ms', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const algorithm of ALGOS) {
      const t0 = performance.now();
      await provider.load(seedId(algorithm, 50, '0123456789abcdef'));
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(500);
    }
  });

  it('start and exit cells are open in the produced maze', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const algorithm of ALGOS) {
      const data = await provider.load(seedId(algorithm, 15, '0123456789abcdef'));
      expect(data.walls[0][0]).toBe(0);
      expect(data.walls[14][14]).toBe(0);
    }
  });

  it('throws InvalidSeedError on a malformed seed id', async () => {
    const provider = new AlgorithmMazeProvider();
    await expect(provider.load('not-a-seed')).rejects.toBeInstanceOf(InvalidSeedError);
  });

  it('round-trips through encode/decode', () => {
    for (const algorithm of ALGOS) {
      const original = seedId(algorithm, 30, '0123456789abcdef');
      const decoded = decodeSeed(original);
      expect(decoded.algorithm).toBe(algorithm);
      expect(decoded.size).toBe(30);
      expect(decoded.mazeSeed).toBe('0123456789abcdef');
    }
    // fvk1a / mulberry32 / parseHexSeed are used indirectly via the
    // provider; exercise them here to keep the import honest.
    expect(parseHexSeed('0000000000000001')).toBe(1n);
    expect(typeof mulberry32(fnv1a('seed'))).toBe('function');
  });
});
