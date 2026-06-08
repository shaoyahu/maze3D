import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { createCamera } from './Camera';
import { buildScene, disposeScene, type SceneRefs } from './Scene';
import { InputManager } from './InputManager';
import { Loop } from './Loop';
import { resolveMove, type WallGrid } from './Collision';
import { createPlayer, applyLook, updatePlayerCamera, type PlayerState } from '../entities/Player';
import { findPickupAt, crossesExit } from '../game/Rules';
import type { MazeData, Pickup } from '../maze/types';

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
  // getInitial* are snapshotted at init / startLevel; the predicates are
  // called per frame from update() — both are cheap single-property reads.
  getInitialFov: () => number;
  getInitialPointerSensitivity: () => number;
  getInitialDarkMode: () => boolean;
  isActiveLevel: (levelId: string) => boolean;
  isPlaying: () => boolean;
  // P2-2 #8: fired by InputManager on Digit1 / Digit2 (no repeat).
  // Wired to the useItem action by GameCanvas in #9.
  onUseItem: (slot: 0 | 1) => void;
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
  private input?: InputManager;
  private loop?: Loop;
  private remainingPickups: Pickup[] = [];
  private currentMaze?: MazeData;
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

  startLevel(maze: MazeData) {
    if (!this.renderer || !this.camera) throw new Error('Game not initialized');
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups);
    }
    this.sceneRefs = buildScene(maze);
    this.sceneRefs.setDarkMode(this.bridge.getInitialDarkMode());
    this.player = createPlayer(maze.start, maze.cellSize);
    updatePlayerCamera(this.camera, this.player);
    this.currentMaze = maze;
    this.remainingPickups = [...maze.pickups];
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
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups);
    }
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
