import { describe, it, expect } from 'vitest';
import { encodeSeed, decodeSeed, fnv1a, mulberry32, parseHexSeed, InvalidSeedError } from '../../../src/utils/seed';
import {
  AlgorithmMazeProvider,
  filterPickupsAgainstSpawn,
} from '../../../src/maze/AlgorithmMazeProvider';
import type { Algorithm, MazeSize, Pickup } from '../../../src/maze/types';

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

// F-2026-06-17-D-M-1 (false positive — see AlgorithmMazeProvider.ts for
// the rationale). The review finding assumed generators randomly placed
// pickups near the exit; in reality every generator only emits walls,
// and AlgorithmMazeProvider.load() returns `pickups: []`. These tests
// pin both the "no procedural pickups" contract and the defensive
// helper's behavior so a future regression that re-introduces random
// pickup placement fails loudly.
describe('F-2026-06-17-D-M-1 pickup-spawn guard', () => {
  it('AlgorithmMazeProvider.load().pickups is always [] across all algorithms × sizes × seeds', async () => {
    const provider = new AlgorithmMazeProvider();
    const hexes = ['0000000000000001', '0123456789abcdef', 'deadbeefcafebabe'];
    for (const algorithm of ALGOS) {
      for (const size of SIZES) {
        for (const hex of hexes) {
          const data = await provider.load(seedId(algorithm, size, hex));
          expect(data.pickups).toEqual([]);
        }
      }
    }
  });

  it('filterPickupsAgainstSpawn removes pickups within 1 cell of exit', () => {
    const exit = { x: 10, z: 10 };
    const start = { x: 0, z: 0 };
    const pickups: Pickup[] = [
      { id: 'near', x: 10, z: 10, type: 'time', value: 1 },
      { id: 'corner', x: 11, z: 11, type: 'time', value: 1 },
      { id: 'far', x: 0, z: 10, type: 'time', value: 1 },
    ];
    const filtered = filterPickupsAgainstSpawn(pickups, exit, start);
    expect(filtered.map((p) => p.id)).toEqual(['far']);
  });

  it('filterPickupsAgainstSpawn removes pickups within 2 cells of start', () => {
    const exit = { x: 10, z: 10 };
    const start = { x: 0, z: 0 };
    const pickups: Pickup[] = [
      { id: 'at', x: 0, z: 0, type: 'health', value: 1 },
      { id: 'adjacent', x: 2, z: 0, type: 'health', value: 1 },
      { id: 'far', x: 5, z: 5, type: 'health', value: 1 },
    ];
    const filtered = filterPickupsAgainstSpawn(pickups, exit, start);
    expect(filtered.map((p) => p.id)).toEqual(['far']);
  });

  it('filterPickupsAgainstSpawn returns empty array unchanged', () => {
    expect(filterPickupsAgainstSpawn([], { x: 10, z: 10 }, { x: 0, z: 0 })).toEqual([]);
  });
});
