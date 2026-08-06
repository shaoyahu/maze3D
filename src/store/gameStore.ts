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
  computeSlowMultiplier,
  onUseItem,
  shouldSurviveWin,
} from '../game/Rules';
import {
  createEmptyParchment,
  type ParchmentState,
} from '../engine/ParchmentState';

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

  // P2-11: source of the most recent damage event that actually changed
  // health (i.e. wasn't absorbed by the invulnerability window). Used by
  // `damage()` to decide whether a 0-health event routes to the
  // 'caught-by-enemy' WinOverlay path (when the level's victory mode
  // is also 'caught-by-enemy') or the regular 'game-over' path.
  lastHitBy: 'enemy' | 'other';
  // P2-11: distinguishes a reach-exit win from a caught-by-enemy win so
  // WinOverlay can pick the right copy ("通关！" vs "被追上了 — 教学完成").
  // Null when the player hasn't won yet.
  lastWinKind: 'reach-exit' | 'caught-by-enemy' | null;

  // P2-18: wall-clock timestamp (seconds) until which the player is slowed
  // by a water trap. 0 = not slowed. The engine reads this via
  // getPlayerSpeedMultiplier() to recalculate player.speed per frame.
  slowUntil: number;
  // P2-18: id of the most recently unlocked door, set by useItem when
  // a key+door match is found. The bridge's onUseItem reads this to
  // call game.openDoor(id). Reset to null after the bridge consumes it.
  lastUnlockedDoorId: string | null;

  // F-2026-06-30: P2-16 — hand-held parchment map state. Mirrors the
  // engine-side `Game.parchment` field; the engine pushes via
  // `setParchment` on every reference change, and the UI subscribes
  // through this store. Lives on the menu screen too (with an empty
  // initial value) so the component tree doesn't have to special-case
  // "no level loaded".
  // F-2026-06-30-H-2: double-bookkept with engine; future refactor
  // should pick a single source of truth (likely the engine, with the
  // store as a derived snapshot or a thin subscription). The current
  // shape — both sides hold a `ParchmentState` and the engine
  // round-trips updates through the store via `setParchment` — is
  // correct but redundant; consolidating will require unwinding the
  // engine→store→UI push without breaking the M-key open/close path.
  parchment: ParchmentState;
  // F-2026-06-30: P2-16 — UI-driven open/close + reset. The M-key
  // handler in GameCanvas calls these; they forward to the engine
  // through the GameBridge so the engine's per-tick pause-while-open
  // guard stays in sync with the UI's modal state.
  openParchment: () => void;
  closeParchment: () => void;
  toggleParchment: () => void;
  resetParchment: () => void;
  // F-2026-06-30: P2-16 — engine → store push. GameBridge's
  // onParchmentStateChange wires to this; the store replaces the
  // whole reference (ParchmentState is immutable per recordVisit /
  // maybeRecordDamage, so a fresh reference means a real change).
  setParchment: (state: ParchmentState) => void;

  // P3-1: UI-side mirror of the player's current layer. The engine
  // owns the authoritative value (`Game.playerLevel`) and pushes it
  // through the bridge's `onLevelChange` callback in GameCanvas;
  // `setCurrentLevel` writes it here so HUD's LevelIndicator,
  // Minimap's auto-switcher, and ParchmentMap's default tab can
  // subscribe via Zustand. `null` when no level is active
  // (pre-startLevel / post-goToMenu); the consumers treat `null` as
  // "no level" via `s.player?.currentLevel ?? 0`.
  player: { currentLevel: number } | null;
  setCurrentLevel: (level: number) => void;

  startLevel: (maze: MazeData, options?: StartLevelOptions) => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  pickup: (p: Pickup) => boolean;
  // P2-4a F5: `now` defaults to wall-clock seconds so backgrounded tabs
  // (rAF throttled to 1Hz) cannot freeze the invulnerability window. Tests
  // pass an explicit `now` to make the timing deterministic.
  // P2-11: `source` defaults to 'other' so existing callers (and tests)
  // keep their behavior. The engine passes 'enemy' from onEnemyContact.
  damage: (n: number, now?: number, source?: 'enemy' | 'other') => void;
  // F-2026-07-01-C-1 + H-1: added closedDoorCells and player cell position
  // parameters so Rules.onUseItem can check door adjacency.
  useItem: (
    slot: InventorySlot,
    closedDoorCells?: ReadonlySet<string>,
    playerCellX?: number,
    playerCellZ?: number,
  ) => void;
  reachExit: (isNewRecord?: boolean) => void;
  goToMenu: () => void;
  // P2-18: set the wall-clock timestamp until which the player is slowed.
  // Called by the bridge's onTrapHit handler when a water trap fires.
  setSlowUntil: (until: number) => void;
  // P2-18: returns the current speed multiplier (1.0 normal, 0.5 slowed).
  // The engine calls this every frame via bridge.getPlayerSpeedMultiplier().
  getPlayerSpeedMultiplier: () => number;
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
  // P2-11: defaults — lastHitBy 'other' so non-enemy damage paths don't
  // accidentally trigger the caught-by-enemy branch on a stale value.
  lastHitBy: 'other',
  lastWinKind: null,
  // P2-18: not slowed at boot.
  slowUntil: 0,
  lastUnlockedDoorId: null,

  // F-2026-06-30: P2-16 — empty parchment at boot. Mirrors the
  // engine-side `Game.parchment` default; the engine pushes the
  // first real value at startLevel() time.
  parchment: createEmptyParchment(),

  // P3-1: no level is active at boot. The engine pushes the real
  // value via `onLevelChange` once `startLevel` runs and the player
  // is created. `null` collapses to `0` at every consumer via
  // `s.player?.currentLevel ?? 0` so a level mounted before the
  // bridge fires still renders the L1 chip instead of an empty badge.
  player: null,

  // P3-1: setter wired to `GameBridge.onLevelChange` in GameCanvas.
  // The engine only calls it when `playerLevel` actually flips
  // (transition completion in `tickActiveTransition`), so a static
  // player standing on layer 0 doesn't churn the React tree. The
  // setter is also no-op for an unchanged value (defensive — the
  // engine's contract already guarantees this, but the guard makes
  // a manual `setCurrentLevel(0)` during testing a no-op when the
  // store already says 0).
  setCurrentLevel: (level) =>
    set((s) => (s.player?.currentLevel === level ? s : { player: { currentLevel: level } })),

  // F-2026-06-30: P2-16 — UI-driven parchment actions. Each forwards
  // to the engine via `setParchmentOpen` so the engine's per-tick
  // pause-while-open guard stays in sync. The set() call here keeps
  // the store's local copy in lockstep with the engine's authoritative
  // state — without it, a toggle from the UI would leave the store
  // out of date until the next recordVisit pushed a fresh reference.
  setParchment: (state) => set({ parchment: state }),
  openParchment: () =>
    set((s) => (s.parchment.isOpen ? s : { parchment: { ...s.parchment, isOpen: true } })),
  closeParchment: () =>
    set((s) => (!s.parchment.isOpen ? s : { parchment: { ...s.parchment, isOpen: false } })),
  toggleParchment: () =>
    set((s) => ({ parchment: { ...s.parchment, isOpen: !s.parchment.isOpen } })),
  // F-2026-06-30: P2-16 — reset ONLY visited + damage; the open
  // flag persists so a player who left the modal open doesn't get
  // it slammed shut on every level. Mirrors `resetMap` in
  // engine/ParchmentState.ts.
  // P3-1: `visitedCells` is now a per-level Map; the reset
  // mirrors `resetMap` and replaces it with a fresh empty Map so
  // the referential equality contract holds (the engine's
  // bridge callback only fires on reference change).
  resetParchment: () =>
    set((s) =>
      s.parchment.visitedCells.size === 0 && s.parchment.damageRegions.length === 0
        ? s
        : {
            parchment: {
              ...s.parchment,
              visitedCells: new Map<number, ReadonlySet<string>>(),
              damageRegions: [],
            },
          },
    ),

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
      //
      // F-project-review-2026-06-13-A-L1: explicit `mode === 'survive'`
      // gate on the spawner call. The count clamp above (non-survive → 0)
      // already makes injectEnemySpawns a no-op via its `count === 0 →
      // return []` short-circuit, but the explicit branch is the
      // documented contract — same rationale as Game.startLevel.
      const injectedEnemies = mode === 'survive'
        ? injectEnemySpawns(maze, requestedEnemyCount, { levelCount: maze.levelCount ?? 1 })
        : [];
      // F-2026-06-17-C-H-3: mirror Game.startLevel — drop any
      // previously-injected gen-* enemies before counting. Without
      // this, the HUD's enemy counter drifts higher on every retry
      // because each injectEnemySpawns call returned 3 new gen-1/2/3
      // and the prior batch was still in maze.enemies.
      const handCraftedCount = maze.enemies.filter((e) => !e.id.startsWith('gen-')).length;
      const totalEnemyCount = handCraftedCount + injectedEnemies.length;
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
        // P2-11: reset hit source + win kind on every level start so a
        // previous run's `lastHitBy='enemy'` doesn't leak into a fresh
        // reach-exit level and produce a false caught-by-enemy signal.
        lastHitBy: 'other',
        lastWinKind: null,
        // P2-18: reset slow debuff on every level start.
        slowUntil: 0,
        lastUnlockedDoorId: null,
        // F-2026-06-30: P2-16 — clear the parchment at every level
        // start so visited cells + damage regions from the previous
        // level don't bleed into the new one. The engine pushes its
        // own reset through `setParchment` immediately after this;
        // the local copy here keeps the UI consistent before that
        // round-trip lands. `isOpen` is preserved — players who left
        // the modal open keep it open across level boundaries.
        parchment: {
          ...s.parchment,
          visitedCells: new Map<number, ReadonlySet<string>>(),
          damageRegions: [],
        },
        // P3-1: reset the layer mirror to 0 (the engine's
        // start-level default for the player's start cell). The
        // engine pushes the real value via `onLevelChange` shortly
        // after startLevel() returns; the initial 0 here is the
        // "good-enough" value for the brief window before the
        // bridge fires. For a multi-level level where the start
        // cell is on a non-zero layer, the bridge's push
        // immediately overwrites this with the real layer so the
        // HUD chip only briefly shows L1 before flipping to the
        // correct layer.
        player: { currentLevel: 0 },
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
    // F-N6: gate the progressive spawn trigger on survive mode. The
    // engine's Game.startLevel only injects enemies in survive (see
    // requestedEnemyCount branch), so bumping progressiveEnemyCount in
    // reach-exit / time-trial is dead state — no UI reads it, no scene
    // consumes it. Without this gate, the helper still fires on every
    // 15s interval in those modes, ghost-incrementing the counter.
    if (s.currentMode === 'survive') {
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
      // F-N12: dedup by id. If a slot already holds this exact key,
      // reject the pickup so the engine rolls back (re-show the mesh
      // and re-add to remainingPickups). Protects against the edge
      // case where the player re-walks the same cell — the existing
      // findIndex(null) guard already prevents two-different-keys
      // from clobbering each other, but a "same id replay" was a
      // remaining double-counting hole.
      if (inv.some((slot) => slot !== null && slot.id === p.id)) {
        return false;
      }
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

  damage: (n, now, source) => {
    const s = get();
    if (s.screen !== 'playing') return;
    // P2-11: default source is 'other' so existing 2-arg callers (and tests
    // that never pass a source) keep their behavior. Only the engine's
    // onEnemyContact path passes 'enemy', which is what unlocks the
    // caught-by-enemy tutorial completion path below.
    const hitSource: 'enemy' | 'other' = source ?? 'other';
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
      // P2-11: caught-by-enemy tutorial completion. Only fires when ALL:
      //   - the killing blow came from an enemy (lastHitBy === 'enemy')
      //   - the level's victory mode is 'caught-by-enemy' (哨兵回廊)
      // Other death causes (time-trial timeout, falling off world, etc.)
      // and other levels keep the existing 'game-over' path.
      if (hitSource === 'enemy' && s.currentMode === 'caught-by-enemy') {
        set({
          health: 0,
          screen: 'win',
          invulnerableUntil: result.invulnerableUntil,
          hitCount: s.hitCount + 1,
          lastHitBy: 'enemy',
          lastWinKind: 'caught-by-enemy',
        });
        return;
      }
      set({
        health: 0,
        screen: 'game-over',
        invulnerableUntil: result.invulnerableUntil,
        hitCount: s.hitCount + 1,
        lastHitBy: hitSource,
      });
      return;
    }
    set({
      health: result.health,
      invulnerableUntil: result.invulnerableUntil,
      hitCount: s.hitCount + 1,
      lastHitBy: hitSource,
    });
  },

  useItem: (slot, closedDoorCells?, playerCellX?, playerCellZ?) => {
    const s = get();
    if (s.screen !== 'playing') {
      // F3: surface the silent ignore so a Digit1/Digit2 press during
      // pause / game-over / win / menu is visible in the console.
      // F-L10: DEV-only — production users pressing keys mid-overlay
      // would otherwise get a noisy console in shipped builds.
      if (import.meta.env.DEV) console.debug('[useItem] ignored: screen =', s.screen);
      return;
    }
    const result = onUseItem(slot, s.inventory, s.currentMaze, closedDoorCells, playerCellX, playerCellZ);
    if (!result.flash) return;
    // P2-18: when a key+door match is found, the result tells us which
    // door to unlock. We notify the engine via bridge.onDoorUnlocked
    // and consume the slot (remove from inventory).
    if (result.consumed && result.unlockedDoorId) {
      const inv = [...s.inventory];
      inv[slot] = null;
      set({
        inventory: inv,
        useItemFlash: { slot, version: (s.useItemFlash?.version ?? 0) + 1 },
        // P2-18: store the unlocked door id so the bridge can call
        // game.openDoor(id). Cleared after the bridge reads it.
        lastUnlockedDoorId: result.unlockedDoorId,
      });
      return;
    }
    set({
      useItemFlash: { slot, version: (s.useItemFlash?.version ?? 0) + 1 },
    });
  },

  reachExit: (isNewRecord) => {
    // P2-11: tag the win kind so WinOverlay can render "通关！" instead
    // of "被追上了" for the reach-exit path. The caught-by-enemy path
    // sets lastWinKind directly inside damage().
    if (get().screen === 'playing') set({ screen: 'win', lastWinIsNewRecord: isNewRecord ?? null, lastWinKind: 'reach-exit' });
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
      // F-2026-06-15-C-2: reset currentMode and currentEnemyCount to their
      // initial values so a survive run followed by goToMenu doesn't leak
      // 'survive' into the next reach-exit level. Initial state declares
      // currentMode: 'reach-exit' / currentEnemyCount: 0 — goToMenu must
      // match that contract.
      currentMode: 'reach-exit',
      currentEnemyCount: 0,
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
      // F-2026-06-30: P2-16 — wipe the parchment on menu exit so a
      // player who retries a level always starts with a fresh map.
      // `parchmentLifecycle: 'persist'` would override this in a
      // future death-increment; the engine hook isn't wired yet.
      parchment: createEmptyParchment(),
      // P3-1: clear the layer mirror on menu exit. A stale layer
      // would be wrong on the next level (the previous run might
      // have ended on L2; the next reach-exit level may be a
      // single-layer one). `null` is the "no level active" state
      // — consumers fall back to 0 via the `?? 0` in their
      // selector.
      player: null,
      // P2-18: reset slow debuff on menu exit.
      slowUntil: 0,
      lastUnlockedDoorId: null,
    }),

  // P2-18: set the slow-until timestamp (called by bridge's onTrapHit
  // handler when a water trap fires).
  setSlowUntil: (until) => set({ slowUntil: until }),

  // P2-18: returns the current speed multiplier based on whether the
  // player is still in the slow window. Called by the engine every frame
  // via bridge.getPlayerSpeedMultiplier().
  getPlayerSpeedMultiplier: () => {
    const s = get();
    return computeSlowMultiplier(Date.now() / 1000, s.slowUntil);
  },
}));
