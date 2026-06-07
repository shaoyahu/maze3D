import { describe, it, expect, vi } from 'vitest';
import { createPlayer, applyLook, updatePlayerCamera } from '../../src/entities/Player';
import type { PlayerState } from '../../src/entities/Player';

describe('Player', () => {
  it('createPlayer centers the player in the start cell', () => {
    const p = createPlayer({ x: 2, z: 3 }, 2);
    expect(p.position).toEqual({ x: 5, z: 7 });
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.speed).toBe(3);
    expect(p.radius).toBe(0.2);
  });

  it('applyLook updates yaw and pitch from mouse delta and clamps pitch', () => {
    const p: PlayerState = { position: { x: 0, z: 0 }, yaw: 0, pitch: 0, speed: 1, radius: 0.1 };
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

  it('updatePlayerCamera sets position and a roll-free YXZ quaternion', () => {
    const p: PlayerState = { position: { x: 1.5, z: 2.5 }, yaw: 0.4, pitch: 0.1, speed: 1, radius: 0.1 };
    const setFromEuler = vi.fn();
    const cam = {
      position: { set: vi.fn() },
      quaternion: { setFromEuler },
    } as unknown as import('three').PerspectiveCamera;
    updatePlayerCamera(cam, p);
    expect(cam.position.set).toHaveBeenCalledWith(1.5, 1.6, 2.5);
    expect(setFromEuler).toHaveBeenCalledTimes(1);
    const euler = setFromEuler.mock.calls[0][0] as import('three').Euler;
    expect(euler.order).toBe('YXZ');
    expect(euler.x).toBeCloseTo(p.pitch);
    expect(euler.y).toBeCloseTo(p.yaw);
    expect(euler.z).toBe(0);
  });
});
