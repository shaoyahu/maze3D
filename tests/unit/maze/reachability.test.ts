import { describe, it, expect } from 'vitest';
import { isReachable } from '../../../src/maze/reachability';
import type { CellType } from '../../../src/maze/types';

// Helper: build a square grid of `size` filled with `fill` (0 = floor,
// 1 = wall). Keeps the tests below readable and lets us assert against
// the BFS contract without leaking the internal `walls: CellType[][]`
// literal type at every call site.
function grid(size: number, fill: CellType): CellType[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => fill));
}

describe('isReachable (BFS over open cells)', () => {
  it('returns false on a 2x2 all-walls grid (no open cell to start from)', () => {
    const walls = grid(2, 1);
    expect(isReachable(walls, { x: 0, z: 0 }, { x: 1, z: 1 })).toBe(false);
  });

  it('returns true on a 3x3 open grid from start to exit (no walls)', () => {
    const walls = grid(3, 0);
    expect(isReachable(walls, { x: 0, z: 0 }, { x: 2, z: 2 })).toBe(true);
  });

  it('returns true when start and exit are the same cell (0-step reach)', () => {
    const walls = grid(3, 0);
    expect(isReachable(walls, { x: 1, z: 1 }, { x: 1, z: 1 })).toBe(true);
  });

  it('returns true for corners enclosed by a single-thick wall (expanded grid is still connected)', () => {
    // 5x5 grid with a 1-cell-thick border of walls and a 3x3 open
    // interior. start at (1,1) and exit at (3,3) are both inside the
    // wrap, so the BFS walks through the interior freely.
    const walls = grid(5, 0);
    for (let i = 0; i < 5; i++) {
      walls[0][i] = 1;
      walls[4][i] = 1;
      walls[i][0] = 1;
      walls[i][4] = 1;
    }
    expect(isReachable(walls, { x: 1, z: 1 }, { x: 3, z: 3 })).toBe(true);
  });

  it('returns false when start is inside a wall and exit is on a normal cell', () => {
    // Mostly open grid but the start cell (1,1) is a wall — the BFS
    // must reject the input up front, not start the search from a
    // blocked cell.
    const walls = grid(3, 0);
    walls[1][1] = 1;
    expect(isReachable(walls, { x: 1, z: 1 }, { x: 2, z: 2 })).toBe(false);
  });

  it('returns false when exit is inside a wall and start is on a normal cell', () => {
    // Symmetric to the previous test: the exit cell (2,2) is a wall,
    // so a perfectly walkable start (0,0) can never reach a wall.
    const walls = grid(3, 0);
    walls[2][2] = 1;
    expect(isReachable(walls, { x: 0, z: 0 }, { x: 2, z: 2 })).toBe(false);
  });
});
