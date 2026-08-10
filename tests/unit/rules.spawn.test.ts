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
  // P3-1 fix-progressive-max: every test schedule now carries
  // an explicit `max` (the spec cap the runtime honors). The
  // base default of 10 mirrors `SPAWN_PROGRESSIVE_MAX_DEFAULT`
  // and is the value the cap-respecting tests below also use.
  schedule: { intervalSec: 30, onPickup: false, enabled: true, max: 10 },
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
      schedule: { intervalSec: 30, onPickup: true, enabled: true, max: 10 },
      pickupCountCollected: 3,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(true);
    expect(out.reason).toBe('pickup');
    expect(out.nextEnemyCount).toBe(3);
    expect(out.newLastSpawnAt).toBe(0);
    expect(out.newLastPickupCountForSpawn).toBe(3);
  });

  it('pickup trigger respects schedule.max (defaults to ENEMY_COUNT_MAX=10 when schedule.max is the spec default)', () => {
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true, max: 10 },
      currentEnemyCount: 9,
      pickupCountCollected: 5,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(true);
    // Cap is 10 (schedule.max). 9 + 5 = 14 → clamp to 10.
    expect(out.nextEnemyCount).toBe(10);
  });

  it('P3-1 fix-progressive-max: pickup trigger respects user-set schedule.max below the global ENEMY_COUNT_MAX', () => {
    // The user-set "渐进上限=3" cap must be honored even when
    // it's below the global ENEMY_COUNT_MAX (10). Pre-fix this
    // would clamp to 10 (the global cap) instead of 3, silently
    // dropping the UI input.
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true, max: 3 },
      currentEnemyCount: 2,
      pickupCountCollected: 5,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(true);
    // Cap is 3 (schedule.max). 2 + 5 = 7 → clamp to 3.
    expect(out.nextEnemyCount).toBe(3);
  });

  it('P3-1 fix-progressive-max: time trigger respects user-set schedule.max above the global ENEMY_COUNT_MAX', () => {
    // URL clamp range is [1, 20] — the user can ask for a
    // progressive cap higher than ENEMY_COUNT_MAX (10). The
    // time-trigger must honor that, not silently clamp to 10.
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: false, enabled: true, max: 15 },
      currentEnemyCount: 12,
      elapsedTime: 100, // far past the 30s interval
      lastSpawnAt: 0,
    });
    expect(out.triggered).toBe(true);
    expect(out.nextEnemyCount).toBe(13);
    // 13 < 15 (schedule.max), so no further cap applies.
  });

  it('P3-1 fix-progressive-max: no-trigger early-return when currentEnemyCount >= schedule.max', () => {
    // The early-return cap-guard at the top of
    // `shouldProgressSpawn` previously hardcoded
    // ENEMY_COUNT_MAX. A user-set cap of 3 with
    // currentEnemyCount=3 should be a no-trigger.
    const out = applySpawnTrigger({
      ...baseInput,
      schedule: { intervalSec: 30, onPickup: true, enabled: true, max: 3 },
      currentEnemyCount: 3,
      pickupCountCollected: 5,
      lastPickupCountForSpawn: 0,
    });
    expect(out.triggered).toBe(false);
    expect(out.nextEnemyCount).toBe(3);
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
      schedule: { intervalSec: 30, onPickup: true, enabled: true, max: 10 },
      pickupCountCollected: 2,
      lastPickupCountForSpawn: 2,
    });
    expect(out.triggered).toBe(false);
  });
});