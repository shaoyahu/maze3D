import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { createCamera } from './Camera';
import { buildScene, disposeScene, type SceneRefs } from './Scene';
import { InputManager } from './InputManager';
import { Loop } from './Loop';
import { resolveMove, hasEnemyContact, type WallGrid } from './Collision';
import { createPlayer, applyLook, updatePlayerCamera, type PlayerState } from '../entities/Player';
import { Enemy, ENEMY_RADIUS } from '../entities/Enemy';
import { findPickupAt, crossesExit } from '../game/Rules';
import { injectEnemySpawns } from '../maze/enemySpawner';
import type {
  EnemyAggression,
  InventorySlot,
  MazeData,
  Pickup,
  StartLevelOptions,
  VictoryType,
  SurviveSeconds,
} from '../maze/types';
import { enemyChaseMultiplier, normalizeSurviveSeconds, SURVIVE_SECONDS_DEFAULT } from '../maze/types';

// Module-level scratch objects to avoid per-frame allocation in the hot
// update() path. Updated in place each frame; never store the references
// beyond a single update() call. The grid.get closure reads _currentMaze
// rather than capturing `this` so it can live at module scope.
let _currentMaze: MazeData | undefined;
const _grid: WallGrid = {
  width: 0,
  depth: 0,
  cellSize: 0,
  get: (x, z) => (_currentMaze?.walls[z]?.[x] === 1 ? 1 : 0),
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
}

export class Game {
  private renderer?: THREE.WebGLRenderer;
  private camera?: THREE.PerspectiveCamera;
  private sceneRefs?: SceneRefs;
  private player?: PlayerState;
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
  private bridge: GameBridge;

  constructor(bridge: GameBridge) {
    this.bridge = bridge;
  }

  init(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.camera = createCamera();
    // Apply the player's saved FOV before the first render so the minimap
    // and the 3D view agree from frame 0.
    this.camera.fov = this.bridge.getInitialFov();
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
    this.camera.fov = degrees;
    this.camera.updateProjectionMatrix();
  }

  setDarkMode(enabled: boolean) {
    this.sceneRefs?.setDarkMode(enabled);
  }

  requestPointerLock(): Promise<void> {
    // requestPointerLock() returns a Promise in modern browsers but
    // undefined in others (and when called outside a user gesture). The
    // optional-chained call above used to crash with "can't access property
    // catch of undefined" when the result wasn't a thenable. Guard both
    // halves. The Promise rejects on denial so the caller (GameCanvas)
    // can surface a user-visible error.
    const el = this.renderer?.domElement;
    if (!el) return Promise.resolve();
    const p = el.requestPointerLock();
    if (p && typeof p.then === 'function') {
      return p.then(
        () => undefined,
        (e: unknown) => {
          console.warn('Game.requestPointerLock: pointer lock request rejected', e);
          throw e;
        },
      );
    }
    return Promise.resolve();
  }

  startLevel(maze: MazeData, options?: StartLevelOptions) {
    if (!this.renderer || !this.camera) throw new Error('Game not initialized');
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups, this.sceneRefs.enemies);
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
    // P2-4a: inject enemy spawns into the maze based on enemyCount,
    // appending to any pre-existing enemies (so a hand-crafted level
    // JSON's explicit enemies aren't lost). The result is a new maze
    // object — we don't mutate the caller's reference.
    const generated = injectEnemySpawns(maze, options?.enemyCount);
    const injectedMaze: MazeData = { ...maze, enemies: [...maze.enemies, ...generated] };
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
      return new Enemy(meterSpawn, { playerSpeed: this.player!.speed, chaseMultiplier });
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
    if (this.loop) this.loop.stop();
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
    this.loop?.stop();
    this.input?.dispose();
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups, this.sceneRefs.enemies);
    }
    // P2-4a F1: drop the Enemy refs along with the scene. They hold no
    // GPU resources (Three.js capsule meshes live in sceneRefs.enemies
    // and are disposed above), but leaving a stale list around would let
    // the next update() iterate ghosts after a dispose/reinit cycle.
    this.enemies = [];
    this.renderer?.dispose();
  }

  private update(dt: number) {
    if (!this.renderer || !this.camera || !this.player || !this.sceneRefs || !this.currentMaze || !this.input) return;
    if (!this.bridge.isActiveLevel(this.currentMaze.id)) return;
    // Bail when the run is over. pauseLoop() is called for the win path, but
    // game-over and post-goToMenu don't stop the loop — guarding here keeps
    // the player frozen, prevents phantom pickup/exit processing under
    // overlays, and avoids wasted render work on terminal screens.
    if (!this.bridge.isPlaying()) return;

    // Tick the clock first so the recorded time on win includes this frame's dt.
    // The previous code called onTick(dt) after the exit check, which undercounted
    // the winning frame by exactly one dt (off by ~16ms at 60fps, more on stalls).
    this.bridge.onTick(dt);

    applyLook(this.player, this.input.consumeMouseDelta());

    const yaw = this.player.yaw;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const move = this.input.getMove();
    // Input convention: move.x = +1 for D (right), move.z = -1 for W (forward).
    // Derivation: camForward = (-sinY, 0, -cosY), camRight = (cosY, 0, -sinY).
    const dx = (move.x * cosY + move.z * sinY) * this.player.speed * dt;
    const dz = (-move.x * sinY + move.z * cosY) * this.player.speed * dt;
    _currentMaze = this.currentMaze;
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
    if (
      this.enemies.length > 0 &&
      hasEnemyContact(
        this.player.position,
        this.player.radius,
        this.enemies.map((e) => ({ x: e.position.x, z: e.position.z })),
        ENEMY_RADIUS,
      )
    ) {
      this.bridge.onEnemyContact(1);
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
      this.bridge.onReachExit();
      this.pauseLoop();
      this.renderer.render(this.sceneRefs.scene, this.camera);
      return;
    }

    this.renderer.render(this.sceneRefs.scene, this.camera);
  }
}
