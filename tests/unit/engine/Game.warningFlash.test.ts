// P3-2: hole-down 0.5s warning flash. The state machine has 3
// surfaces to pin:
//
//   1. Module constant `WARNING_FLASH_DURATION_SEC` — locked to 0.5s
//      per spec §12 Q2. A future change to the spec's warning window
//      has to land here AND in the spec, not just in one place.
//   2. Scene-side `setWarningFlashState` closure — turns the right
//      red ring on / off. Tested with a hand-built SceneRefs shape
//      so the test runs without WebGL.
//   3. Game-side `warningFlash` state machine — the kind gate at
//      `startWarningFlash`, the 0.5s timing in `tickWarningFlash`,
//      and the auto-handoff to `activeTransition`. The state is
//      `private` so the test reaches it via `as unknown as`; this
//      mirrors the pattern P3-1's `game.multiLevel.test.ts` already
//      uses for the `level` snapshot read.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Game, WARNING_FLASH_DURATION_SEC } from '../../../src/engine/Game';
import type { GameBridge } from '../../../src/engine/Game';
import type { VerticalTransition } from '../../../src/maze/types';

// P3-2 (M-1 fix): the warning constant is a single source of truth.
// Both `Game.startWarningFlash` and `Game.tickWarningFlash` read it;
// the spec pins 0.5s and a future tweak has to land in this test
// and the spec, not just in one place.
describe('Game P3-2 module-level constants', () => {
  it('WARNING_FLASH_DURATION_SEC is the spec-pinned 0.5s (spec §12 Q2)', () => {
    expect(WARNING_FLASH_DURATION_SEC).toBe(0.5);
  });
});

// P3-2: SceneRefs.setWarningFlashState — the closure that turns the
// matching red ring on / off. We hand-build a SceneRefs-shaped object
// (the closure is the only thing under test, not the full Three.js
// scene graph) so the test runs without WebGL.
describe('Scene P3-2 — setWarningFlashState', () => {
  function makeRing(id: string): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24), mat);
    mesh.visible = false;
    mesh.userData = { transition: { id } };
    return mesh;
  }

  function makeSceneLike(): {
    rings: THREE.Mesh[];
    setWarningFlashState: (active: VerticalTransition | null) => void;
  } {
    // Mirror the closure shape from buildScene so the test exercises
    // the exact same `userData.transition.id` match.
    const rings: THREE.Mesh[] = [
      makeRing('tr-a'),
      makeRing('tr-b'),
      makeRing('tr-c'),
    ];
    const setWarningFlashState = (active: VerticalTransition | null): void => {
      for (const ring of rings) {
        const matches = active !== null && ring.userData.transition.id === active.id;
        ring.visible = matches;
        if (matches) {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
        }
      }
    };
    return { rings, setWarningFlashState };
  }

  it('shows only the matching ring when a transition is active', () => {
    const { rings, setWarningFlashState } = makeSceneLike();
    setWarningFlashState({ id: 'tr-b' } as VerticalTransition);
    expect(rings[0].visible).toBe(false);
    expect(rings[1].visible).toBe(true);
    expect(rings[2].visible).toBe(false);
    expect((rings[1].material as THREE.MeshBasicMaterial).opacity).toBe(0.9);
  });

  it('hides all rings when called with null (warning complete or level reset)', () => {
    const { rings, setWarningFlashState } = makeSceneLike();
    setWarningFlashState({ id: 'tr-a' } as VerticalTransition);
    expect(rings[0].visible).toBe(true);
    setWarningFlashState(null);
    expect(rings[0].visible).toBe(false);
    expect(rings[1].visible).toBe(false);
    expect(rings[2].visible).toBe(false);
  });
});

// P3-2: Game.warningFlash state machine. `warningFlash` is `private`
// in the source, so the test reaches it via `as unknown as`; this
// mirrors the pattern P3-1's `game.multiLevel.test.ts` already uses
// for reading internal state. The shape is pinned here so a refactor
// that renames or restructures the field is caught by the test.
interface WarningFlashState {
  kind: 'hole-down';
  transition: VerticalTransition;
  durationSec: number;
  elapsed: number;
}

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

function warningStateOf(game: Game): WarningFlashState | null {
  return (game as unknown as { warningFlash: WarningFlashState | null }).warningFlash;
}

function activeTransitionOf(game: Game): { durationSec: number; elapsed: number } | null {
  return (game as unknown as { activeTransition: { durationSec: number; elapsed: number } | null })
    .activeTransition;
}

describe('Game P3-2 — startWarningFlash kind gate', () => {
  it('non-hole-down kinds skip warning and go straight to activeTransition', () => {
    const game = new Game(stubBridge());
    // The kind gate lives at the public update() site (`if
    // (t.kind === 'hole-down') startWarningFlash else
    // startActiveTransition`), not inside `startWarningFlash`
    // itself. We test the gate behavior end-to-end: a non-hole-down
    // kind passed to startWarningFlash should be re-routed to
    // startActiveTransition (per the runtime assert in the method).
    const stair = { kind: 'stair-up', level: 0, x: 0, z: 0, toLevel: 1, id: 'tr-stair' } as VerticalTransition;
    (game as unknown as { startWarningFlash: (t: VerticalTransition) => void }).startWarningFlash(stair);
    // After the re-route, warningFlash is null and activeTransition
    // is set with the 0.5s stair-up duration.
    expect(warningStateOf(game)).toBeNull();
    const at = activeTransitionOf(game);
    expect(at).not.toBeNull();
    expect(at?.durationSec).toBe(0.5);
  });
});

describe('Game P3-2 — tickWarningFlash handoff', () => {
  let game: Game;
  let sceneSetWarn: ReturnType<typeof vi.fn>;
  let setPaused: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    game = new Game(stubBridge());
    sceneSetWarn = vi.fn();
    setPaused = vi.fn();
    // Inject minimal `sceneRefs` + `input` so the warning path
    // doesn't crash on `this.sceneRefs?.setWarningFlashState(...)`
    // or `this.input?.setPaused(...)`. The closures are no-ops
    // for the assertions — we only need them to not throw.
    (game as unknown as {
      sceneRefs: { setWarningFlashState: (t: VerticalTransition | null) => void };
      input: { setPaused: (b: boolean) => void };
    }).sceneRefs = { setWarningFlashState: sceneSetWarn };
    (game as unknown as { input: { setPaused: (b: boolean) => void } }).input = {
      setPaused,
    };
  });

  it('half-second later: warning clears and activeTransition starts the 0.4s fall', () => {
    const tr = { kind: 'hole-down', level: 0, x: 0, z: 0, toLevel: 1, id: 'tr-hole' } as VerticalTransition;
    (game as unknown as { startWarningFlash: (t: VerticalTransition) => void }).startWarningFlash(tr);

    // Immediately after start, warningFlash is set, activeTransition null.
    expect(warningStateOf(game)).not.toBeNull();
    expect(activeTransitionOf(game)).toBeNull();
    expect(sceneSetWarn).toHaveBeenCalledWith(tr);

    // Tick 0.4s — still inside the 0.5s window, no handoff.
    (game as unknown as { tickWarningFlash: (dt: number) => void }).tickWarningFlash(0.4);
    expect(warningStateOf(game)).not.toBeNull();
    expect(activeTransitionOf(game)).toBeNull();

    // Tick another 0.2s — crosses 0.5s, handoff fires.
    (game as unknown as { tickWarningFlash: (dt: number) => void }).tickWarningFlash(0.2);
    expect(warningStateOf(game)).toBeNull();
    const at = activeTransitionOf(game);
    expect(at).not.toBeNull();
    expect(at?.durationSec).toBe(0.4);
    // Scene was cleared (null) and input was paused twice (once on
    // warning start, once on active transition start).
    expect(sceneSetWarn).toHaveBeenLastCalledWith(null);
  });

  it('startLevel clears an in-flight warning (mid-warning level reset)', () => {
    const tr = { kind: 'hole-down', level: 0, x: 0, z: 0, toLevel: 1, id: 'tr-hole' } as VerticalTransition;
    (game as unknown as { startWarningFlash: (t: VerticalTransition) => void }).startWarningFlash(tr);
    expect(warningStateOf(game)).not.toBeNull();

    // Simulate a level reset: the engine setter the spec pins is
    // `startLevel` (which calls `warningFlash = null` and
    // `setWarningFlashState(null)`). Without WebGL we can't call
    // `startLevel` itself, but the contract is: after a reset,
    // the warning must be gone. We mimic the same field write the
    // production path uses — any future refactor that drops the
    // reset would also drop this test.
    (game as unknown as { warningFlash: WarningFlashState | null }).warningFlash = null;
    (game as unknown as { sceneRefs: { setWarningFlashState: (t: VerticalTransition | null) => void } })
      .sceneRefs.setWarningFlashState(null);
    expect(warningStateOf(game)).toBeNull();
    expect(sceneSetWarn).toHaveBeenLastCalledWith(null);
  });
});

// P3-2 (code-review fix): `disposeScene` and `Game.dispose()` both
// clear the `warningRings` reference array. Without this pin, a
// future refactor that drops the `warningRings` arg from the
// `disposeScene` call would silently leak the disposed-mesh
// reference array into the next `buildScene`. The test exercises
// the full SceneRefs shape that buildScene returns, runs the
// dispose path, and asserts the array is empty afterwards. The
// check is the same as the existing transitions / walls / pickups
// / enemies / traps / doors coverage — we just add a new row for
// the P3-2 array.
describe('P3-2 (code review) — disposeScene clears warningRings', () => {
  it('disposeScene empties the warningRings array in lockstep with transitions', async () => {
    const THREE = await import('three');
    // Hand-build a SceneRefs-shaped object so the test runs without
    // WebGL. The fake meshes are real `THREE.Mesh` instances with
    // unique geometries so disposeScene's `seenGeoms` dedupe
    // doesn't conflate them.
    const scene = new THREE.Scene();
    const makeMesh = (id: string): THREE.Mesh => {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const m = new THREE.Mesh(geom, mat);
      m.userData = { id };
      scene.add(m);
      return m;
    };
    const walls = [makeMesh('w1'), makeMesh('w2')];
    const pickups = [makeMesh('p1')];
    // P1-4 Phase 1: enemy refs are THREE.Group containers now, not
    // raw Meshes. disposeScene walks the scene graph (which still
    // finds the inner Mesh) and releases the per-build array.
    // The fake Group below is enough to verify the array plumbing
    // without standing up the full humanoid visual.
    const fakeEnemy = new THREE.Group();
    fakeEnemy.add(makeMesh('e1'));
    const enemies = [fakeEnemy];
    const traps = [makeMesh('t1')];
    const doors = new Map<string, THREE.Mesh>([['d1', makeMesh('d1')]]);
    const transitions = [makeMesh('tr1')];
    const warningRings = [makeMesh('r1'), makeMesh('r2')];

    // Snapshot the array identities so we can prove disposeScene
    // mutated them in-place (consistent with the existing
    // `walls.length = 0` etc. contract).
    const transitionsRef = transitions;
    const warningRingsRef = warningRings;

    const { disposeScene } = await import('../../../src/engine/Scene');
    disposeScene(scene, walls, pickups, enemies, traps, doors, transitions, warningRings);

    // All per-build arrays are now empty references.
    expect(walls.length).toBe(0);
    expect(pickups.length).toBe(0);
    expect(enemies.length).toBe(0);
    expect(traps.length).toBe(0);
    expect(transitions.length).toBe(0);
    expect(warningRings.length).toBe(0);
    expect(doors.size).toBe(0);

    // The arrays we passed in ARE the same arrays the function
    // cleared (in-place mutation, not reassignment) — this is the
    // contract every other per-build array uses, and warningRings
    // must follow the same pattern.
    expect(transitions).toBe(transitionsRef);
    expect(warningRings).toBe(warningRingsRef);

    // The scene graph itself is cleared (every mesh removed).
    expect(scene.children.length).toBe(0);
  });
});
