import { describe, it, expect } from 'vitest';
import { encodeSeed, encodeSeedV2, decodeSeed, fnv1a, mulberry32, parseHexSeed, InvalidSeedError } from '../../../src/utils/seed';
import {
  AlgorithmMazeProvider,
  filterPickupsAgainstSpawn,
  generateMultiLevel,
} from '../../../src/maze/AlgorithmMazeProvider';
// P2-21 cleanup (DESIGN DEBT #7): the test's `ALGOS` list is derived
// from the registry. Adding a new algorithm now flows in lockstep:
// the registry entry, the union widening, and the test loop. The
// previous hard-coded 15-item list had to be edited in three other
// places (levelStore, AlgorithmMazeProvider, LevelSelect) plus this
// test — and the levelStore copy had already drifted (see CRITICAL #1
// regression test in levelStore.test.ts).
import { ALGORITHM_BY_ID, ALGORITHM_IDS, ALGORITHM_REGISTRY } from '../../../src/maze/algorithmRegistry';
import type { Algorithm, LevelCount, MazeSize, Pickup } from '../../../src/maze/types';

const ALGOS: readonly Algorithm[] = ALGORITHM_IDS;
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
        // P3-1: start / exit now carry a `level` field. The v1
        // back-compat contract is "levelCount=1 ⇒ every entity
        // on layer 0", so the default level is 0 in both cases.
        expect(data.start).toMatchObject({ x: 0, z: 0, level: 0 });
        expect(data.exit).toMatchObject({ x: 2 * (Math.ceil(size / 2) - 1), z: 2 * (Math.ceil(size / 2) - 1), level: 0 });
        // P3-1: levelCount defaults to 1 and transitions is []
        // for v1 ids (the historical single-layer shape).
        expect(data.levelCount).toBe(1);
        expect(data.transitions).toEqual([]);
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

  // P2-21 cleanup (LOW #6): per-algo perf budget. The 500ms blanket
  // assertion was the right number for cheap O(N) / O(N log N) spanning-
  // tree algorithms, but Aldous-Broder (O(N²) expected), Wilson's
  // (O(N²) expected), and Houston (also O(N²) per the P2-21 spec) need
  // 1500ms to stay under CI jitter. The other 12 algorithms stay at
  // 500ms. The per-algo budget is now carried by the registry
  // (`perfBudgetMs50`) so adding a new algorithm requires picking a
  // budget at the registry level — see the comment at the top of
  // `maze/algorithmRegistry.ts` for the 500/1500 split rationale.
  it('50×50 generation completes within each algorithm\'s individual perf budget', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const entry of ALGORITHM_REGISTRY) {
      const budget = entry.perfBudgetMs50;
      const t0 = performance.now();
      await provider.load(seedId(entry.id, 50, '0123456789abcdef'));
      const elapsed = performance.now() - t0;
      expect(elapsed, `${entry.id} 50×50 took ${elapsed}ms, budget ${budget}ms`).toBeLessThan(budget);
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

// ---------------------------------------------------------------------------
// P3-1: multi-level procedural generator. P3-1a is the data-layer
// landing zone — no engine, no UI. The smoke test below pins the
// data shape (`levelCount`, `transitions.length`, start/exit
// `level` field) so a future refactor that drops or mis-defaults
// these fields surfaces here instead of at runtime. The engine-
// level behavior (collision across N layers, reachability, etc.)
// is P3-1b / P3-1c work and is intentionally out of scope here.
// ---------------------------------------------------------------------------
describe('generateMultiLevel (P3-1 data-layer smoke)', () => {
  // levelCount=1 is the back-compat path: the result must be
  // byte-for-byte equivalent to a v1 single-layer level. P3-1b
  // will keep this contract — the engine reads `levelCount` and
  // short-circuits to the v1 rendering path.
  it('levelCount=1 produces a single-layer shape (transitions=[])', () => {
    const { maze, perLayerWalls } = generateMultiLevel({
      algorithm: 'recursive-backtracker',
      size: 15,
      levelCount: 1,
      prng: mulberry32(fnv1a('0123456789abcdef')),
      mazeSeed: '0123456789abcdef',
    });
    expect(maze.levelCount).toBe(1);
    expect(maze.transitions).toEqual([]);
    expect(maze.start.level).toBe(0);
    expect(maze.exit.level).toBe(0);
    expect(perLayerWalls).toHaveLength(1);
    // P3-1: perLayerWalls[0] IS maze.walls (by reference) so the
    // single-layer engine can keep reading `maze.walls` and
    // the multi-layer engine can collapse to `[maze.walls]`.
    expect(perLayerWalls[0]).toBe(maze.walls);
    // P3-1: back-compat corner pinning. The 15×15 generator
    // always opens the (0,0) and (14,14) cells (logicalSize-1
    // corners in the thick-wall grid), and the back-compat
    // promise is "behaves identically to the v1 single-layer
    // level" — which is what every P2-era test pins.
    expect(maze.start).toMatchObject({ x: 0, z: 0, level: 0 });
    expect(maze.exit).toMatchObject({ x: 14, z: 14, level: 0 });
  });

  // levelCount=2: one inter-layer boundary, so exactly 1
  // stair-up transition. Start and exit land on a random layer
  // (each in [0, 1]) per the 70% / 30% rule. The 1 transition
  // always connects layer 0 → layer 1 (the only boundary).
  it('levelCount=2 produces exactly 1 stair-up transition (0→1)', () => {
    const { maze, perLayerWalls } = generateMultiLevel({
      algorithm: 'recursive-backtracker',
      size: 15,
      levelCount: 2,
      prng: mulberry32(fnv1a('0123456789abcdef')),
      mazeSeed: '0123456789abcdef',
    });
    expect(maze.levelCount).toBe(2);
    expect(maze.transitions!).toHaveLength(1);
    expect(maze.transitions![0]).toMatchObject({
      level: 0,
      kind: 'stair-up',
      toLevel: 1,
    });
    // Start / exit are randomized across the 2 layers. We
    // don't pin them to a specific layer — the 70% / 30% rule
    // means either ordering is valid. The deeper invariants
    // (non-wall, not equal/adjacent on same layer) are checked
    // by the comprehensive test below.
    expect([0, 1]).toContain(maze.start.level);
    expect([0, 1]).toContain(maze.exit.level);
    expect(perLayerWalls).toHaveLength(2);
  });

  // levelCount=3: 2 inter-layer boundaries, so exactly 2
  // stair-up transitions (0→1 and 1→2). Start / exit can be on
  // any layer 0..2.
  it('levelCount=3 produces 2 transitions (0→1 and 1→2)', () => {
    const { maze, perLayerWalls } = generateMultiLevel({
      algorithm: 'recursive-backtracker',
      size: 15,
      levelCount: 3,
      prng: mulberry32(fnv1a('0123456789abcdef')),
      mazeSeed: '0123456789abcdef',
    });
    expect(maze.levelCount).toBe(3);
    expect(maze.transitions!).toHaveLength(2);
    // Boundaries are always 0→1 and 1→2 (one per inter-layer
    // gap). Start / exit can land on any of the 3 layers.
    const tLevels = maze.transitions!.map((t) => [t.level, t.toLevel]);
    expect(tLevels).toEqual(
      expect.arrayContaining([
        [0, 1],
        [1, 2],
      ]),
    );
    expect([0, 1, 2]).toContain(maze.start.level);
    expect([0, 1, 2]).toContain(maze.exit.level);
    expect(perLayerWalls).toHaveLength(3);
  });

  // Determinism: same input → same output. The walls matrix,
  // transitions, and start/exit cells must be byte-equal across
  // two calls (use `.toEqual` deep equality — each call returns
  // a fresh array from `entry.generate`, so reference equality
  // is not the right check here). This is the cross-reload
  // contract the URL → seed → MazeData round-trip relies on.
  //
  // Each call gets a FRESH PRNG seeded from the same hex — the
  // PRNG is stateful (consumed by the first call), so re-using
  // the same closure across calls would diverge. The function's
  // contract is "caller hands me a PRNG that I'll consume in
  // order"; the cross-reload equivalent is the caller creating
  // a new PRNG from the same seed.
  it('is deterministic: same opts produce identical MazeData', () => {
    const baseOpts = {
      algorithm: 'kruskal' as const,
      size: 15,
      levelCount: 3 as LevelCount,
      mazeSeed: 'deadbeefcafebabe',
    };
    const a = generateMultiLevel({
      ...baseOpts,
      prng: mulberry32(fnv1a(baseOpts.mazeSeed)),
    });
    const b = generateMultiLevel({
      ...baseOpts,
      prng: mulberry32(fnv1a(baseOpts.mazeSeed)),
    });
    // Deep equality (each call returns a new array).
    expect(a.maze.walls).toEqual(b.maze.walls);
    expect(a.perLayerWalls).toEqual(b.perLayerWalls);
    expect(a.maze.transitions!).toEqual(b.maze.transitions!);
    expect(a.maze.start).toEqual(b.maze.start);
    expect(a.maze.exit).toEqual(b.maze.exit);
  });

  // AlgorithmMazeProvider.load uses the v2 codec to recover
  // levelCount. Pin the end-to-end shape so the v2 id → provider
  // round-trip stays in lockstep with `generateMultiLevel`.
  it('AlgorithmMazeProvider.load() routes a v2 id through generateMultiLevel', async () => {
    const provider = new AlgorithmMazeProvider();
    const id = encodeSeedV2(
      { algorithm: 'recursive-backtracker', size: 15, mazeSeed: '0123456789abcdef' },
      3,
    );
    const maze = await provider.load(id);
    expect(maze.levelCount).toBe(3);
    expect(maze.transitions!).toHaveLength(2);
    expect([0, 1, 2]).toContain(maze.start.level);
    expect([0, 1, 2]).toContain(maze.exit.level);
  });
});

// ---------------------------------------------------------------------------
// P3-1b: comprehensive generateMultiLevel contract. The smoke tests above
// pin a few specific shapes; this block enumerates the full set of
// invariants the spec asks for (§5.5, §12 Q10, plus the task's "单测覆盖"
// checklist) and runs them across every supported level count + a
// representative algorithm mix.
// ---------------------------------------------------------------------------
describe('generateMultiLevel (P3-1b comprehensive contract)', () => {
  // Helper: build a fresh options object with a freshly seeded PRNG
  // (the PRNG is stateful, so each call needs its own — see the
  // determinism test in the smoke suite for context).
  function makeOpts(overrides: Partial<{
    algorithm: Algorithm;
    size: number;
    levelCount: LevelCount;
    mazeSeed: string;
  }> = {}) {
    const mazeSeed = overrides.mazeSeed ?? '0123456789abcdef';
    return {
      algorithm: overrides.algorithm ?? ('recursive-backtracker' as Algorithm),
      size: overrides.size ?? 15,
      levelCount: overrides.levelCount ?? (1 as LevelCount),
      mazeSeed,
      prng: mulberry32(fnv1a(mazeSeed)),
    };
  }

  // 1. levelCount=1 is fully equivalent to the historical
  //    `generateWalls` output: no transitions, start at the
  //    historical (0,0) corner, exit at the (logicalSize-1)
  //    corner, both on layer 0. This is the P3-1 spec §13 H3
  //    back-compat promise and the only P2-era contract that
  //    has to keep holding across the multi-level refactor.
  it('levelCount=1 matches the historical single-layer shape exactly', () => {
    const { maze, perLayerWalls } = generateMultiLevel(
      makeOpts({ levelCount: 1, size: 15 }),
    );
    expect(maze.levelCount).toBe(1);
    expect(maze.transitions).toEqual([]);
    expect(maze.start).toEqual({ x: 0, z: 0, level: 0 });
    // 15 → logicalSize 8 → corner (2*7, 2*7) = (14, 14)
    expect(maze.exit).toEqual({ x: 14, z: 14, level: 0 });
    // Walls match what the registry entry would have returned
    // for a single 15×15 call.
    const direct = ALGORITHM_BY_ID['recursive-backtracker'].generate(
      15,
      mulberry32(fnv1a('0123456789abcdef')),
    );
    expect(maze.walls).toEqual(direct);
    // Single layer in the per-layer cache.
    expect(perLayerWalls).toHaveLength(1);
    // Back-compat: perLayerWalls[0] IS maze.walls (same array).
    expect(perLayerWalls[0]).toBe(maze.walls);
  });

  // 2. The 4 supported multi-level counts (2 / 3 / 4 / 6 per
  //    spec §12 Q7) all generate successfully. The 5-second
  //    budget is the P3-1 spec §9 / §11.3 "user-acceptable load
  //    time" cap; the all-15-algorithms × size-15 grid is the
  //    tightest one a default-sized level will see.
  it.each([2, 3, 4, 6] as const)(
    'levelCount=%d generates within the 5-second budget for every algorithm',
    (levelCount) => {
      const t0 = performance.now();
      for (const entry of ALGORITHM_REGISTRY) {
        const { maze, perLayerWalls } = generateMultiLevel(
          makeOpts({
            algorithm: entry.id,
            size: 15,
            levelCount: levelCount as LevelCount,
          }),
        );
        expect(maze.levelCount).toBe(levelCount);
        expect(perLayerWalls).toHaveLength(levelCount);
        // Stair-up transitions: one per inter-layer boundary.
        // The MVP scope (P3-1b) only emits stair-up; the other
        // kinds land in P3-1c.
        expect(maze.transitions).toHaveLength(levelCount - 1);
        for (const t of maze.transitions!) {
          expect(t.kind).toBe('stair-up');
          expect(t.toLevel).toBe(t.level + 1);
        }
      }
      const elapsed = performance.now() - t0;
      // 15 algorithms × 4 layer counts × size 15 → worst case
      // is the O(N²) family (Aldous-Broder / Wilson's /
      // Houston) at 6 levels. The 5s cap is the spec budget
      // for a single level generation; we multiply by ~15×4 to
      // cover the iteration, so a more realistic per-call cap
      // is sub-second. The assertion stays loose at 5s to
      // avoid CI jitter on slow runners.
      expect(elapsed).toBeLessThan(5000);
    },
  );

  // 3. Same seed → same maze. The cross-reload contract — a
  //    player who shares a URL gets the same level, the
  //    best-record tag matches, and the per-layer walls
  //    (engine cache) align with the maze data.
  it('same seed produces identical { maze, perLayerWalls } across calls', () => {
    const a = generateMultiLevel(makeOpts({ levelCount: 3, mazeSeed: 'cafebabecafebabe' }));
    const b = generateMultiLevel(makeOpts({ levelCount: 3, mazeSeed: 'cafebabecafebabe' }));
    expect(a.maze.walls).toEqual(b.maze.walls);
    expect(a.maze.transitions).toEqual(b.maze.transitions);
    expect(a.maze.start).toEqual(b.maze.start);
    expect(a.maze.exit).toEqual(b.maze.exit);
    expect(a.perLayerWalls).toEqual(b.perLayerWalls);
  });

  // 4. Start and exit both land on non-wall cells. The
  //    rejection-sampling pickOpenCell guarantees this, but
  //    a regression to a non-validating pick (e.g. an empty
  //    fallback that returned the first cell) would silently
  //    ship unwalkable spawns — pin the invariant.
  it('start and exit cells are non-wall across every layer count + algorithm', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      for (const levelCount of [2, 3, 4, 6] as const) {
        const { maze, perLayerWalls } = generateMultiLevel(
          makeOpts({
            algorithm: entry.id,
            levelCount: levelCount as LevelCount,
            mazeSeed: '0123456789abcdef',
          }),
        );
        const startLayer = perLayerWalls[maze.start.level ?? 0];
        const exitLayer = perLayerWalls[maze.exit.level ?? 0];
        expect(
          startLayer[maze.start.z][maze.start.x],
          `${entry.id} levelCount=${levelCount} start on wall`,
        ).toBe(0);
        expect(
          exitLayer[maze.exit.z][maze.exit.x],
          `${entry.id} levelCount=${levelCount} exit on wall`,
        ).toBe(0);
      }
    }
  });

  // 5. Start ≠ exit. The "same layer" branch also pins the
  //    "not adjacent" rule (Q10), but a different-layer
  //    placement is trivially not-equal at the cell level.
  it('start cell never equals exit cell (same or different layer)', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      for (const levelCount of [2, 3, 4, 6] as const) {
        const { maze } = generateMultiLevel(
          makeOpts({
            algorithm: entry.id,
            levelCount: levelCount as LevelCount,
            mazeSeed: '0123456789abcdef',
          }),
        );
        // Identity by (level, x, z). The level field makes
        // "same cell on different layers" legal but the test
        // is strictly about "same cell on the same layer".
        const sameCellSameLayer =
          maze.start.level === maze.exit.level &&
          maze.start.x === maze.exit.x &&
          maze.start.z === maze.exit.z;
        expect(
          sameCellSameLayer,
          `${entry.id} levelCount=${levelCount} start === exit at (${maze.start.level},${maze.start.x},${maze.start.z})`,
        ).toBe(false);
      }
    }
  });

  // 6. On the same layer, start and exit are not 4-adjacent.
  //    Spec §12 Q10: "同层时 start cell ≠ exit cell 且不相邻".
  //    We force the 30% same-layer case by reseeding the PRNG
  //    past the layer-pick stage. Simpler: assert across many
  //    seeds; ~30% of them will hit the same-layer case, and
  //    those that do must satisfy the adjacency rule.
  it('on the same layer, start and exit are not 4-adjacent (Q10)', () => {
    // Run with multiple seeds so the 30% same-layer branch is
    // exercised at least once. 16 seeds × 4 level counts gives
    // 64 trials; ~30% → ~19 same-layer trials.
    let sameLayerTrials = 0;
    for (let seedIdx = 0; seedIdx < 16; seedIdx++) {
      const hex = seedIdx.toString(16).padStart(16, '0');
      for (const levelCount of [2, 3, 4, 6] as const) {
        const { maze } = generateMultiLevel(
          makeOpts({ levelCount, mazeSeed: hex, size: 15 }),
        );
        if (maze.start.level !== maze.exit.level) continue;
        sameLayerTrials++;
        const dx = Math.abs(maze.start.x - maze.exit.x);
        const dz = Math.abs(maze.start.z - maze.exit.z);
        // Not the same cell (covered by test #5) and not
        // 4-adjacent (dx+dz === 1).
        const isAdjacent = dx + dz === 1;
        expect(
          isAdjacent,
          `seed=${hex} levelCount=${levelCount} start (${maze.start.x},${maze.start.z}) adjacent to exit (${maze.exit.x},${maze.exit.z})`,
        ).toBe(false);
      }
    }
    // Sanity: we did exercise the same-layer branch. If
    // sameLayerTrials is 0, the test isn't actually validating
    // anything; a future PRNG refactor that pins start/exit to
    // different layers would silently weaken coverage.
    expect(sameLayerTrials).toBeGreaterThan(0);
  });

  // 7. Every transition endpoint sits on a non-wall cell. A
  //    regression to a non-validating pick (e.g. one that
  //    accepts wall cells) would put the player's stair-up
  //    mesh inside a wall — visually broken and collision-
  //    blocking.
  it('every transition endpoint (source AND dest) is a non-wall cell', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      for (const levelCount of [2, 3, 4, 6] as const) {
        const { maze, perLayerWalls } = generateMultiLevel(
          makeOpts({
            algorithm: entry.id,
            levelCount: levelCount as LevelCount,
            mazeSeed: '0123456789abcdef',
          }),
        );
        expect(maze.transitions).toHaveLength(levelCount - 1);
        for (const t of maze.transitions!) {
          const src = perLayerWalls[t.level];
          const dst = perLayerWalls[t.toLevel];
          expect(
            src[t.z][t.x],
            `${entry.id} levelCount=${levelCount} transition ${t.id} source on wall at (${t.level},${t.x},${t.z})`,
          ).toBe(0);
          // toX / toZ default to the same (x, z) when omitted
          // — we always set them in P3-1b's generator, so they
          // are guaranteed present.
          const destX = t.toX ?? t.x;
          const destZ = t.toZ ?? t.z;
          expect(
            dst[destZ][destX],
            `${entry.id} levelCount=${levelCount} transition ${t.id} dest on wall at (${t.toLevel},${destX},${destZ})`,
          ).toBe(0);
        }
      }
    }
  });

  // 8. The "each cell at most 1 transition" rule. A cell
  //    is identified by (level, x, z) — the same (x, z) on
  //    different layers is a different cell, so we don't
  //    cross-couple. This covers the awkward case where
  //    the layer i→i+1 transition's dest cell collides
  //    with the layer (i+1)→(i+2) transition's source cell
  //    — the reservation set must catch it.
  it('no cell hosts more than one transition (across source + dest)', () => {
    for (const entry of ALGORITHM_REGISTRY) {
      for (const levelCount of [2, 3, 4, 6] as const) {
        const { maze } = generateMultiLevel(
          makeOpts({
            algorithm: entry.id,
            levelCount: levelCount as LevelCount,
            mazeSeed: '0123456789abcdef',
          }),
        );
        const seen = new Map<string, string>();
        for (const t of maze.transitions!) {
          const srcKey = `${t.level}:${t.x}:${t.z}`;
          const dstKey = `${t.toLevel}:${t.toX ?? t.x}:${t.toZ ?? t.z}`;
          for (const [key, label] of [
            [srcKey, `source of ${t.id}`] as const,
            [dstKey, `dest of ${t.id}`] as const,
          ]) {
            const existing = seen.get(key);
            expect(
              existing,
              `${entry.id} levelCount=${levelCount} cell ${key} hosts two transitions: ${existing} and ${label}`,
            ).toBeUndefined();
            seen.set(key, label);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P4: 3D voxel seed load (v3 codec + load3D). The 3D path doesn't
// go through the algorithm registry (the registry's `generate`
// signature is `(visualSize, rng) => CellType[][]` and 3D RB returns
// `CellType[][][]`). load3D dispatches to `generateRecursiveBacktracker3D`
// directly and sets `walls3D` on the returned MazeData. The contract
// we test here is the data shape that the engine's 3D tick consumes:
//   - `walls3D` is a 3D cube of cells.
//   - `walls: []` (required by the 2D MazeData type, unused for 3D).
//   - `start3D` / `exit3D` are passage cells.
//   - `pickups` / `enemies` / `transitions` are all empty.
//   - The 3D start is reachable from the 3D exit via isReachable3D.
// ---------------------------------------------------------------------------

import { encodeSeedV3 } from '../../../src/utils/seed';
import { isReachable3D } from '../../../src/maze/reachability';

function v3Id(size: number, hex: string): string {
  return encodeSeedV3(
    { algorithm: '3d-recursive-backtracker', size, mazeSeed: hex },
    size,
  );
}

describe('AlgorithmMazeProvider P4 — 3D voxel load', () => {
  it('list() still returns [] for the 3D path (no catalog)', async () => {
    const provider = new AlgorithmMazeProvider();
    const ids = await provider.list();
    expect(ids).toEqual([]);
  });

  it('load() returns a 3D MazeData for every size in {5, 7, 9}', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const size of [5, 7, 9] as const) {
      const data = await provider.load(v3Id(size, '0123456789abcdef'));
      expect(data.walls3D).toBeDefined();
      expect(data.walls3D!).toHaveLength(size);
      // Every (z, y) layer is a length-`size` array of length-`size` rows.
      for (const layer of data.walls3D!) {
        for (const row of layer) {
          expect(row).toHaveLength(size);
        }
      }
      // P4-PROVIDER-7: `walls` is required on MazeData; 3D cubes
      // have no 2D walls so we satisfy the type with [].
      expect(data.walls).toEqual([]);
      // P4-PROVIDER-6: levelCount is intentionally NOT set for
      // 3D — a 3D cube has no stack-of-layers concept.
      expect(data.levelCount).toBeUndefined();
      expect(data.transitions).toEqual([]);
      // P4: pickups / enemies / traps / doors are all empty in P4a.
      expect(data.pickups).toEqual([]);
      expect(data.enemies).toEqual([]);
      expect(data.traps).toEqual([]);
      expect(data.doors).toEqual([]);
      // P4-PROVIDER-8: 3D start3D / exit3D populated from the
      // pickStartExit3D contract (both are passage cells).
      expect(data.start3D).toBeDefined();
      expect(data.exit3D).toBeDefined();
      const { start3D, exit3D } = data;
      expect(data.walls3D![start3D!.z][start3D!.y][start3D!.x]).toBe(0);
      expect(data.walls3D![exit3D!.z][exit3D!.y][exit3D!.x]).toBe(0);
      // 2D fallback: 2D start / exit mirror the 3D (x, z) at
      // level 0, so legacy consumers keep reading the 2D shape.
      expect(data.start).toMatchObject({ x: start3D!.x, z: start3D!.z, level: 0 });
      expect(data.exit).toMatchObject({ x: exit3D!.x, z: exit3D!.z, level: 0 });
      // The 3D start ↔ exit are reachable (3D RB is a spanning tree).
      expect(isReachable3D(data.walls3D!, start3D!, exit3D!)).toBe(true);
    }
  });

  it('load() is deterministic for the same v3 id (URL round-trip contract)', async () => {
    const provider = new AlgorithmMazeProvider();
    const a = await provider.load(v3Id(7, '0123456789abcdef'));
    const b = await provider.load(v3Id(7, '0123456789abcdef'));
    expect(a.walls3D).toEqual(b.walls3D);
  });

  it('different hex seeds produce different 3D mazes (entropy flows through)', async () => {
    const provider = new AlgorithmMazeProvider();
    const a = await provider.load(v3Id(7, '0000000000000001'));
    const b = await provider.load(v3Id(7, '0000000000000002'));
    expect(a.walls3D).not.toEqual(b.walls3D);
  });

  it('throws on a v3 id with an unknown 3D algorithm (regression on the v3 whitelist)', async () => {
    const provider = new AlgorithmMazeProvider();
    // Hand-craft a v3 id with a non-3D-prefixed algorithm. The codec's
    // v3 whitelist rejects it before load3D is even called.
    await expect(
      provider.load('algo-v3-recursive-backtracker-7-0123456789abcdef'),
    ).rejects.toThrow();
  });

  // P4b-Prim: 3D Prim dispatch. `load3D` now branches on
  // `algorithm === '3d-prim'` and calls `generatePrim3D`.
  // The contract is the same shape as the 3D RB test
  // above — start3D / exit3D on passage cells, walls3D
  // is a cube of the requested size, walls:[] back-fill.
  // P4a RB and P4b Prim are siblings, not aliases: the
  // generated walls differ for the same seed.
  it('P4b-Prim: load() returns a 3D MazeData for every size in {5, 7, 9} via the 3d-prim algorithm', async () => {
    const provider = new AlgorithmMazeProvider();
    for (const size of [5, 7, 9] as const) {
      const data = await provider.load(
        encodeSeedV3({ algorithm: '3d-prim', size, mazeSeed: '0123456789abcdef' }, size),
      );
      expect(data.walls3D).toBeDefined();
      expect(data.walls3D!).toHaveLength(size);
      // Every (z, y) layer is a length-`size` array of length-`size` rows.
      for (const layer of data.walls3D!) {
        for (const row of layer) {
          expect(row).toHaveLength(size);
        }
      }
      // Same back-compat shape as the 3D RB test.
      expect(data.walls).toEqual([]);
      expect(data.levelCount).toBeUndefined();
      expect(data.transitions).toEqual([]);
      expect(data.pickups).toEqual([]);
      expect(data.enemies).toEqual([]);
      expect(data.traps).toEqual([]);
      expect(data.doors).toEqual([]);
      expect(data.start3D).toBeDefined();
      expect(data.exit3D).toBeDefined();
      const { start3D, exit3D } = data;
      expect(data.walls3D![start3D!.z][start3D!.y][start3D!.x]).toBe(0);
      expect(data.walls3D![exit3D!.z][exit3D!.y][exit3D!.x]).toBe(0);
      // The 3D start ↔ exit are reachable (3D Prim is a spanning tree).
      expect(isReachable3D(data.walls3D!, start3D!, exit3D!)).toBe(true);
    }
  });

  it('P4b-Prim: 3d-prim and 3d-recursive-backtracker produce DIFFERENT walls for the same seed', async () => {
    // Sibling-contract guard: 3D Prim and 3D RB share data
    // layout + thick-wall encoding, but the outer loop
    // (frontier-based random pick vs. stack-based DFS)
    // yields different wall patterns for the same PRNG
    // seed. A future refactor that accidentally collapses
    // the two generators (e.g. P4b Prim becomes a thin
    // wrapper around P4a RB) would fail this assertion.
    const provider = new AlgorithmMazeProvider();
    const rbData = await provider.load(v3Id(7, '0123456789abcdef'));
    const primData = await provider.load(
      encodeSeedV3({ algorithm: '3d-prim', size: 7, mazeSeed: '0123456789abcdef' }, 7),
    );
    expect(primData.walls3D).not.toEqual(rbData.walls3D);
  });
});
