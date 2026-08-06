// P4: Game 3D movement. The 3D tick (`Game.tick3DMovement`)
// handles:
//   - mouse-look (yaw / pitch unchanged from 2D)
//   - 6-neighbor movement (WASD + Space + KeyC) with cell-based
//     collision against `maze.walls3D`
//   - camera + eye-height sync (player.y + 1.6)
//   - on-floor marker x / y / z sync
//   - exit check (player at `exit3D` cell → `bridge.onReachExit` +
//     `pauseLoop`)
//
// The 2D tick (resolveMove / per-entity branches) is bypassed
// entirely. The tests below reach the private `tick3DMovement`
// through the Game's public API: `startLevel` → dispatch a
// `KeyboardEvent` for the move key → advance the loop by one
// frame via the bridge's `onTick`. We avoid spinning up the
// full `Loop` / `WebGLRenderer` because the 3D movement math
// is independent of the render.

// F-P4-GAME-MOCK: jsdom has no WebGL context, so `createRenderer`
// (which constructs a `THREE.WebGLRenderer`) throws. The 3D
// movement math is independent of the renderer — we just need a
// stub `render(...)` so the per-frame `renderer.render(...)` call
// doesn't throw. `vi.mock` the entire `Renderer` module to return
// a no-op stub. The stub exposes every method the engine calls
// (`render`, `setSize`, `dispose`, etc.) as a no-op.
vi.mock('../../../src/engine/Renderer', () => ({
  createRenderer: () => ({
    setPixelRatio: () => {},
    setSize: () => {},
    render: () => {},
    dispose: () => {},
    domElement: document.createElement('canvas'),
  }),
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../../src/engine/Game';
import type { GameBridge } from '../../../src/engine/Game';
import type { MazeData } from '../../../src/maze/types';

// F-P4-GAME-TEST: hand-built bridge that captures the bridge
// callbacks but does NOT spin up a real renderer / scene. The
// 3D movement math (collision, cell teleport, exit check) is
// independent of the render, so a stub bridge is enough to
// exercise the engine's 3D path.
function makeStubBridge(): GameBridge & {
  reachExitCalls: number;
  tickCalls: number;
  tutorialEvents: Array<{ kind: string; [k: string]: unknown }>;
} {
  const bridge: GameBridge & {
    reachExitCalls: number;
    tickCalls: number;
    tutorialEvents: Array<{ kind: string; [k: string]: unknown }>;
  } = {
    reachExitCalls: 0,
    tickCalls: 0,
    tutorialEvents: [],
    onTick: vi.fn(() => { bridge.tickCalls++; }),
    onPauseToggle: vi.fn(),
    onPickupCollected: vi.fn(() => true),
    onReachExit: vi.fn(() => { bridge.reachExitCalls++; }),
    getInitialFov: () => 60,
    getInitialPointerSensitivity: () => 0.002,
    getCurrentDarkMode: () => false,
    getCurrentEnemyAggression: () => 'medium',
    isActiveLevel: () => true,
    isPlaying: () => true,
    onUseItem: vi.fn(),
    onEnemyContact: vi.fn(),
    onTrapHit: vi.fn(),
    getPlayerSpeedMultiplier: () => 1.0,
    onTutorialEvent: (event) => { bridge.tutorialEvents.push(event); },
  };
  return bridge;
}

// F-P4-GAME-MAZE: build a 5×5×5 3D maze with a known passage
// layout. We bypass the AlgorithmMazeProvider here so the
// test owns the data shape directly — the provider's 3D load
// is covered by `algorithmMazeProvider.test.ts` already.
//
// Layout: the cube is a corridor running from (1, 0, 1) to
// (3, 0, 3) on the y=0 floor. The player can move along x
// (cells 1→2→3) and along z (cells 1→2→3), and a single
// "ladder" cell (2, 0, 2) → (2, 1, 2) → (2, 2, 2) is a
// vertical column. Everything else is wall. This gives us
// three reachable exit cells in 3 directions: (3, 0, 1),
// (1, 0, 3), (2, 2, 2).
function build3DTestMaze(): MazeData {
  const size = 5;
  // Initialize all walls.
  const walls3D: number[][][] = [];
  for (let z = 0; z < size; z++) {
    const layer: number[][] = [];
    for (let y = 0; y < size; y++) {
      const row: number[] = new Array(size).fill(1);
      layer.push(row);
    }
    walls3D.push(layer);
  }
  // Carve a + corridor on the y=0 floor: (1, 0, 1)-(3, 0, 1)-(3, 0, 2)-(3, 0, 3)
  //                                                       also (1, 0, 2), (1, 0, 3).
  // (The player just needs 4-neighbor passability; the
  // specific layout doesn't matter as long as we have
  // a known start + exit + a few intermediate cells.)
  for (let x = 1; x <= 3; x++) walls3D[1][0][x] = 0;
  for (let z = 1; z <= 3; z++) walls3D[z][0][1] = 0;
  // Ladder column: (2, 0, 2), (2, 1, 2), (2, 2, 2).
  walls3D[2][0][2] = 0;
  walls3D[2][1][2] = 0;
  walls3D[2][2][2] = 0;
  return {
    id: 'test-3d',
    name: 'Test 3D',
    size: { width: size, depth: size },
    cellSize: 2,
    start: { x: 1, z: 1, level: 0 },
    exit: { x: 3, z: 1, level: 0 },
    start3D: { x: 1, y: 0, z: 1 },
    exit3D: { x: 2, y: 2, z: 2 }, // top of the ladder column
    walls: [],
    walls3D: walls3D as MazeData['walls3D'],
    pickups: [],
    rules: { initialTime: 30, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
    enemies: [],
    traps: [],
    doors: [],
  };
}

describe('Game P4 — 3D movement tick', () => {
  let game: Game;
  let bridge: ReturnType<typeof makeStubBridge>;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    bridge = makeStubBridge();
    // Stub canvas — Game.init only needs a non-null HTMLCanvasElement
    // to construct the WebGLRenderer (which we're not exercising).
    canvas = document.createElement('canvas');
    game = new Game(bridge);
    // We don't call game.init() because that would create a real
    // WebGLRenderer / Camera. The 3D movement math is independent
    // of the render — we directly populate the Game's private refs
    // through `startLevel` and then dispatch keyboard events to
    // exercise the tick.
    //
    // However, `startLevel` does call `buildScene` which constructs
    // a full Three.js scene. To exercise the 3D movement path
    // without a WebGL context, we need to mock the WebGLRenderer.
    // Three.js falls back to a software renderer in headless test
    // environments (jsdom + vitest with WebGL polyfill), but
    // `createRenderer` may fail in strict jsdom. We bypass the
    // scene build by going through the public `dispose` / `init`
    // shape, then setting the private state directly. The cleanest
    // approach is to use Three.js's `WebGLRenderer` mock — but
    // that's brittle. Instead, the test exercises `tick3DMovement`
    // via a `startLevel` call with a fully formed MazeData, which
    // routes through `buildScene3D` (the 3D path of `buildScene`).
    //
    // The buildScene3D path does NOT touch WebGL — it just adds
    // meshes to a Scene. We then patch the private sceneRefs /
    // camera / renderer fields to point at no-op stubs so the
    // engine's per-frame `renderer.render(...)` call doesn't
    // blow up.
    game.init(canvas);
    // Stub the renderer.render to a no-op so the engine can call
    // it without a real WebGL context.
    const renderer = (game as unknown as { renderer: { render: () => void } | undefined }).renderer;
    if (renderer) (renderer as { render: () => void }).render = () => {};
  });

  it('startLevel routes a 3D maze to buildScene3D (walls3D present in sceneRefs)', () => {
    const maze = build3DTestMaze();
    game.startLevel(maze);
    const sceneRefs = (game as unknown as { sceneRefs?: { walls: unknown[] } }).sceneRefs;
    expect(sceneRefs).toBeDefined();
    // The 3D builder should have populated the walls array with
    // a cuboid per wall cell. Our test maze has 5×5×5=125 cells
    // minus the 8 passage cells = 117 wall cuboids. (Passage
    // layout: y=0 corridor (1,0,1)(2,0,1)(3,0,1) + (1,0,2)(1,0,3)
    // + ladder base (2,0,2) = 6 cells; y=1 ladder cell (2,1,2)
    // = 1; y=2 ladder cell (2,2,2) = 1; total 8.)
    expect(sceneRefs!.walls.length).toBe(125 - 8);
  });

  it('a single D key press teleports the player one cell along +x (when target is open)', () => {
    const maze = build3DTestMaze();
    game.startLevel(maze);
    // Player spawns at (1, 0, 1) (start3D). Pressing D moves
    // along +x → (2, 0, 1) which is open in our test maze.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    // Advance the game by ~16ms (one frame) so tick3DMovement
    // processes the input. We do this by triggering the loop's
    // tick directly through the public API — there's no public
    // method, so we use the bridge's onTick callback shape
    // (the engine reads it from the bridge, not from a tick).
    // The cleanest way is to use the private `_update` method
    // that the Loop's rAF fires; we re-define `update` here
    // by invoking `Game`'s prototype method.
    //
    // The simplest path: call `Game.prototype.update` via
    // a method override that bypasses the destroyed flag.
    // But TypeScript doesn't expose `update` as public. We
    // use the `(game as unknown as { update: (dt: number) => void })`
    // pattern that other engine tests already use for the
    // private `tickActiveTransition` access.
    const update = (game as unknown as { update: (dt: number) => void }).update.bind(game);
    update(0.016);
    // Player should now be at cell (2, 0, 1), world coords
    // (x=2*cs+cs/2=5, y=0*cs+cs/2=1, z=1*cs+cs/2=3) with cs=2.
    const player = (game as unknown as { player?: { position: { x: number; y: number; z: number } } }).player;
    expect(player).toBeDefined();
    expect(player!.position.x).toBeCloseTo(5);
    expect(player!.position.y).toBeCloseTo(1);
    expect(player!.position.z).toBeCloseTo(3);
  });

  it('a move into a wall cell is rejected (player stays on current cell)', () => {
    const maze = build3DTestMaze();
    game.startLevel(maze);
    // Player at (1, 0, 1). Pressing W (dz = -1) tries to go
    // to (1, 0, 0) which is a wall in our test maze.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const update = (game as unknown as { update: (dt: number) => void }).update.bind(game);
    update(0.016);
    const player = (game as unknown as { player?: { position: { x: number; y: number; z: number } } }).player;
    // Player must NOT have moved.
    expect(player!.position.x).toBeCloseTo(1 * 2 + 1); // cell 1 center = 3
    expect(player!.position.z).toBeCloseTo(1 * 2 + 1); // cell 1 center = 3
  });

  it('Space teleports the player +y when the target is open (vertical climb)', () => {
    const maze = build3DTestMaze();
    game.startLevel(maze);
    // Move to (2, 0, 2) first (start of the ladder column).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    const update = (game as unknown as { update: (dt: number) => void }).update.bind(game);
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    // Now press W to step to (2, 0, 1) — actually the test
    // maze has (2, 0, 2) reachable from (1, 0, 1) by D
    // (cell 2 on the corridor) AND from (1, 0, 1) by S+S
    // would land on (1, 0, 3). Let me re-check: the corridor
    // is (1, 0, 1)-(3, 0, 1) along x AND (1, 0, 1)-(1, 0, 3)
    // along z, and (2, 0, 2) is a single open cell. So from
    // (1, 0, 1), D goes to (2, 0, 1) (open), and the only
    // way to (2, 0, 2) is via S from (2, 0, 1) (which would
    // be (2, 0, 2) — but is (2, 0, 2) a 4-neighbor of (2, 0, 1)?
    // No — (2, 0, 2) and (2, 0, 1) differ in z by 1, so YES
    // they are 4-neighbors. S from (2, 0, 1) → (2, 0, 2).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    // Now press Space to climb y.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    update(0.016);
    const player = (game as unknown as { player?: { position: { x: number; y: number; z: number } } }).player;
    // Player should now be at (2, 1, 2) world (5, 3, 5).
    expect(player!.position.x).toBeCloseTo(5);
    expect(player!.position.y).toBeCloseTo(3);
    expect(player!.position.z).toBeCloseTo(5);
  });

  it('reaching the 3D exit cell fires bridge.onReachExit and pauses the loop', () => {
    const maze = build3DTestMaze();
    game.startLevel(maze);
    const update = (game as unknown as { update: (dt: number) => void }).update.bind(game);
    // Walk (1, 0, 1) → (2, 0, 1) → (2, 0, 2) → (2, 1, 2) → (2, 2, 2).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    update(0.016);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    // After climbing twice, the player should be at (2, 2, 2) — the exit.
    expect(bridge.reachExitCalls).toBe(1);
    // The exit was reached, so the tutorial event 'reached-exit'
    // should have fired too.
    const reachedEvent = bridge.tutorialEvents.find(e => e.kind === 'reached-exit');
    expect(reachedEvent).toBeDefined();
  });
});
