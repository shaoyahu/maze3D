import { describe, it, expect } from 'vitest';
import { validateMaze } from '../../../src/maze/JsonMazeProvider';
import { builtInIdFromPath } from '../../../src/maze/builtInLevels';
import { PLAYER_RADIUS } from '../../../src/entities/Player';

// D-20: every JSON shipped at /public/levels/*.json must survive the
// runtime validator AND satisfy the player's geometric floor. The provider
// test (builtInLevels.test.ts) covers the singleton + glob wiring; this
// file is the contract guard for the *contents* of the JSONs themselves,
// so a hand-edit that breaks the schema trips CI before a user picks it.
//
// `import.meta.glob('/public/levels/*.json', { eager: true })` resolves
// every match at build time, just like production code in
// `src/maze/builtInLevels.ts:24`. `{ eager: true }` gives us the parsed
// modules inline (no `await loader()`), so the test stays synchronous
// and fast even as the fixture set grows.
//
// Mirrors the unwrap rule from builtInLevels.ts:43-48 — Vite wraps each
// JSON module in `{ default: <data> }`, so we read `.default` when present
// and fall back to the module itself.
const RAW_LEVELS = import.meta.glob('/public/levels/*.json', { eager: true }) as Record<
  string,
  { default?: unknown } | unknown
>;

// MIN_CELL_SIZE = 2 * PLAYER_RADIUS — duplicated here rather than exported
// from JsonMazeProvider (which keeps it private to gate against runtime
// use). The test asserts the same floor the validator enforces, so the
// two layers cannot drift.
const MIN_CELL_SIZE = 2 * PLAYER_RADIUS;

interface LevelEntry {
  id: string;
  raw: unknown;
}

function collectLevels(): LevelEntry[] {
  // `import.meta.glob` returns paths sorted alphabetically by Vite. We
  // surface every entry; the per-id assertions below run for each.
  return Object.entries(RAW_LEVELS).map(([path, mod]) => ({
    id: builtInIdFromPath(path),
    raw: (mod as { default?: unknown }).default ?? mod,
  }));
}

describe('built-in level JSONs (D-20)', () => {
  it('finds at least one built-in level (glob resolves)', () => {
    // Sanity: if the fixture directory is empty, the test below cannot
    // exercise the validator. The exact count is not pinned — adding a
    // new built-in level must not require updating a count literal here.
    expect(collectLevels().length).toBeGreaterThan(0);
  });

  it.each(collectLevels())(
    '%s — validateMaze accepts the JSON and the path-derived id matches the level id',
    ({ id, raw }) => {
      // The validator at src/maze/JsonMazeProvider.ts:48 throws
      // LevelLoadError on the first contract breach; `not.toThrow()`
      // pins "no schema drift" without enumerating every field.
      let data;
      expect(() => {
        data = validateMaze(raw, id);
      }).not.toThrow();
      // After validation, the returned MazeData's id must equal the id
      // we asked it to validate against — guards against a regression
      // where the file's `"id"` field silently disagrees with the
      // filename (which is how JsonMazeProvider looks the level up).
      expect(data!.id).toBe(id);
    },
  );

  it.each(collectLevels())(
    '%s — cellSize is at least the player-fit floor (2 * PLAYER_RADIUS)',
    ({ id, raw }) => {
      const data = validateMaze(raw, id);
      // The validator enforces `cellSize >= MIN_CELL_SIZE` at line 69 of
      // JsonMazeProvider. If a built-in JSON slips below the floor, the
      // player's collision radius would clip the wall mesh. Today all
      // built-in levels use cellSize = 2; the assertion is the floor, not
      // the value, so a future tune-up (e.g. cellSize = 4 for bigger
      // geometry) does not break the test.
      expect(data.cellSize).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    },
  );

  it.each(collectLevels())(
    '%s — start and exit are on walkable cells (walls[...] === 0)',
    ({ id, raw }) => {
      const data = validateMaze(raw, id);
      // validator already rejects `walls[start] === 1` at line 114 of
      // JsonMazeProvider; this is a belt-and-braces assertion that the
      // *built-in* fixtures never trip that path. The double-check here
      // costs nothing and surfaces a confusing validator regression
      // with a clearer message.
      expect(data.walls[data.start.z][data.start.x]).toBe(0);
      expect(data.walls[data.exit.z][data.exit.x]).toBe(0);
    },
  );

  // F-2026-06-17-F-CRITICAL-1: built-in teaching levels ship with P2-11
  // fields (i18n.en, tutorialSteps, hideMinimap, rules.enemyAggression,
  // rules.requireAllPickups). The original P2-11 validator was
  // field-silent, so adding the JSON fields did nothing at runtime —
  // 959/1/0 tests passed while i18n / TutorialBanner / hideMinimap /
  // enemyAggression were all dropped. This assertion is per-level and
  // fails the specific level whose validator broke, so a regression
  // is traceable instead of "all built-ins broken".
  it.each(collectLevels())(
    '%s — P2-11 fields survive the validator (i18n + tutorialSteps + hideMinimap + rules overrides)',
    ({ id, raw }) => {
      const data = validateMaze(raw, id);
      // The bug we are guarding against is the validator silently
      // *stripping* a field that the JSON had. For each P2-11 field:
      // if the raw JSON carried it, the validated data must carry it
      // too (with the same shape).
      const rawObj = raw as Record<string, unknown>;
      const rawRules = (rawObj.rules as Record<string, unknown> | undefined) ?? {};
      if (rawObj.i18n !== undefined) {
        expect(data.i18n).toBeDefined();
      }
      if (Array.isArray(rawObj.tutorialSteps)) {
        expect(data.tutorialSteps).toBeDefined();
        expect(Array.isArray(data.tutorialSteps)).toBe(true);
      }
      if (typeof rawObj.hideMinimap === 'boolean') {
        expect(data.hideMinimap).toBe(rawObj.hideMinimap);
      }
      if (
        rawRules.enemyAggression === 'easy' ||
        rawRules.enemyAggression === 'medium' ||
        rawRules.enemyAggression === 'hard'
      ) {
        expect(data.rules.enemyAggression).toBe(rawRules.enemyAggression);
      }
      if (rawRules.requireAllPickups === true) {
        expect(data.rules.requireAllPickups).toBe(true);
      }
    },
  );
});