// F-2026-06-17-B-M-14: spiral-of-death guard. When the tab is backgrounded,
// rAF stops firing; when the tab regains focus, dt would be huge (seconds
// of "missed" time) and one frame would advance the simulation forward by
// an unbounded amount, causing the player to clip through walls, fall
// through floors, or trigger runaway collisions. 0.1s = 10 FPS is the
// chosen trade-off: slow enough to clamp away the worst backgrounded
// spikes, fast enough that any real visible stutter (a few hundred ms) is
// still mostly replayed faithfully.
//
// F-2026-07-01-FCR-L-13: export the constant so enemy path recompute, trap
// timers, and other per-tick helpers can clamp their own dt against the
// same bound instead of duplicating the 0.1 magic number.
export const MAX_DT_SECONDS = 0.1;

export class Loop {
  private raf = 0;
  private last = 0;
  private stopped = true;
  constructor(private update: (dt: number) => void) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.stopped) return;
      const dt = Math.min(MAX_DT_SECONDS, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      // Re-check after update() — stop() may have been called from within it.
      if (this.stopped) return;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }
}
