import { describe, it, expect } from 'vitest';
import { resolveMove, type WallGrid } from '../../src/engine/Collision';

const grid: WallGrid = (() => {
  const w = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  return { width: 5, depth: 5, cellSize: 2, get: (x, z) => w[z][x] as 0 | 1 };
})();

describe('resolveMove', () => {
  it('allows free movement inside corridor', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, grid);
    expect(next.x).toBeCloseTo(5.5);
    expect(next.z).toBeCloseTo(5);
  });

  it('blocks movement into a wall on +x', () => {
    const p = { x: 7.6, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 0 }, grid);
    expect(next.x).toBeLessThanOrEqual(7.7);
  });

  it('blocks movement into a wall on -x', () => {
    const p = { x: 2.4, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: -1, dz: 0 }, grid);
    expect(next.x).toBeGreaterThanOrEqual(2.3);
  });

  it('blocks movement into a wall on +z', () => {
    const p = { x: 5, z: 7.6, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 1 }, grid);
    expect(next.z).toBeLessThanOrEqual(7.7);
  });

  it('blocks movement into a wall on -z', () => {
    const p = { x: 5, z: 2.4, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: -1 }, grid);
    expect(next.z).toBeGreaterThanOrEqual(2.3);
  });

  it('slides along a wall (diagonal into corner is clamped)', () => {
    const p = { x: 7.6, z: 7.6, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 1 }, grid);
    expect(next.x).toBeLessThanOrEqual(7.7);
    expect(next.z).toBeLessThanOrEqual(7.7);
  });

  it('zero-delta returns same position', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 0 }, grid);
    expect(next.x).toBeCloseTo(5);
    expect(next.z).toBeCloseTo(5);
  });
});
