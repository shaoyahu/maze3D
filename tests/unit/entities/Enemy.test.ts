import { describe, it, expect } from 'vitest';
import { Enemy, type EnemyPlayerRef } from '../../../src/entities/Enemy';
import type { EnemySpawn } from '../../../src/maze/types';

const player = (x: number, z: number): EnemyPlayerRef => ({ position: { x, z } });

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
  return new Enemy(makeSpawn(overrides), { playerSpeed, chaseMultiplier });
}

describe('Enemy', () => {
  describe('patrol→dwell→patrol cycle', () => {
    it('walks toward path[0], dwells, then advances to path[1]', () => {
      const e = makeEnemy({ path: [{ x: 1, z: 0 }, { x: 1, z: 1 }] }, 1, 1.5);
      // patrolSpeed = 0.6; dwellTime = 1.0
      const far = player(1000, 1000); // never in FOV

      // Frame 1: move 0.6 toward (1,0). State still patrol.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(0);
      expect(e.position.x).toBeCloseTo(0.6);

      // Frame 2: move 0.4 more (clamped to remaining 0.4). Reaches (1,0). State -> dwell.
      e.update(1, far);
      expect(e.state).toBe('dwell');
      expect(e.currentTarget).toBe(0);
      expect(e.position.x).toBeCloseTo(1);

      // Frame 3: tickDwell with dt=1. dwellTimer = 1 - 1 = 0 -> advance target.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);

      // Frame 4: move 0.6 toward (1,1). heading now points +Z.
      e.update(1, far);
      expect(e.state).toBe('patrol');
      expect(e.position.z).toBeCloseTo(0.6);
    });

    it('wraps target index back to 0 after the last node', () => {
      const e = makeEnemy({ path: [{ x: 1, z: 0 }, { x: 0, z: 0 }] }, 2, 1.5);
      // patrolSpeed = 1.2; path is 1 unit total, 2 nodes
      const far = player(1000, 1000);

      // Reach (1,0) in 1 frame, then dwell 1s, then advance to (0,0).
      e.update(1, far);
      expect(e.state).toBe('dwell');
      e.update(1, far); // dwellTimer expires
      expect(e.state).toBe('patrol');
      expect(e.currentTarget).toBe(1);

      // Reach (0,0), dwell, then wrap to target 0.
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
      const e = makeEnemy({ path: [{ x: 1, z: 0 }, { x: 0, z: 0 }], dwellTime: 0 }, 2, 1.5);
      // patrolSpeed = 1.2; path is 1 unit, reached in 1 frame.
      const far = player(1000, 1000);
      e.update(1, far); // reaches (1,0) -> state = dwell, dwellTimer = 0
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
});
