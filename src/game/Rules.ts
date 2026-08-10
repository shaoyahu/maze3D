import type { InventorySlot, KeyColor, MazeData, Pickup, SpawnSchedule, Trap } from '../maze/types';
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
  // F-2026-07-01-FCR-M-6: defense-in-depth guard. `JsonMazeProvider.validateMaze`
  // already rejects `cellSize <= 0`, but if a future provider bypasses
  // validation (EditorMazeProvider, programmatic test fixtures), a 0 cell
  // size would make `cellX` / `cellZ` return Infinity and this function
  // would silently always return false. Mirror `shouldSurviveWin`'s pattern.
  if (!Number.isFinite(cs) || cs <= 0) return false;
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
  // F-2026-07-01-FCR-M-6: defense-in-depth guard (see crossesExit).
  if (!Number.isFinite(cs) || cs <= 0) return null;
  const px = cellX(player, cs);
  const pz = cellZ(player, cs);
  for (const p of remaining) {
    if (p.x === px && p.z === pz) return p;
  }
  return null;
}

// P2-18: find the trap at the player's current cell, if any. Returns
// null when the cell has no trap or the trap is on a wall cell (shouldn't
// happen in valid levels, but guards against corrupted data).
export function findTrapAt(
  player: { x: number; z: number },
  traps: Trap[],
  cs: number,
): Trap | null {
  // F-2026-07-01-FCR-M-6: defense-in-depth guard (see crossesExit). findTrapAt
  // takes `cs` as an explicit parameter, so we guard it here directly.
  if (!Number.isFinite(cs) || cs <= 0) return null;
  const px = cellX(player, cs);
  const pz = cellZ(player, cs);
  for (const t of traps) {
    if (t.x === px && t.z === pz) return t;
  }
  return null;
}

// P2-18: compute the speed multiplier based on whether the player is
// currently slowed by a water trap. Returns 1.0 when not slowed, 0.5
// when slowed. The caller (Game.update) re-applies this every frame.
export function computeSlowMultiplier(now: number, slowUntil: number): number {
  if (now < slowUntil) return 0.5;
  return 1.0;
}

// P2-2 #10: useItem handler. Pure function over (slot, inventory, maze) —
// the store action calls it and reacts to the result.
export interface UseItemResult {
  flash: boolean;
  consumed: boolean;
  // P2-18: when the used item is a key with a keyColor that matches an
  // adjacent closed door, this is that door's id. The store uses it to
  // call bridge.onDoorUnlocked(id). Null when no door was unlocked.
  unlockedDoorId: string | null;
}

export function onUseItem(
  slot: InventorySlot,
  inventory: (Pickup | null)[],
  maze: MazeData | null,
  // P2-18: set of "x,z" coordinate keys for doors that are still closed.
  // Closed doors not in this set are considered open (already unlocked).
  // F-2026-07-01-FCR-C-1: changed from openedDoorIds (door ids) to
  // closedDoorCells (coordinate strings) for consistency with the
  // collision system.
  closedDoorCells?: ReadonlySet<string>,
  // P2-18: player's current cell coordinates, needed for adjacency check.
  // F-2026-07-01-FCR-H-1: added so findAdjacentDoorForUnlock can verify
  // the player is actually next to the door before unlocking.
  playerCellX?: number,
  playerCellZ?: number,
): UseItemResult {
  if (!maze) return { flash: false, consumed: false, unlockedDoorId: null };
  if (slot < 0 || slot >= inventory.length) return { flash: false, consumed: false, unlockedDoorId: null };
  const item = inventory[slot];
  if (!item) return { flash: false, consumed: false, unlockedDoorId: null };

  // P2-18: key + keyColor → try to unlock an adjacent matching door.
  if (item.type === 'key' && item.keyColor) {
    const doorId = findAdjacentDoorForUnlock(
      item.keyColor,
      playerCellX ?? -1,
      playerCellZ ?? -1,
      maze,
      closedDoorCells,
    );
    if (doorId) {
      return { flash: true, consumed: true, unlockedDoorId: doorId };
    }
  }

  return { flash: true, consumed: false, unlockedDoorId: null };
}

// P2-18: find a closed door adjacent to the player's current cell that
// matches the given key color. "Adjacent" = 4-neighbour (Manhattan
// distance 1). Returns the first matching door id, or null.
// F-2026-07-01-FCR-C-1: changed parameter from openedDoorIds (door ids) to
// closedDoorCells ("x,z" coordinate keys) to match the key space used
// by the collision system.
function findAdjacentDoorForUnlock(
  keyColor: KeyColor,
  playerX: number,
  playerZ: number,
  maze: MazeData,
  closedDoorCells?: ReadonlySet<string>,
): string | null {
  const closedSet = closedDoorCells ?? new Set<string>();
  // F-2026-07-01-FCR-H-1: check 4-neighbour cells (Manhattan distance 1)
  // instead of scanning all doors. This matches the function name and
  // the design spec's "adjacent" requirement.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    const nx = playerX + dx;
    const nz = playerZ + dz;
    for (const door of maze.doors) {
      if (door.x !== nx || door.z !== nz) continue;
      if (door.keyColor !== keyColor) continue;
      // Door is still closed if its cell is in closedDoorCells
      if (!closedSet.has(`${door.x},${door.z}`)) continue;
      return door.id;
    }
  }
  return null;
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
  // F-2026-06-17-C-M-1: the elapsed time coming out of a requestAnimationFrame
  // loop is always finite in practice (Loop.ts clamps dt to 0.1s), but the
  // surviveSeconds value flows through several layers (initialTime +
  // timeOnPickup pickups + the surviveSeconds field on a loaded level).
  // A corrupted level (or a future direct caller of shouldSurviveWin) can
  // hand us -Infinity, -1, or 0. Without this guard, `elapsedTime(0) >= -1`
  // is true on the very first frame, awarding an instant survive win, and
  // `Infinity >= surviveSeconds` is also true after a single frame.
  if (!Number.isFinite(elapsedTime) || !Number.isFinite(surviveSeconds)) return false;
  if (surviveSeconds <= 0) return false;
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
  // P3-1 fix-progressive-max (P2 follow-up): the per-tick cap
  // is the user-set `schedule.max` (defaulted to
  // `SPAWN_PROGRESSIVE_MAX_DEFAULT` = 10), not the global
  // `ENEMY_COUNT_MAX`. The old hardcoded `ENEMY_COUNT_MAX`
  // meant a "渐进上限=3" UI pick would be honored at the
  // initial `injectEnemySpawns` call (the Session's first
  // batch) but silently reverted to the global cap as soon
  // as the per-tick progressive trigger fired. Both sites
  // now use the same `schedule.max` field.
  const cap = input.schedule.max ?? ENEMY_COUNT_MAX;
  if (!input.enabled) return { triggered: false, reason: null, nextEnemyCount: input.currentEnemyCount };
  if (input.currentEnemyCount >= cap) {
    return { triggered: false, reason: null, nextEnemyCount: input.currentEnemyCount };
  }
  if (input.schedule.onPickup && input.pickupCount > input.lastPickupCount) {
    // F-N5: spawn N enemies for N pickups collected in this tick, capped
    // by the remaining headroom under `schedule.max`. Previously this
    // hardcoded +1, dropping the delta — 3 pickups in one frame spawned
    // only 1 enemy. The `cap` swap (P3-1 fix-progressive-max)
    // mirrors the early-return guard above.
    const spawns = Math.min(
      cap - input.currentEnemyCount,
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
      nextEnemyCount: Math.min(cap, input.currentEnemyCount + 1),
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
