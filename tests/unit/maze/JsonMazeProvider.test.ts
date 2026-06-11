import { describe, it, expect } from 'vitest';
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
      expect(data.start).toEqual({ x: 0, z: 0 });
      expect(data.exit).toEqual({ x: 4, z: 2 });
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
      expect(data.start).toEqual({ x: 2, z: 1 });
      expect(data.exit).toEqual({ x: 3, z: 1 });
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
});
