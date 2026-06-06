export interface Move { x: number; z: number; }
export interface MouseDelta { x: number; y: number; }

export class InputManager {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0 };
  private togglePauseListener: (() => void) | null = null;

  constructor(private sensitivity = 0.002) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  onTogglePause(fn: () => void) { this.togglePauseListener = fn; }

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
    if (document.pointerLockElement) {
      this.mouse.x += e.movementX * this.sensitivity;
      this.mouse.y += e.movementY * this.sensitivity;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyP') this.togglePauseListener?.();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onLockChange = () => { /* host can subscribe via store */ };
}
