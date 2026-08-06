import { describe, it, expect, vi } from 'vitest';
import { JsonMazeProvider, validateMaze } from '../../../src/maze/JsonMazeProvider';
import { LevelLoadError } from '../../../src/utils/errors';

// Minimal well-formed level fixture. All coordinates are integers within
// bounds; the start/exit cells are non-walls; rules pass positivity checks.
function makeValidLevel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'level-test',
    name: 'Test Level',
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
    // F-2026-06-15-H-3.2: enemies is now a required field; default to []
    // here so the fixture stays minimal and individual tests that exercise
    // enemies can override.
    enemies: [],
    ...overrides,
  };
}

describe('JsonMazeProvider', () => {
  describe('validateMaze (via .load())', () => {
    it('returns a usable MazeData for a well-formed level', async () => {
      // Arrange
      const provider = new JsonMazeProvider({ 'level-test': makeValidLevel() });

      // Act
      const data = await provider.load('level-test');

      // Assert
      expect(data.id).toBe('level-test');
      expect(data.name).toBe('Test Level');
      expect(data.size).toEqual({ width: 5, depth: 3 });
      // P3-1: validator defaults start/exit.level to 0 when the
      // JSON omits the field. Assert via toMatchObject so the new
      // defaulted field is visible without the test having to
      // hard-code every defaulted key.
      expect(data.start).toMatchObject({ x: 0, z: 0, level: 0 });
      expect(data.exit).toMatchObject({ x: 4, z: 2, level: 0 });
      // P3-1: every P3-1 added top-level field has a default.
      expect(data.levelCount).toBe(1);
      expect(data.transitions).toEqual([]);
      expect(data.walls).toHaveLength(3);
      expect(data.walls[0]).toHaveLength(5);
      expect(data.pickups).toEqual([]);
      expect(data.rules.victory).toBe('reach-exit');
    });
  });

  describe('Pickup.id backfill (P2-4b backward compat)', () => {
    it('mints a non-empty id when a pickup entry omits the id field', async () => {
      // Arrange — pickup with no id, mirroring pre-P2-4b hand-crafted JSON
      const level = makeValidLevel({
        pickups: [{ x: 1, z: 1, type: 'time', value: 10 }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      // Act
      const data = await provider.load('level-test');

      // Assert
      expect(data.pickups).toHaveLength(1);
      expect(typeof data.pickups[0].id).toBe('string');
      expect(data.pickups[0].id.length).toBeGreaterThan(0);
    });

    it('preserves an explicit pickup id verbatim', async () => {
      // Arrange
      const level = makeValidLevel({
        pickups: [{ id: 'pickup-explicit-1', x: 1, z: 1, type: 'time', value: 10 }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      // Act
      const data = await provider.load('level-test');

      // Assert
      expect(data.pickups[0].id).toBe('pickup-explicit-1');
    });

    it('generates unique ids for two backfilled pickups in the same level', async () => {
      // Arrange
      const level = makeValidLevel({
        pickups: [
          { x: 1, z: 1, type: 'time', value: 10 },
          { x: 2, z: 1, type: 'health', value: 1 },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      // Act
      const data = await provider.load('level-test');

      // Assert
      expect(data.pickups).toHaveLength(2);
      expect(data.pickups[0].id).not.toBe(data.pickups[1].id);
      expect(data.pickups[0].id.length).toBeGreaterThan(0);
      expect(data.pickups[1].id.length).toBeGreaterThan(0);
    });
  });

  describe('validateMaze export (P2-4b Plan Task 5)', () => {
    it('is importable as a named export and works on a well-formed input', () => {
      // Arrange
      const raw = makeValidLevel();

      // Act
      const data = validateMaze(raw, 'level-test');

      // Assert
      expect(data.id).toBe('level-test');
      expect(data.size).toEqual({ width: 5, depth: 3 });
    });

    it('throws LevelLoadError on invalid input (sanity check on the exported function)', () => {
      // Arrange — missing required string 'id'
      const broken = { ...makeValidLevel() } as Record<string, unknown>;
      delete broken.id;

      // Act + Assert
      expect(() => validateMaze(broken, 'level-test')).toThrow(LevelLoadError);
    });
  });

  // D-19: the path-derived id (e.g. "level-tiny" from
  // "/public/levels/level-tiny.json") must match the JSON's own `id`
  // field. Without the cross-check, a misnamed fixture would load via
  // the path-derived id, and the validator's later `requireString(m,
  // 'id', id)` would throw with a confusing "Maze 'level-other':
  // missing string 'id'" message even though `id` IS present.
  describe('D-19 — path-derived id must match raw.id', () => {
    it('throws LevelLoadError when raw.id disagrees with the requested id', () => {
      // Arrange — JSON says "level-tiny" but the caller asks for "level-other"
      const raw = makeValidLevel({ id: 'level-tiny' });

      // Act + Assert
      expect(() => validateMaze(raw, 'level-other')).toThrow(LevelLoadError);
      // Message names both ids so the user can see the mismatch immediately.
      expect(() => validateMaze(raw, 'level-other')).toThrow(/does not match/i);
    });

    it('accepts the level when raw.id matches the requested id', () => {
      // Arrange
      const raw = makeValidLevel({ id: 'level-tiny' });

      // Act
      const data = validateMaze(raw, 'level-tiny');

      // Assert
      expect(data.id).toBe('level-tiny');
    });
  });

  describe('F6 — start === exit is rejected', () => {
    it('throws LevelLoadError when start and exit occupy the same cell', async () => {
      // Regression (F6): the validator previously allowed start.x===exit.x
      // && start.z===exit.z, so a hand-crafted level (or an editor save
      // where the exit was dragged onto the start) would load and the
      // very first tick would call `crossesExit` on the spawn cell,
      // producing an instant 0-second victory.
      const level = makeValidLevel({ start: { x: 2, z: 1 }, exit: { x: 2, z: 1 } });
      const provider = new JsonMazeProvider({ 'level-test': level });

      // Act + Assert
      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('still accepts a level where start and exit are adjacent but distinct', async () => {
      // Regression guard: the new check must not over-reject. Adjacent
      // cells (different x OR different z) remain valid.
      const level = makeValidLevel({ start: { x: 2, z: 1 }, exit: { x: 3, z: 1 } });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      // P3-1: validator defaults start/exit.level to 0 — toMatchObject
      // so the new defaulted field is acknowledged without rewriting
      // the legacy x/z shape.
      expect(data.start).toMatchObject({ x: 2, z: 1, level: 0 });
      expect(data.exit).toMatchObject({ x: 3, z: 1, level: 0 });
    });
  });

  describe('F7 — enemy patrol-path nodes are bounds- and walkability-checked', () => {
    it('throws LevelLoadError when a patrol node is out of bounds (x>=width)', async () => {
      // Regression (F7): `parseEnemies` used `requireNumber` for path
      // nodes, so {x:99,z:-2} slipped through and the patrol rendered
      // outside the maze. Tightening to `requireInBounds` catches it.
      const level = makeValidLevel({
        enemies: [
          {
            id: 'e1',
            x: 0,
            z: 0,
            path: [
              { x: 0, z: 0 },
              { x: 99, z: -2 },
            ],
          },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('throws LevelLoadError when a patrol node is non-integer (e.g. 1.5)', async () => {
      // Regression (F7): integer requirement matches the cell-center
      // positioning convention used by every other validator call
      // site; a fractional node would break the floor(x/cs) agreement.
      const level = makeValidLevel({
        enemies: [
          {
            id: 'e1',
            x: 0,
            z: 0,
            path: [
              { x: 0, z: 0 },
              { x: 1.5, z: 1 },
            ],
          },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('throws LevelLoadError when a patrol node sits on a wall cell', async () => {
      // Regression (F7): the default `makeValidLevel` walls are all 0
      // (every cell walkable). Replace the grid with a wall in the
      // path's destination to confirm the walkability check is wired.
      const walls = [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      const level = makeValidLevel({
        walls,
        enemies: [
          {
            id: 'e1',
            x: 0,
            z: 0,
            path: [
              { x: 0, z: 0 },
              { x: 2, z: 1 }, // walls[1][2] === 1 — wall cell
            ],
          },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('still accepts an enemy whose path nodes are in-bounds and walkable', async () => {
      // Regression guard: tightening the validator must not over-reject
      // well-formed enemies. Two nodes, both integer, both in-bounds,
      // both on floor cells — the default fixture.
      const level = makeValidLevel({
        enemies: [
          {
            id: 'e1',
            x: 0,
            z: 0,
            path: [
              { x: 0, z: 0 },
              { x: 2, z: 1 },
            ],
          },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.enemies[0].path).toEqual([
        { x: 0, z: 0 },
        { x: 2, z: 1 },
      ]);
    });
  });

  // F-D-quality-D-30: every LevelLoadError site that interpolates a
  // user-controlled value must keep the rendered message bounded so
  // the LevelSelect error UI doesn't render a multi-MB paragraph into
  // the DOM. The unit-level helper (clampErrorValue) is covered by
  // tests/unit/utils/errors.test.ts; these two tests pin the
  // integration: a huge enemy id / cell value reaches the error
  // message bounded.
  describe('D-30 — LevelLoadError clamps user-controlled values to 80 chars', () => {
    it('clamps a 10 KB enemy id in the path-must-be-array error message', async () => {
      // The "enemy ${clampErrorValue(ee.id)} path must be array" branch
      // (JsonMazeProvider.ts:268) is the most exposed: an enemy id is
      // user-authored text in the editor, and the validator throws
      // before anything else can sanitize it. The full message must
      // remain small regardless of id length.
      const hugeId = 'X'.repeat(10_000);
      const level = makeValidLevel({
        enemies: [{ id: hugeId, x: 0, z: 0, path: 'not-an-array' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const err = await provider.load('level-test').catch((e) => e);
      expect(err).toBeInstanceOf(LevelLoadError);
      const msg = (err as LevelLoadError).message;
      // The 10 KB id must not surface verbatim.
      expect(msg.length).toBeLessThan(10_000);
      // The truncation ellipsis confirms the id was clipped (vs. the
      // helper silently dropping it).
      expect(msg).toContain('…');
      // Absolute cap: with the id clamped to 80+1 chars and the rest
      // of the template around 60 chars, the total is ~140. 500 gives
      // comfortable headroom for template tweaks without letting a
      // regression slip a full 10 KB id through.
      expect(msg.length).toBeLessThan(500);
    });

    it('clamps a 10 KB cell value in the walls[z][x] error message', async () => {
      // The walls[z][x] !== 0/1 branch (JsonMazeProvider.ts:119) uses
      // `clampErrorValue(v)` to bound the offending cell value. A
      // hand-crafted JSON could put any string in a cell slot, and
      // without clamping the error message would carry the full
      // string into the LevelSelect error UI.
      const hugeCell = 'Y'.repeat(10_000);
      const walls: Array<Array<unknown>> = [
        [0, 0, 0, 0, 0],
        [0, hugeCell, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      const level = makeValidLevel({ walls });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const err = await provider.load('level-test').catch((e) => e);
      expect(err).toBeInstanceOf(LevelLoadError);
      const msg = (err as LevelLoadError).message;
      expect(msg.length).toBeLessThan(10_000);
      expect(msg).toContain('…');
      expect(msg.length).toBeLessThan(500);
    });
  });

  // F-2026-06-30: 'caught-by-enemy' is the P2-11 teaching-only victory
  // path. The editor hides the option for non-tutorial levels; this
  // structural guard is the backstop for hand-edited JSON, older
  // exports, or imports from a future second source.
  describe("'caught-by-enemy' requires tutorial steps", () => {
    it('rejects a level with caught-by-enemy and no tutorialSteps field', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'caught-by-enemy',
          timeOnPickup: 10,
        },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
      await expect(provider.load('level-test')).rejects.toThrow(/caught-by-enemy/);
    });

    it('rejects a level with caught-by-enemy and an empty tutorialSteps array', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'caught-by-enemy',
          timeOnPickup: 10,
        },
        tutorialSteps: [],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
      await expect(provider.load('level-test')).rejects.toThrow(/caught-by-enemy/);
    });

    it('accepts a level with caught-by-enemy and at least one tutorial step (teaching-03 shape)', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'caught-by-enemy',
          timeOnPickup: 10,
        },
        // F-2026-07-01-FCR-H-3: tutorialSteps are now validated by the
        // loader — each step must have a string `id`, a string
        // `messageKey`, and a typed `trigger` object. The previous
        // fixture used a string trigger + `message: { zh, en }` shape
        // (which was tolerated by the old `as` cast validator); the
        // upgraded validator pins the contract here.
        tutorialSteps: [
          {
            id: 's1',
            messageKey: 'tutorial.teaching03.step1',
            trigger: { type: 'reached-exit' },
          },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.rules.victory).toBe('caught-by-enemy');
      expect(data.tutorialSteps).toHaveLength(1);
    });
  });

  // F-2026-06-30: P2-16 — three new optional rules fields are parsed
  // leniently: invalid values are silently dropped (matching the
  // `requireAllPickups` style) and the level still loads. The defaults
  // come from the engine at runtime, not from the validator.
  describe('P2-16 — new optional rules fields', () => {
    it('accepts a well-formed minimapMode / mapOpenBehavior / parchmentLifecycle', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'reach-exit',
          timeOnPickup: 10,
          minimapMode: 'parchment',
          mapOpenBehavior: 'continue',
          parchmentLifecycle: 'persist',
        },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.rules.minimapMode).toBe('parchment');
      expect(data.rules.mapOpenBehavior).toBe('continue');
      expect(data.rules.parchmentLifecycle).toBe('persist');
    });

    it('silently drops invalid string values and still loads the level', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'reach-exit',
          timeOnPickup: 10,
          minimapMode: 'parchments', // typo
          mapOpenBehavior: 'play', // unknown
          parchmentLifecycle: 'keep', // unknown
        },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      // Fields must NOT appear on the parsed rules — neither the typo
      // nor the unknown values should leak into the runtime MazeData.
      expect(data.rules.minimapMode).toBeUndefined();
      expect(data.rules.mapOpenBehavior).toBeUndefined();
      expect(data.rules.parchmentLifecycle).toBeUndefined();
    });

    it('silently drops non-string garbage (numbers / null / objects)', async () => {
      const level = makeValidLevel({
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'reach-exit',
          timeOnPickup: 10,
          minimapMode: 1,
          mapOpenBehavior: null,
          parchmentLifecycle: { type: 'persist' },
        },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.rules.minimapMode).toBeUndefined();
      expect(data.rules.mapOpenBehavior).toBeUndefined();
      expect(data.rules.parchmentLifecycle).toBeUndefined();
    });
  });

  // F-2026-06-30: P2-16 — back-compat migration for the P2-11
  // `hideMinimap: boolean` field. Hand-crafted JSON written before
  // P2-16 still uses the boolean; the validator must translate
  // `true` → `rules.minimapMode: 'hidden'` and warn once, while
  // `false` / absent is the default top-right minimap.
  describe('P2-16 — hideMinimap back-compat migration', () => {
    // Silence the migration's console.warn so the test output stays
    // clean — the dedicated "emits a one-time console.warn" test below
    // owns the assertion about the warning.
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("migrates top-level hideMinimap: true to rules.minimapMode: 'hidden'", async () => {
      const level = makeValidLevel({ hideMinimap: true });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.rules.minimapMode).toBe('hidden');
      // The deprecated boolean must NOT round-trip into the runtime
      // MazeData — it would mislead downstream consumers that still
      // check the old field.
      expect((data as { hideMinimap?: boolean }).hideMinimap).toBeUndefined();
    });

    it('emits a one-time console.warn when migrating hideMinimap', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const level = makeValidLevel({ hideMinimap: true });
      const provider = new JsonMazeProvider({ 'level-test': level });

      await provider.load('level-test');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/hideMinimap/);
      warnSpy.mockRestore();
    });

    it('does NOT migrate hideMinimap: false (was a no-op before too)', async () => {
      const level = makeValidLevel({ hideMinimap: false });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      // No warn, no migration, no field on the runtime MazeData.
      expect(data.rules.minimapMode).toBeUndefined();
    });

    it('does NOT overwrite an explicit rules.minimapMode with the hideMinimap migration', async () => {
      // Hand-edited JSON could have both fields — author intent wins.
      const level = makeValidLevel({
        hideMinimap: true,
        rules: {
          initialTime: 30,
          maxHealth: 3,
          victory: 'reach-exit',
          timeOnPickup: 10,
          minimapMode: 'parchment',
        },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });

      const data = await provider.load('level-test');
      expect(data.rules.minimapMode).toBe('parchment');
    });
  });

  // P2-18: parseTraps / parseDoors validation
  describe('P2-18 — parseTraps', () => {
    it('accepts a well-formed trap array', async () => {
      const level = makeValidLevel({
        traps: [
          { id: 'fire-1', x: 1, z: 1, kind: 'fire', damage: 2 },
          { id: 'water-1', x: 2, z: 1, kind: 'water', slowDurationSec: 3 },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.traps).toHaveLength(2);
      expect(data.traps[0].kind).toBe('fire');
      expect(data.traps[0].damage).toBe(2);
      expect(data.traps[1].kind).toBe('water');
      expect(data.traps[1].slowDurationSec).toBe(3);
    });

    it('mints an id when trap omits the id field', async () => {
      const level = makeValidLevel({
        traps: [{ x: 1, z: 1, kind: 'fire' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.traps[0].id).toBeTruthy();
    });

    it('returns empty array when traps is missing', async () => {
      const level = makeValidLevel();
      delete (level as Record<string, unknown>).traps;
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.traps).toEqual([]);
    });

    it('throws LevelLoadError when a trap is on a wall cell', async () => {
      const level = makeValidLevel({
        walls: [
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        traps: [{ x: 0, z: 0, kind: 'fire' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('throws LevelLoadError when a trap is on the start cell', async () => {
      const level = makeValidLevel({
        traps: [{ x: 0, z: 0, kind: 'fire' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/start/i);
    });

    it('throws LevelLoadError when a trap is on the exit cell', async () => {
      const level = makeValidLevel({
        traps: [{ x: 4, z: 2, kind: 'water' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/exit/i);
    });

    it('throws LevelLoadError for duplicate trap on the same cell', async () => {
      const level = makeValidLevel({
        traps: [
          { x: 1, z: 1, kind: 'fire' },
          { x: 1, z: 1, kind: 'water' },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/duplicate/i);
    });

    it('throws LevelLoadError for invalid trap kind', async () => {
      const level = makeValidLevel({
        traps: [{ x: 1, z: 1, kind: 'ice' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/kind/i);
    });
  });

  describe('P2-18 — parseDoors', () => {
    it('accepts a well-formed door array', async () => {
      const level = makeValidLevel({
        doors: [
          { id: 'door-red-1', x: 1, z: 1, keyColor: 'red' },
          { id: 'door-blue-1', x: 2, z: 1, keyColor: 'blue' },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.doors).toHaveLength(2);
      expect(data.doors[0].keyColor).toBe('red');
      expect(data.doors[1].keyColor).toBe('blue');
    });

    it('mints an id when door omits the id field', async () => {
      const level = makeValidLevel({
        doors: [{ x: 1, z: 1, keyColor: 'green' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.doors[0].id).toBeTruthy();
    });

    it('returns empty array when doors is missing', async () => {
      const level = makeValidLevel();
      delete (level as Record<string, unknown>).doors;
      const provider = new JsonMazeProvider({ 'level-test': level });
      const data = await provider.load('level-test');
      expect(data.doors).toEqual([]);
    });

    it('throws LevelLoadError when a door is on a wall cell', async () => {
      const level = makeValidLevel({
        walls: [
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
        doors: [{ x: 0, z: 0, keyColor: 'red' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(LevelLoadError);
    });

    it('throws LevelLoadError when a door is on the start cell', async () => {
      const level = makeValidLevel({
        doors: [{ x: 0, z: 0, keyColor: 'red' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/start/i);
    });

    it('throws LevelLoadError when a door is on the exit cell', async () => {
      const level = makeValidLevel({
        doors: [{ x: 4, z: 2, keyColor: 'yellow' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/exit/i);
    });

    it('throws LevelLoadError for duplicate door on the same cell', async () => {
      const level = makeValidLevel({
        doors: [
          { x: 1, z: 1, keyColor: 'red' },
          { x: 1, z: 1, keyColor: 'blue' },
        ],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/duplicate/i);
    });

    it('throws LevelLoadError for invalid keyColor', async () => {
      const level = makeValidLevel({
        doors: [{ x: 1, z: 1, keyColor: 'purple' }],
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/keyColor/i);
    });
  });

  // P3-1d (M-2 fix): host-side DoS guards. JsonMazeProvider is the
  // only validator between untrusted JSON (shared link / import file)
  // and the in-memory MazeData, so a malicious payload that requests
  // a 10⁶×10⁶ grid, or stuffs the entity arrays with millions of
  // entries, would otherwise OOM the tab. These cases pin the
  // rejection contract.
  describe('M-2 host-side DoS guards', () => {
    it('rejects width > MAX_MAZE_SIZE', async () => {
      const level = makeValidLevel({ size: { width: 1000, depth: 5 } });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/width \(1000\)/);
    });

    it('rejects depth > MAX_MAZE_SIZE', async () => {
      const level = makeValidLevel({ size: { width: 5, depth: 1000 } });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/depth \(1000\)/);
    });

    it('rejects non-integer width (e.g. 5.5)', async () => {
      const level = makeValidLevel({ size: { width: 5.5, depth: 5 } });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/width/);
    });

    it('rejects width <= 0', async () => {
      const level = makeValidLevel({ size: { width: 0, depth: 5 } });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/width/);
    });

    it('accepts the boundary size (200x200)', async () => {
      // MAX_MAZE_SIZE is 200; a 200x200 grid is allowed.
      const walls = Array.from({ length: 200 }, () => Array<number>(200).fill(0));
      const level = makeValidLevel({
        size: { width: 200, depth: 200 },
        walls,
        start: { x: 0, z: 0 },
        exit: { x: 199, z: 199 },
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).resolves.toBeDefined();
    });

    it('rejects oversized enemies array', async () => {
      const enemies = Array.from({ length: 1001 }, (_, i) => ({
        id: `e${i}`, x: 1, z: 1, path: [{ x: 1, z: 1 }, { x: 1, z: 2 }],
      }));
      const level = makeValidLevel({ enemies });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/enemies has 1001/);
    });

    it('rejects oversized pickups array', async () => {
      // Use a 50×50 grid so all 1001 pickups can sit on unique cells
      // (the duplicate-cell check would fire first if we reused coords
      // on a 5×3 grid). Start and exit live at opposite corners,
      // pickups spread across the 48×48 interior.
      const walls = Array.from({ length: 50 }, () => Array<number>(50).fill(0));
      const pickups = Array.from({ length: 1001 }, (_, i) => {
        const x = (i % 48) + 1; // 1..48
        const z = (Math.floor(i / 48) % 48) + 1; // 1..48
        return { id: `p${i}`, x, z, type: 'time' as const, value: 1 };
      });
      const level = makeValidLevel({
        size: { width: 50, depth: 50 },
        walls,
        start: { x: 0, z: 0 },
        exit: { x: 49, z: 49 },
        pickups,
      });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/pickups has 1001/);
    });

    it('rejects oversized tutorialSteps array', async () => {
      const tutorialSteps = Array.from({ length: 65 }, (_, i) => ({
        id: `s${i}`,
        messageKey: 'tutorial.teaching01.step1',
        trigger: { type: 'timeout', timeoutSec: 1 },
      }));
      const level = makeValidLevel({ tutorialSteps });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).rejects.toThrow(/tutorialSteps has 65/);
    });

    it('accepts the boundary tutorialSteps count (64)', async () => {
      const tutorialSteps = Array.from({ length: 64 }, (_, i) => ({
        id: `s${i}`,
        messageKey: 'tutorial.teaching01.step1',
        trigger: { type: 'timeout', timeoutSec: 1 },
      }));
      const level = makeValidLevel({ tutorialSteps });
      const provider = new JsonMazeProvider({ 'level-test': level });
      await expect(provider.load('level-test')).resolves.toBeDefined();
    });
  });
});
