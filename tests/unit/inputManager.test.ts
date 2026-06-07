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

  it('setSensitivity changes the multiplier used for mouse delta', () => {
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    const im2 = new InputManager();
    im2.setSensitivity(0.004);
    im2.onMouseMove({ movementX: 10, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta().x).toBeCloseTo(10 * 0.004);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('setSensitivity rejects non-positive or non-finite values', () => {
    const im2 = new InputManager();
    im2.setSensitivity(0.001);
    im2.setSensitivity(0);
    im2.setSensitivity(-1);
    im2.setSensitivity(NaN);
    im2.setSensitivity(Infinity);
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    im2.onMouseMove({ movementX: 10, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta().x).toBeCloseTo(10 * 0.001);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('pointerlockchange to locked discards the first post-lock mousemove (spurious-mousemove guard)', () => {
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    const im2 = new InputManager();
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    // Browser fires pointerlockchange, then a spurious mousemove on the
    // following frame. The spurious one must be dropped so it doesn't seed
    // the player's yaw/pitch with a random offset (the symptom: W moves
    // "right-front" instead of straight forward on a fresh session).
    document.dispatchEvent(new Event('pointerlockchange'));
    im2.onMouseMove({ movementX: 50, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    // The NEXT mousemove is real and must be processed.
    im2.onMouseMove({ movementX: 7, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta().x).toBeCloseTo(7 * 0.002);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('re-locking after an unlock re-arms the spurious-mousemove guard', () => {
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    const im2 = new InputManager();
    // First lock acquire: spurious mousemove dropped.
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
    im2.onMouseMove({ movementX: 50, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    // Unlock (e.g. user pressed Esc).
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
    // Re-lock: spurious mousemove dropped again, real mousemoves processed.
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
    im2.onMouseMove({ movementX: 50, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    im2.onMouseMove({ movementX: 7, movementY: 0 } as MouseEvent);
    expect(im2.consumeMouseDelta().x).toBeCloseTo(7 * 0.002);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('pausing keeps held keys so resume continues the same motion', () => {
    const im2 = new InputManager();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(im2.getMove().z).toBeLessThan(0);
    im2.setPaused(true);
    im2.setPaused(false);
    expect(im2.getMove().z).toBeLessThan(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  });
});
