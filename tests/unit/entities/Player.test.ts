import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_RADIUS,
  EYE_HEIGHT,
  FLOOR_HEIGHT,
  createPlayer,
  applyLook,
  updatePlayerCamera,
  applyVerticalTransition,
  updatePlayerTransition,
  STAIR_UP_DURATION_SEC,
  HOLE_DOWN_DURATION_SEC,
  type PlayerState,
} from '../../../src/entities/Player';

function makePlayer(): PlayerState {
  return {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    speed: 1,
    radius: 0.1,
    currentLevel: 0,
    inputLocked: false,
    transitionStartTime: 0,
    transitionFromY: 0,
    transitionToY: 0,
    transitionDuration: 0,
  };
}

describe('createPlayer', () => {
  it('places the player at the cell CENTER (not corner) and seeds sensible defaults', () => {
    // Cell (2,3) with cellSize 2 should map to world (5, 7) — i.e.
    // x = cellX*cs + cs/2 (the cell center), never x = cellX*cs (the
    // cell's corner). A regression to corner placement would put the
    // player on a wall edge in tight cells.
    const p = createPlayer({ x: 2, z: 3 }, 2);
    expect(p.position).toEqual({ x: 5, y: 0, z: 7 });
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.speed).toBe(3);
    expect(p.radius).toBe(PLAYER_RADIUS);
    expect(p.currentLevel).toBe(0);
    expect(p.inputLocked).toBe(false);
  });

  it('scales the cell-center offset with cellSize', () => {
    // Same cell index, different cellSize: position must scale
    // linearly so the cell-center invariant holds regardless of grid
    // resolution.
    const p1 = createPlayer({ x: 0, z: 0 }, 1);
    const p2 = createPlayer({ x: 0, z: 0 }, 4);
    expect(p1.position).toEqual({ x: 0.5, y: 0, z: 0.5 });
    expect(p2.position).toEqual({ x: 2, y: 0, z: 2 });
  });

  it('honors the start cell\'s `level` field — multi-layer spawn', () => {
    // P3-1: a start cell on layer 3 places the player at y = 3 *
    // FLOOR_HEIGHT (their feet on the 4th floor's floor).
    const p = createPlayer({ x: 0, z: 0, level: 3 }, 2);
    expect(p.position.y).toBe(3 * FLOOR_HEIGHT);
    expect(p.currentLevel).toBe(3);
  });
});

describe('applyLook', () => {
  it('wraps yaw correctly when it approaches 360 degrees (no precision drift)', () => {
    // Three.js PointerLockControls convention: yaw -= mouse.x. The
    // wrap formula is `((yaw + π) mod 2π + 2π) mod 2π - π` so the
    // visible range is (-π, π]. Feed in a yaw near 3π (i.e. the
    // player has spun past 360°) and confirm the result lands back in
    // the canonical range — and the sign stays correct, since the
    // `%` operator in JS returns the dividend's sign for negative
    // operands.
    const p = makePlayer();
    p.yaw = Math.PI * 3 - 0.0001; // just under 3π
    applyLook(p, { x: 0, y: 0 });
    expect(p.yaw).toBeGreaterThan(-Math.PI);
    expect(p.yaw).toBeLessThanOrEqual(Math.PI);

    // And feeding a large negative yaw (past -π) wraps cleanly.
    const p2 = makePlayer();
    p2.yaw = -Math.PI * 3 + 0.0001;
    applyLook(p2, { x: 0, y: 0 });
    expect(p2.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(p2.yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('clamps pitch to (-π/2, π/2) regardless of mouse.y magnitude', () => {
    const p = makePlayer();
    applyLook(p, { x: 0, y: 100 });
    expect(p.pitch).toBeLessThanOrEqual(Math.PI / 2);
    expect(p.pitch).toBeGreaterThanOrEqual(-Math.PI / 2 + 0.01);
    applyLook(p, { x: 0, y: -100 });
    expect(p.pitch).toBeGreaterThanOrEqual(-Math.PI / 2);
    expect(p.pitch).toBeLessThanOrEqual(Math.PI / 2 - 0.01);
  });
});

describe('updatePlayerCamera', () => {
  it('does not throw on degenerate fov / extreme yaw inputs', () => {
    // updatePlayerCamera only mutates the camera; it has no fov
    // parameter, but a fov of 0 / NaN on the camera must not crash
    // the call. Pair the degenerate camera with a player whose yaw
    // and pitch are at the wrap edges to also exercise the Euler
    // construction path under stress.
    const makeCam = (fov: number): THREE.PerspectiveCamera => {
      const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 100);
      return c;
    };
    const p = makePlayer();
    p.yaw = Math.PI * 2.5; // 450°
    p.pitch = Math.PI / 2 - 0.005; // right at the upper clamp
    expect(() => updatePlayerCamera(makeCam(75), p)).not.toThrow();
    expect(() => updatePlayerCamera(makeCam(0), p)).not.toThrow();
    expect(() => updatePlayerCamera(makeCam(Number.NaN), p)).not.toThrow();

    // Sanity: camera position was still pinned to the player at
    // y = player.position.y + EYE_HEIGHT. For the default
    // makePlayer() (y = 0) the camera y is exactly EYE_HEIGHT
    // (1.6m).
    const cam = makeCam(75);
    updatePlayerCamera(cam, p);
    expect(cam.position.x).toBe(p.position.x);
    expect(cam.position.y).toBe(EYE_HEIGHT);
    expect(cam.position.z).toBe(p.position.z);
  });

  it('writes a YXZ Euler with z=0 (level horizon) and y=yaw, x=pitch', () => {
    const p = makePlayer();
    p.yaw = 0.4;
    p.pitch = 0.1;
    const setFromEuler = vi.fn();
    const cam = {
      position: { set: vi.fn() },
      quaternion: { setFromEuler },
    } as unknown as THREE.PerspectiveCamera;
    updatePlayerCamera(cam, p);
    const euler = setFromEuler.mock.calls[0][0] as THREE.Euler;
    expect(euler.order).toBe('YXZ');
    expect(euler.x).toBeCloseTo(p.pitch);
    expect(euler.y).toBeCloseTo(p.yaw);
    expect(euler.z).toBe(0);
  });

  it('lifts the camera to the multi-layer player\'s standing eye height', () => {
    // P3-1: a player on layer 2 (y = 2 * FLOOR_HEIGHT) has their
    // camera at y = 2 * FLOOR_HEIGHT + EYE_HEIGHT. A regression
    // to the pre-P3-1 hard-coded y = 1.6 would still show the
    // camera on the bottom floor while the rest of the engine
    // thinks the player is upstairs — a 4.8m parallax that
    // breaks the first-person view.
    const p = createPlayer({ x: 0, z: 0, level: 2 }, 2);
    const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    updatePlayerCamera(cam, p);
    expect(cam.position.y).toBeCloseTo(2 * FLOOR_HEIGHT + EYE_HEIGHT);
  });
});

describe('applyVerticalTransition (P3-1)', () => {
  it('pins currentLevel, locks input, and arms the y tween endpoints', () => {
    const p = createPlayer({ x: 0, z: 0, level: 0 }, 2);
    applyVerticalTransition(p, 1, 1 * FLOOR_HEIGHT, STAIR_UP_DURATION_SEC, 'stair-up', 100);
    expect(p.currentLevel).toBe(1);
    expect(p.inputLocked).toBe(true);
    expect(p.transitionStartTime).toBe(100);
    expect(p.transitionFromY).toBe(0);
    expect(p.transitionToY).toBe(FLOOR_HEIGHT);
    expect(p.transitionDuration).toBe(STAIR_UP_DURATION_SEC);
  });

  it('uses the kind-specific default duration when given a non-finite / ≤ 0 value', () => {
    // Defensive: a NaN / 0 / negative duration would freeze the
    // player mid-air or snap them instantly. The helper falls
    // back to the kind-specific default (0.5s stair-up, 0.4s
    // hole-down) so the tween math stays safe.
    const p1 = createPlayer({ x: 0, z: 0, level: 0 }, 2);
    applyVerticalTransition(p1, 1, FLOOR_HEIGHT, 0, 'stair-up', 0);
    expect(p1.transitionDuration).toBe(STAIR_UP_DURATION_SEC);

    const p2 = createPlayer({ x: 0, z: 0, level: 1 }, 2);
    applyVerticalTransition(p2, 0, 0, NaN, 'hole-down', 0);
    expect(p2.transitionDuration).toBe(HOLE_DOWN_DURATION_SEC);
  });
});

describe('updatePlayerTransition (P3-1)', () => {
  it('is a no-op when no tween is armed', () => {
    const p = makePlayer();
    // Both transitionDuration and transitionStartTime are 0.
    expect(updatePlayerTransition(p, 1000)).toBe(false);
    expect(p.position.y).toBe(0);
    expect(p.inputLocked).toBe(false);
  });

  it('interpolates position.y linearly across the tween window', () => {
    const p = makePlayer();
    applyVerticalTransition(p, 1, FLOOR_HEIGHT, 1.0, 'stair-up', 0);
    // At t=0 the player is still at the source y.
    updatePlayerTransition(p, 0);
    expect(p.position.y).toBeCloseTo(0, 5);
    expect(p.inputLocked).toBe(true);
    expect(updatePlayerTransition(p, 0)).toBe(true);

    // Halfway through: player is at FLOOR_HEIGHT / 2.
    updatePlayerTransition(p, 0.5);
    expect(p.position.y).toBeCloseTo(FLOOR_HEIGHT / 2, 5);
    expect(p.inputLocked).toBe(true);

    // Just before completion: still interpolating.
    updatePlayerTransition(p, 0.999);
    expect(p.position.y).toBeLessThan(FLOOR_HEIGHT);
    expect(p.inputLocked).toBe(true);
  });

  it('snaps to target y and unlocks input when the tween completes', () => {
    const p = makePlayer();
    applyVerticalTransition(p, 1, FLOOR_HEIGHT, 0.5, 'stair-up', 100);
    // Past the tween end (0.5s after start = 100.5 wall-clock).
    const stillGoing = updatePlayerTransition(p, 100.6);
    expect(stillGoing).toBe(false);
    expect(p.position.y).toBeCloseTo(FLOOR_HEIGHT, 5);
    expect(p.inputLocked).toBe(false);
    // The tween fields are reset so a follow-up call is a no-op.
    expect(p.transitionStartTime).toBe(0);
    expect(p.transitionDuration).toBe(0);
  });

  it('handles a `nowSec` that arrives in the past relative to the tween start (defensive)', () => {
    // Edge case: the engine's clock could in principle be reset
    // (e.g. on a tab visibility flip the rAF clock pauses and
    // resumes). The function should keep the tween armed rather
    // than completing it instantly.
    const p = makePlayer();
    applyVerticalTransition(p, 1, FLOOR_HEIGHT, 0.5, 'stair-up', 100);
    const stillGoing = updatePlayerTransition(p, 50);
    expect(stillGoing).toBe(true);
    expect(p.inputLocked).toBe(true);
  });
});

describe('PLAYER_RADIUS (P2-2 collision contract)', () => {
  it('is exported as 0.2 — the source of truth for MIN_CELL_SIZE validation', () => {
    // The export is the single source of truth for the player
    // collision radius. JsonMazeProvider derives MIN_CELL_SIZE from
    // it; a silent change here would also shrink the minimum cell
    // size and let designers ship sub-radius cells.
    expect(PLAYER_RADIUS).toBe(0.2);
  });
});

describe('EYE_HEIGHT / FLOOR_HEIGHT (P3-1 shared y-axis math)', () => {
  it('EYE_HEIGHT is 1.6 — the standing eye height (matches pre-P3-1 camera y)', () => {
    // P3-1: the camera y collapses to EYE_HEIGHT when player.y is
    // 0, which is what every pre-P3-1 level assumes. A drift to
    // a different value would silently re-frame the world.
    expect(EYE_HEIGHT).toBe(1.6);
  });

  it('FLOOR_HEIGHT is 2.4 — matches the pre-P3-1 ceiling height (flush stack)', () => {
    // P3-1: the layer L floor is at y = L * FLOOR_HEIGHT and the
    // layer L ceiling is at y = (L+1) * FLOOR_HEIGHT. The wall
    // mesh height (Scene.ts) is also FLOOR_HEIGHT so each layer
    // is a closed 2.4m box; layer L's ceiling and layer (L+1)'s
    // floor share y = (L+1) * FLOOR_HEIGHT, with no gap and no
    // overlap.
    expect(FLOOR_HEIGHT).toBe(2.4);
  });
});
