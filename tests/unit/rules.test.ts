import { describe, it, expect } from 'vitest';
import {
  findPickupAt,
  crossesExit,
  onUseItem,
  applyDamage,
  shouldSurviveWin,
  shouldProgressSpawn,
  ENEMY_INVULNERABLE_SECONDS,
} from '../../src/game/Rules';
import { SPAWN_SCHEDULE_DEFAULT } from '../../src/maze/types';
import type { MazeData, SpawnSchedule } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 1 },
  walls: [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
  pickups: [{ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 5 }],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
};

describe('Rules', () => {
  it('findPickupAt returns the matching pickup or null', () => {
    const hit = findPickupAt({ x: 3, z: 3 }, maze, maze.pickups);
    expect(hit).toEqual(maze.pickups[0]);
    const miss = findPickupAt({ x: 1, z: 1 }, maze, []);
    expect(miss).toBeNull();
  });

  describe('crossesExit', () => {
    it('returns true when start is in the exit cell', () => {
      expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, maze)).toBe(true);
    });

    it('returns true when end is in the exit cell', () => {
      expect(crossesExit({ x: 1, z: 3 }, { x: 5, z: 3 }, maze)).toBe(true);
    });

    it('returns true when midpoint crosses the exit cell (tunneling guard)', () => {
      const start = { x: 3.9, z: 3 };
      const end = { x: 6.1, z: 3 };
      expect(crossesExit(start, start, maze)).toBe(false);
      expect(crossesExit(end, end, maze)).toBe(false);
      expect(crossesExit(start, end, maze)).toBe(true);
    });

    it('returns false when the segment does not touch the exit cell', () => {
      expect(crossesExit({ x: 1, z: 1 }, { x: 3, z: 3 }, maze)).toBe(false);
    });
  });

  describe('onUseItem (P2-2 #10)', () => {
    const keyPickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key' as const, value: 1 };

    it('returns flash=false when maze is null', () => {
      expect(onUseItem(0, [keyPickup, null], null)).toEqual({ flash: false, consumed: false });
    });

    it('returns flash=false when the slot is empty', () => {
      expect(onUseItem(0, [null, null], maze)).toEqual({ flash: false, consumed: false });
    });

    it('returns flash=false when the slot index is out of bounds', () => {
      // Cast: the runtime guard exists to protect against bad input that
      // bypassed the type system (e.g. wider `number` callers). The literal
      // 5 isn't assignable to `InventorySlot = 0 | 1` without a cast.
      expect(onUseItem(5 as unknown as 0 | 1, [keyPickup, null], maze)).toEqual({ flash: false, consumed: false });
    });

    it('returns flash=true and consumed=false for a filled slot in the no-lock world', () => {
      // MVP has no lock cells, so a useItem only triggers a UI flash; future
      // P2-4a lock logic would flip consumed to true once a key opens a door.
      expect(onUseItem(0, [keyPickup, null], maze)).toEqual({ flash: true, consumed: false });
    });

    it('works for slot 1 as well', () => {
      expect(onUseItem(1, [null, keyPickup], maze)).toEqual({ flash: true, consumed: false });
    });
  });

  describe('applyDamage (P2-4a)', () => {
    it('decrements health and arms the invulnerable window', () => {
      const r = applyDamage(3, 1, 0, 0);
      expect(r.health).toBe(2);
      expect(r.damaged).toBe(true);
      expect(r.invulnerableUntil).toBeCloseTo(ENEMY_INVULNERABLE_SECONDS);
    });

    it('clamps health to 0 when the hit would go below', () => {
      const r = applyDamage(1, 5, 0, 0);
      expect(r.health).toBe(0);
      expect(r.damaged).toBe(true);
    });

    it('refuses to apply damage inside the invulnerable window', () => {
      const r = applyDamage(3, 1, /* invulnerableUntil */ 1.0, /* now */ 0.5);
      expect(r.health).toBe(3);
      expect(r.damaged).toBe(false);
      expect(r.invulnerableUntil).toBe(1.0);
    });

    it('applies damage at the exact boundary (now === invulnerableUntil)', () => {
      // Strict < on `now < invulnerableUntil`, so a hit at the exact
      // boundary goes through and pushes the window forward.
      const r = applyDamage(3, 1, 0.5, 0.5);
      expect(r.health).toBe(2);
      expect(r.invulnerableUntil).toBeCloseTo(1.0);
    });
  });

  describe('shouldSurviveWin (P2-4a)', () => {
    it('returns false while elapsed < surviveSeconds', () => {
      expect(shouldSurviveWin(29, 30)).toBe(false);
    });
    it('returns true at or above the threshold', () => {
      expect(shouldSurviveWin(30, 30)).toBe(true);
      expect(shouldSurviveWin(31, 30)).toBe(true);
    });
  });

  describe('shouldProgressSpawn (P2-4a)', () => {
    const baseSchedule: SpawnSchedule = { ...SPAWN_SCHEDULE_DEFAULT };

    it('does nothing when disabled', () => {
      const r = shouldProgressSpawn({
        enabled: false,
        schedule: baseSchedule,
        elapsedTime: 100,
        lastSpawnAt: 0,
        pickupCount: 0,
        lastPickupCount: 0,
        currentEnemyCount: 3,
      });
      expect(r.triggered).toBe(false);
      expect(r.reason).toBeNull();
    });

    it('does nothing once the cap is reached', () => {
      const r = shouldProgressSpawn({
        enabled: true,
        schedule: baseSchedule,
        elapsedTime: 100,
        lastSpawnAt: 0,
        pickupCount: 5,
        lastPickupCount: 0,
        currentEnemyCount: 10,
      });
      expect(r.triggered).toBe(false);
    });

    it('triggers on the time interval', () => {
      const r = shouldProgressSpawn({
        enabled: true,
        schedule: baseSchedule,
        elapsedTime: 15,
        lastSpawnAt: 0,
        pickupCount: 0,
        lastPickupCount: 0,
        currentEnemyCount: 3,
      });
      expect(r.triggered).toBe(true);
      expect(r.reason).toBe('time');
      expect(r.nextEnemyCount).toBe(4);
    });

    it('triggers on a pickup when onPickup is true', () => {
      const r = shouldProgressSpawn({
        enabled: true,
        schedule: { ...baseSchedule, onPickup: true },
        elapsedTime: 1,
        lastSpawnAt: 0,
        pickupCount: 1,
        lastPickupCount: 0,
        currentEnemyCount: 3,
      });
      expect(r.triggered).toBe(true);
      expect(r.reason).toBe('pickup');
      expect(r.nextEnemyCount).toBe(4);
    });

    it('does not trigger on a pickup when onPickup is false', () => {
      const r = shouldProgressSpawn({
        enabled: true,
        schedule: { ...baseSchedule, onPickup: false },
        elapsedTime: 1,
        lastSpawnAt: 0,
        pickupCount: 1,
        lastPickupCount: 0,
        currentEnemyCount: 3,
      });
      expect(r.triggered).toBe(false);
    });

    it('caps the increment to ENEMY_COUNT_MAX when one short of the cap', () => {
      const r = shouldProgressSpawn({
        enabled: true,
        schedule: baseSchedule,
        elapsedTime: 15,
        lastSpawnAt: 0,
        pickupCount: 0,
        lastPickupCount: 0,
        currentEnemyCount: 9,
      });
      expect(r.triggered).toBe(true);
      expect(r.nextEnemyCount).toBe(10);
    });
  });
});
