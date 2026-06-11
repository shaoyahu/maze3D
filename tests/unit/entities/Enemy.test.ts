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
    path: [
      { x: 2, z: 0 },
      { x: 2, z: 2 },
    ],
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<EnemySpawn> = {}, playerSpeed = 1, chaseMultiplier = 1.5) {
  return new Enemy(makeSpawn(overrides), { playerSpeed, chaseMultiplier }, walledGrid());
}

describe('Enemy', () => {
  describe('patrol→dwell→patrol cycle', () => {
    it('walks toward path[0], dwells, then advances to path[1]', () => {
      // F2 (P0): spawn at (0.5, 0.5) (cell-center) so the enemy's ENEMY_RADIUS=0.35
      // circle never overlaps a negative cell index — pre-fix tests put the
      // enemy at (0,0) which the new wall-aware moveToward correctly treats
      // as "out of bounds = wall" and refuses to leave. Path nodes shifted
      // by the same +0.5 offset keep the relative geometry identical.
      const e = makeEnemy(
        { x: 0.5, z: 0.5, path: [{ x: 1.5, z: 0.5 }, { x: 1.5, z: 1.5 }] },
        1,
        1.5,
      );
      // patrolSpeed = 0.6; dwellTime = 1.0
      const far = player(1000, 1000); // never in FOV

      // Frame 1: move 0.6 toward (1.5, 0.5). State still patrol.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);
      expect(e.position.x).toBeCloseTo(1.1);

      // Frame 2: move 0.4 more (clamped to remaining 0.4). Reaches (1.5, 0.5). State -> dwell.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      expect(e.currentTarget).toBe(0);
      expect(e.position.x).toBeCloseTo(1.5);

      // Frame 3: tickDwell with dt=1. dwellTimer = 1 - 1 = 0 -> advance target.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);

      // Frame 4: move 0.6 toward (1.5, 1.5). heading now points +Z.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.position.z).toBeCloseTo(1.1);
    });

    it('wraps target index back to 0 after the last node', () => {
      // F2 (P0): shift spawn off the (0,0) corner — see the comment in the
      // "walks toward path[0]" test for why. Path geometry shifted by the
      // same +0.5 offset to keep the wrap-around semantics identical.
      const e = makeEnemy(
        { x: 0.5, z: 0.5, path: [{ x: 1.5, z: 0.5 }, { x: 0.5, z: 0.5 }] },
        2,
        1.5,
      );
      // patrolSpeed = 1.2; path is 1 unit total, 2 nodes
      const far = player(1000, 1000);

      // Reach (1.5, 0.5) in 1 frame, then dwell 1s, then advance to (0.5, 0.5).
      e.update(1, far);
      expect(e.state).toBe('dwell');
      e.update(1, far); // dwellTimer expires
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);

      // Reach (0.5, 0.5), dwell, then wrap to target 0.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);
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
      // F2 (P0): same +0.5 offset as the other patrol tests.
      const e = makeEnemy(
        { x: 0.5, z: 0.5, path: [{ x: 1.5, z: 0.5 }, { x: 0.5, z: 0.5 }], dwellTime: 0 },
        2,
        1.5,
      );
      // patrolSpeed = 1.2; path is 1 unit, reached in 1 frame.
      const far = player(1000, 1000);
      e.update(1, far); // reaches (1.5, 0.5) -> state = dwell, dwellTimer = 0
      expect(e.state).toBe('dwell');
      e.update(0.001, far); // dwellTimer <= 0 -> advance target
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);
    });
  });

  describe('constructor validation', () => {
    it('throws when the path has fewer than 2 nodes', () => {
      expect(() => makeEnemy({ path: [{ x: 0, z: 0 }] })).toThrow(/at least 2 nodes/);
      expect(() => makeEnemy({ path: [] })).toThrow(/at least 2 nodes/);
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
      // F2 (P0): path[0] must differ from the spawn position — otherwise
      // moveToward returns true on dist=0 in the very first tickPatrol
      // call and the enemy enters dwell (and never gets to chase). The
      // first patrol hop is from (0.5, 0.5) to (2.5, 0.5) — same geometry
      // as before, just with the path ordered target-first.
      const e = new Enemy(
        {
          id: 'e1',
          x: 0.5,
          z: 0.5,
          path: [
            { x: 2.5, z: 0.5 },
            { x: 0.5, z: 0.5 },
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
      const e = new Enemy(
        {
          id: 'e1',
          x: 0.5,
          z: 0.5,
          path: [
            { x: 2.5, z: 0.5 },
            { x: 0.5, z: 0.5 },
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
});
