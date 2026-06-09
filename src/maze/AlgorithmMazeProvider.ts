import { decodeSeed, fnv1a, mulberry32, InvalidSeedError } from '../utils/seed';
import { generateRecursiveBacktracker } from './generators/recursiveBacktracker';
import { generateKruskal } from './generators/kruskal';
import { generatePrim } from './generators/prim';
import { generateHuntAndKill } from './generators/huntAndKill';
import type { Algorithm, MazeData, MazeProvider } from './types';

// MazeProvider for procedurally generated mazes.
//
// load(id) decodes the seed id (e.g. "algo-v1-recursive-backtracker-15-0123456789abcdef"),
// dispatches to the matching algorithm, and assembles a complete MazeData
// (start at (0,0), exit at the last logical cell, default reach-exit rules,
// no pickups — the procedural level is a clean slate that other code can
// decorate if needed).
//
// list() always returns an empty array: procedural mazes have no fixed
// catalog, so there is nothing to enumerate.
export class AlgorithmMazeProvider implements MazeProvider {
  async list(): Promise<string[]> {
    return [];
  }

  async load(id: string): Promise<MazeData> {
    // decodeSeed throws InvalidSeedError on a malformed id, which satisfies
    // the test "throws InvalidSeedError on a malformed seed id".
    const seed = decodeSeed(id);
    const walls = generateWalls(seed.algorithm, seed.size, seed.mazeSeed);
    const logicalSize = Math.ceil(seed.size / 2);
    return {
      id,
      name: `${seed.algorithm} ${seed.size}×${seed.size} (${seed.mazeSeed.slice(0, 8)})`,
      size: { width: seed.size, depth: seed.size },
      // cellSize=2 matches the hand-crafted levels in public/levels/*.json
      // and satisfies the JsonMazeProvider MIN_CELL_SIZE floor for the
      // default player radius.
      cellSize: 2,
      start: { x: 0, z: 0 },
      exit: { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) },
      walls,
      pickups: [],
      rules: {
        initialTime: 30,
        maxHealth: 3,
        victory: 'reach-exit',
        timeOnPickup: 15,
      },
    };
  }
}

// Convert a 16-char hex seed into a function-typed mulberry32 PRNG. We hash
// the hex string with FNV-1a to get a 32-bit seed, since mulberry32 takes a
// single 32-bit integer. (parseHexSeed returns a bigint, which is wider than
// mulberry32 wants.)
function prngFromHex(hex: string): () => number {
  return mulberry32(fnv1a(hex));
}

function generateWalls(algorithm: Algorithm, size: number, hex: string) {
  const rng = prngFromHex(hex);
  switch (algorithm) {
    case 'recursive-backtracker':
      return generateRecursiveBacktracker(size, rng);
    case 'kruskal':
      return generateKruskal(size, rng);
    case 'prim':
      return generatePrim(size, rng);
    case 'hunt-and-kill':
      return generateHuntAndKill(size, rng);
    default: {
      // Exhaustiveness check: if a new algorithm is added to the union
      // without updating this switch, TS will fail to compile here.
      const _exhaustive: never = algorithm;
      throw new InvalidSeedError(`AlgorithmMazeProvider: unhandled algorithm ${String(_exhaustive)}`);
    }
  }
}
