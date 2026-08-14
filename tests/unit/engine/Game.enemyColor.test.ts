import { describe, it, expect, beforeEach } from 'vitest';
import { Enemy } from '../../../src/entities/Enemy';
import type { EnemySpawn } from '../../../src/maze/types';
import type { WallGrid } from '../../../src/engine/Collision';

// P1-7: per-instance color chase flash. The Enemy class owns
// the state machine + the `colorRamp` field; these tests pin
// the API contract that the Game tick relies on (and the
// P1-4 review flagged as a future polish candidate).
//
// We exercise the Enemy class directly here (no Three.js
// scene) so the tests stay fast and the contract stays in
// one place. The end-to-end "material color actually changes
// in the scene" assertion lives in the enemyRendering tests
// (which call buildScene and verify the userData refs).

function makeSpawn(over: Partial<EnemySpawn> = {}): EnemySpawn {
  return {
    id: 'e_test',
    x: 0,
    z: 0,
    path: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
    ...over,
  };
}

function makeGrid(): WallGrid {
  // Minimal open grid: 5x5 of all 0s. Enemy constructor reads
  // grid.cellSize for the spawn↔path[0] distance check; 2 is
  // the standard cellSize.
  return {
    width: 5,
    depth: 5,
    cellSize: 2,
    get: (_x: number, _z: number, _level: number) => 0,
  };
}

describe('P1-7 — per-instance color chase flash', () => {
  beforeEach(() => {
    // No-op: each test creates its own Enemy.
  });

  it('colorRamp starts null (no in-flight ramp on construction)', () => {
    const enemy = new Enemy(makeSpawn(), { playerSpeed: 2, chaseMultiplier: 1.5 }, makeGrid());
    expect(enemy.colorRamp).toBeNull();
  });

  it('startColorFlash(toColor, durationSec) sets colorRamp with the target hex + duration', () => {
    const enemy = new Enemy(makeSpawn(), { playerSpeed: 2, chaseMultiplier: 1.5 }, makeGrid());
    const before = performance.now();
    enemy.startColorFlash(0xff0000, 0.3);
    const ramp = enemy.colorRamp;
    expect(ramp).not.toBeNull();
    expect(ramp!.to).toBe(0xff0000);
    expect(ramp!.durationSec).toBe(0.3);
    // startMs is captured close to `before`; allow a small
    // window for the JS event-loop tick to advance.
    expect(ramp!.startMs).toBeGreaterThanOrEqual(before);
    expect(ramp!.startMs).toBeLessThanOrEqual(before + 50);
  });

  it('enterChase() kicks a 0.3s colorRamp toward red', () => {
    // Drive the state machine into chase. The cleanest way
    // without mocking the private methods is to position
    // the player inside the enemy's FOV and let update() do
    // the work. Default fovRange=3, fovAngleDeg=60 — the
    // enemy is at (0,0) heading east, so the player at
    // (0,0) is "in the cone" (distSq < 1e-8 path).
    const enemy = new Enemy(
      makeSpawn(),
      { playerSpeed: 2, chaseMultiplier: 1.5 },
      makeGrid(),
    );
    expect(enemy.state).toBe('patrol');
    // Initial position (0,0); player at (0,0); enemy heading
    // toward path[1] = (1,0) (east). canSeePlayer returns true
    // when distSq < 1e-8.
    enemy.update(0.016, { position: { x: 0, z: 0 } });
    expect(enemy.state).toBe('chase');
    expect(enemy.colorRamp).not.toBeNull();
    expect(enemy.colorRamp!.to).toBe(0xff0000);
    expect(enemy.colorRamp!.durationSec).toBe(0.3);
  });

  it('chase → patrol (0.5s alertTimer) kicks a 0.5s colorRamp back to base', () => {
    const enemy = new Enemy(
      makeSpawn(),
      { playerSpeed: 2, chaseMultiplier: 1.5 },
      makeGrid(),
    );
    // Force into chase first.
    enemy.update(0.016, { position: { x: 0, z: 0 } });
    expect(enemy.state).toBe('chase');
    // Now move the player outside the enemy's FOV. The
    // enemy needs to lose sight for ENEMY_CHASE_ALERT_SECONDS
    // (0.5s) before falling back to patrol — but the color
    // ramp starts immediately on enterPatrol (not on the
    // alert expiry), so we tick enough frames for the
    // alertTimer to elapse.
    enemy.update(0.016, { position: { x: 100, z: 100 } });
    // alertTimer was just reset to 0.5s by the previous
    // canSeePlayer check. Run enough ticks to drain it.
    for (let i = 0; i < 40; i++) {
      enemy.update(0.016, { position: { x: 100, z: 100 } });
    }
    expect(enemy.state).toBe('patrol');
    // enterPatrol kicks the back-to-base ramp.
    expect(enemy.colorRamp).not.toBeNull();
    expect(enemy.colorRamp!.to).toBe(0x553333);
    expect(enemy.colorRamp!.durationSec).toBe(0.5);
  });

  it('colorRamp is per-enemy (mutating one does not affect another)', () => {
    // Two enemies with identical spawns; each has its own
    // colorRamp. The Game tick is responsible for keeping
    // them in sync (driven by state changes), but the field
    // itself is per-instance.
    const enemy1 = new Enemy(makeSpawn({ id: 'e1' }), { playerSpeed: 2, chaseMultiplier: 1.5 }, makeGrid());
    const enemy2 = new Enemy(makeSpawn({ id: 'e2' }), { playerSpeed: 2, chaseMultiplier: 1.5 }, makeGrid());
    enemy1.startColorFlash(0xff0000, 0.3);
    expect(enemy2.colorRamp).toBeNull();
    expect(enemy1.colorRamp).not.toBeNull();
  });
});
