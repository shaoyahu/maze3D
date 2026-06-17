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

  // F-2026-06-17-C-H-1: the three cases below pin the empty-grid and
  // out-of-bounds contract that the BFS relies on. Before the bounds guard
  // landed, `walls[start.z][start.x]` would silently return undefined on
  // out-of-range coordinates and `visited[z*width+x]` would write past
  // the array's end on a jagged input — both undetectable from the
  // function's return value alone, but the latter was a real OOB write.

  it('returns false on an empty grid (walls=[])', () => {
    // depth=0 -> early return at the depth===0 guard.
    expect(isReachable([], { x: 0, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });

  it('returns false on a single-row grid (walls=[[]])', () => {
    // depth=1, width=0 -> early return at the width===0 guard.
    expect(isReachable([[]], { x: 0, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });

  it('returns false when start is out of bounds (avoids OOB write on jagged grids)', () => {
    // Jagged grid: row 0 has 3 cells, row 1 has 6 cells. width=3 (from
    // walls[0].length) and depth=2. start=(5,1) is within walls[1] (so
    // walls[1][5] is not undefined) but x=5 >= width=3 means the BFS
    // visited array — sized width*depth = 6 — would be indexed at
    // z*width+x = 1*3+5 = 8, which is past the end. The bounds guard
    // now rejects the call before any array access.
    const walls: CellType[][] = [
      [0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    expect(isReachable(walls, { x: 5, z: 1 }, { x: 0, z: 0 })).toBe(false);
  });
});
