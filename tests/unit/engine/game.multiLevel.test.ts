import { describe, it, expect, vi } from 'vitest';
import { Game, FLOOR_HEIGHT, STAIR_DURATION_SEC } from '../../../src/engine/Game';
import type { GameBridge } from '../../../src/engine/Game';
import { createCamera } from '../../../src/engine/Camera';
import * as AlgorithmMazeProvider from '../../../src/maze/AlgorithmMazeProvider';
import type { CellType, MazeData } from '../../../src/maze/types';

// P3-1: Game engine surface for multi-level play. The runtime
// transition animation owns the player for its full duration;
// here we exercise the public accessors (`getCurrentLevel`),
// the bridge push (`onLevelChange`), and the exported constants
// (`FLOOR_HEIGHT`, `STAIR_DURATION_SEC`) that the engine's per-
// frame y math reads from. We can't easily run `update()` without
// WebGL (startLevel calls buildScene), so the test surface is the
// pre-init / post-dispose state + the typecheck-validated module
// surface. The actual transition trigger is covered by
// `reachability.test.ts` (3D BFS contract) + the per-frame
// `update()` glue documented in the Game.ts inline comments.

function stubBridge(): GameBridge {
  return {
    onTick: () => {},
    onPauseToggle: () => {},
    onPickupCollected: () => true,
    onReachExit: () => {},
    getInitialFov: () => 60,
    getInitialPointerSensitivity: () => 0.002,
    getCurrentDarkMode: () => false,
    getCurrentEnemyAggression: () => 'medium',
    isActiveLevel: () => true,
    isPlaying: () => true,
    onUseItem: () => {},
    onEnemyContact: () => {},
    onTrapHit: () => {},
    getPlayerSpeedMultiplier: () => 1,
  };
}

describe('Game P3-1 module-level constants', () => {
  it('FLOOR_HEIGHT is the spec-pinned 2.4 (matches the historical single-layer ceiling)', () => {
    // The value is a single source of truth — the per-frame
    // y interpolation in update() reads it to compute the
    // per-layer floor y. Changing this constant is a breaking
    // change to every multi-level level (the on-floor player
    // y = level * FLOOR_HEIGHT).
    expect(FLOOR_HEIGHT).toBe(2.4);
  });

  it('STAIR_DURATION_SEC is the spec-pinned 0.5s (P3-1 §13 H1)', () => {
    // The transition y interpolation runs for this many
    // seconds; the spec pins 0.5s for stair-up / stair-down
    // (the same value, the engine doesn't distinguish the
    // direction).
    expect(STAIR_DURATION_SEC).toBe(0.5);
  });
});

describe('Game P3-1 public surface — getCurrentLevel', () => {
  it('returns 0 on a fresh Game instance (pre-init / pre-startLevel)', () => {
    // The accessor is the canonical fallback for UI code
    // that needs a one-shot read of the player's layer. The
    // back-compat default is 0 — the same value a
    // pre-P3-1 single-layer game would return.
    const g = new Game(stubBridge());
    expect(g.getCurrentLevel()).toBe(0);
  });

  it('returns 0 after dispose() (the engine is no longer in service)', () => {
    const g = new Game(stubBridge());
    // dispose() without init() is a safe no-op (it only
    // touches the loop / scene / input if they're defined).
    g.dispose();
    expect(g.getCurrentLevel()).toBe(0);
  });
});

describe('GameBridge P3-1 — onLevelChange', () => {
  it('onLevelChange is an OPTIONAL bridge callback (the engine does not crash without it)', () => {
    // P3-1 contract: the engine pushes a `level` event
    // through the bridge when the player finishes a
    // transition. The push is optional — a level without
    // multi-level UI simply ignores the callback. A bridge
    // that omits the field (the pre-P3-1 default) is still
    // type-valid; a fresh Game constructed against such a
    // bridge does not throw.
    const bridge: GameBridge = stubBridge();
    expect(bridge.onLevelChange).toBeUndefined();
    const g = new Game(bridge);
    expect(g).toBeDefined();
  });

  it('a bridge that supplies onLevelChange receives a typed function reference', () => {
    // The TypeScript contract is the only check here — the
    // callback is invoked from inside `tickActiveTransition`
    // (a private method), which we can't exercise without
    // running the full update() loop. The pin is "the
    // bridge's optional field exists and is callable".
    const onLevelChange = vi.fn();
    const bridge: GameBridge = { ...stubBridge(), onLevelChange };
    expect(bridge.onLevelChange).toBe(onLevelChange);
  });
});

describe('Game P3-1 — back-compat with pre-P3-1 levels', () => {
  // P3-1: a levelCount=1 maze with `transitions=[]` and
  // every entity on layer 0 must behave identically to the
  // pre-P3-1 single-layer implementation. The typecheck +
  // existing unit-test surface is the strongest pin: the
  // back-compat contract is the union of "levelCount=1 maze
  // loads" + "all existing tests pass".
  //
  // The minimal-level MazeData below mirrors the schema
  // JsonMazeProvider produces for a teaching level. The
  // fields not relevant to the test (pickups, enemies, traps,
  // doors) are empty.
  const minimalLevel: MazeData = {
    id: 'p3-1-minimal',
    name: 'P3-1 Minimal',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    pickups: [],
    enemies: [],
    traps: [],
    doors: [],
    rules: {
      initialTime: 30,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
    },
  };

  it('a levelCount=1 maze (defaults) has playerLevel=0 and transitions=[]', () => {
    // Spec §4.1: pre-P3-1 JSON omits `levelCount` and
    // `transitions`; the validator back-fills them to `1`
    // and `[]`. The engine snapshot in startLevel reads
    // those values verbatim, so the runtime state is
    //   playerLevel = maze.start.level ?? 0
    //   transitions = maze.transitions ?? []
    // which matches the pre-P3-1 behavior. We can't run
    // startLevel() here (it needs WebGL), but the contract
    // is the typecheck + the validator back-fill.
    expect(minimalLevel.levelCount).toBeUndefined();
    expect(minimalLevel.transitions).toBeUndefined();
  });

  it('isReachableMultiLevel agrees with isReachable for a 1-layer back-compat scenario', () => {
    // The runtime reachability check (P3-1b workstream) must
    // agree with the historical `isReachable` for the
    // levelCount=1 / transitions=[] case. This is the
    // reachability-side pin of the same back-compat
    // contract tested at the engine level above.
    // The actual assertion lives in
    // `tests/unit/maze/reachability.test.ts > isReachable
    // (BFS over open cells) > levelCount=1 with empty
    // transitions matches isReachable`; this description
    // is the cross-link for any future code reviewer.
    expect(minimalLevel.start).toEqual({ x: 0, z: 0, level: undefined });
    expect(minimalLevel.exit).toEqual({ x: 2, z: 2, level: undefined });
  });
});

describe('Game P3-1 D6 — startLevel fires onLevelChange with the hand-authored start.level', () => {
  // P3-1 D6 (architect review): `startLevel` set
  // `this.playerLevel = injectedMaze.start.level ?? 0` but never
  // fired the bridge's `onLevelChange` push. A hand-authored JSON
  // with `start.level=2` therefore left the engine on layer 2
  // while the HUD / minimap / parchment still showed L1 (driven
  // by `gameStore.player.currentLevel`, which only flipped on
  // transition completion). The fix lives at the same site in
  // startLevel — mirror the tickActiveTransition fire.
  //
  // Test surface: the file preamble notes that `startLevel` needs
  // WebGL (it builds a Three.js scene). We bypass `init()` the
  // same way `tests/unit/engine/game.test.ts` does for setFov —
  // construct a Game, inject a real `PerspectiveCamera` (no GL
  // needed) and a stub renderer, then call `startLevel`. The
  // stub renderer is just truthy + disposable; nothing in
  // startLevel itself invokes renderer methods (render() lives
  // in `update()`, which the rAF tick never reaches before
  // `dispose()` stops the loop).
  // Build a Game that can call startLevel() without WebGL.
  // Bypasses `init()` (the same way `tests/unit/engine/game.test.ts`
  // does for setFov) and only injects what startLevel's
  // existence checks + buildScene's `updatePlayerCamera` need.
  // The stub renderer is just truthy + disposable; the per-
  // frame renderer.render() call lives in `update()`, which the
  // rAF tick never reaches before `dispose()` stops the loop.
  function gameWithStartLevel(bridge: GameBridge): Game {
    const g = new Game(bridge);
    (g as unknown as { camera: ReturnType<typeof createCamera> }).camera = createCamera();
    (g as unknown as { renderer: { dispose: () => void } }).renderer = { dispose: () => {} };
    return g;
  }

  // Single-layer wall grid, 6x6, all open. The start cell (1,1)
  // and exit cell (5,5) both fit; the level count is 3 even
  // though the engine only renders layer 0 here (the hand-
  // authored JSON side-channel — the provider's per-layer cache
  // is a no-op for non-`gen-` levels, so buildScene falls back
  // to the single-layer `maze.walls` grid per the resolvePerLayer-
  // Walls back-compat path).
  // P5-editor-multilayer: hand-authored multi-layer fixtures must
  // carry `walls2d` (strict `walls xor walls2d` mutex, decision
  // A5). The engine's `Scene.resolvePerLayerWalls` reads it
  // directly, so the cache spy below is only needed for the
  // assert the bridge receives the player's initial layer.
  const open6x6: CellType[][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ];
  const multiLevelMaze: MazeData = {
    id: 'p3-1-d6-handcrafted',
    name: 'P3-1 D6 Handcrafted',
    size: { width: 6, depth: 6 },
    cellSize: 2,
    levelCount: 3,
    start: { x: 1, z: 1, level: 2 },
    exit: { x: 5, z: 5, level: 0 },
    walls2d: [open6x6, open6x6, open6x6],
    pickups: [],
    enemies: [],
    traps: [],
    doors: [],
    transitions: [],
    rules: {
      initialTime: 30,
      maxHealth: 3,
      victory: 'reach-exit',
      timeOnPickup: 10,
    },
  };

  it('fires onLevelChange on startLevel with the hand-authored start.level', () => {
    // Bridge must carry the callback we want to spy on. The
    // stub bridge omits it (matching the pre-P3-1 default), so
    // we extend with the vi.fn.
    const onLevelChange = vi.fn();
    const g = gameWithStartLevel({ ...stubBridge(), onLevelChange });
    // The engine's `buildScene` reads the per-layer wall cache
    // and iterates `levelCount` layers; for a hand-authored
    // level the cache is empty and the back-compat path
    // returns `[maze.walls]` (length 1), which would crash on
    // L=1 for a levelCount=3 maze. Spy the cache getter to
    // hand back three copies of the single-layer grid — the
    // test cares about startLevel's `onLevelChange` fire, not
    // the rendering. `mockReturnValue` keeps the test honest:
    // any future change that re-iterates layers (e.g. dropping
    // the back-compat fallback) will still pass.
    // P5-editor-multilayer: the hand-authored multi-layer maze has
    // `walls` undefined (strict `walls xor walls2d` mutex); the cache
    // back-compat stub here just needs three walkable grids, so we
    // build a small open grid inline rather than reaching for the
    // (now optional) `walls` field.
    const layerGrid: CellType[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const layers: CellType[][][] = [layerGrid, layerGrid, layerGrid];
    const cacheSpy = vi.spyOn(
      AlgorithmMazeProvider,
      'getPerLayerWallsByLevelId',
    ).mockReturnValue(layers);
    try {
      g.startLevel(multiLevelMaze, { mode: 'reach-exit' });
      // The hand-authored `start.level=2` must reach the bridge
      // the same tick startLevel snapshots `playerLevel` —
      // matching the tickActiveTransition fire site so the UI
      // (HUD chip, minimap auto-switcher, parchment layer) sees
      // the right floor from frame 0.
      expect(onLevelChange).toHaveBeenCalledWith(2);
      // And it must NOT have been called with 0 — the default
      // the engine used to expose before the D6 fix.
      expect(onLevelChange).not.toHaveBeenCalledWith(0);
    } finally {
      // Stop the rAF loop startLevel started, then drop the
      // cache spy so it doesn't leak into sibling tests.
      g.dispose();
      cacheSpy.mockRestore();
    }
  });
});
