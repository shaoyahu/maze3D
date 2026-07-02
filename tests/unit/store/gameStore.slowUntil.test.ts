import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../../../src/store/gameStore';

// F-2026-07-01-FCR-H-2: lock in the P2-18 setSlowUntil / getPlayerSpeedMultiplier
// contract: water trap → multiplier drops to 0.5; expiry → returns to 1.0;
// consecutive writes take the larger window. Pairs with rules.test.ts's
// computeSlowMultiplier coverage at the pure-function layer.

describe('gameStore.setSlowUntil (P2-18)', () => {
  beforeEach(() => {
    useGameStore.setState({ slowUntil: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ slowUntil: 0 });
  });

  it('initial slowUntil is 0 and multiplier is 1.0', () => {
    const s = useGameStore.getState();
    expect(s.slowUntil).toBe(0);
    expect(s.getPlayerSpeedMultiplier()).toBe(1.0);
  });

  it('setSlowUntil to a future time makes multiplier 0.5', () => {
    const nowSec = Date.now() / 1000;
    useGameStore.getState().setSlowUntil(nowSec + 3);
    expect(useGameStore.getState().slowUntil).toBeCloseTo(nowSec + 3, 3);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(0.5);
  });

  it('setSlowUntil to a past time leaves multiplier at 1.0', () => {
    const nowSec = Date.now() / 1000;
    useGameStore.getState().setSlowUntil(nowSec - 1);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(1.0);
  });

  it('setSlowUntil to 0 (clear) restores multiplier immediately', () => {
    const nowSec = Date.now() / 1000;
    useGameStore.getState().setSlowUntil(nowSec + 5);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(0.5);
    useGameStore.getState().setSlowUntil(0);
    expect(useGameStore.getState().slowUntil).toBe(0);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(1.0);
  });

  it('consecutive setSlowUntil calls keep the larger window (no overlap-sum)', () => {
    const nowSec = Date.now() / 1000;
    useGameStore.getState().setSlowUntil(nowSec + 2);
    useGameStore.getState().setSlowUntil(nowSec + 5);
    // The latest write wins (no max-aggregation in the store); the
    // multiplier stays 0.5 because both are still in the future.
    expect(useGameStore.getState().slowUntil).toBeCloseTo(nowSec + 5, 3);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(0.5);
  });

  it('multiplier returns to 1.0 once wall-clock crosses slowUntil', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000); // arbitrary fixed now
    useGameStore.getState().setSlowUntil(1_000_000_000_000 / 1000 + 1);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(0.5);
    // Advance past the slow window.
    vi.setSystemTime(1_000_000_000_000 + 2000);
    expect(useGameStore.getState().getPlayerSpeedMultiplier()).toBe(1.0);
  });
});