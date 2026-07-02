import { describe, it, expect } from 'vitest';
import {
  expandThickWall,
  type TreeEdge,
} from '../../../../src/maze/generators/_expandThickWall';

// F-2026-07-01-FCR-M-11: dedicated coverage for expandThickWall. The four
// procedural generators consume this helper, but its edge cases
// (odd/even visualSize, last-row/column even positions, midpoint
// clipping) are only exercised indirectly. Each case below pins one
// invariant so a regression in this helper is caught at the helper
// boundary, not deep inside a generator integration test.

describe('expandThickWall (F-2026-07-01-FCR-M-11)', () => {
  it('throws when visualSize < 3', () => {
    expect(() => expandThickWall(0, [])).toThrow();
    expect(() => expandThickWall(1, [])).toThrow();
    expect(() => expandThickWall(2, [])).toThrow();
  });

  it('returns a visualSize x visualSize walls matrix on odd sizes (15)', () => {
    const walls = expandThickWall(15, []);
    expect(walls.length).toBe(15);
    for (const row of walls) expect(row.length).toBe(15);
  });

  it('returns a visualSize x visualSize walls matrix on even sizes (16)', () => {
    const walls = expandThickWall(16, []);
    expect(walls.length).toBe(16);
    for (const row of walls) expect(row.length).toBe(16);
  });

  it('logical cells (even-even positions) are passages even with no edges', () => {
    // size=5: logical cells at (0,0), (0,2), (0,4), (2,0), (2,2), (2,4), (4,0), (4,2), (4,4)
    const walls = expandThickWall(5, []);
    const even = [
      [0, 0], [0, 2], [0, 4],
      [2, 0], [2, 2], [2, 4],
      [4, 0], [4, 2], [4, 4],
    ];
    for (const [x, z] of even) {
      expect(walls[z]![x]).toBe(0);
    }
  });

  it('non-logical cells stay as walls when no edges connect them', () => {
    // size=5: corners at (1,1), (1,3), (3,1), (3,3) should remain walls.
    const walls = expandThickWall(5, []);
    const oddOdd = [[1, 1], [1, 3], [3, 1], [3, 3]];
    for (const [x, z] of oddOdd) {
      expect(walls[z]![x]).toBe(1);
    }
  });

  it('start cell (0,0) and the last logical cell are force-opened', () => {
    // size=7: logicalSize=4 → exit at (2*(4-1), 2*(4-1)) = (6, 6).
    const walls = expandThickWall(7, []);
    expect(walls[0]![0]).toBe(0);
    expect(walls[6]![6]).toBe(0);
  });

  it('a single horizontal edge (0,0)-(1,0) opens the midpoint at (2,0)', () => {
    const edges: TreeEdge[] = [{ ax: 0, az: 0, bx: 1, bz: 0 }];
    const walls = expandThickWall(7, edges);
    expect(walls[0]![2]).toBe(0);
  });

  it('a single vertical edge (0,0)-(0,1) opens the midpoint at (0,2)', () => {
    const edges: TreeEdge[] = [{ ax: 0, az: 0, bx: 0, bz: 1 }];
    const walls = expandThickWall(7, edges);
    expect(walls[2]![0]).toBe(0);
  });

  it('edges with endpoints outside bounds are clipped, not thrown', () => {
    // Edge to (99,99) — beyond visualSize. The midpoint would land at
    // (198,198) which is out of bounds; helper should silently skip.
    const edges: TreeEdge[] = [{ ax: 0, az: 0, bx: 99, bz: 99 }];
    const walls = expandThickWall(7, edges);
    // No exception; matrix remains 7x7.
    expect(walls.length).toBe(7);
    // The far-out-of-bounds midpoint didn't corrupt anything: corners
    // that should still be walls are walls.
    expect(walls[1]![1]).toBe(1);
  });

  it('all even-even positions become passages regardless of row/column edge', () => {
    // size=15: logicalSize=8 → lz in [0..7], lx in [0..7]. Every
    // (2*lx, 2*lz) pair is a logical cell and gets opened by the
    // helper, including (14,12), (12,14), (14,14). The previous
    // version of this test asserted that the last-row/column
    // even-even positions stayed as walls — but the algorithm
    // explicitly opens every even-even within bounds.
    const walls = expandThickWall(15, []);
    // All 8x8 = 64 even-even cells are passages.
    for (let lz = 0; lz < 8; lz += 1) {
      for (let lx = 0; lx < 8; lx += 1) {
        const vx = 2 * lx;
        const vz = 2 * lz;
        expect(walls[vz]![vx]).toBe(0);
      }
    }
    // Odd-odd cells stay as walls (corners).
    expect(walls[1]![1]).toBe(1);
    expect(walls[13]![13]).toBe(1);
  });
});