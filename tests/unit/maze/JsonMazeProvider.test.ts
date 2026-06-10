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
});
