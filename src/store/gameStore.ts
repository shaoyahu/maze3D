import { create } from 'zustand';
import {
  INVENTORY_SIZE,
  SPAWN_SCHEDULE_DEFAULT,
  SURVIVE_SECONDS_DEFAULT,
  type InventorySlot,
  type MazeData,
  type Pickup,
  type SpawnSchedule,
  type StartLevelOptions,
  type VictoryType,
  clampEnemyCount,
  normalizeSurviveSeconds,
} from '../maze/types';
import { injectEnemySpawns } from '../maze/enemySpawner';
import {
  applyDamage,
  applySpawnTrigger,
  onUseItem,
  shouldSurviveWin,
} from '../game/Rules';

// P2-3 spec §5/FR-8: time-trial mode forces a 180s budget regardless of
// the maze's own initialTime. reach-exit (and any future mode that doesn't
// override) keeps whatever the maze declares so per-level tuning still works.
const TIME_TRIAL_INITIAL_TIME = 180;

export type Screen = 'menu' | 'playing' | 'paused' | 'game-over' | 'win';

export interface GameState {
  screen: Screen;
  currentLevelId: string | null;
  currentMaze: MazeData | null;
  timeRemaining: number;
  health: number;
  pickupCount: { collected: number; total: number };
  inventory: (Pickup | null)[];
  lastWinIsNewRecord: boolean | null;
  // Wall-clock time spent in the current level (pauses excluded). Separate
  // from timeRemaining because time pickups can push it past initialTime,
  // making initialTime - timeRemaining negative.
  elapsedTime: number;
  // Bumped on every startLevel() call so React effects (e.g. GameCanvas's
  // level-reset effect) can observe "retry happened" even when the new
  // maze id matches the old one. Without this, a retry on the same level
  // would be invisible to effects keyed on maze.id.
  restartKey: number;
  // P2-2 #9: transient flash trigger for InventoryBar. Bumped on every
  // valid useItem so the UI can use it as a React key to re-trigger the
  // one-shot CSS flash animation. Null when no flash is pending.
  useItemFlash: { slot: InventorySlot; version: number } | null;
  // P2-3: the active victory mode for the current level. Defaults to
  // maze.rules.victory; can be overridden by StartLevelOptions.mode. Both
  // current modes use the same countdown→game-over tick path; the only
  // difference is that time-trial forces a 180s budget (see startLevel
  // below) so the player has a hard time limit, while reach-exit honours
  // whatever initialTime the maze declares.
  currentMode: VictoryType;

  // P2-4a: survive-mode target in seconds. time-trial uses timeRemaining;
  // survive uses elapsedTime >= currentSurviveSeconds -> win.
  //
  // F5: typed as `number` (not the `SurviveSeconds` literal union) so
  // time pickups can extend the survive countdown at runtime past the
  // 30/60/90/120 menu presets. The menu/options entry point is still
  // guarded by `normalizeSurviveSeconds` in `startLevel`, so the value
  // is always a valid preset on level start; pickups then add to it.
  currentSurviveSeconds: number;
  // P2-4a: invulnerability window. Wall-clock time the player is
  // protected until, so a second enemy contact in the same window
  // collapses into a no-op. Updated by damage(); 0 = not invulnerable.
  invulnerableUntil: number;
  // P2-4a F4: monotonic counter of damage events (real or absorbed by
  // the invuln window). HealthBar / InvulnerableFlash subscribe to this
  // so the flash animation re-triggers on every hit, even when the
  // second hit lands inside the 0.5s window and is a no-op for health.
  hitCount: number;
  // P2-4a: progressive spawn scheduler state. SpawnSchedule comes from
  // StartLevelOptions.spawnSchedule; initial count is
  // StartLevelOptions.enemyCount (default 3). The counter increments up
  // to ENEMY_COUNT_MAX (10) on each fire of shouldProgressSpawn.
  spawnSchedule: SpawnSchedule;
  progressiveEnemyCount: number;
  // F9: the actual count of enemies in the current level after
  // startLevel() injects hand-crafted + spawner-generated spawns. The
  // HUD's EnemyCounter reads this; progressiveEnemyCount is a spawn-
  // event tally, not a scene-reflected count, so the two diverge in
  // any level that uses the progressive scheduler.
  currentEnemyCount: number;
  // P2-4a F12: dropped `nextSpawnAt` — it was just `lastSpawnAt + intervalSec`
  // and required an off-by-one careful re-derivation. The trigger only needs
  // the last fire time; the next fire is derived as `lastSpawnAt + intervalSec`
  // on demand inside shouldProgressSpawn.
  lastSpawnAt: number;
  lastPickupCountForSpawn: number;

  startLevel: (maze: MazeData, options?: StartLevelOptions) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => boolean;
  // P2-4a F5: `now` defaults to wall-clock seconds so backgrounded tabs
  // (rAF throttled to 1Hz) cannot freeze the invulnerability window. Tests
  // pass an explicit `now` to make the timing deterministic.
  damage: (n: number, now?: number) => void;
  useItem: (slot: InventorySlot) => void;
  reachExit: (isNewRecord?: boolean) => void;
  goToMenu: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  currentLevelId: null,
  currentMaze: null,
  timeRemaining: 0,
  health: 0,
  pickupCount: { collected: 0, total: 0 },
  inventory: Array(INVENTORY_SIZE).fill(null),
  lastWinIsNewRecord: null,
  elapsedTime: 0,
  restartKey: 0,
  useItemFlash: null,
  currentMode: 'reach-exit',
  currentSurviveSeconds: SURVIVE_SECONDS_DEFAULT,
  invulnerableUntil: 0,
  hitCount: 0,
  spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT },
  progressiveEnemyCount: 0,
  currentEnemyCount: 0,
  lastSpawnAt: 0,
  lastPickupCountForSpawn: 0,

  startLevel: (maze, options) =>
    set((s) => {
      const surviveSeconds = normalizeSurviveSeconds(options?.surviveSeconds);
      // P2-5 FR-18: enemy spawner injection is hard-gated to survive mode. Other
      // modes honor the user's enemyCount only as a UI hint — the store / engine
      // sees 0 so the HUD and scene agree. FR-21: hand-crafted maze.enemies are
      // design intent, not procedural injection, so they always count.
      const mode: VictoryType = options?.mode ?? maze.rules.victory;
      const requestedEnemyCount =
        mode === 'survive' ? clampEnemyCount(options?.enemyCount) : 0;
      // F9: compute the actual count of enemies after spawner injection.
      // We call injectEnemySpawns here (mirroring Game.startLevel) so the
      // HUD can show the real number; the function is pure and produces
      // the same result for the same (maze, enemyCount) input.
      const injectedEnemies = injectEnemySpawns(maze, requestedEnemyCount);
      const totalEnemyCount = maze.enemies.length + injectedEnemies.length;
      return {
        screen: 'playing',
        currentLevelId: maze.id,
        currentMaze: maze,
        timeRemaining:
          options?.mode === 'time-trial' ? TIME_TRIAL_INITIAL_TIME : maze.rules.initialTime,
        health: maze.rules.maxHealth,
        pickupCount: { collected: 0, total: maze.pickups.length },
        inventory: Array(INVENTORY_SIZE).fill(null),
        lastWinIsNewRecord: null,
        elapsedTime: 0,
        restartKey: s.restartKey + 1,
        useItemFlash: null,
        currentMode: options?.mode ?? maze.rules.victory,
        currentSurviveSeconds: surviveSeconds,
        invulnerableUntil: 0,
        hitCount: 0,
        spawnSchedule: { ...(options?.spawnSchedule ?? SPAWN_SCHEDULE_DEFAULT) },
        progressiveEnemyCount: requestedEnemyCount,
        currentEnemyCount: totalEnemyCount,
        // F12: `lastSpawnAt: 0` means the first interval-based trigger fires
        // at elapsedTime === intervalSec (i.e. intervalSec seconds into the
        // level). Pickup trigger arms immediately via lastPickupCountForSpawn.
        lastSpawnAt: 0,
        lastPickupCountForSpawn: 0,
      };
    }),

  pause: () => {
    if (get().screen === 'playing') set({ screen: 'paused' });
  },
  resume: () => {
    if (get().screen === 'paused') set({ screen: 'playing' });
  },

  tick: (dt) => {
    const s = get();
    if (s.screen !== 'playing') return;
    // P2-4a: survive mode's win condition runs on elapsedTime instead
    // of timeRemaining. Win is checked before the per-mode countdown
    // so the winning frame doesn't also push timeRemaining to zero on
    // a level that doesn't use it.
    if (s.currentMode === 'survive') {
      const newElapsed = s.elapsedTime + dt;
      if (shouldSurviveWin(newElapsed, s.currentSurviveSeconds)) {
        set({
          screen: 'win',
          elapsedTime: s.currentSurviveSeconds,
        });
        return;
      }
      set({ elapsedTime: newElapsed });
      // Fall through to the progressive-spawn check below.
    } else {
      // reach-exit and time-trial share the countdown→game-over path;
      // the mode only differs in the initial timeRemaining that
      // startLevel seeded (see TIME_TRIAL_INITIAL_TIME).
      const newElapsed = s.elapsedTime + dt;
      const next = s.timeRemaining - dt;
      if (next <= 0) {
        // Player was only alive for s.timeRemaining seconds of this frame —
        // the (dt - s.timeRemaining) tail is wall-clock time after they were
        // already dead, so don't count it.
        set({ timeRemaining: 0, screen: 'game-over', elapsedTime: s.elapsedTime + s.timeRemaining });
        return;
      }
      set({ timeRemaining: next, elapsedTime: newElapsed });
    }
    // Progressive spawn trigger — both time-based and pickup-based fire
    // here, with pickup handled implicitly via the pickupCount delta
    // (lastPickupCountForSpawn only advances on a successful pickup
    // action, see pickup() below). The count caps at ENEMY_COUNT_MAX
    // inside shouldProgressSpawn.
    // P2-4a F12 + F14: the helper combines the trigger decision with the
    // state-update decision, so the store no longer needs to know the
    // "nextSpawnAt" math. No-trigger path is a zero-write set() below.
    const result = applySpawnTrigger({
      enabled: s.spawnSchedule.enabled,
      schedule: s.spawnSchedule,
      elapsedTime: get().elapsedTime,
      lastSpawnAt: s.lastSpawnAt,
      lastPickupCountForSpawn: s.lastPickupCountForSpawn,
      pickupCountCollected: get().pickupCount.collected,
      currentEnemyCount: get().progressiveEnemyCount,
    });
    if (result.triggered) {
      set({
        progressiveEnemyCount: result.nextEnemyCount,
        lastSpawnAt: result.newLastSpawnAt,
        lastPickupCountForSpawn: result.newLastPickupCountForSpawn,
      });
    }
  },

  pickup: (p): boolean => {
    const s = get();
    if (s.screen !== 'playing') return false;
    if (p.type === 'time') {
      // F5 (P1): per-pickup `value` (when positive) overrides the level's
      // `rules.timeOnPickup` default. The old `s.currentMaze?.rules.timeOnPickup ?? p.value`
      // made `p.value` dead code: `validateMaze` (JsonMazeProvider:156-160)
      // forces `timeOnPickup` to be a finite positive number, so the
      // right-hand side of `??` was unreachable. Health and key pickups
      // already use `p.value` — time now matches that contract.
      //
      // The same bonus is also added to `currentSurviveSeconds` in survive
      // mode so the HUD countdown (`currentSurviveSeconds - elapsedTime`,
      // HUD.tsx:21-23) actually moves when a time pickup is grabbed.
      // Without this branch the bonus silently grows `timeRemaining` —
      // a field the player never sees in survive mode — so the pickup
      // looked broken to the player.
      const rulesBonus = s.currentMaze?.rules.timeOnPickup ?? 0;
      const bonus = p.value > 0 ? p.value : rulesBonus;
      set({
        timeRemaining: s.timeRemaining + bonus,
        currentSurviveSeconds:
          s.currentMode === 'survive' ? s.currentSurviveSeconds + bonus : s.currentSurviveSeconds,
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
      return true;
    }
    if (p.type === 'health') {
      const maxHealth = s.currentMaze?.rules.maxHealth ?? p.value;
      const newHealth = Math.min(maxHealth, s.health + p.value);
      set({
        health: newHealth,
        pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
      });
      return true;
    }
    if (p.type === 'key') {
      const inv = [...s.inventory];
      const idx = inv.findIndex((slot) => slot === null);
      if (idx >= 0) {
        inv[idx] = p;
        set({
          inventory: inv,
          pickupCount: { ...s.pickupCount, collected: s.pickupCount.collected + 1 },
        });
        return true;
      }
      // Inventory full — the engine must keep the pickup in the world.
      return false;
    }
    console.warn(`gameStore.pickup: unknown pickup type '${p.type}', dropping`, p);
    return false;
  },

  damage: (n, now) => {
    const s = get();
    if (s.screen !== 'playing') return;
    // P2-4a F4: bump the hit counter unconditionally. Even when the call
    // collapses into an invuln-window no-op (no health change), the UI
    // still needs to re-trigger the flash animation so a second contact
    // during the window is visually acknowledged.
    // P2-4a F5: wall-clock time, not elapsedTime. elapsedTime is advanced
    // only inside tick(), which is driven by rAF — when the tab is back-
    // grounded browsers throttle rAF to 1Hz, so elapsedTime would freeze
    // and the player could be stuck invulnerable long after the 0.5s
    // window. Date.now() keeps marching even when the tab is hidden.
    const result = applyDamage(
      s.health,
      n,
      s.invulnerableUntil,
      now ?? Date.now() / 1000,
    );
    if (!result.damaged) {
      set({ hitCount: s.hitCount + 1 });
      return;
    }
    if (result.health <= 0) {
      set({
        health: 0,
        screen: 'game-over',
        invulnerableUntil: result.invulnerableUntil,
        hitCount: s.hitCount + 1,
      });
    } else {
      set({
        health: result.health,
        invulnerableUntil: result.invulnerableUntil,
        hitCount: s.hitCount + 1,
      });
    }
  },

  useItem: (slot) => {
    const s = get();
    if (s.screen !== 'playing') {
    // F3: surface the silent ignore so a Digit1/Digit2 press during
    // pause / game-over / win / menu is visible in the console.
    console.debug('[useItem] ignored: screen =', s.screen);
      return;
  }
    const result = onUseItem(slot, s.inventory, s.currentMaze);
    if (!result.flash) return;
    // TODO(P2-4a): when result.consumed flips to true, clear inventory[slot]
    // so the key can't be reused. Rules.onUseItem currently never sets
    // consumed (no lock cells exist yet), but the contract is in place.
    set({
      useItemFlash: { slot, version: (s.useItemFlash?.version ?? 0) + 1 },
    });
  },

  reachExit: (isNewRecord) => {
    if (get().screen === 'playing') set({ screen: 'win', lastWinIsNewRecord: isNewRecord ?? null });
  },

  goToMenu: () =>
    set({
      screen: 'menu',
      currentLevelId: null,
      currentMaze: null,
      timeRemaining: 0,
      health: 0,
      pickupCount: { collected: 0, total: 0 },
      inventory: Array(INVENTORY_SIZE).fill(null),
      lastWinIsNewRecord: null,
      elapsedTime: 0,
      restartKey: 0,
      useItemFlash: null,
      currentSurviveSeconds: SURVIVE_SECONDS_DEFAULT,
      invulnerableUntil: 0,
      // P2-4a F4: hitCount is the monotonic counter HealthBar/InvulnerableFlash
      // use to re-trigger the flash animation on every contact. Reset it
      // here so a previous run's damage history doesn't carry into a fresh
      // session and re-trigger a stale flash on the next level.
      hitCount: 0,
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT },
      progressiveEnemyCount: 0,
      lastSpawnAt: 0,
      lastPickupCountForSpawn: 0,
    }),
}));
