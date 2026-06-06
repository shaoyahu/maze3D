import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputManager } from '../../src/engine/InputManager';

describe('InputManager', () => {
  let im: InputManager;
  beforeEach(() => {
    im = new InputManager();
  });

  it('reports no movement initially', () => {
    expect(im.getMove()).toEqual({ x: 0, z: 0 });
  });

  it('W key sets forward movement', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(im.getMove().z).toBeLessThan(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(im.getMove().z).toBe(0);
  });

  it('ArrowDown sets backward movement', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(im.getMove().z).toBeGreaterThan(0);
  });

  it('A and D pressed together cancel out', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(im.getMove().x).toBeCloseTo(0);
  });

  it('P key fires togglePause listener', () => {
    const fn = vi.fn();
    im.onTogglePause(fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('pointer move accumulates delta and consumeMouseDelta resets it', () => {
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    const im2 = new InputManager();
    im2.onMouseMove({ movementX: 10, movementY: 5 } as MouseEvent);
    const yaw = im2.consumeMouseDelta();
    expect(yaw.x).toBeCloseTo(10 * 0.002);
    expect(yaw.y).toBeCloseTo(5 * 0.002);
    expect(im2.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });
});
