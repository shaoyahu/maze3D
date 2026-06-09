// Seed codec + PRNG utilities for procedural maze generation.
// Pure module: no React/Zustand dependencies. Algorithms in src/maze/generators/*
// consume mulberry32 + parseHexSeed; the rest of the app consumes encodeSeed/
// decodeSeed for round-tripping a Seed through a single string id.

import type { Algorithm, MazeSize, Seed } from '../maze/types';

export class InvalidSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSeedError';
  }
}

// FNV-1a 32-bit hash. Used to derive a deterministic 32-bit integer from a
// string seed (e.g. user-typed "hello"). Reference: http://www.isthe.com/chongo/tech/comp/fnv/
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(str: string): number {
  let h = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: 32-bit PRNG returning numbers in [0, 1). Cheap and good enough
// for maze generation (a few hundred thousand calls per level). Reference:
// https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function rand(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hex (16 lowercase chars) <-> bigint conversion for a 64-bit mazeSeed.
// Bigint is necessary because Number's safe-integer ceiling is 2^53 - 1, but a
// 64-bit seed needs the full 0..2^64-1 range.
export function toHexSeed(n: bigint): string {
  if (n < 0n) throw new InvalidSeedError('toHexSeed: negative bigint');
  return n.toString(16).padStart(16, '0');
}

const HEX_RE = /^[0-9a-f]{16}$/;

export function parseHexSeed(s: string): bigint {
  if (typeof s !== 'string' || !HEX_RE.test(s)) {
    throw new InvalidSeedError(`parseHexSeed: expected 16 lowercase hex chars, got ${JSON.stringify(s)}`);
  }
  return BigInt('0x' + s);
}

const VALID_ALGORITHMS: readonly Algorithm[] = [
  'recursive-backtracker',
  'kruskal',
  'prim',
  'hunt-and-kill',
];

const VALID_SIZES: readonly MazeSize[] = [15, 30, 50];

const SEED_RE = /^algo-v1-([a-z-]+)-(\d+)-([0-9a-f]{16})$/;

export function encodeSeed(seed: Seed): string {
  return `algo-v1-${seed.algorithm}-${seed.size}-${seed.mazeSeed}`;
}

export function decodeSeed(id: string): Seed {
  const m = SEED_RE.exec(id);
  if (!m) throw new InvalidSeedError(`decodeSeed: malformed id ${JSON.stringify(id)}`);
  const [, algorithm, sizeStr, mazeSeed] = m;
  if (!VALID_ALGORITHMS.includes(algorithm as Algorithm)) {
    throw new InvalidSeedError(`decodeSeed: unknown algorithm ${JSON.stringify(algorithm)}`);
  }
  const size = Number(sizeStr);
  if (!VALID_SIZES.includes(size as MazeSize)) {
    throw new InvalidSeedError(`decodeSeed: unsupported size ${size}`);
  }
  return {
    algorithm: algorithm as Algorithm,
    size: size as MazeSize,
    mazeSeed,
  };
}
