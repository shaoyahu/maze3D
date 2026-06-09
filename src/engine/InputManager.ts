import type { InventorySlot } from '../maze/types';

export interface Move { x: number; z: number; }
export interface MouseDelta { x: number; y: number; }

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
  }

  dispose() {
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
    const d = { x: this.mouse.x, y: this.mouse.y };
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
    this.keys.add(e.code);
    if (e.code === 'KeyP' && !e.repeat) this.togglePauseListener?.();
    if (e.code === 'Digit1' && !e.repeat) this.useItemListener?.(0);
    if (e.code === 'Digit2' && !e.repeat) this.useItemListener?.(1);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
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
