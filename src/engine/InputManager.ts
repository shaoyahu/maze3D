import type { InventorySlot } from '../maze/types';

export interface Move { x: number; z: number; }
export interface MouseDelta { x: number; y: number; }

// F-2026-06-30: P2-16 — logical action name + the key code bound to
// it. Exported as a single constant so the GameCanvas useEffect and
// any future settings-overlay re-binding key see the same value. The
// M key was chosen because (a) it's the conventional first-person
// "map" key, (b) it doesn't conflict with WASD / arrow movement /
// pause (P) / inventory digits, and (c) it's a single key press so
// holding it doesn't fire continuously.
export const OPEN_MAP_KEY = 'KeyM';
// F-2026-06-30: P2-16 — same idea for the "close" gesture, which
// reuses M. The modal also accepts Escape; the close logic lives in
// the React component so InputManager stays a pure key-tracker.
export const CLOSE_MAP_KEY = 'Escape';

export class InputManager {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0 };
  private togglePauseListener: (() => void) | null = null;
  private useItemListener: ((slot: InventorySlot) => void) | null = null;
  private paused = false;
  #sensitivity: number;

  constructor(sensitivity = 0.002) {
    this.#sensitivity = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 0.002;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  setSensitivity(n: number) {
    if (Number.isFinite(n) && n > 0) this.#sensitivity = n;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      // Clear any pending delta so resume doesn't snap. Held keys stay in the
      // set so resume continues the same motion — the loop is stopped before
      // setInputPaused runs, so there is no drift window to guard against.
      this.mouse.x = 0;
      this.mouse.y = 0;
    }
  }

  // Drop all held keys. Called by Game.startLevel so a player who was
  // holding W at the moment of win/game-over doesn't carry that intent
  // into the new level's first frame.
  clearKeys() {
    this.keys.clear();
    this.justPressed = [];
  }

  dispose() {
    // F-L8: reset internal state. Currently InputManager isn't reused so
    // the impact is nil, but a future refactor that reuses the instance
    // (e.g. for a second level without tearing down) would otherwise
    // carry the post-lock-acquire skip flag into the new level's first
    // frame.
    //
    // F-2026-06-15-L-5.3: also clear `this.keys` and the mouse delta so
    // a future pool-style reuse of InputManager doesn't carry phantom
    // input across dispose/init.
    this.skipNextMove = false;
    this.keys.clear();
    this.mouse.x = 0;
    this.mouse.y = 0;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  onTogglePause(fn: () => void) { this.togglePauseListener = fn; }

  onUseItem(fn: (slot: InventorySlot) => void) { this.useItemListener = fn; }

  getMove(): Move {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, z };
  }

  consumeMouseDelta(): MouseDelta {
    // F-L3: cap the returned delta to ±π per axis. Without this, a
    // backgrounded tab returning to foreground can fire a single
    // mousemove with a huge movementX, instantly spinning the camera
    // several rotations. The actual mouse position lands on the next move.
    const MAX_DELTA = Math.PI;
    const d = {
      x: Math.max(-MAX_DELTA, Math.min(MAX_DELTA, this.mouse.x)),
      y: Math.max(-MAX_DELTA, Math.min(MAX_DELTA, this.mouse.y)),
    };
    this.mouse.x = 0;
    this.mouse.y = 0;
    return d;
  }

  // Exposed for tests
  onMouseMove = (e: MouseEvent) => {
    // Browsers (Chrome/Edge in particular) emit one stray mousemove on the
    // frame that follows pointer-lock acquisition. Clearing the buffer in
    // onLockChange isn't enough — that spurious event arrives AFTER
    // pointerlockchange fires, so the cleared buffer gets re-seeded. Drop
    // the first post-lock event entirely. The symptom this guards against:
    // a fresh session seeds yaw/pitch with a random offset, so W moves
    // "right-front" instead of straight forward and the horizon appears
    // tilted until the player mouselooks back to center.
    if (this.skipNextMove) {
      this.skipNextMove = false;
      return;
    }
    if (document.pointerLockElement && !this.paused) {
      this.mouse.x += e.movementX * this.#sensitivity;
      this.mouse.y += e.movementY * this.#sensitivity;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // F-2026-06-17-B-H-3: when paused, the only key the engine still
    // cares about is the pause-toggle key (so the player can un-pause).
    // Anything else — typing in the Settings overlay, accidentally
    // tapping Digit1/2 to use an item while the menu is up, pressing W
    // to scroll a dropdown — must not leak into `this.keys` /
    // `justPressed` or fire a tutorial / use-item side effect. The
    // previous code had no guard here, so opening the Pause overlay
    // while a focus was inside a form input created a "P key loop":
    // P toggled pause off, the next P in the input box toggled it back
    // on, etc. Now we still allow KeyP to fall through so the user can
    // always un-pause, but everything else is dropped.
    //
    // L-4 (2026-07-01): restructured to early-return for non-KeyP
    // keys when paused, instead of the previous `if (this.paused &&
    // e.code !== 'KeyP') return;` mid-function guard. The two
    // approaches are functionally equivalent, but the early-return
    // makes the pause-state control flow obvious at the top of the
    // handler: a paused player gets ONLY the un-pause toggle, period;
    // all subsequent branches below run with `this.paused === false`
    // implicitly guaranteed. The previous fall-through shape
    // accidentally invited contributors to add code below the guard
    // that re-ran for paused-state input.
    if (this.paused) {
      if (e.code === 'KeyP' && !e.repeat) this.togglePauseListener?.();
      return;
    }
    this.keys.add(e.code);
    if (e.code === 'KeyP' && !e.repeat) this.togglePauseListener?.();
    if (e.code === 'Digit1' && !e.repeat) this.useItemListener?.(0);
    if (e.code === 'Digit2' && !e.repeat) this.useItemListener?.(1);
    // P2-11: edge-triggered "just pressed" buffer for tutorial events.
    if (!e.repeat) this.justPressed.push(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  // P2-11: buffer of key codes pressed since the last `consumeJustPressedKeys`
  // call. Used by Game.update() to emit `key-pressed` tutorial events.
  // `clearKeys()` flushes it so a level boundary doesn't leak already-
  // pressed keys into the next level's tutorial.
  private justPressed: string[] = [];
  consumeJustPressedKeys(): string[] {
    if (this.justPressed.length === 0) return [];
    const out = this.justPressed;
    this.justPressed = [];
    return out;
  }
  // Clearing the buffer on lock acquire is necessary but not sufficient —
  // see the note in onMouseMove. skipNextMove drops the spurious event
  // that lands between this handler and the next frame.
  private skipNextMove = false;
  private onLockChange = () => {
    if (document.pointerLockElement) {
      this.mouse.x = 0;
      this.mouse.y = 0;
      this.skipNextMove = true;
    } else {
      this.skipNextMove = false;
    }
  };
}
