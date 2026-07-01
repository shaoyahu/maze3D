import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { createCamera } from './Camera';
import { buildScene, disposeScene, type SceneRefs } from './Scene';
import { InputManager } from './InputManager';
import { Loop } from './Loop';
import { resolveMove, type WallGrid } from './Collision';
import { createPlayer, applyLook, updatePlayerCamera, type PlayerState } from '../entities/Player';
import { Enemy, ENEMY_RADIUS } from '../entities/Enemy';
import { findPickupAt, findTrapAt, crossesExit } from '../game/Rules';
import { injectEnemySpawns } from '../maze/enemySpawner';
import {
  createEmptyParchment,
  recordVisit,
  maybeRecordDamage,
  type ParchmentState,
} from './ParchmentState';
import type {
  EnemyAggression,
  InventorySlot,
  MazeData,
  Pickup,
  StartLevelOptions,
  TrapKind,
  VictoryType,
  SurviveSeconds,
} from '../maze/types';
import { enemyChaseMultiplier, normalizeSurviveSeconds, SURVIVE_SECONDS_DEFAULT } from '../maze/types';

// Module-level scratch objects to avoid per-frame allocation in the hot
// update() path. Updated in place each frame; never store the references
// beyond a single update() call. The grid.get closure reads __SCRATCH_*
// rather than capturing `this` so it can live at module scope.
//
// L-2 (2026-07-01): the `__SCRATCH_*` prefix is a re-entrancy
// guard-by-convention. update() runs single-threaded on the rAF
// tick and the next instance-level closure isn't installed until
// the previous startLevel() returns, so the module-level refs can
// in principle be stale across level boundaries. The check at the
// top of update() (`if (!this.currentMaze) return;`) and the
// `this.currentMaze` re-assignment in startLevel() keep the scratch
// cell refreshed on the very next frame, but the prefix is here so
// a future contributor who tries to add a Promise.then / microtask
// that reads `_grid` from outside update() sees the warning name and
// knows the value is per-frame-volatile.
let __SCRATCH_currentMaze: MazeData | undefined;
// P2-18: module-level mirror of closed-door cell keys ("x,z"). The
// `_grid.get` closure ORs these into the wall bit (returning 1 for a
// closed door at (x,z)), so movement collision treats them as walls.
// Updated per-frame in update() alongside __SCRATCH_currentMaze; reset
// on every startLevel(). The Game.closedDoorCells set is authoritative;
// this scratch reference just gives the closure access without capturing
// `this`.
// F-2026-07-01-C-1: previously this stored door ids (e.g. "door-red-1")
// but _grid.get checked has(`${x},${z}`) — the key spaces never matched,
// so closed doors never blocked movement. Now both use coordinate strings.
let __SCRATCH_closedDoorCells: ReadonlySet<string> = new Set();
const _grid: WallGrid = {
  width: 0,
  depth: 0,
  cellSize: 0,
  // P2-18: closed doors are treated as walls. `_grid.get` checks both
  // the maze's wall grid AND the closed-door-cells set: if the cell is
  // a wall OR the cell has a closed (unopened) door, movement is blocked
  // (returns 1). Opened doors are removed from closedDoorCells, so the
  // OR clause fails and the wall-grid value (0 for a walkable door cell)
  // returns 0. This keeps WallGrid.get's return type as 0 | 1 without
  // widening the union.
  get: (x, z) => (
    __SCRATCH_currentMaze?.walls[z]?.[x] === 1
    || __SCRATCH_closedDoorCells.has(`${x},${z}`)
      ? 1 : 0
  ),
};
const _prevPos = { x: 0, z: 0 };

export interface GameBridge {
  onTick: (dt: number) => void;
  onPauseToggle: () => void;
  // Returns true if the store accepted the pickup (e.g. inventory had room
  // for a 'key'); false if the store rejected it. The engine restores the
  // scene state on false so a full-inventory 'key' stays visible/collectible
  // for the rest of the run instead of vanishing silently.
  onPickupCollected: (p: Pickup) => boolean;
  onReachExit: () => void;
  // Q3 / DoD §14.2: the engine never imports a store. The App layer
  // (GameCanvas) implements these by reading the relevant Zustand store.
  // Fov + pointerSensitivity are snapshotted at init / startLevel; the
  // remaining predicates and accessors are called per frame from update()
  // and read the **current** store value (renamed from getInitialDarkMode
  // per P2-2 F11 — its old name implied a snapshot, but the impl reads
  // live state, which is what update() needs). All are cheap single-
  // property reads.
  getInitialFov: () => number;
  getInitialPointerSensitivity: () => number;
  getCurrentDarkMode: () => boolean;
  // P2-4a: live-read aggression from the settings store. Engine snapshots
  // it per-frame from the bridge so the user can change it mid-run
  // (if a future UI surfaces a runtime difficulty toggle); the Enemy
  // class also reads its own chaseMultiplier at construction time, so
  // changing aggression mid-level affects future spawns, not the
  // already-spawned ones. For the current UI (Settings overlay between
  // levels), startLevel is the only time it matters.
  getCurrentEnemyAggression: () => EnemyAggression;
  isActiveLevel: (levelId: string) => boolean;
  isPlaying: () => boolean;
  // P2-2 #8: fired by InputManager on Digit1 / Digit2 (no repeat).
  // Wired to the useItem action by GameCanvas in #9.
  onUseItem: (slot: InventorySlot) => void;
  // P2-4a F1: fired by Game.update() every frame the player overlaps an
  // enemy. The store's 0.5s invulnerable window collapses the per-frame
  // burst into one logical hit. Wired to gameStore.damage in GameCanvas.
  onEnemyContact: (damage: number) => void;
  // P2-18: fired by Game.update() when the player steps on a trap.
  // fire trap: damage is the trap's damage (default 1).
  // water trap: the numeric arg is the slow duration in seconds.
  onTrapHit: (kind: TrapKind, n: number) => void;
  // P2-18: returns the current speed multiplier (1.0 = normal, 0.5 = slowed).
  // The engine reads this every frame to recalculate player.speed.
  getPlayerSpeedMultiplier: () => number;
  // F-2026-07-01-M-1: removed onDoorUnlocked from GameBridge — it was dead
  // code. The actual unlock flow goes through onUseItem → lastUnlockedDoorId
  // → game.openDoor(id) in GameCanvas.
  // P2-11: tutorial event fan-out. Fired by Game.update() with the
  // current mouse delta / just-pressed keys / pickup count / exit cross.
  // Wired to tutorialStore.dispatch in GameCanvas. Optional — production
  // levels without `tutorialSteps` simply omit it.
  onTutorialEvent?: (event: TutorialEvent) => void;
  // F-2026-06-30: P2-16 — parchment map state push. Fired by Game.update()
  // whenever `visitedCells` or `damageRegions` change (reference equality
  // is the trigger, so a player standing still never re-renders the UI).
  // Wired to gameStore.setParchment in GameCanvas. Optional — the engine
  // still tracks the state internally, but a level without the parchment
  // UI mode simply ignores the callback.
  onParchmentStateChange?: (state: ParchmentState) => void;
}

// P2-11: events emitted by the engine to drive the tutorial store. The
// shape mirrors `useTutorialStore.TutorialEvent` so the wire is a pure
// passthrough; Game.ts does not import the store directly (per DoD §14.2).
export type TutorialEvent =
  | { kind: 'mouse-look'; deltaYaw: number; deltaPitch: number }
  | { kind: 'key-pressed'; key: string }
  | { kind: 'pickup-collected'; total: number }
  | { kind: 'reached-exit' };

// F10: clampFov — single source of truth for "is this a safe FOV value
// for the perspective camera?". settingsStore.sanitizeSettings /
// isValidSetting use the same [30, 120] window, but the runtime path
// (Game.setFov, called from GameCanvas's settings subscriber) is the last
// line of defense. NaN / ±Infinity collapse to 60 (the engine default in
// createCamera) instead of poisoning camera.fov → projectionMatrix.
const FOV_MIN = 30;
const FOV_MAX = 120;
const FOV_DEFAULT = 60;
export function clampFov(degrees: number): number {
  if (!Number.isFinite(degrees)) return FOV_DEFAULT;
  if (degrees < FOV_MIN) return FOV_MIN;
  if (degrees > FOV_MAX) return FOV_MAX;
  return degrees;
}

export class Game {
  private renderer?: THREE.WebGLRenderer;
  private camera?: THREE.PerspectiveCamera;
  private sceneRefs?: SceneRefs;
  private player?: PlayerState;
  // F-2026-06-17-B-H-2: a flag flipped synchronously in dispose() and
  // checked at the top of update(). The Loop's own `stopped` flag cancels
  // pending rAF, but rAF callbacks already in flight (already dispatched
  // by the browser, scheduled to fire on the next frame) can still land
  // inside update() after dispose() returns — especially in React 18
  // strict-mode, where Game instances are created and destroyed twice in
  // quick succession. Without this guard, a late tick would touch the
  // disposed scene refs and render a torn-down scene once.
  private destroyed = false;
  // Read-only accessors for UI components (e.g. Minimap) that need to
  // peek at engine state without going through Zustand. Returns the raw
  // reference; callers must not mutate.
  getPlayerPosition(): { x: number; z: number } | null {
    return this.player?.position ?? null;
  }
  getPlayerYaw(): number {
    return this.player?.yaw ?? 0;
  }
  // Vertical FOV in degrees (Three.js convention). UI components (e.g.
  // the minimap view cone) read this to know how wide to draw the cone.
  getCameraFov(): number {
    return this.camera?.fov ?? 60;
  }
  // P2-3: the active victory mode for the current level. Snapshotted in
  // startLevel() so HUD/UI components that need to know the mode (e.g. to
  // label the timer as "TIME TRIAL" or pick a different overlay) can read
  // it without going through the Zustand store. The store still owns the
  // authoritative value; this is just a mirror for engine-side consumers.
  getCurrentMode(): VictoryType {
    return this.currentMode;
  }
  // P2-4a: snapshot of options.surviveSeconds (default 90). HUD/UI
  // (e.g. the survive countdown) reads this to know how long to run
  // without going through the Zustand store. The store still owns
  // the authoritative value; this is a mirror for engine-side consumers.
  getCurrentSurviveSeconds(): SurviveSeconds {
    return this.currentSurviveSeconds;
  }
  // P2-4a: per-frame read of settingsStore.enemyAggression. Same
  // snapshot/live-split pattern as getCurrentDarkMode — see the
  // bridge comment for why live-reads make sense for difficulty.
  getCurrentEnemyAggression(): EnemyAggression {
    return this.bridge.getCurrentEnemyAggression();
  }
  // F-2026-06-30: P2-16 — read-only snapshot of the parchment state.
  // Callers (gameStore, ParchmentMap component) use this when they
  // need a one-time peek at the current visited/damage set without
  // subscribing to the bridge's onParchmentStateChange push.
  getParchment(): ParchmentState {
    return this.parchment;
  }
  // F-2026-06-30: P2-16 — UI-driven open/close. The M key handler in
  // GameCanvas calls `setParchmentOpen(true)` and the engine mirrors
  // the change into its own state so a subsequent bridge push (from
  // a recordVisit) keeps both copies in sync. The isOpen flag also
  // drives the "pause while open" check at the top of update().
  setParchmentOpen(open: boolean): void {
    if (this.parchment.isOpen === open) return;
    this.parchment = { ...this.parchment, isOpen: open };
    this.bridge.onParchmentStateChange?.(this.parchment);
  }
  // P2-18: public method called by GameCanvas when the store's useItem
  // finds a key+door match. Removes the door's cell from the closed-doors
  // set and hides the door mesh so the player can walk through. The
  // per-frame sync to __SCRATCH_closedDoorCells happens in update() so
  // _grid.get sees the new state on the very next collision check.
  // F-2026-07-01-C-1: now removes the coordinate key "x,z" from
  // closedDoorCells instead of adding an id to openedDoors, so _grid.get
  // correctly sees the door as passable.
  openDoor(doorId: string): void {
    const door = this.currentMaze?.doors.find(d => d.id === doorId);
    if (door) this.closedDoorCells.delete(`${door.x},${door.z}`);
    const mesh = this.sceneRefs?.doors.get(doorId);
    if (mesh) mesh.visible = false;
  }
  // F-2026-07-01-H-1: expose closedDoorCells and player cell position
  // so the bridge can pass them to onUseItem for adjacency checking.
  getClosedDoorCells(): ReadonlySet<string> {
    return this.closedDoorCells;
  }
  getPlayerCell(): { x: number; z: number } {
    if (!this.player || !this.currentMaze) return { x: -1, z: -1 };
    const cs = this.currentMaze.cellSize;
    return {
      x: Math.floor(this.player.position.x / cs),
      z: Math.floor(this.player.position.z / cs),
    };
  }
  private currentMode: VictoryType = 'reach-exit';
  private currentSurviveSeconds: SurviveSeconds = SURVIVE_SECONDS_DEFAULT;
  private input?: InputManager;
  private loop?: Loop;
  private remainingPickups: Pickup[] = [];
  private currentMaze?: MazeData;
  // P2-4a F1: list of Enemy state machines, one per MazeData.enemies entry
  // (post-injection). Their order matches sceneRefs.enemies[i] so the
  // per-frame mesh sync can be a simple index-aligned loop. The 3D capsule
  // meshes in sceneRefs are decorative; collision runs against the Enemy
  // instances here, which hold the authoritative position.
  private enemies: Enemy[] = [];
  // F-2026-06-30: P2-16 — hand-held parchment state. Snapshotted from
  // `currentMaze.rules.minimapMode === 'parchment'` at startLevel and
  // driven by recordVisit / maybeRecordDamage in update(). Pushed to
  // the UI through `bridge.onParchmentStateChange` only on reference
  // change, so a player standing still doesn't trigger a React re-render.
  private parchment: ParchmentState = createEmptyParchment();
  // Wall-clock seconds of the most recent damage event we counted
  // toward a parchment mark. Mirrors the 0.5s invuln window in
  // gameStore.applyDamage so a single hit (not a per-frame contact
  // burst) is what triggers a damage region.
  private lastDamageAt = 0;
  // P2-18: set of "x,z" coordinate keys for doors that are still closed.
  // Reset on every startLevel(). The module-level __SCRATCH_closedDoorCells
  // mirror is synced from this in update() so the _grid.get closure can
  // read it this-free. F-2026-07-01-C-1: changed from openedDoors (door ids)
  // to closedDoorCells (coordinate strings) so _grid.get's has() check
  // matches the key space.
  private closedDoorCells = new Set<string>();
  private bridge: GameBridge;

  constructor(bridge: GameBridge) {
    this.bridge = bridge;
  }

  init(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.camera = createCamera();
    // Apply the player's saved FOV before the first render so the minimap
    // and the 3D view agree from frame 0.
    // F-2026-06-17-B-H-4: route through clampFov() so a stray NaN /
    // ±Infinity (corrupted localStorage, devtools injection, future
    // migration bug) collapses to FOV_DEFAULT (60) instead of poisoning
    // camera.fov and propagating into projectionMatrix, breaking the
    // very first render. setFov() already does this — init() was the
    // forgotten sibling.
    this.camera.fov = clampFov(this.bridge.getInitialFov());
    this.camera.updateProjectionMatrix();
    this.input = new InputManager(this.bridge.getInitialPointerSensitivity());
    this.input.onTogglePause(() => this.bridge.onPauseToggle());
    this.input.onUseItem((slot) => this.bridge.onUseItem(slot));
  }

  setSensitivity(n: number) {
    this.input?.setSensitivity(n);
  }

  setFov(degrees: number) {
    if (!this.camera) return;
    // F10: clamp + Number.isFinite guard. settingsStore.sanitizeSettings
    // and isValidSetting already reject out-of-range / NaN on load + set,
    // so this path normally receives a clean [30, 120] number. The guard
    // here is the last line of defense: a stray non-finite value
    // (corrupted localStorage, devtools injection, future migration bug)
    // used to propagate straight into camera.fov and then into
    // projectionMatrix, breaking rendering until reload. clampFov falls
    // back to 60 (the default) on NaN / ±Infinity.
    const safe = clampFov(degrees);
    this.camera.fov = safe;
    this.camera.updateProjectionMatrix();
  }

  setDarkMode(enabled: boolean) {
    this.sceneRefs?.setDarkMode(enabled);
  }

  requestPointerLock(): Promise<{ ok: boolean }> {
    // requestPointerLock() returns a Promise in modern browsers but
    // undefined in others (and when called outside a user gesture). Both
    // halves are guarded.
    //
    // F-2026-06-15-H-3.9: previously this returned Promise<void> and
    // re-threw on rejection — any caller that forgot `.catch(...)`
    // surfaced an Uncaught (in promise) on the console (and could be
    // misclassified by telemetry as a real error). Now we always
    // resolve with { ok: boolean } so callers handle the outcome
    // explicitly. console.warn is preserved so the dev-time breadcrumb
    // does not disappear.
    const el = this.renderer?.domElement;
    if (!el) return Promise.resolve({ ok: false });
    const p = el.requestPointerLock();
    if (p && typeof p.then === 'function') {
      return p.then(
        () => ({ ok: true }),
        (e: unknown) => {
          console.warn('Game.requestPointerLock: pointer lock request rejected', e);
          return { ok: false };
        },
      );
    }
    return Promise.resolve({ ok: true });
  }

  startLevel(maze: MazeData, options?: StartLevelOptions) {
    if (!this.renderer || !this.camera) throw new Error('Game not initialized');
    // F-M4: stop the previous loop BEFORE tearing down the scene. Even
    // though JS is single-threaded and the synchronous body can't be
    // re-entered by the rAF tick, keeping the dispose path simple matters:
    // a future refactor that swaps stop and dispose would otherwise let
    // update() run with a half-disposed scene (walls/pickups arrays
    // emptied by disposeScene, sceneRefs still pointing at the old
    // scene). Stop first, dispose, rebuild, start.
    if (this.loop) this.loop.stop();
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups, this.sceneRefs.enemies, this.sceneRefs.traps, this.sceneRefs.doors);
    }
    // P2-3: snapshot the mode so getCurrentMode() callers (HUD/UI) see
    // the level's active mode without having to reach into the store. The
    // engine itself doesn't branch on mode — the store's tick() handles
    // countdown semantics — but the mode is needed for display purposes.
    this.currentMode = options?.mode ?? 'reach-exit';
    // P2-4a: snapshot the survive target the same way (only meaningful
    // when currentMode === 'survive', but storing it is harmless and
    // avoids a special case in UI consumers).
    this.currentSurviveSeconds = normalizeSurviveSeconds(options?.surviveSeconds);
    // P2-5 FR-18/FR-19/FR-21: enemy injection is hard-gated to survive mode.
    // Hand-crafted maze.enemies (FR-21) flow through unchanged in any mode.
    // F-project-review-2026-06-13-A-L1: the mode-based `count` clamp below
    // (non-survive → 0) already makes injectEnemySpawns a no-op via its
    // `count === 0 → return []` short-circuit. But the explicit `mode ===
    // 'survive'` branch on the SPAWNER CALL is the documented contract —
    // a future refactor that drops the count clamp (e.g. to honor a
    // non-survive enemyCount UI hint) would silently double the enemy
    // roster for hand-crafted levels. The two call sites
    // (Game.startLevel here + gameStore.startLevel) are kept in sync.
    const requestedEnemyCount = this.currentMode === 'survive'
      ? options?.enemyCount
      : 0;
    const generated = this.currentMode === 'survive'
      ? injectEnemySpawns(maze, requestedEnemyCount)
      : [];
    // F-2026-06-17-C-H-3: drop any previously-injected gen-* enemies
    // before merging the new batch. Without this, the retry / next-level
    // path stacked another 3 enemies on top of the prior 3, ballooning
    // the scene to 6 / 9 / 12 over a single run. Hand-crafted
    // `maze.enemies` (FR-21) are preserved — the `gen-` prefix is the
    // procedural-injection marker, so the filter is safe.
    const handCraftedEnemies = maze.enemies.filter((e) => !e.id.startsWith('gen-'));
    const injectedMaze: MazeData = { ...maze, enemies: [...handCraftedEnemies, ...generated] };
    // F4: buildScene applies the palette exactly once based on the dark
    // mode flag, so the follow-up setDarkMode() (which would re-run
    // applyPalette a second time) is no longer needed.
    this.sceneRefs = buildScene(injectedMaze, this.bridge.getCurrentDarkMode());
    this.player = createPlayer(injectedMaze.start, injectedMaze.cellSize);
    updatePlayerCamera(this.camera, this.player);
    this.currentMaze = injectedMaze;
    this.remainingPickups = [...injectedMaze.pickups];
    // P2-4a F1: instantiate an Enemy state machine per maze.enemies entry.
    // spawn.x/z/path are in CELL coordinates; Enemy + collision work in
    // WORLD METERS (same as player.position). Translate once here so
    // subsequent per-frame math compares apples to apples. The conversion
    // mirrors what buildScene does for the decorative capsule mesh, but
    // is duplicated here intentionally — Scene.ts is engine presentation
    // and shouldn't be the source of truth for the collision-shape
    // translation. If drift bites, extract a shared helper.
    // F6: chaseMultiplier is derived from the user's enemyAggression
    // setting snapshot at startLevel. Mid-run aggression changes (if
    // a future UI exposes a runtime toggle) affect future spawns only.
    const chaseMultiplier = enemyChaseMultiplier(this.bridge.getCurrentEnemyAggression());
    const cs = injectedMaze.cellSize;
    this.enemies = injectedMaze.enemies.map((spawn) => {
      const meterSpawn = {
        ...spawn,
        x: spawn.x * cs + cs / 2,
        z: spawn.z * cs + cs / 2,
        path: spawn.path.map((p) => ({ x: p.x * cs + cs / 2, z: p.z * cs + cs / 2 })),
      };
      return new Enemy(meterSpawn, { playerSpeed: this.player!.speed, chaseMultiplier }, _grid);
    });
    // Discard any mouse delta that accumulated between pointer-lock acquire
    // and the first update tick (spurious browser events, page-focus events,
    // HMR-triggered remounts). Without this, the first few frames can carry
    // a non-zero yaw/pitch seed, making W move "right-front" and the horizon
    // appear tilted.
    this.input?.consumeMouseDelta();
    // Clear any keys the player was still holding at the moment of the
    // previous level ending — without this, retry/next-level would resume
    // motion from a keyup that never happened.
    this.input?.clearKeys();
    // F-2026-06-30: P2-16 — reset the parchment state at every level
    // start. The previous level's visited cells and damage regions
    // would otherwise bleed into the new level. The bridge fires
    // once here so the UI clears its copy in the same tick.
    this.parchment = createEmptyParchment();
    this.lastDamageAt = 0;
    // P2-18: reset door state on every level start. Populate
    // closedDoorCells with all door coordinates from the new maze.
    // Door unlock state is per-run (not persisted), so a refresh
    // replays the same locked state. Also sync to the module-level
    // scratch so _grid.get sees the reset before the first update()
    // frame. F-2026-07-01-C-1: use closedDoorCells (coordinate keys)
    // instead of openedDoors (door ids).
    this.closedDoorCells = new Set(
      injectedMaze.doors.map(d => `${d.x},${d.z}`),
    );
    __SCRATCH_closedDoorCells = this.closedDoorCells;
    this.bridge.onParchmentStateChange?.(this.parchment);
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();
  }

  pauseLoop() { this.loop?.stop(); }
  resumeLoop() {
    this.loop?.start();
  }

  setInputPaused(paused: boolean) {
    this.input?.setPaused(paused);
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    // F-2026-06-17-B-H-2: flip the destroyed flag synchronously, BEFORE
    // any other teardown, so an in-flight rAF callback (already
    // dispatched by the browser but not yet executed) is rejected at the
    // top of update() and never touches the partially-torn-down scene.
    this.destroyed = true;
    this.loop?.stop();
    this.input?.dispose();
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups, this.sceneRefs.enemies, this.sceneRefs.traps, this.sceneRefs.doors);
    }
    // P2-4a F1: drop the Enemy refs along with the scene. They hold no
    // GPU resources (Three.js capsule meshes live in sceneRefs.enemies
    // and are disposed above), but leaving a stale list around would let
    // the next update() iterate ghosts after a dispose/reinit cycle.
    this.enemies = [];
    this.renderer?.dispose();
  }

  private update(dt: number) {
    // F-2026-06-17-B-H-2: bail first on a disposed instance. The other
    // `!this.renderer` guards below already handle missing optional refs
    // (e.g. before init), but they all check *field* presence — disposed
    // refs are not nulled by dispose() (the `?.dispose()` calls only run
    // the side effect, they do not clear the references), so a late
    // tick would otherwise see every ref still present and render
    // a torn-down scene. The destroyed flag is the single source of
    // truth for "this Game is no longer in service".
    if (this.destroyed) return;
    if (!this.renderer || !this.camera || !this.player || !this.sceneRefs || !this.currentMaze || !this.input) return;
    if (!this.bridge.isActiveLevel(this.currentMaze.id)) return;
    // F-2026-06-30: P2-16 — when the parchment map is open AND the
    // level's mapOpenBehavior is 'pause', skip the per-frame gameplay
    // tick. The render still happens (so the world stays visible
    // behind the modal) but the player can't move / take damage /
    // collect pickups while reading. Levels that opt into 'continue'
    // skip this guard so the world keeps ticking under the modal.
    //
    // L-3 (2026-07-01) VERIFIED: guard ordering is correct as-is. The
    // three predicates short-circuit left-to-right on `&&`, and the
    // cheap ones (`isOpen` boolean, `'continue'` literal compare) run
    // first; the level-rules reads (`minimapMode`, `mapOpenBehavior`)
    // happen only when the modal is actually open. The `return`
    // skipping the rest of update() but still falling through to
    // `this.renderer.render(...)` at the bottom keeps the world
    // visible behind the modal as designed — do NOT move this guard
    // below the render call or the pause effect silently breaks.
    if (
      this.currentMaze.rules.minimapMode === 'parchment' &&
      this.parchment.isOpen &&
      this.currentMaze.rules.mapOpenBehavior !== 'continue'
    ) {
      return;
    }
    // Bail when the run is over. pauseLoop() is called for the win path, but
    // game-over and post-goToMenu don't stop the loop — guarding here keeps
    // the player frozen, prevents phantom pickup/exit processing under
    // overlays, and avoids wasted render work on terminal screens.
    if (!this.bridge.isPlaying()) return;

    // Tick the clock first so the recorded time on win includes this frame's dt.
    // The previous code called onTick(dt) after the exit check, which undercounted
    // the winning frame by exactly one dt (off by ~16ms at 60fps, more on stalls).
    // F-M1: re-check isPlaying AFTER the tick. onTick can flip screen to
    // 'game-over' (countdown → 0) or 'win' (survive countdown → target) on
    // this same frame; the early-return at the top of update() only catches
    // the *previous* frame's terminal state. Without this re-check the rest
    // of update() runs a ghost frame: player moves, enemies chase, pickups
    // get processed, then the post-death world is rendered. Bail before any
    // of that and let the App layer's overlay take over.
    this.bridge.onTick(dt);
    if (!this.bridge.isPlaying()) return;

    // P2-11: capture mouse delta BEFORE applyLook consumes it, so we can
    // emit a tutorial event with this frame's exact rotation. The store
    // decides whether the cumulative rotation has crossed its threshold.
    const mouseDelta = this.input.consumeMouseDelta();
    applyLook(this.player, mouseDelta);
    if (this.bridge.onTutorialEvent && (mouseDelta.x !== 0 || mouseDelta.y !== 0)) {
      this.bridge.onTutorialEvent({ kind: 'mouse-look', deltaYaw: mouseDelta.x, deltaPitch: mouseDelta.y });
    }

    // P2-11: edge-triggered key presses → `key-pressed` tutorial events.
    if (this.bridge.onTutorialEvent) {
      for (const key of this.input.consumeJustPressedKeys()) {
        this.bridge.onTutorialEvent({ kind: 'key-pressed', key });
      }
    }

    const yaw = this.player.yaw;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const move = this.input.getMove();
    // Input convention: move.x = +1 for D (right), move.z = -1 for W (forward).
    // Derivation: camForward = (-sinY, 0, -cosY), camRight = (cosY, 0, -sinY).
    const dx = (move.x * cosY + move.z * sinY) * this.player.speed * dt;
    const dz = (-move.x * sinY + move.z * cosY) * this.player.speed * dt;
    __SCRATCH_currentMaze = this.currentMaze;
    // P2-18: sync closed door cells to module-level scratch so _grid.get
    // closure sees the latest state this-free.
    __SCRATCH_closedDoorCells = this.closedDoorCells;
    // P2-18: recalculate player speed based on slow debuff.
    // getPlayerSpeedMultiplier returns 1.0 (normal) or 0.5 (slowed).
    const speedMult = this.bridge.getPlayerSpeedMultiplier();
    this.player.speed = 3 * speedMult;
    _grid.width = this.currentMaze.size.width;
    _grid.depth = this.currentMaze.size.depth;
    _grid.cellSize = this.currentMaze.cellSize;
    _prevPos.x = this.player.position.x;
    _prevPos.z = this.player.position.z;
    const next = resolveMove(
      { x: this.player.position.x, z: this.player.position.z, r: this.player.radius },
      { dx, dz },
      _grid,
    );
    // Mutate in place to avoid a per-frame `{ x, z }` allocation.
    this.player.position.x = next.x;
    this.player.position.z = next.z;
    // Keep the on-floor position indicator glued to the player. The marker
    // is created once per scene in buildScene; only its x/z need syncing.
    this.sceneRefs.playerMarker.position.x = next.x;
    this.sceneRefs.playerMarker.position.z = next.z;

    // Sync the camera to the collision-resolved player position. The camera
    // must NEVER sit at the pre-collision position; otherwise walking into a
    // wall leaves the camera one frame past it, rendering the world on the
    // far side of the wall.
    updatePlayerCamera(this.camera, this.player);

    // F-2026-06-30: P2-16 — record the player's current cell into
    // `parchment.visitedCells`. Only fires on a NEW cell (referential
    // equality short-circuits), so a player standing still never
    // re-pushes state to the UI. The 0.5s enemy-invuln window logic
    // (gameStore.applyDamage) uses a wall-clock timestamp; we mirror
    // it via `performance.now() / 1000` so a damage-region event and
    // a health hit agree on the same notion of "now".
    if (this.currentMaze.rules.minimapMode === 'parchment') {
      const cs = this.currentMaze.cellSize;
      const cellX = Math.floor(this.player.position.x / cs);
      const cellZ = Math.floor(this.player.position.z / cs);
      const nextParchment = recordVisit(this.parchment, cellX, cellZ);
      if (nextParchment !== this.parchment) {
        this.parchment = nextParchment;
        this.bridge.onParchmentStateChange?.(this.parchment);
      }
    }

    // P2-4a F1: tick each enemy against the current player position, then
    // mirror the result into the corresponding decorative mesh. The order
    // here matches the order in sceneRefs.enemies (built in Scene.ts from
    // injectedMaze.enemies, which is the same order we iterated in
    // startLevel). The collision check is a single batched call against
    // hasEnemyContact — the 0.5s invuln window in gameStore.damage
    // collapses any per-frame burst into one hit, so the engine fires
    // onEnemyContact(1) every frame the player overlaps an enemy.
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.update(dt, { position: this.player.position });
      const mesh = this.sceneRefs.enemies[i];
      mesh.position.x = enemy.position.x;
      mesh.position.z = enemy.position.z;
    }
    // F-H2: inline the contact check to avoid per-frame allocation of
    // an N-element `{x,z}[]` array. `hasEnemyContact` remains exported for
    // unit tests; the hot path in the engine reads enemy positions in place.
    if (this.enemies.length > 0) {
      const px = this.player.position.x;
      const pz = this.player.position.z;
      const sumR2 = (this.player.radius + ENEMY_RADIUS) * (this.player.radius + ENEMY_RADIUS);
      let contact = false;
      for (const e of this.enemies) {
        const dx = e.position.x - px;
        const dz = e.position.z - pz;
        if (dx * dx + dz * dz < sumR2) {
          contact = true;
          break;
        }
      }
      if (contact) {
        this.bridge.onEnemyContact(1);
        // F-2026-06-30: P2-16 — on a FRESH enemy hit, also try to leave
        // a damage mark on the parchment. "Fresh" mirrors the 0.5s
        // invuln window in gameStore.applyDamage so a single logical
        // hit (not a per-frame contact burst) is what the parchment
        // sees. The wall-clock timestamp is tracked locally so the
        // engine doesn't have to peek inside the store. Outside of
        // `parchment` mode this branch is dead code.
        if (this.currentMaze.rules.minimapMode === 'parchment') {
          const nowSec = performance.now() / 1000;
          if (nowSec - this.lastDamageAt >= 0.5) {
            this.lastDamageAt = nowSec;
            const cs = this.currentMaze.cellSize;
            const cellX = Math.floor(this.player.position.x / cs);
            const cellZ = Math.floor(this.player.position.z / cs);
            const nextParchment = maybeRecordDamage(
              this.parchment,
              cellX,
              cellZ,
              0, // tick counter reserved for future animation
              Math.random,
            );
            if (nextParchment !== this.parchment) {
              this.parchment = nextParchment;
              this.bridge.onParchmentStateChange?.(this.parchment);
            }
          }
        }
      }
    }

    // P2-18: trap detection. Check if the player's current cell has a trap.
    // Fire traps deal damage; water traps apply a slow debuff. Both record
    // a forced-type damage mark on the parchment (burn / water).
    // F-2026-07-01-L-1: rate-limit trap bridge callbacks with a 0.5s guard
    // (matching the invuln window) so we don't fire onTrapHit every frame
    // while the player stands on the trap cell.
    const trap = findTrapAt(this.player.position, this.currentMaze.traps, this.currentMaze.cellSize);
    if (trap) {
      const nowSec = performance.now() / 1000;
      if (nowSec - this.lastDamageAt >= 0.5) {
        this.lastDamageAt = nowSec;
        if (trap.kind === 'fire') {
          this.bridge.onTrapHit('fire', trap.damage ?? 1);
        } else {
          this.bridge.onTrapHit('water', trap.slowDurationSec ?? 1.5);
        }
        // P2-18: record damage on the parchment with a forced type so fire
        // always leaves 'burn' marks and water always leaves 'water' marks.
        if (this.currentMaze.rules.minimapMode === 'parchment') {
          const cs = this.currentMaze.cellSize;
          const cellX = Math.floor(this.player.position.x / cs);
          const cellZ = Math.floor(this.player.position.z / cs);
          const forceType = trap.kind === 'fire' ? 'burn' : 'water';
          const nextParchment = maybeRecordDamage(
            this.parchment,
            cellX,
            cellZ,
            0,
            Math.random,
            forceType,
          );
          if (nextParchment !== this.parchment) {
            this.parchment = nextParchment;
            this.bridge.onParchmentStateChange?.(this.parchment);
          }
        }
      }
    }

    const hit = findPickupAt(this.player.position, this.currentMaze, this.remainingPickups);
    if (hit) {
      this.remainingPickups = this.remainingPickups.filter((p) => p !== hit);
      const mesh = this.sceneRefs.pickups.find((m) => m.userData?.pickup === hit);
      if (mesh) {
        mesh.visible = false;
        for (const sib of mesh.userData.siblings) sib.visible = false;
      }
      const accepted = this.bridge.onPickupCollected(hit);
      // P2-11: tutorial `pickup-collected` event after a successful pickup.
      // `total` = how many pickups have been collected so far this level,
      // which the store compares against `trigger.count`.
      if (accepted) {
        const initialTotal = this.currentMaze.pickups.length;
        const collected = initialTotal - this.remainingPickups.length;
        this.bridge.onTutorialEvent?.({ kind: 'pickup-collected', total: collected });
      }
      if (!accepted) {
        // Store rejected the pickup (e.g. inventory full for a 'key').
        // Roll back the scene mutation so the pickup stays in the world.
        this.remainingPickups.push(hit);
        if (mesh) {
          mesh.visible = true;
          for (const sib of mesh.userData.siblings) sib.visible = true;
        }
      }
    }

    if (crossesExit(_prevPos, this.player.position, this.currentMaze)) {
      // In a tunneling-sampled exit, player.position may be past the exit
      // cell. Clamp to the exit cell center so the final frame and the
      // win overlay show the player standing in the exit, not overshooting.
      const cs = this.currentMaze.cellSize;
      this.player.position.x = this.currentMaze.exit.x * cs + cs / 2;
      this.player.position.z = this.currentMaze.exit.z * cs + cs / 2;
      updatePlayerCamera(this.camera, this.player);
      // P2-11: tutorial `reached-exit` event fires unconditionally —
      // the store decides whether to advance based on the current step.
      this.bridge.onTutorialEvent?.({ kind: 'reached-exit' });
      this.bridge.onReachExit();
      this.pauseLoop();
      this.renderer.render(this.sceneRefs.scene, this.camera);
      return;
    }

    this.renderer.render(this.sceneRefs.scene, this.camera);
  }
}
