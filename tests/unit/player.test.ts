import { describe, it, expect, vi } from 'vitest';
import { createPlayer, applyLook, updatePlayerCamera, FLOOR_HEIGHT, EYE_HEIGHT } from '../../src/entities/Player';
import type { PlayerState } from '../../src/entities/Player';

describe('Player', () => {
  it('createPlayer centers the player in the start cell and seeds y = 0 on layer 0', () => {
    // P3-1: position is now {x, y, z}; y defaults to 0 for a level-0
    // start. Single-layer start cells (no `level` field, or
    // level === 0) still produce the historical y=0 — back-compat.
    const p = createPlayer({ x: 2, z: 3 }, 2);
    expect(p.position).toEqual({ x: 5, y: 0, z: 7 });
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.speed).toBe(3);
    expect(p.radius).toBe(0.2);
    expect(p.currentLevel).toBe(0);
    expect(p.inputLocked).toBe(false);
  });

  it('createPlayer honors the start cell\'s `level` field for multi-level levels', () => {
    // P3-1: a start cell on layer 2 places the player at y = 2 *
    // FLOOR_HEIGHT (their feet on the third floor's floor).
    const p = createPlayer({ x: 1, z: 1, level: 2 }, 2);
    expect(p.position).toEqual({ x: 3, y: 2 * FLOOR_HEIGHT, z: 3 });
    expect(p.currentLevel).toBe(2);
  });

  it('applyLook updates yaw and pitch from mouse delta and clamps pitch', () => {
    const p: PlayerState = {
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
    applyLook(p, { x: 0.5, y: 0.2 });
    expect(p.yaw).toBeCloseTo(-0.5);
    expect(p.pitch).toBeCloseTo(-0.2);
    // clamp near +pi/2
    applyLook(p, { x: 0, y: 100 });
    expect(p.pitch).toBeLessThanOrEqual(Math.PI / 2);
    // clamp near -pi/2
    applyLook(p, { x: 0, y: -100 });
    expect(p.pitch).toBeGreaterThanOrEqual(-Math.PI / 2);
  });

  it('updatePlayerCamera sets position (camera y = player y + EYE_HEIGHT) and a roll-free YXZ quaternion', () => {
    // P3-1: with player.position.y = 0 the camera y is EYE_HEIGHT
    // (= 1.6m). For multi-layer players the y is `player.y + 1.6`.
    const p: PlayerState = {
      position: { x: 1.5, y: 0, z: 2.5 },
      yaw: 0.4,
      pitch: 0.1,
      speed: 1,
      radius: 0.1,
      currentLevel: 0,
      inputLocked: false,
      transitionStartTime: 0,
      transitionFromY: 0,
      transitionToY: 0,
      transitionDuration: 0,
    };
    const setFromEuler = vi.fn();
    const cam = {
      position: { set: vi.fn() },
      quaternion: { setFromEuler },
    } as unknown as import('three').PerspectiveCamera;
    updatePlayerCamera(cam, p);
    expect(cam.position.set).toHaveBeenCalledWith(1.5, EYE_HEIGHT, 2.5);
    expect(setFromEuler).toHaveBeenCalledTimes(1);
    const euler = setFromEuler.mock.calls[0][0] as import('three').Euler;
    expect(euler.order).toBe('YXZ');
    expect(euler.x).toBeCloseTo(p.pitch);
    expect(euler.y).toBeCloseTo(p.yaw);
    expect(euler.z).toBe(0);
  });

  it('updatePlayerCamera lifts the camera to the multi-level player\'s standing eye height', () => {
    // P3-1: layer 2 player (y = 2 * FLOOR_HEIGHT) sees the world
    // from y = 2 * FLOOR_HEIGHT + EYE_HEIGHT, i.e. eye-level on
    // the third floor.
    const p = createPlayer({ x: 0, z: 0, level: 2 }, 2);
    const set = vi.fn();
    const cam = { position: { set }, quaternion: { setFromEuler: vi.fn() } } as unknown as import('three').PerspectiveCamera;
    updatePlayerCamera(cam, p);
    expect(set).toHaveBeenCalledWith(1, 2 * FLOOR_HEIGHT + EYE_HEIGHT, 1);
  });
});
