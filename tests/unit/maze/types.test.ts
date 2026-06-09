import { describe, it, expect } from 'vitest';
import {
  ENEMY_COUNT_MIN,
  ENEMY_COUNT_MAX,
  ENEMY_COUNT_DEFAULT,
  ENEMY_CHASE_MULTIPLIER_EASY,
  ENEMY_CHASE_MULTIPLIER_MEDIUM,
  ENEMY_CHASE_MULTIPLIER_HARD,
  SURVIVE_SECONDS_VALUES,
  SURVIVE_SECONDS_DEFAULT,
  SPAWN_SCHEDULE_DEFAULT,
  clampEnemyCount,
  enemyChaseMultiplier,
  isValidSurviveSeconds,
  normalizeSurviveSeconds,
  isValidEnemyPath,
  type EnemySpawn,
  type EnemyState,
} from '../../../src/maze/types';

describe('clampEnemyCount', () => {
  it('returns the default when value is undefined', () => {
    expect(clampEnemyCount(undefined)).toBe(ENEMY_COUNT_DEFAULT);
  });

  it('returns the default when value is NaN', () => {
    expect(clampEnemyCount(Number.NaN)).toBe(ENEMY_COUNT_DEFAULT);
  });

  it('passes through values inside the inclusive range', () => {
    expect(clampEnemyCount(0)).toBe(0);
    expect(clampEnemyCount(ENEMY_COUNT_MIN)).toBe(0);
    expect(clampEnemyCount(5)).toBe(5);
    expect(clampEnemyCount(ENEMY_COUNT_MAX)).toBe(ENEMY_COUNT_MAX);
  });

  it('clamps negative values to the minimum', () => {
    expect(clampEnemyCount(-1)).toBe(ENEMY_COUNT_MIN);
    expect(clampEnemyCount(-100)).toBe(ENEMY_COUNT_MIN);
  });

  it('clamps values above the maximum to the maximum', () => {
    expect(clampEnemyCount(11)).toBe(ENEMY_COUNT_MAX);
    expect(clampEnemyCount(1000)).toBe(ENEMY_COUNT_MAX);
  });
});

describe('isValidSurviveSeconds', () => {
  it.each(SURVIVE_SECONDS_VALUES)('accepts %d', (value) => {
    expect(isValidSurviveSeconds(value)).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isValidSurviveSeconds(undefined)).toBe(false);
  });

  it('rejects values outside the 30/60/90/120 enum', () => {
    expect(isValidSurviveSeconds(0)).toBe(false);
    expect(isValidSurviveSeconds(15)).toBe(false);
    expect(isValidSurviveSeconds(45)).toBe(false);
    expect(isValidSurviveSeconds(180)).toBe(false);
    expect(isValidSurviveSeconds(60.5)).toBe(false);
  });
});

describe('normalizeSurviveSeconds', () => {
  it('returns the value when it is in the enum', () => {
    expect(normalizeSurviveSeconds(30)).toBe(30);
    expect(normalizeSurviveSeconds(60)).toBe(60);
    expect(normalizeSurviveSeconds(90)).toBe(90);
    expect(normalizeSurviveSeconds(120)).toBe(120);
  });

  it('falls back to the default when undefined or invalid', () => {
    expect(normalizeSurviveSeconds(undefined)).toBe(SURVIVE_SECONDS_DEFAULT);
    expect(normalizeSurviveSeconds(0)).toBe(SURVIVE_SECONDS_DEFAULT);
    expect(normalizeSurviveSeconds(45)).toBe(SURVIVE_SECONDS_DEFAULT);
    expect(normalizeSurviveSeconds(180)).toBe(SURVIVE_SECONDS_DEFAULT);
  });
});

describe('isValidEnemyPath', () => {
  const baseEnemy: Pick<EnemySpawn, 'path'> = {
    path: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
  };

  it('accepts paths with 2 or more nodes', () => {
    expect(isValidEnemyPath(baseEnemy)).toBe(true);
    expect(isValidEnemyPath({ path: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }] })).toBe(true);
  });

  it('rejects paths with 1 node', () => {
    expect(isValidEnemyPath({ path: [{ x: 0, z: 0 }] })).toBe(false);
  });

  it('rejects empty paths', () => {
    expect(isValidEnemyPath({ path: [] })).toBe(false);
  });
});

describe('P2-4a enemy constants', () => {
  it('exposes the documented enemy-count bounds', () => {
    expect(ENEMY_COUNT_MIN).toBe(0);
    expect(ENEMY_COUNT_MAX).toBe(10);
    expect(ENEMY_COUNT_DEFAULT).toBe(3);
  });

  it('exposes the documented survive-seconds enum and default', () => {
    expect([...SURVIVE_SECONDS_VALUES]).toEqual([30, 60, 90, 120]);
    expect(SURVIVE_SECONDS_DEFAULT).toBe(90);
  });

  it('defaults the spawn schedule to intervalSec=15, onPickup=true, enabled=true', () => {
    expect(SPAWN_SCHEDULE_DEFAULT).toEqual({
      intervalSec: 15,
      onPickup: true,
      enabled: true,
    });
  });
});

describe('P2-4a enemy type contracts', () => {
  it('accepts the three documented enemy states', () => {
    const states: EnemyState[] = ['patrol', 'dwell', 'chase'];
    expect(states).toHaveLength(3);
    expect(states).toContain('patrol');
    expect(states).toContain('dwell');
    expect(states).toContain('chase');
  });
});

describe('enemyChaseMultiplier (P2-4a)', () => {
  it('maps the three aggression brackets to the documented multipliers', () => {
    expect(enemyChaseMultiplier('easy')).toBe(ENEMY_CHASE_MULTIPLIER_EASY);
    expect(enemyChaseMultiplier('medium')).toBe(ENEMY_CHASE_MULTIPLIER_MEDIUM);
    expect(enemyChaseMultiplier('hard')).toBe(ENEMY_CHASE_MULTIPLIER_HARD);
  });

  it('exposes 1.2 / 1.5 / 1.8 as the canonical easy / medium / hard rates', () => {
    expect(ENEMY_CHASE_MULTIPLIER_EASY).toBe(1.2);
    expect(ENEMY_CHASE_MULTIPLIER_MEDIUM).toBe(1.5);
    expect(ENEMY_CHASE_MULTIPLIER_HARD).toBe(1.8);
  });
});
