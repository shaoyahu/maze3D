import { describe, it, expect } from 'vitest';
import {
  resolveMove,
  playerVsEnemy,
  hasEnemyContact,
  type WallGrid,
} from '../../src/engine/Collision';
import { Enemy } from '../../src/entities/Enemy';

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

describe('playerVsEnemy', () => {
  // Player radius follows PLAYER_RADIUS (0.2). Enemy radius is 0.35.
  // Sum = 0.55; the tangent threshold for the boundary cases.
  const playerRadius = 0.2;
  const enemyRadius = 0.35;

  it('returns false when player and enemy are exactly tangent (distance = sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0.55, z: 0, r: enemyRadius };
    expect(playerVsEnemy(player, playerRadius, enemy)).toBe(false);
  });

  it('returns true when player and enemy overlap (distance < sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0.5, z: 0, r: enemyRadius };
    expect(playerVsEnemy(player, playerRadius, enemy)).toBe(true);
  });

  it('returns false when player and enemy are clearly apart (distance > sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 2, z: 0, r: enemyRadius };
    expect(playerVsEnemy(player, playerRadius, enemy)).toBe(false);
  });

  it('reflects an enemy that has moved along its facing direction (cross-node)', () => {
    // Enemy spawned at (0,0) patrols toward (2,0). With patrolSpeed=2
    // (playerSpeed=10/6 * 0.6, but use 2 for a clean step), one tick of
    // 0.5s moves the enemy to (1, 0).
    const enemy = new Enemy(
      { id: 'e1', x: 0, z: 0, path: [{ x: 2, z: 0 }, { x: 2, z: 2 }] },
      { playerSpeed: 2 / 0.6, chaseMultiplier: 1.5 },
    );
    enemy.update(0.5, { position: { x: 1000, z: 1000 } });
    expect(enemy.position.x).toBeCloseTo(1);
    // Player at (1, 0) — same cell as the enemy. Sum of radii 0.55.
    const hit = playerVsEnemy(
      { x: 1, z: 0 },
      playerRadius,
      { x: enemy.position.x, z: enemy.position.z, r: enemyRadius },
    );
    expect(hit).toBe(true);
  });
});

// P2-4a F1: per-frame contact check used by Game.update() to fire
// bridge.onEnemyContact. A list-based helper keeps the loop in a pure
// function so the engine can stay glue-only (the actual Three.js /
// sceneRefs work is in Game.ts). hasEnemyContact returns true the moment
// ANY enemy overlaps the player — the engine should debounce via the
// 0.5s invulnerable window in the store, not here.
describe('hasEnemyContact', () => {
  const playerRadius = 0.2;
  const enemyRadius = 0.35;

  it('returns false when the enemy list is empty', () => {
    expect(hasEnemyContact({ x: 0, z: 0 }, playerRadius, [], enemyRadius)).toBe(false);
  });

  it('returns false when no enemy is within the collision range', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [{ x: 5, z: 0 }],
        enemyRadius,
      ),
    ).toBe(false);
  });

  it('returns true when an enemy overlaps the player', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [{ x: 0.1, z: 0 }],
        enemyRadius,
      ),
    ).toBe(true);
  });

  it('returns true if any enemy in the list is in contact (not just the first)', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [
          { x: 100, z: 0 }, // far
          { x: 0.05, z: 0 }, // close — overlap
        ],
        enemyRadius,
      ),
    ).toBe(true);
  });

  it('treats tangent (distance === sum radius) as no contact (matches playerVsEnemy strict-<)', () => {
    // playerRadius 0.2 + enemyRadius 0.35 = 0.55. Distance 0.55 -> tangent.
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [{ x: 0.55, z: 0 }],
        enemyRadius,
      ),
    ).toBe(false);
  });
});
