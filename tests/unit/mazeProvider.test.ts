import { describe, it, expect, vi } from 'vitest';
import { JsonMazeProvider } from '../../src/maze/JsonMazeProvider';
import { LevelLoadError } from '../../src/utils/errors';

const validMaze = {
  id: 'm1',
  name: 'Test',
  size: { width: 3, depth: 3 },
  cellSize: 2,
  start: { x: 0, z: 0 },
  exit: { x: 2, z: 2 },
  walls: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  pickups: [],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
};

describe('JsonMazeProvider', () => {
  it('parses a valid maze object', async () => {
    const provider = new JsonMazeProvider({ 'm1': validMaze });
    const maze = await provider.load('m1');
    expect(maze.id).toBe('m1');
    expect(maze.size).toEqual({ width: 3, depth: 3 });
  });

  it('throws LevelLoadError on missing id', async () => {
    const provider = new JsonMazeProvider({ 'm1': validMaze });
    await expect(provider.load('nope')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError on missing required field', async () => {
    const bad = { ...validMaze, start: undefined } as any;
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when walls row length does not match width', async () => {
    const bad = { ...validMaze, walls: [[1, 1], [1, 1, 1], [1, 1]] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when walls is not an array of arrays of 0/1', async () => {
    const bad = { ...validMaze, walls: [[2, 0], [1, 1], [1, 1]] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when start or exit is on a wall cell', async () => {
    const bad = { ...validMaze, start: { x: 1, z: 1 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError on invalid victory type', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, victory: 'invalid' } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when start is out of bounds', async () => {
    const bad = { ...validMaze, start: { x: 99, z: 0 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when exit is out of bounds', async () => {
    const bad = { ...validMaze, exit: { x: 0, z: -1 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when pickup is on start cell', async () => {
    const bad = { ...validMaze, pickups: [{ x: 0, z: 0, type: 'time', value: 10 }] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when pickup is out of bounds', async () => {
    const bad = { ...validMaze, pickups: [{ x: 5, z: 5, type: 'time', value: 10 }] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when pickup.value is missing', async () => {
    const bad = { ...validMaze, pickups: [{ x: 2, z: 0, type: 'time' }] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when cellSize is not a positive finite number', async () => {
    const bad = { ...validMaze, cellSize: 0 };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when initialTime is not positive', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, initialTime: 0 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when initialTime is negative', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, initialTime: -10 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when maxHealth is not positive', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, maxHealth: 0 } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when timeOnPickup is NaN', async () => {
    const bad = { ...validMaze, rules: { ...validMaze.rules, timeOnPickup: NaN } };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(LevelLoadError);
  });

  it('throws LevelLoadError when pickup value is zero', async () => {
    const bad = { ...validMaze, pickups: [{ x: 2, z: 0, type: 'health', value: 0 }] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(/pickup value must be a finite positive number/);
  });

  it('throws LevelLoadError when pickup value is negative', async () => {
    const bad = { ...validMaze, pickups: [{ x: 2, z: 0, type: 'health', value: -5 }] };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(/pickup value must be a finite positive number/);
  });

  it('throws LevelLoadError when two pickups occupy the same cell', async () => {
    const bad = {
      ...validMaze,
      pickups: [
        { x: 2, z: 0, type: 'time', value: 5 },
        { x: 2, z: 0, type: 'key', value: 1 },
      ],
    };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(/duplicate pickup/);
  });

  it('throws LevelLoadError when cellSize is too small for the player radius', async () => {
    // player radius is 0.2, so cellSize must be at least 0.4 to fit.
    const bad = { ...validMaze, cellSize: 0.3 };
    const provider = new JsonMazeProvider({ 'm1': bad });
    await expect(provider.load('m1')).rejects.toThrow(/cellSize must be at least/);
  });

  it('parses a maze with a valid enemies array', async () => {
    // The validMaze fixture's walls are [[0,1,0],[1,1,1],[0,1,0]] — only
    // (0,0), (2,0), (0,2), (2,2) are walkable. Pre-F7, parseEnemies
    // accepted any integer (x,z) on a path, including wall cells. The
    // fixture used to spell out {x:1,z:1} etc.; post-F7 those land on
    // walls, so the fixture walks the corners of the room instead.
    const maze = {
      ...validMaze,
      enemies: [
        { id: 'e1', x: 0, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 2 }] },
        {
          id: 'e2', x: 2, z: 2, path: [{ x: 0, z: 2 }, { x: 2, z: 0 }], dwellTime: 0.5,
        },
      ],
    };
    const provider = new JsonMazeProvider({ 'm1': maze });
    const loaded = await provider.load('m1');
    expect(loaded.enemies).toHaveLength(2);
    expect(loaded.enemies[0].id).toBe('e1');
    expect(loaded.enemies[0].path).toEqual([{ x: 2, z: 0 }, { x: 0, z: 2 }]);
    expect(loaded.enemies[1].dwellTime).toBe(0.5);
  });

  it('rejects when the enemies field is missing (F-2026-06-15-H-3.2)', async () => {
    const maze = { ...validMaze } as Record<string, unknown>;
    delete (maze as { enemies?: unknown }).enemies;
    const provider = new JsonMazeProvider({ 'm1': maze });
    await expect(provider.load('m1')).rejects.toThrow(/missing 'enemies' field/);
  });

  it('drops an enemy whose path has fewer than 2 nodes (and warns)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Path nodes are on floor cells (corners) — see the "parses a
      // maze with a valid enemies array" test for why (1,1) etc. no
      // longer work post-F7 (z=1 is a wall row in this fixture).
      const maze = {
        ...validMaze,
        enemies: [
          { id: 'bad', x: 0, z: 0, path: [{ x: 2, z: 0 }] }, // 1 node -> drop
          { id: 'good', x: 0, z: 0, path: [{ x: 2, z: 0 }, { x: 0, z: 2 }] },
        ],
      };
      const provider = new JsonMazeProvider({ 'm1': maze });
      const loaded = await provider.load('m1');
      expect(loaded.enemies).toHaveLength(1);
      expect(loaded.enemies[0].id).toBe('good');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/bad.*1 path node/));
    } finally {
      warnSpy.mockRestore();
    }
  });

  // P2-4b Task 1: backward-compat with pre-Pickup.id JSON. Hand-crafted
  // levels saved before P2-4b don't carry a `pickup.id`; loading them must
  // auto-assign a non-empty id so the editor can later refer to that
  // pickup by id. Existing ids must be preserved verbatim.
  describe('pickup id (P2-4b backward compat)', () => {
    it('assigns a non-empty id to a pickup that omits the id field', async () => {
      const maze = {
        ...validMaze,
        pickups: [{ x: 2, z: 0, type: 'time', value: 10 }], // no `id`
      };
      const provider = new JsonMazeProvider({ 'm1': maze });
      const loaded = await provider.load('m1');
      expect(loaded.pickups).toHaveLength(1);
      expect(typeof loaded.pickups[0].id).toBe('string');
      expect(loaded.pickups[0].id.length).toBeGreaterThan(0);
    });

    it('preserves the explicit id when the JSON provides one', async () => {
      const maze = {
        ...validMaze,
        pickups: [{ id: 'pickup-foo', x: 2, z: 0, type: 'health', value: 1 }],
      };
      const provider = new JsonMazeProvider({ 'm1': maze });
      const loaded = await provider.load('m1');
      expect(loaded.pickups[0].id).toBe('pickup-foo');
    });
  });
});
