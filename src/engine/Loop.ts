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
      const dt = Math.min(0.1, (t - this.last) / 1000);
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
