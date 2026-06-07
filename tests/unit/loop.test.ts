import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Loop } from '../../src/engine/Loop';

describe('Loop', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let currentTime: number;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    currentTime = 0;
    update = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      rafCallbacks.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Advance the virtual clock and run every currently-pending RAF callback.
  // Mirrors a real browser: the browser fires the callback at time t with
  // the latest performance.now() reading.
  const tickFrame = (ms: number) => {
    currentTime += ms;
    const cbs = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const cb of cbs) cb(currentTime);
  };

  it('start schedules a RAF and invokes update with the frame dt', () => {
    const loop = new Loop(update);
    loop.start();
    expect(rafCallbacks.size).toBe(1);
    tickFrame(16);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(0.016);
  });

  it('start is idempotent — calling it while already running is a no-op', () => {
    const loop = new Loop(update);
    loop.start();
    expect(rafCallbacks.size).toBe(1);
    loop.start();
    expect(rafCallbacks.size).toBe(1);
  });

  it('stop cancels the pending RAF and no more updates fire', () => {
    const loop = new Loop(update);
    loop.start();
    loop.stop();
    expect(rafCallbacks.size).toBe(0);
    tickFrame(16);
    expect(update).not.toHaveBeenCalled();
  });

  it('stop called from inside update() prevents scheduling the next frame', () => {
    const loop = new Loop(update);
    update.mockImplementation(() => loop.stop());
    loop.start();
    tickFrame(16);
    expect(update).toHaveBeenCalledTimes(1);
    // The next frame should NOT call update because the previous frame
    // called stop(), which set stopped=true and cancelled the RAF.
    tickFrame(16);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('clamps dt to 0.1s on a long frame (tab unfocus, GC stall)', () => {
    const loop = new Loop(update);
    loop.start();
    tickFrame(5000);
    expect(update).toHaveBeenLastCalledWith(0.1);
  });

  it('resume after stop resets `last` so the next frame does not get a giant dt', () => {
    const loop = new Loop(update);
    loop.start();
    tickFrame(100);
    loop.stop();
    // currentTime is now 100; if start() didn't reset `last`, the next
    // frame would see dt=0 and the frame after that would see dt≈0.016.
    // We want start() to reset `last` so dt is always measured from the
    // most recent start, not from the constructor.
    loop.start();
    tickFrame(16);
    expect(update).toHaveBeenLastCalledWith(0.016);
  });
});
