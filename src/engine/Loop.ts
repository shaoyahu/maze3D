export class Loop {
  private raf = 0;
  private last = 0;
  constructor(private update: (dt: number) => void) {}

  start() {
    this.last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.raf); }
}
