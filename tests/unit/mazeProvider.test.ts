import { describe, it, expect } from 'vitest';
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
});
