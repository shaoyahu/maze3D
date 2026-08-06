// P3-1: data-layer multi-level compat tests. P3-1a is the pure
// data-layer landing zone — no engine, no UI, no level-select —
// so this file's job is to pin:
//
//   1. The new types compile and accept the documented shape
//      (LevelData, VerticalTransition, Seed.levelCount, …).
//   2. JsonMazeProvider back-fills `levelCount`, `transitions`,
//      and the per-entity `level` field when a hand-crafted /
//      built-in JSON omits them. This is the back-compat
//      contract for every pre-P3-1 level in `public/levels/*.json`
//      (4 teaching + level-small + 4 tiny debug fixtures).
//   3. Explicit values are preserved verbatim (not silently
//      overwritten by the defaults).
//   4. The built-in teaching levels all load with `levelCount: 1`
//      and every entity on layer 0 — the sanity test the spec
//      asks for in §11.2 / §11.5.
//
// The file name is `types.multiLevel` (not `multiLevelCompat`) on
// purpose: the test surface is the *types* contract (new fields
// have a default; defaults are non-overwriting) and the validation
// is exercised through `validateMaze`, the single chokepoint every
// loader funnels through.

import { describe, it, expect } from 'vitest';
import { JsonMazeProvider, validateMaze } from '../../../src/maze/JsonMazeProvider';
import {
  isLevelCount,
  LEVEL_COUNT_VALUES,
  type LevelData,
  type VerticalTransition,
} from '../../../src/maze/types';

// Minimal well-formed level fixture. Mirrors the factory used in
// JsonMazeProvider.test.ts so the validator sees the same shape it
// sees at runtime.
function makeValidLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'level-multi',
    name: 'Multi Test',
    size: { width: 5, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 2 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    rules: {
      initialTime: 30,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
    },
    enemies: [],
    ...overrides,
  };
}

describe('P3-1 multi-level types', () => {
  describe('LEVEL_COUNT_VALUES / isLevelCount', () => {
    it('LEVEL_COUNT_VALUES is the documented 1..6 whitelist', () => {
      // The seed codec and the JSON validator both read this
      // tuple; widening it without updating spec §12 Q7 (the
      // 1..6 cap) is a P4 decision, not a P3-1a change.
      expect([...LEVEL_COUNT_VALUES]).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it.each([1, 2, 3, 4, 5, 6] as const)('isLevelCount accepts %d', (n) => {
      expect(isLevelCount(n)).toBe(true);
    });

    it('isLevelCount rejects values outside 1..6', () => {
      expect(isLevelCount(0)).toBe(false);
      expect(isLevelCount(7)).toBe(false);
      expect(isLevelCount(99)).toBe(false);
    });

    it('isLevelCount rejects non-integer / non-number inputs', () => {
      expect(isLevelCount(1.5)).toBe(false);
      expect(isLevelCount('2')).toBe(false);
      expect(isLevelCount(null)).toBe(false);
      expect(isLevelCount(undefined)).toBe(false);
      expect(isLevelCount(NaN)).toBe(false);
    });
  });

  describe('LevelData / VerticalTransition shape', () => {
    it('LevelData is constructible with the documented fields', () => {
      // Compile-time only: the type widens to whatever CellType
      // resolves to (0 | 1) and the runtime value is a 2D grid.
      // The point is to assert the interface is reachable from a
      // public test (a future interface rename would surface
      // here as a typecheck error).
      const ld: LevelData = {
        level: 0,
        walls: [
          [0, 1],
          [1, 0],
        ],
      };
      expect(ld.level).toBe(0);
      expect(ld.walls).toHaveLength(2);
    });

    it('VerticalTransition is constructible with every documented kind', () => {
      const kinds: VerticalTransition['kind'][] = [
        'stair-up',
        'stair-down',
        'hole-down',
        'hole-up',
        'ladder',
      ];
      for (const kind of kinds) {
        const t: VerticalTransition = {
          id: `vt-${kind}`,
          level: 0,
          x: 1,
          z: 1,
          kind,
          toLevel: 1,
        };
        expect(t.kind).toBe(kind);
      }
    });

    it('VerticalTransition accepts optional toX / toZ landing offsets', () => {
      const t: VerticalTransition = {
        id: 'vt-offset',
        level: 0,
        x: 1,
        z: 1,
        kind: 'stair-up',
        toLevel: 1,
        toX: 2,
        toZ: 2,
      };
      expect(t.toX).toBe(2);
      expect(t.toZ).toBe(2);
    });
  });

  describe('JsonMazeProvider default fills (P3-1 backward compat)', () => {
    it('defaults levelCount to 1 when the JSON omits the field', () => {
      const maze = validateMaze(makeValidLevel(), 'level-multi');
      expect(maze.levelCount).toBe(1);
    });

    it('defaults transitions to [] when the JSON omits the field', () => {
      const maze = validateMaze(makeValidLevel(), 'level-multi');
      expect(maze.transitions).toEqual([]);
    });

    it('defaults start.level / exit.level to 0 when the JSON omits them', () => {
      const maze = validateMaze(makeValidLevel(), 'level-multi');
      expect(maze.start).toMatchObject({ x: 0, z: 0, level: 0 });
      expect(maze.exit).toMatchObject({ x: 4, z: 2, level: 0 });
    });

    it('defaults every position-bearing entity.level to 0', () => {
      const level = makeValidLevel({
        pickups: [{ x: 1, z: 1, type: 'time', value: 5 }],
        // P2-18: traps / doors are also P3-1 position-bearing.
        // (cells (0,0) and (4,2) are reserved for start/exit so the
        // validator rejects on-start / on-exit placements — pick
        // free walkable cells in the 5×3 grid.)
        traps: [{ id: 't1', x: 1, z: 0, kind: 'fire' }],
        doors: [{ id: 'd1', x: 3, z: 0, keyColor: 'red' }],
        enemies: [
          {
            id: 'e1',
            x: 2,
            z: 2,
            path: [
              { x: 2, z: 2 },
              { x: 3, z: 2 },
            ],
          },
        ],
      });
      const maze = validateMaze(level, 'level-multi');
      expect(maze.pickups[0].level).toBe(0);
      expect(maze.traps[0].level).toBe(0);
      expect(maze.doors[0].level).toBe(0);
      expect(maze.enemies[0].level).toBe(0);
    });

    it('preserves explicit levelCount / transitions / start.level values', () => {
      const level = makeValidLevel({
        start: { x: 0, z: 0, level: 2 },
        exit: { x: 4, z: 2, level: 1 },
        levelCount: 3,
        transitions: [
          {
            id: 'vt-1',
            level: 0,
            x: 1,
            z: 1,
            kind: 'stair-up',
            toLevel: 1,
          },
        ],
      });
      const maze = validateMaze(level, 'level-multi');
      expect(maze.levelCount).toBe(3);
      expect(maze.transitions!).toHaveLength(1);
      expect(maze.transitions![0]).toMatchObject({ kind: 'stair-up', toLevel: 1 });
      expect(maze.start.level).toBe(2);
      expect(maze.exit.level).toBe(1);
    });

    it('preserves explicit per-entity level values', () => {
      const level = makeValidLevel({
        pickups: [{ x: 1, z: 1, type: 'time', value: 5, level: 2 }],
        enemies: [
          {
            id: 'e1',
            x: 2,
            z: 2,
            level: 1,
            path: [
              { x: 2, z: 2 },
              { x: 3, z: 2 },
            ],
          },
        ],
      });
      const maze = validateMaze(level, 'level-multi');
      expect(maze.pickups[0].level).toBe(2);
      expect(maze.enemies[0].level).toBe(1);
    });

    it('coerces out-of-range levelCount back to 1 (lenient validator)', () => {
      // The current engine is single-layer only; rejecting a JSON
      // with `levelCount: 99` would break otherwise-valid hand-
      // crafted levels. P3-1b tightens this once the engine
      // actually consumes the value.
      const maze = validateMaze(makeValidLevel({ levelCount: 99 }), 'level-multi');
      expect(maze.levelCount).toBe(1);
    });

    it('coerces non-array transitions back to [] (lenient validator)', () => {
      // Mirrors the P2-18 traps / doors lenient policy.
      const maze = validateMaze(makeValidLevel({ transitions: 'not-an-array' }), 'level-multi');
      expect(maze.transitions).toEqual([]);
    });

    it('coerces invalid entity.level back to 0 (NaN / negative / non-integer)', () => {
      const level = makeValidLevel({
        pickups: [
          { x: 1, z: 1, type: 'time', value: 5, level: -1 },
          { x: 2, z: 1, type: 'health', value: 1, level: 1.5 },
          { x: 3, z: 1, type: 'time', value: 1, level: 'not-a-number' },
        ],
      });
      const maze = validateMaze(level, 'level-multi');
      expect(maze.pickups[0].level).toBe(0);
      expect(maze.pickups[1].level).toBe(0);
      expect(maze.pickups[2].level).toBe(0);
    });
  });

  describe('built-in teaching levels back-compat sanity (spec §11.2)', () => {
    // The spec asks for an explicit sanity check: "load every
    // built-in teaching JSON, assert levelCount=1 + every entity
    // level=0". We exercise this through the same JsonMazeProvider
    // the runtime uses (no separate code path) so a future
    // validator regression that *did* start dropping these fields
    // would fail loudly here.
    const TEACHING_IDS = [
      'teaching-01',
      'teaching-02',
      'teaching-03',
      'teaching-04',
      'teaching-05',
      'teaching-06',
      'teaching-07',
      'teaching-08',
    ];

    it.each(TEACHING_IDS)('%s loads with levelCount=1 and every entity on layer 0', async (id) => {
      // Pull the level from the same `import.meta.glob` the app
      // uses, then run it through the same validator. We import
      // directly rather than going through BUILT_IN_JSON_PROVIDER
      // because the singleton runs at module-load time and would
      // leak the warning once for the whole batch.
      const mod = (await import(`../../../public/levels/${id}.json`)) as {
        default?: unknown;
      };
      const raw = mod.default ?? mod;
      const maze = validateMaze(raw, id);
      expect(maze.levelCount).toBe(1);
      expect(maze.transitions).toEqual([]);
      expect(maze.start.level).toBe(0);
      expect(maze.exit.level).toBe(0);
      for (const p of maze.pickups) expect(p.level).toBe(0);
      for (const t of maze.traps) expect(t.level).toBe(0);
      for (const d of maze.doors) expect(d.level).toBe(0);
      for (const e of maze.enemies) expect(e.level).toBe(0);
    });
  });

  describe('JsonMazeProvider integration with the documented types', () => {
    it('full multi-level level roundtrips through validateMaze', async () => {
      // Smoke test: a JSON that opts into P3-1 fields must load
      // without dropping the levelCount / transitions.
      const raw = makeValidLevel({
        levelCount: 2,
        transitions: [
          { id: 'vt-up', level: 0, x: 1, z: 1, kind: 'stair-up', toLevel: 1 },
          { id: 'vt-down', level: 1, x: 3, z: 1, kind: 'hole-down', toLevel: 0 },
        ],
        pickups: [{ x: 1, z: 1, type: 'time', value: 5, level: 1 }],
      });
      const provider = new JsonMazeProvider({ 'level-multi': raw });
      const data = await provider.load('level-multi');
      expect(data.levelCount).toBe(2);
      expect(data.transitions).toHaveLength(2);
      expect(data.pickups[0].level).toBe(1);
    });
  });
});
