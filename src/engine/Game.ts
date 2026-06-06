import * as THREE from 'three';
import { createRenderer } from './Renderer';
import { createCamera } from './Camera';
import { buildScene, disposeScene, type SceneRefs } from './Scene';
import { InputManager } from './InputManager';
import { Loop } from './Loop';
import { resolveMove, type WallGrid } from './Collision';
import { createPlayer, applyLook, updatePlayerCamera, type PlayerState } from '../entities/Player';
import { isAtExit, findPickupAt } from '../game/Rules';
import type { MazeData, Pickup } from '../maze/types';

export interface GameBridge {
  onTick: (dt: number) => void;
  onPauseToggle: () => void;
  onPickupCollected: (p: Pickup) => void;
  onReachExit: () => void;
}

export class Game {
  private renderer?: THREE.WebGLRenderer;
  private camera?: THREE.PerspectiveCamera;
  private sceneRefs?: SceneRefs;
  private player?: PlayerState;
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
    this.input = new InputManager();
    this.input.onTogglePause(() => this.bridge.onPauseToggle());
  }

  startLevel(maze: MazeData) {
    if (!this.renderer || !this.camera) throw new Error('Game not initialized');
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.exit, this.sceneRefs.pickups);
    }
    this.sceneRefs = buildScene(maze);
    this.player = createPlayer(maze.start, maze.cellSize);
    updatePlayerCamera(this.camera, this.player);
    this.currentMaze = maze;
    this.remainingPickups = [...maze.pickups];
    if (this.loop) this.loop.stop();
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();
  }

  pauseLoop() { this.loop?.stop(); }
  resumeLoop() {
    if (!this.loop) return;
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();
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
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.exit, this.sceneRefs.pickups);
    }
    this.renderer?.dispose();
  }

  private update(dt: number) {
    if (!this.camera || !this.player || !this.sceneRefs || !this.currentMaze || !this.input) return;

    applyLook(this.player, this.input.consumeMouseDelta());

    const move = this.input.getMove();
    const cosY = Math.cos(this.player.yaw);
    const sinY = Math.sin(this.player.yaw);
    const dx = (move.x * cosY + move.z * sinY) * this.player.speed * dt;
    const dz = (-move.x * sinY + move.z * cosY) * this.player.speed * dt;
    const grid: WallGrid = {
      width: this.currentMaze.size.width,
      depth: this.currentMaze.size.depth,
      cellSize: this.currentMaze.cellSize,
      get: (x, z) => (this.currentMaze!.walls[z]?.[x] === 1 ? 1 : 0),
    };
    const next = resolveMove(
      { x: this.player.position.x, z: this.player.position.z, r: this.player.radius },
      { dx, dz },
      grid,
    );
    this.player.position = { x: next.x, z: next.z };

    updatePlayerCamera(this.camera, this.player);

    const hit = findPickupAt(this.player.position, this.currentMaze, this.remainingPickups);
    if (hit) {
      this.remainingPickups = this.remainingPickups.filter((p) => p !== hit);
      const mesh = this.sceneRefs.pickups.find((m) => m.userData?.pickup === hit);
      if (mesh) mesh.visible = false;
      this.bridge.onPickupCollected(hit);
    }

    if (isAtExit(this.player.position, this.currentMaze)) {
      this.bridge.onReachExit();
      this.pauseLoop();
    }

    this.bridge.onTick(dt);
    this.renderer!.render(this.sceneRefs.scene, this.camera);
  }
}
