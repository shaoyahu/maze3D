import { describe, it, expect } from 'vitest';
import {
  findPickupAt,
  crossesExit,
  onUseItem,
  applyDamage,
  shouldSurviveWin,
  shouldProgressSpawn,
  isPlayerCaughtByEnemy,
  ENEMY_INVULNERABLE_SECONDS,
  // P2-18
  findTrapAt,
  computeSlowMultiplier,
} from '../../src/game/Rules';
import { SPAWN_SCHEDULE_DEFAULT } from '../../src/maze/types';
import type { MazeData, SpawnSchedule, Trap } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 1 },
  walls: [[1, 1, 1], [1, 0, 1], [1, 1, 1]],
  pickups: [{ id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 5 }],
  rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
  traps: [],
  doors: [],
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

    // P2-11: requireAllPickups gating for 最终试炼.
    describe('with requireAllPickups (P2-11)', () => {
      const gatedMaze: MazeData = {
        ...maze,
        pickups: [
          { id: crypto.randomUUID(), x: 0, z: 1, type: 'time', value: 5 },
          { id: crypto.randomUUID(), x: 1, z: 1, type: 'time', value: 5 },
        ],
        rules: { ...maze.rules, requireAllPickups: true },
      };

      it('returns false when not all pickups collected, even on the exit cell', () => {
        expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, gatedMaze, 0)).toBe(false);
        expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, gatedMaze, 1)).toBe(false);
      });

      it('returns true once every pickup is collected', () => {
        expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, gatedMaze, 2)).toBe(true);
      });

      it('treats undefined collectedCount as 0 (fail closed)', () => {
        expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, gatedMaze)).toBe(false);
      });

      it('leaves non-gated levels alone', () => {
        expect(crossesExit({ x: 5, z: 3 }, { x: 5, z: 3 }, maze, 0)).toBe(true);
      });
    });
  });

  describe('isPlayerCaughtByEnemy (P2-11)', () => {
    it('is true only when health is 0 and the hit was from an enemy', () => {
      expect(isPlayerCaughtByEnemy(0, 'enemy')).toBe(true);
    });

    it('is false when health is still positive', () => {
      expect(isPlayerCaughtByEnemy(1, 'enemy')).toBe(false);
      expect(isPlayerCaughtByEnemy(2, 'enemy')).toBe(false);
    });

    it('is false when the killing blow was not from an enemy', () => {
      expect(isPlayerCaughtByEnemy(0, 'other')).toBe(false);
    });

    it('is false when the player still has health from an enemy hit', () => {
      expect(isPlayerCaughtByEnemy(2, 'other')).toBe(false);
    });
  });

  describe('onUseItem (P2-2 #10)', () => {
    const keyPickup = { id: crypto.randomUUID(), x: 0, z: 0, type: 'key' as const, value: 1 };

    it('returns flash=false when maze is null', () => {
      expect(onUseItem(0, [keyPickup, null], null)).toEqual({ flash: false, consumed: false, unlockedDoorId: null });
    });

    it('returns flash=false when the slot is empty', () => {
      expect(onUseItem(0, [null, null], maze)).toEqual({ flash: false, consumed: false, unlockedDoorId: null });
    });

    it('returns flash=false when the slot index is out of bounds', () => {
      // Cast: the runtime guard exists to protect against bad input that
      // bypassed the type system (e.g. wider `number` callers). The literal
      // 5 isn't assignable to `InventorySlot = 0 | 1` without a cast.
      expect(onUseItem(5 as unknown as 0 | 1, [keyPickup, null], maze)).toEqual({ flash: false, consumed: false, unlockedDoorId: null });
    });

    it('returns flash=true and consumed=false for a filled slot in the no-lock world', () => {
      // MVP has no lock cells, so a useItem only triggers a UI flash; future
      // P2-4a lock logic would flip consumed to true once a key opens a door.
      expect(onUseItem(0, [keyPickup, null], maze)).toEqual({ flash: true, consumed: false, unlockedDoorId: null });
    });

    it('works for slot 1 as well', () => {
      expect(onUseItem(1, [null, keyPickup], maze)).toEqual({ flash: true, consumed: false, unlockedDoorId: null });
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
    // F-2026-06-17-C-M-1: these three cases pin the finite/non-negative
    // guard. A corrupted level can hand us -Infinity, -1, or NaN through
    // `surviveSeconds` (initialTime + pickup values) or `elapsedTime` (a
    // buggy future caller), and the bare `>=` operator would award an
    // instant win or never award one.
    it('returns false when surviveSeconds is non-finite', () => {
      expect(shouldSurviveWin(100, Number.NaN)).toBe(false);
      expect(shouldSurviveWin(100, Number.POSITIVE_INFINITY)).toBe(false);
      expect(shouldSurviveWin(100, Number.NEGATIVE_INFINITY)).toBe(false);
    });
    it('returns false when surviveSeconds is zero or negative', () => {
      expect(shouldSurviveWin(0, 0)).toBe(false);
      expect(shouldSurviveWin(100, -1)).toBe(false);
    });
    it('returns false when elapsedTime is non-finite', () => {
      expect(shouldSurviveWin(Number.NaN, 30)).toBe(false);
      expect(shouldSurviveWin(Number.POSITIVE_INFINITY, 30)).toBe(false);
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

  // ── P2-18: findTrapAt ──
  describe('findTrapAt (P2-18)', () => {
    const traps: Trap[] = [
      { id: 'fire-1', x: 2, z: 2, kind: 'fire', damage: 1 },
      { id: 'water-1', x: 4, z: 4, kind: 'water', slowDurationSec: 2 },
    ];
    const cs = 2; // cellSize

    it('returns the trap when the player is on a trap cell', () => {
      // cell (2,2) → world (4,4) with cellSize 2
      const hit = findTrapAt({ x: 4.5, z: 4.5 }, traps, cs);
      expect(hit).toEqual(traps[0]);
    });

    it('returns the water trap when on that cell', () => {
      const hit = findTrapAt({ x: 8.5, z: 8.5 }, traps, cs);
      expect(hit).toEqual(traps[1]);
    });

    it('returns null when the player is not on any trap', () => {
      const miss = findTrapAt({ x: 0.5, z: 0.5 }, traps, cs);
      expect(miss).toBeNull();
    });

    it('returns null when traps array is empty', () => {
      expect(findTrapAt({ x: 4, z: 4 }, [], cs)).toBeNull();
    });
  });

  // ── P2-18: computeSlowMultiplier ──
  describe('computeSlowMultiplier (P2-18)', () => {
    it('returns 1.0 when not slowed (slowUntil <= now)', () => {
      expect(computeSlowMultiplier(10, 5)).toBe(1.0);
      expect(computeSlowMultiplier(10, 10)).toBe(1.0);
    });

    it('returns 0.5 when slowed (now < slowUntil)', () => {
      expect(computeSlowMultiplier(5, 10)).toBe(0.5);
    });

    it('returns 1.0 when slowUntil is 0 (never slowed)', () => {
      expect(computeSlowMultiplier(5, 0)).toBe(1.0);
    });
  });

  // ── P2-18: onUseItem with key + door ──
  describe('onUseItem key+door (P2-18)', () => {
    const doorId = 'door-red-1';
    const mazeWithDoor: MazeData = {
      ...maze,
      doors: [{ id: doorId, x: 1, z: 2, keyColor: 'red' }],
      pickups: [
        { id: 'key-red', x: 1, z: 1, type: 'key', value: 0, keyColor: 'red' },
      ],
    };

    // F-2026-07-01-C-1 + H-1: tests now use closedDoorCells (coordinate keys
    // "x,z") instead of openedDoorIds (door ids), and pass player cell
    // coordinates for adjacency checking.

    it('returns unlockedDoorId when a matching key opens an adjacent door', () => {
      // Player at cell (1,1), door at (1,2) — adjacent (Manhattan dist 1)
      const closedDoorCells = new Set<string>(['1,2']);
      const result = onUseItem(
        0,
        [mazeWithDoor.pickups[0]],
        mazeWithDoor,
        closedDoorCells,
        1, // playerCellX
        1, // playerCellZ
      );
      expect(result.unlockedDoorId).toBe(doorId);
      expect(result.consumed).toBe(true);
      expect(result.flash).toBe(true);
    });

    it('returns null unlockedDoorId when keyColor does not match', () => {
      const blueKey = { ...mazeWithDoor.pickups[0], keyColor: 'blue' as const, id: 'key-blue' };
      const closedDoorCells = new Set<string>(['1,2']);
      const result = onUseItem(0, [blueKey], mazeWithDoor, closedDoorCells, 1, 1);
      expect(result.unlockedDoorId).toBeNull();
      expect(result.consumed).toBe(false);
    });

    it('returns null unlockedDoorId when the door is already opened (not in closedDoorCells)', () => {
      // Door at (1,2) not in closedDoorCells means it's already open
      const closedDoorCells = new Set<string>();
      const result = onUseItem(
        0,
        [mazeWithDoor.pickups[0]],
        mazeWithDoor,
        closedDoorCells,
        1,
        1,
      );
      expect(result.unlockedDoorId).toBeNull();
    });

    it('returns null unlockedDoorId when key has no keyColor', () => {
      const plainKey = { ...mazeWithDoor.pickups[0], keyColor: undefined };
      const result = onUseItem(0, [plainKey], mazeWithDoor);
      expect(result.unlockedDoorId).toBeNull();
    });

    it('returns null unlockedDoorId when there are no doors', () => {
      const mazeNoDoors = { ...mazeWithDoor, doors: [] };
      const result = onUseItem(
        0,
        [mazeWithDoor.pickups[0]],
        mazeNoDoors,
      );
      expect(result.unlockedDoorId).toBeNull();
    });

    it('returns null unlockedDoorId when the door is not adjacent to the player (F-2026-07-01-H-1)', () => {
      // Player at cell (0,0), door at (1,2) — NOT adjacent (Manhattan dist 3)
      const closedDoorCells = new Set<string>(['1,2']);
      const result = onUseItem(
        0,
        [mazeWithDoor.pickups[0]],
        mazeWithDoor,
        closedDoorCells,
        0, // playerCellX — far away
        0, // playerCellZ — far away
      );
      expect(result.unlockedDoorId).toBeNull();
      expect(result.consumed).toBe(false);
    });

    it('returns unlockedDoorId when player is one cell away in any direction', () => {
      // Test all 4 adjacency directions
      const closedDoorCells = new Set<string>(['1,2']);
      // Player at (1,3) — south of door
      const resultSouth = onUseItem(0, [mazeWithDoor.pickups[0]], mazeWithDoor, closedDoorCells, 1, 3);
      expect(resultSouth.unlockedDoorId).toBe(doorId);
      // Player at (2,2) — east of door
      const resultEast = onUseItem(0, [mazeWithDoor.pickups[0]], mazeWithDoor, closedDoorCells, 2, 2);
      expect(resultEast.unlockedDoorId).toBe(doorId);
    });
  });
});
