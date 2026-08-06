import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsonMazeProvider } from '../../src/maze/JsonMazeProvider';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJson(name: string): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, '../../public/levels/', name), 'utf-8'),
  );
}

function isSolvable(
  walls: number[][],
  start: { x: number; z: number },
  exit: { x: number; z: number },
): boolean {
  const depth = walls.length;
  const width = walls[0]?.length ?? 0;
  const visited = new Set<string>();
  const queue: Array<{ x: number; z: number }> = [start];
  visited.add(`${start.x},${start.z}`);
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.x === exit.x && cell.z === exit.z) return true;
    const neighbors = [
      { x: cell.x + 1, z: cell.z },
      { x: cell.x - 1, z: cell.z },
      { x: cell.x, z: cell.z + 1 },
      { x: cell.x, z: cell.z - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.z < 0 || n.z >= depth) continue;
      if (walls[n.z][n.x] === 1) continue;
      const key = `${n.x},${n.z}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(n);
    }
  }
  return false;
}

describe('level JSON files', () => {
  it('teaching-04.json loads and validates via JsonMazeProvider', async () => {
    const data = loadJson('teaching-04.json');
    const provider = new JsonMazeProvider({ 'teaching-04': data });
    const maze = await provider.load('teaching-04');
    expect(maze.id).toBe('teaching-04');
    expect(maze.size).toEqual({ width: 10, depth: 10 });
    // P3-1: validator defaults start / exit.level to 0 (see
    // JsonMazeProvider's parseEntityLevel helper).
    expect(maze.start).toMatchObject({ x: 0, z: 0, level: 0 });
    expect(maze.exit).toMatchObject({ x: 9, z: 9, level: 0 });
  });

  it('teaching-04.json is solvable from start to exit', async () => {
    const data = loadJson('teaching-04.json') as {
      walls: number[][];
      start: { x: number; z: number };
      exit: { x: number; z: number };
    };
    expect(isSolvable(data.walls, data.start, data.exit)).toBe(true);
  });

  it('teaching-01.json loads and validates via JsonMazeProvider', async () => {
    const data = loadJson('teaching-01.json');
    const provider = new JsonMazeProvider({ 'teaching-01': data });
    const maze = await provider.load('teaching-01');
    expect(maze.id).toBe('teaching-01');
    expect(maze.size).toEqual({ width: 3, depth: 3 });
    // P3-1: see teaching-04 above. Validator defaults level=0.
    expect(maze.start).toMatchObject({ x: 0, z: 1, level: 0 });
    expect(maze.exit).toMatchObject({ x: 2, z: 1, level: 0 });
  });

  it('teaching-01.json is solvable from start to exit', async () => {
    const data = loadJson('teaching-01.json') as {
      walls: number[][];
      start: { x: number; z: number };
      exit: { x: number; z: number };
    };
    expect(isSolvable(data.walls, data.start, data.exit)).toBe(true);
  });
});
