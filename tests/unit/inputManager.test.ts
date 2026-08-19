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

  // P2-2 F9: Digit1/Digit2 wiring lives in InputManager.ts onKeyDown (added in
  // the same change as the useItem action). The original P2-2 plan claimed
  // these were covered by inputManager.test.ts, but only KeyP was — without
  // these cases a future refactor that drops the listeners (or the !e.repeat
  // guard) would only be caught by the slow e2e pickup-types flow.
  it('Digit1 fires useItem listener with slot 0', () => {
    const fn = vi.fn();
    im.onUseItem(fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(0);
  });

  it('Digit2 fires useItem listener with slot 1', () => {
    const fn = vi.fn();
    im.onUseItem(fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('Digit1/Digit2 ignore key-repeat (e.repeat=true) so holding the key does not spam useItem', () => {
    const fn = vi.fn();
    im.onUseItem(fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', repeat: true }));
    expect(fn).not.toHaveBeenCalled();
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

  // P3-1d: 2D ladder request. The bindings use Space (up)
  // and KeyC (down). The actual trigger only fires when the
  // player is standing on a ladder cell; this test pins the
  // InputManager half (the keypress → flag plumbing).
  describe('P3-1d — getLadderRequest (2D ladder input)', () => {
    it('reports no ladder request initially', () => {
      expect(im.getLadderRequest()).toEqual({ up: false, down: false });
    });

    it('Space keydown sets up=true; keyup sets it back to false', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(im.getLadderRequest()).toEqual({ up: true, down: false });
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      expect(im.getLadderRequest()).toEqual({ up: false, down: false });
    });

    it('KeyC keydown sets down=true; keyup sets it back to false', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
      expect(im.getLadderRequest()).toEqual({ up: false, down: true });
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
      expect(im.getLadderRequest()).toEqual({ up: false, down: false });
    });

    it('Space + KeyC pressed together return both flags true (engine picks "up" as the priority)', () => {
      // The InputManager half is independent on purpose —
      // both flags are true when both keys are held. The
      // engine's ladder trigger logic decides what to do
      // (current decision: prefer `up` over `down` since
      // the ladder's `toLevel` represents the up direction
      // by editor / generator convention). Pinning both
      // flags here guards against a future InputManager
      // refactor that short-circuits the "both keys"
      // case at the wrong layer.
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
      expect(im.getLadderRequest()).toEqual({ up: true, down: true });
    });
  });

  // F-A-architecture-M8: InputManager's constructor adds 4 listeners
  // (keydown, keyup on window; mousemove, pointerlockchange on document).
  // dispose() must remove exactly those 4 — same event type, same target,
  // and — critically — the SAME handler reference the constructor
  // registered. If dispose() ever passes a fresh wrapper (e.g.
  // `() => this.onKeyDown(...)`), the browser's identity-based
  // removeEventListener silently keeps the listener, and React
  // StrictMode's dev double-mount amplifies the leak on every remount.
  describe('A-M8 — listener cleanup (StrictMode double-mount safety)', () => {
    it('removes every listener its constructor added on dispose, with the same handler references', () => {
      const winAdd = vi.spyOn(window, 'addEventListener');
      const winRemove = vi.spyOn(window, 'removeEventListener');
      const docAdd = vi.spyOn(document, 'addEventListener');
      const docRemove = vi.spyOn(document, 'removeEventListener');

      try {
        const local = new InputManager();
        local.dispose();

        const countsByType = (spy: ReturnType<typeof vi.spyOn>) => {
          const map = new Map<string, number>();
          for (const call of spy.mock.calls) {
            const type = String(call[0]);
            map.set(type, (map.get(type) ?? 0) + 1);
          }
          return map;
        };
        const handlerFor = (spy: ReturnType<typeof vi.spyOn>, type: string) => {
          for (const call of spy.mock.calls) {
            if (String(call[0]) === type) return call[1];
          }
          return undefined;
        };

        const winAdds = countsByType(winAdd);
        const winRemoves = countsByType(winRemove);
        const docAdds = countsByType(docAdd);
        const docRemoves = countsByType(docRemove);

        // (1) Symmetric count per type: constructor registered 1,
        // dispose removed 1, on each expected target.
        expect(winAdds.get('keydown')).toBe(1);
        expect(winAdds.get('keyup')).toBe(1);
        expect(docAdds.get('mousemove')).toBe(1);
        expect(docAdds.get('pointerlockchange')).toBe(1);
        expect(winRemoves.get('keydown')).toBe(1);
        expect(winRemoves.get('keyup')).toBe(1);
        expect(docRemoves.get('mousemove')).toBe(1);
        expect(docRemoves.get('pointerlockchange')).toBe(1);

        // (2) Per-type net add/remove is zero — the StrictMode-safe
        // contract that prevents listener accumulation on remount.
        for (const type of ['keydown', 'keyup', 'mousemove', 'pointerlockchange']) {
          const a = (winAdds.get(type) ?? 0) + (docAdds.get(type) ?? 0);
          const r = (winRemoves.get(type) ?? 0) + (docRemoves.get(type) ?? 0);
          expect(a).toBe(r);
        }

        // (3) Reference identity: dispose() must pass the SAME handler
        // reference the constructor registered. The browser's
        // removeEventListener is identity-based; a fresh wrapper would
        // silently fail to remove the listener.
        expect(winRemove.mock.calls.find((c) => String(c[0]) === 'keydown')?.[1])
          .toBe(handlerFor(winAdd, 'keydown'));
        expect(winRemove.mock.calls.find((c) => String(c[0]) === 'keyup')?.[1])
          .toBe(handlerFor(winAdd, 'keyup'));
        expect(docRemove.mock.calls.find((c) => String(c[0]) === 'mousemove')?.[1])
          .toBe(handlerFor(docAdd, 'mousemove'));
        expect(docRemove.mock.calls.find((c) => String(c[0]) === 'pointerlockchange')?.[1])
          .toBe(handlerFor(docAdd, 'pointerlockchange'));
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
