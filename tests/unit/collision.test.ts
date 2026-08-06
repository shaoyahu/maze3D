import { describe, it, expect } from 'vitest';
import {
  resolveMove,
  playerVsEnemy,
  hasEnemyContact,
  type WallGrid,
} from '../../src/engine/Collision';
import { Enemy } from '../../src/entities/Enemy';

// P3-1: the grid factory accepts the new `level` arg on the `get`
// closure. The shared 5x5 fixture (used by both back-compat and
// multi-level tests) ignores the layer argument — every layer reads
// the same walls, which is the pre-P3-1 / levelCount=1 convention
// and the simplest possible multi-level grid (every layer is a
// copy of the same walls). Tests that want per-layer variation
// build their own `WallGrid` from scratch.
const grid: WallGrid = (() => {
  const w = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  // P3-1: signature is `get(x, z, level)`; the underscore-prefixed
  // `level` arg is read by the type system but unused by this
  // single-layer fixture. ESLint/TS would otherwise complain about
  // the unused arg.
  return { width: 5, depth: 5, cellSize: 2, get: (x, z, _level) => w[z][x] as 0 | 1 };
})();

describe('resolveMove (single-layer back-compat, P3-1)', () => {
  it('allows free movement inside corridor', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, grid, 0);
    expect(next.x).toBeCloseTo(5.5);
    expect(next.z).toBeCloseTo(5);
  });

  it('blocks movement into a wall on +x', () => {
    const p = { x: 7.6, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 0 }, grid, 0);
    expect(next.x).toBeLessThanOrEqual(7.7);
  });

  it('blocks movement into a wall on -x', () => {
    const p = { x: 2.4, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: -1, dz: 0 }, grid, 0);
    expect(next.x).toBeGreaterThanOrEqual(2.3);
  });

  it('blocks movement into a wall on +z', () => {
    const p = { x: 5, z: 7.6, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 1 }, grid, 0);
    expect(next.z).toBeLessThanOrEqual(7.7);
  });

  it('blocks movement into a wall on -z', () => {
    const p = { x: 5, z: 2.4, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: -1 }, grid, 0);
    expect(next.z).toBeGreaterThanOrEqual(2.3);
  });

  it('slides along a wall (diagonal into corner is clamped)', () => {
    const p = { x: 7.6, z: 7.6, r: 0.3 };
    const next = resolveMove(p, { dx: 1, dz: 1 }, grid, 0);
    expect(next.x).toBeLessThanOrEqual(7.7);
    expect(next.z).toBeLessThanOrEqual(7.7);
  });

  it('zero-delta returns same position', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0, dz: 0 }, grid, 0);
    expect(next.x).toBeCloseTo(5);
    expect(next.z).toBeCloseTo(5);
  });
});

// P3-1: per-layer wall lookup. The grid's `get` receives a `level`
// argument; resolveMove is responsible for forwarding the player's
// current level. This block exercises the explicit-level path.
describe('resolveMove (multi-level, P3-1)', () => {
  // Two-layer fixture: layer 0 is the same 5x5 open interior used
  // above; layer 1 fills the whole grid with walls (an unreachable
  // "ceiling" layer). resolveMove on layer 1 must fail every move;
  // resolveMove on layer 0 must behave like the single-layer case.
  const twoLayerGrid: WallGrid = (() => {
    const l0 = [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    const l1 = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 1));
    return {
      width: 5,
      depth: 5,
      cellSize: 2,
      get: (x, z, level) => (level === 0 ? l0[z][x] : l1[z][x]) as 0 | 1,
    };
  })();

  it('layer 0 with playerLevel=0 walks freely (back-compat)', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, twoLayerGrid, 0);
    expect(next.x).toBeCloseTo(5.5);
  });

  it('layer 1 with playerLevel=1 blocks every move (all-walls layer)', () => {
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, twoLayerGrid, 1);
    expect(next.x).toBe(5);
  });

  it('layer mismatch does not affect collision (player on layer 0 ignores layer 1 walls)', () => {
    // This is a "sanity" check: the player's level is what resolveMove
    // passes to `get`. A wall that exists only on a different layer
    // does NOT block the player.
    const p = { x: 5, z: 5, r: 0.3 };
    const next = resolveMove(p, { dx: 0.5, dz: 0 }, twoLayerGrid, 0);
    expect(next.x).toBeCloseTo(5.5);
  });
});

describe('playerVsEnemy', () => {
  // Player radius follows PLAYER_RADIUS (0.2). Enemy radius is 0.35.
  // Sum = 0.55; the tangent threshold for the boundary cases.
  const playerRadius = 0.2;
  const enemyRadius = 0.35;

  it('returns false when player and enemy are exactly tangent (distance = sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0.55, z: 0, r: enemyRadius, level: 0 };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(false);
  });

  it('returns true when player and enemy overlap (distance < sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0.5, z: 0, r: enemyRadius, level: 0 };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(true);
  });

  it('returns false when player and enemy are clearly apart (distance > sum radius)', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 2, z: 0, r: enemyRadius, level: 0 };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(false);
  });

  it('reflects an enemy that has moved along its facing direction (cross-node)', () => {
    // F2 (P0): the enemy constructor now takes a WallGrid (for wall-aware
    // moveToward). The top-of-file `grid` has a wall perimeter, which
    // would trap the enemy at (0, 0). The test's actual subject is
    // patrol movement + playerVsEnemy distance math, NOT wall collision
    // (covered by tests/unit/entities/Enemy.test.ts > "wall-aware
    // movement"). Use a 100x100 open grid so moveToward isn't blocked
    // by an unrelated boundary.
    const openGrid: WallGrid = {
      width: 100,
      depth: 100,
      cellSize: 1,
      get: (_x, _z, _level) => 0,
    };
    // Enemy spawned at (0.5, 0.5) (cell-center) patrols toward (2.5, 0.5).
    // The +0.5 shift off the corner keeps the enemy's ENEMY_RADIUS=0.35
    // circle out of the negative cell index (which collidesAt treats as
    // a wall — pre-fix the enemy was pinned at the corner). With
    // patrolSpeed=2 and dt=0.5, one tick moves the enemy 1m to (1.5, 0.5).
    // F-2026-06-16-L-3: with `currentTarget=1` initial, the enemy
    // patrols from path[0] (= spawn) toward path[1]. Setting
    // path[0] = (0.5, 0.5) and path[1] = (2.5, 0.5) keeps the
    // +X-only direction so one tick lands at (1.5, 0.5) as before.
    const enemy = new Enemy(
      { id: 'e1', x: 0.5, z: 0.5, path: [{ x: 0.5, z: 0.5 }, { x: 2.5, z: 0.5 }] },
      { playerSpeed: 2 / 0.6, chaseMultiplier: 1.5 },
      openGrid,
    );
    enemy.update(0.5, { position: { x: 1000, z: 1000 } });
    expect(enemy.position.x).toBeCloseTo(1.5);
    // Player at (1.5, 0.5) — same position as the enemy. Sum of radii 0.55.
    const hit = playerVsEnemy(
      { x: 1.5, z: 0.5 },
      playerRadius,
      { x: enemy.position.x, z: enemy.position.z, r: enemyRadius, level: 0 },
      0,
    );
    expect(hit).toBe(true);
  });

  // P3-1: cross-layer enemy / player never collide. The pure
  // distance math says "overlap" but the level mismatch rejects it
  // before the radius check runs.
  it('returns false when player and enemy are at the same x/z but different layers', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0, z: 0, r: enemyRadius, level: 1 };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(false);
  });

  it('returns true when both player and enemy are on layer 0 (back-compat default)', () => {
    // enemy.level === undefined is treated as 0 (single-layer back-compat).
    const player = { x: 0, z: 0 };
    const enemy = { x: 0.5, z: 0, r: enemyRadius };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(true);
  });

  it('returns false when player and enemy are on the same x/z but enemy.level differs', () => {
    const player = { x: 0, z: 0 };
    const enemy = { x: 0, z: 0, r: enemyRadius, level: 2 };
    expect(playerVsEnemy(player, playerRadius, enemy, 0)).toBe(false);
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
    expect(hasEnemyContact({ x: 0, z: 0 }, playerRadius, [], enemyRadius, 0)).toBe(false);
  });

  it('returns false when no enemy is within the collision range', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [{ x: 5, z: 0 }],
        enemyRadius,
        0,
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
        0,
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
        0,
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
        0,
      ),
    ).toBe(false);
  });

  // P3-1: cross-layer enemies are silently skipped. The list
  // contains a same-layer overlap and a cross-layer overlap; the
  // same-layer enemy must still trigger contact.
  it('skips enemies on a different layer (P3-1)', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [
          { x: 0, z: 0, level: 1 }, // same x/z but layer 1 — no contact
          { x: 0.05, z: 0, level: 0 }, // layer 0 — contact
        ],
        enemyRadius,
        0,
      ),
    ).toBe(true);
  });

  it('returns false when every enemy in the list is on a different layer (P3-1)', () => {
    expect(
      hasEnemyContact(
        { x: 0, z: 0 },
        playerRadius,
        [
          { x: 0, z: 0, level: 1 },
          { x: 0, z: 0, level: 2 },
          { x: 0, z: 0, level: 5 },
        ],
        enemyRadius,
        0,
      ),
    ).toBe(false);
  });
});
