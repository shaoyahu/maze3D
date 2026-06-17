import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_RADIUS,
  createPlayer,
  applyLook,
  updatePlayerCamera,
  type PlayerState,
} from '../../../src/entities/Player';

function makePlayer(): PlayerState {
  return { position: { x: 0, z: 0 }, yaw: 0, pitch: 0, speed: 1, radius: 0.1 };
}

describe('createPlayer', () => {
  it('places the player at the cell CENTER (not corner) and seeds sensible defaults', () => {
    // Cell (2,3) with cellSize 2 should map to world (5, 7) — i.e.
    // x = cellX*cs + cs/2 (the cell center), never x = cellX*cs (the
    // cell's corner). A regression to corner placement would put the
    // player on a wall edge in tight cells.
    const p = createPlayer({ x: 2, z: 3 }, 2);
    expect(p.position).toEqual({ x: 5, z: 7 });
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.speed).toBe(3);
    expect(p.radius).toBe(PLAYER_RADIUS);
  });

  it('scales the cell-center offset with cellSize', () => {
    // Same cell index, different cellSize: position must scale
    // linearly so the cell-center invariant holds regardless of grid
    // resolution.
    const p1 = createPlayer({ x: 0, z: 0 }, 1);
    const p2 = createPlayer({ x: 0, z: 0 }, 4);
    expect(p1.position).toEqual({ x: 0.5, z: 0.5 });
    expect(p2.position).toEqual({ x: 2, z: 2 });
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

    // Sanity: camera position was still pinned to the player at y=1.6.
    const cam = makeCam(75);
    updatePlayerCamera(cam, p);
    expect(cam.position.x).toBe(p.position.x);
    expect(cam.position.y).toBe(1.6);
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
