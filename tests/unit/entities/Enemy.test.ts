import { describe, it, expect } from 'vitest';
import { Enemy, type EnemyPlayerRef } from '../../../src/entities/Enemy';
import { type WallGrid } from '../../../src/engine/Collision';
import type { EnemySpawn } from '../../../src/maze/types';

const player = (x: number, z: number): EnemyPlayerRef => ({ position: { x, z } });

// F2 (P0): tests build a small wall grid (cellSize=1, 100x100) and place
// walls at the listed (x, z) cell coordinates. Defaults to "all walkable"
// so pre-existing tests can rely on the same helper without per-test wiring.
function walledGrid(wallCells: ReadonlyArray<readonly [number, number]> = []): WallGrid {
  const wallSet = new Set(wallCells.map(([x, z]) => `${x},${z}`));
  return {
    width: 100,
    depth: 100,
    cellSize: 1,
    get: (x, z) => (wallSet.has(`${x},${z}`) ? 1 : 0),
  };
}

function makeSpawn(overrides: Partial<EnemySpawn> = {}): EnemySpawn {
  return {
    id: 'e1',
    x: 0,
    z: 0,
    // F-2026-06-16-L-3: with `currentTarget = 1` initial, the default
    // spawn's first patrol hop is `path[0] -> path[1]`. Setting
    // path[0] = spawn and path[1] = +X keeps the initial heading on
    // (1, 0), matching the legacy semantics the chase / FOV / debounce
    // tests below were written against. Tests that need a different
    // geometry override `path` explicitly.
    path: [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
    ],
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<EnemySpawn> = {}, playerSpeed = 1, chaseMultiplier = 1.5) {
  return new Enemy(makeSpawn(overrides), { playerSpeed, chaseMultiplier }, walledGrid());
}

describe('Enemy', () => {
  describe('patrol→dwell→patrol cycle', () => {
    it('starts patrolling toward path[1] (not path[0]) and advances through the cycle', () => {
      // F-2026-06-16-L-3: the enemy now starts with `currentTarget = 1`
      // so the initial FOV cone points along the first patrol segment
      // instead of the meaningless +X (headingToward(spawn, spawn) is
      // zero-distance and falls back to {x:1, z:0}). Geometry mirrors
      // the previous test: spawn (0.5, 0.5), path[(0, 1), (1, 1)] in
      // cell-centre coords; first segment is +X (length 1).
      const e = makeEnemy(
        { x: 0.5, z: 0.5, path: [{ x: 0.5, z: 0.5 }, { x: 1.5, z: 0.5 }] },
        1,
        1.5,
      );
      const far = player(1000, 1000); // never in FOV

      // Frame 1: currentTarget=1 from the constructor, heading along
      // +X (toward path[1]). Move 0.6 toward (1.5, 0.5). State stays
      // patrol. Position advances from (0.5, 0.5) by 0.6 along +X.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);
      expect(e.position.x).toBeCloseTo(1.1);

      // Frame 2: move 0.4 more (clamped to remaining 0.4). Reaches (1.5, 0.5). State -> dwell.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      expect(e.currentTarget).toBe(1);
      expect(e.position.x).toBeCloseTo(1.5);

      // Frame 3: tickDwell with dt=1. dwellTimer = 1 - 1 = 0 -> advance target.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);

      // Frame 4: move 0.6 toward (0.5, 0.5). heading now points -X.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.position.x).toBeCloseTo(0.9);
    });

    it('wraps target index back to 1 after the last node (L-3 shifted initial target)', () => {
      // F-2026-06-16-L-3: the wrap semantics still apply (path.length
      // modular), but the test now exercises a path whose first segment
      // matches the new initial currentTarget=1 behaviour: spawn (0.5,
      // 0.5) at path[0], path[1] = (0.5, 0.5) = spawn, path[2] = (1.5,
      // 0.5) so the enemy has a real first hop to test against. Three
      // nodes keeps the wrap from collapsing to a single dwell tick.
      const e = makeEnemy(
        {
          x: 0.5,
          z: 0.5,
          path: [
            { x: 0.5, z: 0.5 },
            { x: 0.5, z: 0.5 },
            { x: 1.5, z: 0.5 },
          ],
        },
        2,
        1.5,
      );
      // patrolSpeed = 1.2.
      const far = player(1000, 1000);

      // Initial currentTarget=1; path[1] is the spawn cell so the
      // first tick is an instant dwell.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      e.update(1, far); // dwellTimer expires -> advance to path[2]
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(2);

      // Move 1 unit to (1.5, 0.5) and enter dwell.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      expect(e.position.x).toBeCloseTo(1.5);

      // dwellTimer expires -> wrap to target 0, then path[1] (which is
      // the spawn cell) is the next target — but the constructor init
      // had us already past path[1], so we move to path[0] (= spawn)
      // and dwell again.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);

      e.update(1, far);
      expect(e.state).toBe('dwell');
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);
    });
  });

  describe('patrol→chase trigger', () => {
    it('enters chase when player enters FOV', () => {
      const e = makeEnemy(); // default path starts at +X, heading (1,0)
      e.update(0.01, player(0.5, 0));
      expect(e.state).toBe('chase');
      expect(e.alertTimer).toBeCloseTo(0.5);
    });

    it('does not enter chase when player is behind the enemy', () => {
      const e = makeEnemy();
      // heading is (1,0). Player at (-0.5, 0) is exactly behind (180 deg).
      e.update(0.01, player(-0.5, 0));
      expect(e.state).toBe('patrol');
    });
  });

  describe('chase→patrol with 0.5s alert debounce', () => {
    it('stays in chase while player is out of FOV within the debounce window', () => {
      const e = makeEnemy();
      e.update(0.01, player(0.5, 0));
      expect(e.state).toBe('chase');

      // Player teleports out of FOV.
      const far = player(1000, 1000);
      e.update(0.2, far);
      expect(e.state).toBe('chase');
      expect(e.alertTimer).toBeCloseTo(0.3);

      e.update(0.2, far);
      expect(e.state).toBe('chase');
      expect(e.alertTimer).toBeCloseTo(0.1);
    });

    it('returns to patrol after the 0.5s debounce elapses', () => {
      const e = makeEnemy();
      e.update(0.01, player(0.5, 0));
      expect(e.state).toBe('chase');

      const far = player(1000, 1000);
      e.update(0.4, far);
      expect(e.state).toBe('chase');
      e.update(0.2, far); // total 0.6s out of FOV
      expect(e.state).toBe('patrol');
    });

    it('resets the debounce when the player re-enters FOV mid-window', () => {
      const e = makeEnemy();
      e.update(0.01, player(0.5, 0));
      const far = player(1000, 1000);
      e.update(0.3, far); // 0.2 left on debounce
      expect(e.state).toBe('chase');

      // Player pops back into FOV — debounce resets.
      e.update(0.01, player(0.5, 0));
      expect(e.state).toBe('chase');
      expect(e.alertTimer).toBeCloseTo(0.5);
    });
  });

  describe('FOV boundary', () => {
    it('sees a player on the heading axis within range', () => {
      const e = makeEnemy({ fovRange: 3, fovAngleDeg: 60 });
      expect(e.canSeePlayer(player(3, 0))).toBe(true);
    });

    it('sees a player at exactly half the FOV angle', () => {
      const e = makeEnemy({ fovRange: 3, fovAngleDeg: 60 });
      const angle = (30 * Math.PI) / 180;
      const x = 3 * Math.cos(angle);
      const z = 3 * Math.sin(angle);
      expect(e.canSeePlayer(player(x, z))).toBe(true);
    });

    it('does not see a player just outside the FOV half-angle', () => {
      const e = makeEnemy({ fovRange: 3, fovAngleDeg: 60 });
      const angle = (40 * Math.PI) / 180;
      const x = 3 * Math.cos(angle);
      const z = 3 * Math.sin(angle);
      expect(e.canSeePlayer(player(x, z))).toBe(false);
    });

    it('does not see a player beyond the FOV range', () => {
      const e = makeEnemy({ fovRange: 3, fovAngleDeg: 60 });
      expect(e.canSeePlayer(player(5, 0))).toBe(false);
    });
  });

  describe('dwellTime', () => {
    it('skips the dwell phase when dwellTime is 0', () => {
      // F-2026-06-16-L-3: with `currentTarget = 1` initial, the enemy
      // patrols from spawn (0.5, 0.5) toward path[1] (1.5, 0.5) — i.e.
      // the second node. The path geometry keeps the same 1-unit hop
      // so the patrolSpeed × dt math stays identical; only the
      // "currentTarget after the hop" assertion shifts from 1 to 0
      // because after the dwell-and-advance the target wraps to path[0]
      // (the previous path[0] of the legacy test).
      const e = makeEnemy(
        { x: 0.5, z: 0.5, path: [{ x: 0.5, z: 0.5 }, { x: 1.5, z: 0.5 }], dwellTime: 0 },
        2,
        1.5,
      );
      // patrolSpeed = 1.2; path is 1 unit, reached in 1 frame.
      const far = player(1000, 1000);
      e.update(1, far); // reaches (1.5, 0.5) -> state = dwell, dwellTimer = 0
      expect(e.state).toBe('dwell');
      e.update(0.001, far); // dwellTimer <= 0 -> advance target
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);
    });
  });

  describe('constructor validation', () => {
    it('throws when the path has fewer than 2 nodes', () => {
      expect(() => makeEnemy({ path: [{ x: 0, z: 0 }] })).toThrow(/at least 2 nodes/);
      expect(() => makeEnemy({ path: [] })).toThrow(/at least 2 nodes/);
    });
  });

  // F-2026-06-16-L-3: the enemy's initial heading is now computed
  // from spawn -> path[1], not spawn -> path[0]. path[0] is the spawn
  // cell, so headingToward(spawn, spawn) is a zero-distance call that
  // falls back to the {x:1, z:0} east default — meaning the FOV cone
  // would point +x regardless of the actual patrol direction. Starting
  // with currentTarget=1 fixes the FOV to point along the first real
  // patrol segment.
  describe('initial heading (F-2026-06-16-L-3)', () => {
    it('initial heading points toward path[1], not the +X fallback', () => {
      // path[1] is at (+1, -1) — heading should be the unit vector to
      // the SE, never the {1, 0} east default that the old init produced.
      const e = makeEnemy({ path: [{ x: 0, z: 0 }, { x: 1, z: -1 }] });
      expect(e.heading.x).toBeCloseTo(Math.SQRT1_2);
      expect(e.heading.z).toBeCloseTo(-Math.SQRT1_2);
      // And: initial target is path[1], not path[0].
      expect(e.currentTarget).toBe(1);
    });

    it('initial heading along a pure +Z patrol (not the legacy +X default)', () => {
      const e = makeEnemy({ path: [{ x: 0, z: 0 }, { x: 0, z: 2 }] });
      expect(e.heading.x).toBeCloseTo(0);
      expect(e.heading.z).toBeCloseTo(1);
      expect(e.currentTarget).toBe(1);
    });
  });

  // F2 (P0): wall-aware movement. Pre-fix, the enemy's moveToward added
  // the unit vector scaled by step directly to the position, so a wall
  // between the enemy and its target disappeared within a second of chase.
  // These tests pin the new behavior: a wall between the enemy and its
  // target stops the chase/patrol on the near side of the wall, mirroring
  // the player's Collision.resolveMove.
  describe('wall-aware movement', () => {
    it('does not chase through a wall when the player is on the far side', () => {
      // Wall column at cell (1, 0) — meters x range [1, 2], enemy starting
      // at x=0.5 (cell 0 center) and player at x=3.5 (cell 3 center).
      // F2 (P0): path[0] = spawn so the initial currentTarget=1 points
      // at path[1] = (2.5, 0.5) (the real first hop). Same geometry as
      // before — first patrol hop is +X by 2 cells.
      // F-2026-06-16-L-3: this is the same wall-aware movement test;
      // path[0] = spawn keeps the chase trigger geometry identical to
      // the legacy version.
      const e = new Enemy(
        {
          id: 'e1',
          x: 0.5,
          z: 0.5,
          path: [
            { x: 0.5, z: 0.5 },
            { x: 2.5, z: 0.5 },
          ],
        },
        { playerSpeed: 1, chaseMultiplier: 1.5 },
        walledGrid([[1, 0]]),
      );
      // Tick 100 frames at 16ms (~1.6s) — well past the 0.5s chase debounce.
      // The player is in FOV (heading=+X by default, player on +X axis),
      // so the enemy enters chase immediately. Without the wall fix, the
      // enemy would walk straight through the wall and end up near x=3.5.
      for (let i = 0; i < 100; i++) {
        e.update(0.016, player(3.5, 0.5));
      }
      expect(e.state).toBe('chase');
      // With ENEMY_RADIUS=0.35, the enemy's circle first overlaps cell (1, 0)
      // when its x is around 0.65 (floor(0.65+0.35) = 1). The chase advances
      // a few cells before the per-axis try-move rejects the X delta, so the
      // x settles somewhere between the spawn (0.5) and the wall face (~1.0).
      expect(e.position.x).toBeLessThan(1.0);
      expect(e.position.x).toBeGreaterThan(0.5);
      // No Z movement requested, so the enemy doesn't drift in z.
      expect(e.position.z).toBeCloseTo(0.5);
    });

    it('does not enter dwell when patrol target is blocked by a wall', () => {
      // Same wall layout as above; player is far away so the enemy stays
      // in patrol. The pre-fix `step >= dist` check would mark the target
      // as reached on the very first frame (stepDist > dist), entering
      // dwell even though the wall prevents the move. With the fix, the
      // enemy stays in patrol because the resolved position never reaches
      // the target.
      // F-2026-06-16-L-3: path[0] = spawn so the initial currentTarget=1
      // points at path[1] = (2.5, 0.5) (the real first hop), matching
      // the chase test's +X geometry. The wall is at cell (1, 0), so
      // the enemy still can't reach path[1] and stays in patrol.
      const e = new Enemy(
        {
          id: 'e1',
          x: 0.5,
          z: 0.5,
          path: [
            { x: 0.5, z: 0.5 },
            { x: 2.5, z: 0.5 },
          ],
        },
        { playerSpeed: 1, chaseMultiplier: 1.5 },
        walledGrid([[1, 0]]),
      );
      const far = player(1000, 1000);
      for (let i = 0; i < 50; i++) {
        e.update(0.016, far);
      }
      expect(e.state).toBe('patrol');
      expect(e.position.x).toBeLessThan(1.0);
    });
  });

  // F-2026-06-17-C-H-2: the constructor must reject spawns whose path[0]
  // is more than one cellSize away. Without this guard, an editor export
  // with stale spawn coordinates would let the enemy "snap" on its
  // first tick — the FOV cone was computed on the very first frame from
  // a far-away heading, then silently corrected on the second tick.
  describe('F-2026-06-17-C-H-2: spawn/path[0] distance guard', () => {
    it('throws when spawn is more than one cell away from path[0]', () => {
      const spawn = makeSpawn({
        x: 0,
        z: 0,
        // path[0] at (5, 5) — distance ~7.07, well past cellSize=1.
        path: [
          { x: 5, z: 5 },
          { x: 6, z: 5 },
        ],
      });
      expect(() => new Enemy(spawn, { playerSpeed: 1, chaseMultiplier: 1.5 }, walledGrid())).toThrow(
        /more than one cell.*away from path\[0\]/,
      );
    });

    it('accepts a spawn exactly at path[0] (zero distance)', () => {
      const spawn = makeSpawn({
        x: 2,
        z: 3,
        path: [
          { x: 2, z: 3 },
          { x: 4, z: 3 },
        ],
      });
      // No throw — the constructor should accept spawn === path[0].
      const e = new Enemy(spawn, { playerSpeed: 1, chaseMultiplier: 1.5 }, walledGrid());
      expect(e.path[0]).toEqual({ x: 2, z: 3 });
    });
  });
});
