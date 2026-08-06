import { describe, it, expect } from 'vitest';
import {
  isReachable,
  isReachableMultiLevel,
  getCellConnections,
  type WallsForLayer,
} from '../../../src/maze/reachability';
import type { CellType, VerticalTransition } from '../../../src/maze/types';

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

// ---------------------------------------------------------------------------
// P3-1: multi-level reachability (3D BFS).
// ---------------------------------------------------------------------------

// P3-1: build a per-level wall grid where every layer is the same
// `size × size` open grid. Matches the historical `isReachable`
// back-compat exactly: levelCount=1 with this builder is identical
// to `isReachable(grid(size, 0), ...)`.
function allOpenLayeredGrid(size: number, levelCount: number): WallsForLayer {
  const open = grid(size, 0);
  return (level: number) => {
    if (level < 0 || level >= levelCount) return open;
    return open;
  };
}

describe('isReachableMultiLevel (P3-1, back-compat with isReachable)', () => {
  it('levelCount=1 with empty transitions matches isReachable on a 3x3 open grid', () => {
    // Same back-compat pin as the single-layer BFS — the 3D
    // function must agree with `isReachable` when there is only
    // one layer and no transitions.
    const walls3x3 = grid(3, 0);
    const flat: WallsForLayer = () => walls3x3;
    expect(
      isReachableMultiLevel(flat, 3, 3, 1, { level: 0, x: 0, z: 0 }, { level: 0, x: 2, z: 2 }, []),
    ).toBe(isReachable(walls3x3, { x: 0, z: 0 }, { x: 2, z: 2 }));
  });

  it('levelCount=1 returns true when start === exit (0-step reach)', () => {
    const flat = allOpenLayeredGrid(3, 1);
    expect(
      isReachableMultiLevel(flat, 3, 3, 1, { level: 0, x: 1, z: 1 }, { level: 0, x: 1, z: 1 }, []),
    ).toBe(true);
  });

  it('levelCount=1 returns false when start is on a wall', () => {
    const walls = grid(3, 0);
    walls[1][1] = 1;
    const flat: WallsForLayer = () => walls;
    expect(
      isReachableMultiLevel(flat, 3, 3, 1, { level: 0, x: 1, z: 1 }, { level: 0, x: 2, z: 2 }, []),
    ).toBe(false);
  });

  it('levelCount=1 returns false when exit is on a wall', () => {
    const walls = grid(3, 0);
    walls[2][2] = 1;
    const flat: WallsForLayer = () => walls;
    expect(
      isReachableMultiLevel(flat, 3, 3, 1, { level: 0, x: 0, z: 0 }, { level: 0, x: 2, z: 2 }, []),
    ).toBe(false);
  });
});

describe('isReachableMultiLevel (P3-1, 2-level scenarios)', () => {
  it('returns true across 2 layers when a stair-up transition connects them', () => {
    // A 2-layer maze where every layer is fully open. start on L0,
    // exit on L1, single transition at the same (x, z) cell.
    const flat = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 't1', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 1 },
    ];
    expect(
      isReachableMultiLevel(
        flat,
        5, 5, 2,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 2, z: 2 },
        transitions,
      ),
    ).toBe(true);
  });

  it('returns false when the only transition is disconnected (no path to its source cell)', () => {
    // The transition exists but the player can't reach its
    // source cell on L0 (the cell is surrounded by walls).
    const walls0 = grid(5, 0);
    // Wall off (2, 2) on L0 — the transition source is unreachable.
    walls0[2][2] = 1;
    walls0[1][2] = 1;
    walls0[3][2] = 1;
    walls0[2][1] = 1;
    walls0[2][3] = 1;
    const layers: WallsForLayer = (l) => (l === 0 ? walls0 : grid(5, 0));
    const transitions: VerticalTransition[] = [
      { id: 't1', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 1 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 2,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 2, z: 2 },
        transitions,
      ),
    ).toBe(false);
  });

  it('returns false when a transition endpoint points to a wall on the destination layer', () => {
    // L0 is open; L1 has a wall at (2, 2). The transition
    // sends the player from (2, 2) on L0 to (2, 2) on L1 —
    // but L1 (2, 2) is a wall, so the destination is
    // unreachable. The BFS must reject the edge, not loop
    // forever on a "destination exists but is a wall" path.
    const layers: WallsForLayer = (l) => {
      const w = grid(5, 0);
      if (l === 1) w[2][2] = 1;
      return w;
    };
    const transitions: VerticalTransition[] = [
      { id: 't1', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 1 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 2,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 2, z: 2 },
        transitions,
      ),
    ).toBe(false);
  });

  it('honors toX / toZ landing offsets on a transition', () => {
    // The transition sends the player to a different (x, z) on
    // the destination layer. A hand-authored level uses this
    // when a stair ends in a lateral corridor (so the player
    // doesn't re-trigger the stair on landing).
    const layers = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 't1', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 1, toX: 3, toZ: 3 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 2,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 3, z: 3 },
        transitions,
      ),
    ).toBe(true);
  });

  it('returns true on a symmetric 2-level maze via hole-down (top → bottom)', () => {
    // Spec §3 decision 1: stair-up is for going up, hole-down
    // is for going down. The BFS doesn't care about the kind —
    // any valid transition is a graph edge.
    const layers = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 'h1', level: 1, x: 2, z: 2, kind: 'hole-down', toLevel: 0 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 2,
        { level: 1, x: 0, z: 0 },
        { level: 0, x: 2, z: 2 },
        transitions,
      ),
    ).toBe(true);
  });
});

describe('isReachableMultiLevel (P3-1, 3/6-level scenarios)', () => {
  it('returns true across 3 layers with two stair-ups in series', () => {
    // L0 → L1 → L2. start on L0, exit on L2.
    const layers = allOpenLayeredGrid(5, 3);
    const transitions: VerticalTransition[] = [
      { id: 'a', level: 0, x: 1, z: 1, kind: 'stair-up', toLevel: 1 },
      { id: 'b', level: 1, x: 3, z: 3, kind: 'stair-up', toLevel: 2 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 3,
        { level: 0, x: 0, z: 0 },
        { level: 2, x: 4, z: 4 },
        transitions,
      ),
    ).toBe(true);
  });

  it('returns false when a 3-layer chain has a broken middle link', () => {
    // L0 → L1 and L2 are valid chains, but the L1 → L2
    // transition is at a wall cell — the chain breaks.
    const layers: WallsForLayer = (l) => {
      if (l === 1) {
        const w = grid(5, 0);
        w[3][3] = 1; // wall at the L1 → L2 transition source
        return w;
      }
      return grid(5, 0);
    };
    const transitions: VerticalTransition[] = [
      { id: 'a', level: 0, x: 1, z: 1, kind: 'stair-up', toLevel: 1 },
      { id: 'b', level: 1, x: 3, z: 3, kind: 'stair-up', toLevel: 2 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 3,
        { level: 0, x: 0, z: 0 },
        { level: 2, x: 4, z: 4 },
        transitions,
      ),
    ).toBe(false);
  });

  it('returns true on a 6-layer ladder when every layer has a stair-up', () => {
    // The spec's upper level cap is 6 (Q7). A 6-layer ladder
    // with 5 stair-up transitions must be reachable end-to-end.
    const layers = allOpenLayeredGrid(5, 6);
    const transitions: VerticalTransition[] = [];
    for (let i = 0; i < 5; i++) {
      transitions.push({
        id: `t${i}`,
        level: i,
        x: 2,
        z: 2,
        kind: 'stair-up',
        toLevel: i + 1,
      });
    }
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 6,
        { level: 0, x: 0, z: 0 },
        { level: 5, x: 4, z: 4 },
        transitions,
      ),
    ).toBe(true);
  });

  it('returns false on a 6-layer ladder when one transition is missing', () => {
    // Same ladder minus the L2 → L3 transition — the chain breaks.
    const layers = allOpenLayeredGrid(5, 6);
    const transitions: VerticalTransition[] = [];
    for (let i = 0; i < 6; i++) {
      if (i === 2) continue; // skip the L2 → L3 stair
      transitions.push({
        id: `t${i}`,
        level: i,
        x: 2,
        z: 2,
        kind: 'stair-up',
        toLevel: i + 1,
      });
    }
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 6,
        { level: 0, x: 0, z: 0 },
        { level: 5, x: 4, z: 4 },
        transitions,
      ),
    ).toBe(false);
  });
});

describe('isReachableMultiLevel (P3-1, self-loop + edge cases)', () => {
  it('skips self-loop transitions (level === toLevel) without looping forever', () => {
    // A self-loop transition is a no-op edge. The BFS
    // contract is to ignore it (the transition table is
    // user-supplied, so a hand-authored level might
    // accidentally include one).
    const layers = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 'bad', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 0 }, // self-loop
      { id: 'good', level: 0, x: 1, z: 1, kind: 'stair-up', toLevel: 1 },
    ];
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 2,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 1, z: 1 },
        transitions,
      ),
    ).toBe(true);
  });

  it('returns false for an empty transitions table when start and exit are on different layers', () => {
    // No vertical edges → the layers are disconnected
    // components. start on L0, exit on L1, with no
    // transition is unreachable.
    const layers = allOpenLayeredGrid(5, 3);
    expect(
      isReachableMultiLevel(
        layers,
        5, 5, 3,
        { level: 0, x: 0, z: 0 },
        { level: 1, x: 4, z: 4 },
        [],
      ),
    ).toBe(false);
  });

  it('returns false when levelCount is 0', () => {
    // Defensive: a hand-crafted level with `levelCount: 0`
    // (somehow slipping past the validator) must be rejected
    // — a 0-layer maze has no start and no exit.
    const layers = allOpenLayeredGrid(0, 0);
    expect(
      isReachableMultiLevel(
        layers,
        0, 0, 0,
        { level: 0, x: 0, z: 0 },
        { level: 0, x: 0, z: 0 },
        [],
      ),
    ).toBe(false);
  });

  it('returns false when start.level is out of bounds', () => {
    const layers = allOpenLayeredGrid(3, 2);
    expect(
      isReachableMultiLevel(
        layers,
        3, 3, 2,
        { level: 5, x: 0, z: 0 },
        { level: 0, x: 2, z: 2 },
        [],
      ),
    ).toBe(false);
  });

  it('returns false when exit.level is out of bounds', () => {
    const layers = allOpenLayeredGrid(3, 2);
    expect(
      isReachableMultiLevel(
        layers,
        3, 3, 2,
        { level: 0, x: 0, z: 0 },
        { level: 5, x: 2, z: 2 },
        [],
      ),
    ).toBe(false);
  });
});

describe('getCellConnections (P3-1, BFS neighbor enumeration)', () => {
  it('returns the 4 horizontal neighbors for an open cell with no transitions', () => {
    const layers = allOpenLayeredGrid(5, 1);
    const conns = getCellConnections(layers, 0, 1, 5, 5, 2, 2, []);
    expect(conns).toHaveLength(4);
    expect(conns).toContainEqual({ level: 0, x: 3, z: 2 });
    expect(conns).toContainEqual({ level: 0, x: 1, z: 2 });
    expect(conns).toContainEqual({ level: 0, x: 2, z: 3 });
    expect(conns).toContainEqual({ level: 0, x: 2, z: 1 });
  });

  it('returns no neighbors for a wall cell (open-cell only contract)', () => {
    const walls = grid(5, 0);
    walls[2][2] = 1;
    const layers: WallsForLayer = () => walls;
    expect(getCellConnections(layers, 0, 1, 5, 5, 2, 2, [])).toEqual([]);
  });

  it('returns no neighbors for an out-of-bounds cell', () => {
    const layers = allOpenLayeredGrid(5, 1);
    expect(getCellConnections(layers, 0, 1, 5, 5, -1, 0, [])).toEqual([]);
    expect(getCellConnections(layers, 0, 1, 5, 5, 0, 5, [])).toEqual([]);
  });

  it('adds the transition destination as an extra neighbor', () => {
    const layers = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 't1', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 1 },
    ];
    const conns = getCellConnections(layers, 0, 2, 5, 5, 2, 2, transitions);
    // 4 horizontal + 1 vertical.
    expect(conns).toHaveLength(5);
    expect(conns).toContainEqual({ level: 1, x: 2, z: 2 });
  });

  it('skips a self-loop transition in the neighbor list', () => {
    const layers = allOpenLayeredGrid(5, 2);
    const transitions: VerticalTransition[] = [
      { id: 'bad', level: 0, x: 2, z: 2, kind: 'stair-up', toLevel: 0 },
    ];
    const conns = getCellConnections(layers, 0, 2, 5, 5, 2, 2, transitions);
    // 4 horizontal only — the self-loop doesn't add a 5th.
    expect(conns).toHaveLength(4);
  });
});
