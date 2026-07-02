import { describe, it, expect } from 'vitest';
import {
  applySpawnTrigger,
  type ApplySpawnTriggerInput,
} from '../../src/game/Rules';

// F-2026-07-01-FCR-M-12: dedicated unit coverage for applySpawnTrigger. The
// helper combines the trigger decision with the state-update decision
// (lastSpawnAt / lastPickupCountForSpawn advance on trigger only). The
// store uses the no-trigger early-return to skip a `set()` call, so
// locking that contract here keeps the zero-write path safe across
// refactors.

const baseInput: ApplySpawnTriggerInput = {
  enabled: true,
  schedule: { intervalSec: 30, onPickup: false, enabled: true },
  elapsedTime: 0,
  lastSpawnAt: 0,
  lastPickupCountForSpawn: 0,
  pickupCountCollected: 0,
  currentEnemyCount: 0,
};

describe('applySpawnTrigger (F-2026-07-01-FCR-M-12)', () => {
  it('returns no-trigger when disabled, leaves all state unchanged', () => {
    const out = applySpawnTrigger({ ...baseInput, enabled: false, elapsedTime: 999 });
    expect(out.triggered).toBe(false);
    expect(out.reason).toBeNull();
    expect(out.nextEnemyCount).toBe(0);
    expect(out.newLastSpawnAt).toBe(0);
    expect(out.newLastPickupCountForSpawn).toBe(0);
  });

  it('returns no-trigger when interval has not elapsed', () => {
    const out = applySpawnTrigger({ ...baseInput, elapsedTime: 10 });
    expect(out.triggered).toBe(false);
    expect(out.newLastSpawnAt).toBe(0);
  });

  it('fires time trigger when interval elapses; lastSpawnAt advances to elapsedTime', () => {
    const out = applySpawnTrigger({
      ...baseInput,
      elapsedTime: 31,
      lastSpawnAt: 0,
    });
    expect(out.triggered).toBe(true);
    expect(out.reason).toBe('time');
    expect(out.nextEnemyCount).toBe(1);
    expect(out.newLastSpawnAt).toBe(31);
    expect(out.newLastPickupCountForSpawn).toBe(0);
  });

  it('pickup trigger advances lastPickupCountForSpawn to current count', () => {
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true },
      pickupCountCollected: 3,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(true);
    expect(out.reason).toBe('pickup');
    expect(out.nextEnemyCount).toBe(3);
    expect(out.newLastSpawnAt).toBe(0);
    expect(out.newLastPickupCountForSpawn).toBe(3);
  });

  it('pickup trigger respects ENEMY_COUNT_MAX cap', () => {
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true },
      currentEnemyCount: 9,
      pickupCountCollected: 5,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(true);
    // Cap is 10 (ENEMY_COUNT_MAX). 9 + 5 = 14 → clamp to 10.
    expect(out.nextEnemyCount).toBe(10);
  });

  it('no-trigger early-return does NOT advance lastSpawnAt / lastPickupCountForSpawn', () => {
    // Even after elapsedTime advances past intervalSec, when triggered
    // is false the store relies on these fields staying unchanged.
    const out = applySpawnTrigger({
      ...baseInput,
      elapsedTime: 100,
      lastSpawnAt: 50,
      lastPickupCountForSpawn: 7,
      // not enabled → no trigger
      enabled: false,
    });
    expect(out.triggered).toBe(false);
    expect(out.newLastSpawnAt).toBe(50);
    expect(out.newLastPickupCountForSpawn).toBe(7);
  });

  it('pickup trigger with no pickups collected (count unchanged) does not fire', () => {
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true },
      pickupCountCollected: 2,
      lastPickupCountForSpawn: 2,
    });
    expect(out.triggered).toBe(false);
  });
});