// Seed codec + PRNG utilities for procedural maze generation.
// Pure module: no React/Zustand dependencies. Algorithms in src/maze/generators/*
// consume mulberry32 + parseHexSeed; the rest of the app consumes encodeSeed/
// decodeSeed for round-tripping a Seed through a single string id.

import type { Algorithm, LevelCount, MazeSize, Seed } from '../maze/types';
// P2-21 cleanup (DESIGN DEBT #7): VALID_ALGORITHMS used to be a
// parallel 15-item array. The levelStore mirror (CRITICAL #1) had
// drifted to a stale 4-item copy, silently dropping best records for
// the newer algorithms during init. The single source of truth now
// lives in maze/algorithmRegistry.ts — re-export it here for back-
// compat with the `decodeSeed` whitelist check (below) and any
// third-party consumer (the previous public name of this constant).
import { ALGORITHM_IDS as VALID_ALGORITHMS } from '../maze/algorithmRegistry';
export { ALGORITHM_IDS as VALID_ALGORITHMS } from '../maze/algorithmRegistry';

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

// P2-21 cleanup: the 15-item VALID_ALGORITHMS array was re-exported
// from maze/algorithmRegistry.ts at the top of this file (single
// source of truth). The historical inline copy (4 → 8 → 12 → 15 items
// over P2-3 / P2-19 / P2-20 / P2-21) is removed — see the registry
// file for the canonical list and the matching id → labelKey map.

const VALID_SIZES: readonly MazeSize[] = [15, 30, 50];

// P3-1: the v1 seed id format. Encoding:
//   algo-v1-{algorithm}-{size}-{mazeSeed}
// Examples (4 of the 15 algorithms × 3 sizes, all single-layer):
//   algo-v1-recursive-backtracker-15-0123456789abcdef
//   algo-v1-kruskal-30-fedcba9876543210
//   algo-v1-prim-50-deadbeefcafebabe
//   algo-v1-wilsons-30-8000000000000000
// Kept verbatim (P2-21 back-compat contract: renaming the v1 prefix
// is a breaking change to existing best records).
const SEED_RE = /^algo-v1-([a-z-]+)-(\d+)-([0-9a-f]{16})$/;

// P3-1: the v2 seed id format adds a `levels` slot between `size`
// and the hex mazeSeed. Encoding:
//   algo-v2-{algorithm}-{size}-{levels}-{mazeSeed}
// `levels` is a 1..6 integer (validated against LEVEL_COUNTS below).
// Examples:
//   algo-v2-recursive-backtracker-30-2-0123456789abcdef
//   algo-v2-kruskal-30-1-fedcba9876543210      ← legal: levels=1 is
//     allowed but decodes identically to v1 (the engine treats
//     levelCount=1 as "single layer" regardless of codec version)
//   algo-v2-houston-50-6-8000000000000000
//
// P3-1a is the data-layer landing zone; the engine / collision /
// reachability work that actually renders N layers is P3-1b. The
// codec is landed now so URL persistence + best-record round-trip
// can start carrying the level count without waiting on engine
// changes (the v2 id is opaque to v1 consumers — they fail the v1
// regex and fall through to the v2 regex, which is the exact reason
// we run both regexes in `decodeSeed`).
const SEED_RE_V2 = /^algo-v2-([a-z-]+)-(\d+)-(\d+)-([0-9a-f]{16})$/;

// P3-1: whitelist for the v2 `levels` slot. Mirrors `MAZE_SIZE_VALUES /
// VALID_SIZES` so the seed codec + the levelStore + the JSON validator
// all share one source of truth (types.ts is the canonical home;
// seed.ts re-imports for the runtime check). 1..6 matches spec §12
// Q7 (1 = back-compat default, 6 = upper cap).
const VALID_LEVEL_COUNTS: readonly LevelCount[] = [1, 2, 3, 4, 5, 6];

// P4: v3 seed id format. Introduces a 3D voxel cube — the algorithm
// operates on a `[z][y][x]` CellType[][][] instead of the
// historical `[z][x]` CellType[][]. Encoding:
//
//   algo-v3-{algorithm}-{size}-{mazeSeed}
//
// `size` is the **3D** visualSize (odd, 5/7/9 for the P4a MVP
// sizes from `recursiveBacktracker3D.ts`). The v1/v2 sizes
// (15/30/50) don't apply — a 3D cube of 50³ = 125000 cells would
// be 5 MB per maze, well past the 5/7/9 sweet spot the
// recursive-backtracker-3D family is designed for.
//
// The v3 prefix is new; the v1 regex and the v2 regex both fail
// for v3 ids because the algorithm slot in v1/v2 must be one of
// the 15 P2-21 algorithms (P2-21 cleanup, `VALID_ALGORITHMS`),
// and `3d-recursive-backtracker` isn't on that list. We still
// add a v3-specific whitelist so a future v3 algorithm (P4b's
// 3D Prim / 3D CA) can register here without re-touching v1/v2.
const SEED_RE_V3 = /^algo-v3-([a-z0-9-]+)-(\d+)-([0-9a-f]{16})$/;

// F-P4-VALID-3D-SIZES: the 3D visualSize whitelist. Lives next
// to the v3 regex so the codec + the generator share one source
// of truth. `recursiveBacktracker3D.ts` re-exports the same set
// via `VALID_3D_SIZES`; the duplication is intentional — the
// codec is a runtime check, the generator is a build-time
// typecheck, and importing across the maze/utils boundary
// would create a cycle the registry pattern explicitly avoids.
//
// P4b-CellSize: widens the set from {5, 7, 9} to
// {5, 7, 9, 11, 13, 15}. The 11/13/15 entries are the
// "medium" 3D cube sizes that P4a spec §15 reserved as a
// future candidate. Both sources of truth
// (`recursiveBacktracker3D.ts` + this `seed.ts` list) MUST
// stay in lockstep — `decodeSeed` rejects any size not on
// this list, so widening only the generator whitelist
// would still fail every v3 id with a 3D size > 9.
const VALID_3D_SIZES: readonly number[] = [5, 7, 9, 11, 13, 15];

// P4: whitelist for v3 algorithms. Single algorithm in P4a
// (recursive backtracker on a 3D cube). P4b will append 3D
// Prim / 3D CA here as the family grows. The `3d-` prefix is
// required on every entry — see `recursiveBacktracker3D.ts`
// for the rationale. TypeScript can't enforce the prefix
// without a string-literal-union here, so a runtime test
// (tests/unit/utils/seed.test.ts) asserts it.
//
// P4b-Prim: add '3d-prim' as the second 3D algorithm. The
// entry is appended (not interleaved) so the whitelist order
// is "P4a first, P4b-Prim second, future P4b-... last" — this
// doesn't affect any code path (whitelist membership is
// `Array.prototype.includes`-based, order-independent) but
// makes git history show the algorithm growth clearly.
const VALID_3D_ALGORITHMS: readonly string[] = [
  '3d-recursive-backtracker',
  '3d-prim',
];

export function encodeSeed(seed: Seed): string {
  // P2-21 back-compat: this function is the v1 codec. It is the
  // canonical encoder for hand-crafted levels and single-layer
  // procedural levels. Renaming the prefix to algo-v2- would
  // break every existing best record (the `levelId` field in
  // localStorage uses the encoded seed string verbatim), so we
  // intentionally keep this on v1 even when the seed carries a
  // `levelCount`. v2 callers must use `encodeSeedV2` explicitly
  // — see the new function below.
  return `algo-v1-${seed.algorithm}-${seed.size}-${seed.mazeSeed}`;
}

// P3-1: explicit v2 encoder. Used by LevelSelect's "multi-level"
// dropdown (P3-1c) and by tests. The shape is fixed at
// `algo-v2-{algorithm}-{size}-{levels}-{hex}`; a missing or out-of-
// range `levelCount` falls back to 1, which decodes back to the
// same v1 single-layer semantics on the other side.
export function encodeSeedV2(seed: Seed, levelCount: LevelCount): string {
  return `algo-v2-${seed.algorithm}-${seed.size}-${levelCount}-${seed.mazeSeed}`;
}

// P4: v3 codec for 3D voxel mazes. The signature mirrors
// `encodeSeedV2` but the shape lacks the `levels` slot — a 3D
// cube is by definition a single voxel mass, never a stack of
// layers. `algorithm` is the 3D literal (e.g.
// `'3d-recursive-backtracker'`); `size` is the odd 3D visualSize
// (5/7/9). The caller is `LevelSelect` and the test fixture
// builder, not the provider — the provider consumes the
// decoded Seed and routes to the 3D generator by algorithm
// literal.
//
// Note: a v3 Seed has `size: number`, not `MazeSize`, because
// the 3D sizes (5/7/9/11/13/15) are not in the historical 2D
// whitelist (15/30/50). The shared `Seed` interface in
// `types.ts` keeps the 2D `MazeSize` constraint for LevelSelect
// and the 2D generator dispatch, so v3 gets its own narrow
// shape — `algorithm` + a free `size: number` + `mazeSeed` —
// and callers explicitly pass the odd 3D visualSize. The
// interface is structural (just the three fields), so any Seed
// is accepted via the structural-subtype rule; the only
// difference is that v3 also accepts the 3D sizes that don't
// satisfy `MazeSize`.
export interface SeedV3 {
  algorithm: Algorithm;
  size: number;
  mazeSeed: string;
}
export function encodeSeedV3(seed: SeedV3): string {
  return `algo-v3-${seed.algorithm}-${seed.size}-${seed.mazeSeed}`;
}

export function decodeSeed(id: string): Seed {
  // P4: try the v3 regex first. v3 ids are the most specific
  // (3-segment pattern: `algo-v3-{algorithm}-{size}-{hex}`), so
  // failing fast lets the v1/v2 branches handle the historical
  // formats below. The `algorithm` field is one of the
  // 3D-prefixed literals (`3d-recursive-backtracker` for P4a);
  // the size is the 3D visualSize (5/7/9).
  const m3 = SEED_RE_V3.exec(id);
  if (m3) {
    const [, algorithm, sizeStr, mazeSeed] = m3;
    if (!VALID_3D_ALGORITHMS.includes(algorithm)) {
      throw new InvalidSeedError(`decodeSeed: unknown v3 algorithm ${JSON.stringify(algorithm)}`);
    }
    const size = Number(sizeStr);
    if (!VALID_3D_SIZES.includes(size)) {
      throw new InvalidSeedError(`decodeSeed: unsupported v3 size ${size} (expected 5, 7, or 9)`);
    }
    return {
      algorithm: algorithm as Algorithm,
      // F-P4b-CellSize: the 3D visualSize is a `number` (5/7/9/11/13/15),
      // not a 2D `MazeSize` (15/30/50). The shared `Seed.size: MazeSize`
      // type doesn't capture the v3 range, so we cast through `number`
      // here. Callers that need the 2D-only validation check
      // `isMazeSize(seed.size)` before using the value as a 2D size.
      size: size as number as never,
      mazeSeed,
      // v3 always decodes to a single voxel cube; `levelCount`
      // is omitted on purpose so callers fall back to 1 via
      // `seed.levelCount ?? 1`. The runtime guard that picks
      // the 3D rendering path is `MazeData.walls3D` being
      // present, not `levelCount`.
    };
  }
  // P3-1: try the v2 regex first because the v1 regex would
  // greedily match the leading 4 segments of a v2 id (it has no
  // anchor for "exactly 4 dashes-after-algo"). Concretely, a v2 id
  // like `algo-v2-recursive-backtracker-30-2-0123456789abcdef`
  // would parse with SEED_RE as algorithm="v2" (rejected) — the
  // "v1" prefix is the only way v1 was ever valid, so we still
  // keep it as a fast path. The v2 branch handles the new format.
  // Both branches share the algorithm + size + mazeSeed validation
  // and only differ in the optional `levels` slot.
  const m2 = SEED_RE_V2.exec(id);
  if (m2) {
    const [, algorithm, sizeStr, levelsStr, mazeSeed] = m2;
    if (!VALID_ALGORITHMS.includes(algorithm as Algorithm)) {
      throw new InvalidSeedError(`decodeSeed: unknown algorithm ${JSON.stringify(algorithm)}`);
    }
    const size = Number(sizeStr);
    if (!VALID_SIZES.includes(size as MazeSize)) {
      throw new InvalidSeedError(`decodeSeed: unsupported size ${size}`);
    }
    const levels = Number(levelsStr);
    if (!VALID_LEVEL_COUNTS.includes(levels as LevelCount)) {
      throw new InvalidSeedError(`decodeSeed: unsupported levelCount ${levels} (expected 1..6)`);
    }
    return {
      algorithm: algorithm as Algorithm,
      size: size as MazeSize,
      mazeSeed,
      // v2 decoders always populate levelCount; v1 decoders leave
      // it undefined so callers can use "undefined" as the
      // historical single-layer signal. The cast is safe because
      // VALID_LEVEL_COUNTS is the same literal union as LevelCount.
      levelCount: levels as LevelCount,
    };
  }
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
    // levelCount intentionally omitted: a v1 id by definition does
    // not carry it. Callers that need a numeric value fall back to
    // 1 (single layer) — see AlgorithmMazeProvider.load for the
    // canonical `seed.levelCount ?? 1` pattern.
  };
}

// ---------------------------------------------------------------------------
// F-D-quality-D-3: deterministic fallback for `randomHexSeed` in
// environments without crypto.getRandomValues. The caller passes
// `Date.now()` so this function stays pure (no system clock inside);
// LevelSelect does `crypto.getRandomValues ?? fallbackRandomHexSeed(Date.now())`.
//
// We avoid Math.random() because its implementation is browser/OS-dependent
// — two no-crypto users would never share the same auto-generated seed.
// The seed flows through fnv1a(timeMs) -> mulberry32 -> 8 bytes, which is:
//   * Deterministic across browsers (pure-JS arithmetic)
//   * Different per call (Date.now() advances between user clicks)
//   * Pure enough to test (no Date.now() inside)
//
// `timeMs` is typed as `number`; a NaN / non-finite input collapses to 0
// so the function never throws — a seed generator that throws is worse
// than one that returns a constant, since the constant at least keeps
// the app functional in environments where Date.now() is somehow broken.
// ---------------------------------------------------------------------------
export function fallbackRandomHexSeed(timeMs: number): string {
  const safeTime = Number.isFinite(timeMs) ? Math.trunc(timeMs) : 0;
  const rand = mulberry32(fnv1a(String(safeTime)));
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += Math.floor(rand() * 256).toString(16).padStart(2, '0');
  }
  return out;
}
