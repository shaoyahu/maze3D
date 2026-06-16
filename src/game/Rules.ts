import type { InventorySlot, MazeData, Pickup, SpawnSchedule } from '../maze/types';
import { ENEMY_COUNT_MAX, clampEnemyCount } from '../maze/types';

// Cell convention: cell i owns [i*cs, (i+1)*cs). floor() matches Collision.
// collidesAt's convention. Round-based "nearest center" disagrees at exact
// boundaries, causing findPickupAt to miss one-frame boundary hits.
function cellX(point: { x: number }, cs: number) { return Math.floor(point.x / cs); }
function cellZ(point: { z: number }, cs: number) { return Math.floor(point.z / cs); }

export function crossesExit(
  start: { x: number; z: number },
  end: { x: number; z: number },
  maze: MazeData,
  // P2-11: when maze.rules.requireAllPickups is true, the caller must
  // pass how many pickups the player has collected so far. The exit
  // only counts as "crossed" once every pickup has been collected.
  collectedCount?: number,
): boolean {
  // P2-11: `requireAllPickups` gate. Only checked when explicitly
  // enabled on the level (default off) — existing levels that don't
  // set the field keep the previous behavior.
  if (maze.rules.requireAllPickups) {
    const total = maze.pickups.length;
    const collected = collectedCount ?? 0;
    if (collected < total) return false;
  }
  // Sample start, end, and the midpoint so fast movement (dt spikes, debug
  // speed-up) cannot tunnel past the exit cell.
  const cs = maze.cellSize;
  const ex = maze.exit.x;
  const ez = maze.exit.z;
  if (cellX(start, cs) === ex && cellZ(start, cs) === ez) return true;
  if (cellX(end, cs) === ex && cellZ(end, cs) === ez) return true;
  const midX = Math.floor((start.x + end.x) / 2 / cs);
  const midZ = Math.floor((start.z + end.z) / 2 / cs);
  return midX === ex && midZ === ez;
}

export function findPickupAt(player: { x: number; z: number }, maze: MazeData, remaining: Pickup[]): Pickup | null {
  const cs = maze.cellSize;
  const px = cellX(player, cs);
  const pz = cellZ(player, cs);
  for (const p of remaining) {
    if (p.x === px && p.z === pz) return p;
  }
  return null;
}

// P2-2 #10: useItem handler. Pure function over (slot, inventory, maze) —
// the store action calls it and reacts to the result. In the current
// no-lock world the only effect is a UI flash; future P2-4a lock cells
// would be resolved here and `consumed` would flip to true once a key
// opens a door.
export interface UseItemResult {
  flash: boolean;
  consumed: boolean;
}

export function onUseItem(
  slot: InventorySlot,
  inventory: (Pickup | null)[],
  maze: MazeData | null,
): UseItemResult {
  if (!maze) return { flash: false, consumed: false };
  if (slot < 0 || slot >= inventory.length) return { flash: false, consumed: false };
  if (!inventory[slot]) return { flash: false, consumed: false };
  return { flash: true, consumed: false };
}

// ---------------------------------------------------------------------------
// P2-4a: damage + survive + progressive spawn
// ---------------------------------------------------------------------------

// Window after a hit during which the player is invulnerable. Multiple
// enemy contacts in the same window collapse into one damage event.
export const ENEMY_INVULNERABLE_SECONDS = 0.5;

// Pure damage calculator: if the player is still inside the invulnerable
// window, returns the existing health + an `damaged: false` flag. The
// engine's tick must pass a monotonically increasing `now` (in seconds)
// for the window to advance.
export function applyDamage(
  currentHealth: number,
  n: number,
  invulnerableUntil: number,
  now: number,
): { health: number; invulnerableUntil: number; damaged: boolean } {
  if (now < invulnerableUntil) {
    return { health: currentHealth, invulnerableUntil, damaged: false };
  }
  const health = Math.max(0, currentHealth - n);
  return {
    health,
    invulnerableUntil: now + ENEMY_INVULNERABLE_SECONDS,
    damaged: health < currentHealth,
  };
}

export function shouldSurviveWin(elapsedTime: number, surviveSeconds: number): boolean {
  return elapsedTime >= surviveSeconds;
}

// ---------------------------------------------------------------------------
// P2-11: tutorial-level "caught by enemy" completion signal
// ---------------------------------------------------------------------------

// Source of the hit that drove the player's health to 0. Only `'enemy'`
// qualifies for the tutorial `caught-by-enemy` WinOverlay path — falling
// off the world or any non-enemy damage should still go through GameOver.
// `lastHitBy: 'other'` is a deliberate catch-all so a future damage
// source (e.g. timed trap) doesn't accidentally trigger the tutorial
// completion path.
export type HitSource = 'enemy' | 'other';

// P2-11: returns true when the player has been caught by an enemy
// (`health === 0` and the killing blow was from an enemy hit). Used by
// Game.ts to branch into the `caught-by-enemy` WinOverlay path instead
// of GameOver. Pure function; safe to call per damage event.
export function isPlayerCaughtByEnemy(
  health: number,
  lastHitBy: HitSource,
): boolean {
  return health <= 0 && lastHitBy === 'enemy';
}

export interface SpawnTriggerInput {
  enabled: boolean;
  schedule: SpawnSchedule;
  elapsedTime: number;
  lastSpawnAt: number;
  pickupCount: number;
  lastPickupCount: number;
  currentEnemyCount: number;
}

export interface SpawnTriggerResult {
  triggered: boolean;
  reason: 'time' | 'pickup' | null;
  // Incremented by 1 (subject to the max). Returns the unchanged current
  // count when triggered is false or the cap is hit.
  nextEnemyCount: number;
}

// One-frame spawn trigger decision. Two independent triggers fire on
// `elapsedTime - lastSpawnAt >= intervalSec` (time) or
// `pickupCount > lastPickupCount` (pickup, when onPickup is true). Both
// clamp the result to the enemy-count maximum — the spec says enemies
// cap at 10, so even a flurry of pickups past the cap must not push
// past it. `enabled: false` short-circuits everything.
export function shouldProgressSpawn(input: SpawnTriggerInput): SpawnTriggerResult {
  if (!input.enabled) return { triggered: false, reason: null, nextEnemyCount: input.currentEnemyCount };
  if (input.currentEnemyCount >= ENEMY_COUNT_MAX) {
    return { triggered: false, reason: null, nextEnemyCount: input.currentEnemyCount };
  }
  if (input.schedule.onPickup && input.pickupCount > input.lastPickupCount) {
    // F-N5: spawn N enemies for N pickups collected in this tick, capped
    // by the remaining headroom under ENEMY_COUNT_MAX. Previously this
    // hardcoded +1, dropping the delta — 3 pickups in one frame spawned
    // only 1 enemy.
    const spawns = Math.min(
      ENEMY_COUNT_MAX - input.currentEnemyCount,
      input.pickupCount - input.lastPickupCount,
    );
    return {
      triggered: spawns > 0,
      reason: 'pickup',
      nextEnemyCount: input.currentEnemyCount + spawns,
    };
  }
  if (input.elapsedTime - input.lastSpawnAt >= input.schedule.intervalSec) {
    return {
      triggered: true,
      reason: 'time',
      nextEnemyCount: Math.min(ENEMY_COUNT_MAX, input.currentEnemyCount + 1),
    };
  }
  return { triggered: false, reason: null, nextEnemyCount: input.currentEnemyCount };
}

// P2-4a F14: combine the trigger decision with the state-update decision
// so the store no longer has to know that "when triggered, also advance
// lastSpawnAt / lastPickupCount". Without this, the store's tick carried
// an off-by-one risk — the `nextSpawnAt = elapsedTime + intervalSec`
// write used to live alongside the trigger check, and a future refactor
// could easily delete the write thinking it was redundant. The helper
// returns the new state only when triggered, so the store does a
// zero-write set() in the no-trigger path.
export interface ApplySpawnTriggerInput {
  enabled: boolean;
  schedule: SpawnSchedule;
  elapsedTime: number;
  lastSpawnAt: number;
  lastPickupCountForSpawn: number;
  pickupCountCollected: number;
  currentEnemyCount: number;
}

export interface ApplySpawnTriggerResult {
  triggered: boolean;
  reason: 'time' | 'pickup' | null;
  nextEnemyCount: number;
  newLastSpawnAt: number;
  newLastPickupCountForSpawn: number;
}

export function applySpawnTrigger(input: ApplySpawnTriggerInput): ApplySpawnTriggerResult {
  const trigger = shouldProgressSpawn({
    enabled: input.enabled,
    schedule: input.schedule,
    elapsedTime: input.elapsedTime,
    lastSpawnAt: input.lastSpawnAt,
    pickupCount: input.pickupCountCollected,
    lastPickupCount: input.lastPickupCountForSpawn,
    currentEnemyCount: input.currentEnemyCount,
  });
  if (!trigger.triggered) {
    return {
      triggered: false,
      reason: null,
      nextEnemyCount: input.currentEnemyCount,
      newLastSpawnAt: input.lastSpawnAt,
      newLastPickupCountForSpawn: input.lastPickupCountForSpawn,
    };
  }
  return {
    triggered: true,
    reason: trigger.reason,
    nextEnemyCount: trigger.nextEnemyCount,
    newLastSpawnAt: input.elapsedTime,
    newLastPickupCountForSpawn: input.pickupCountCollected,
  };
}

export { ENEMY_COUNT_MAX, clampEnemyCount };
