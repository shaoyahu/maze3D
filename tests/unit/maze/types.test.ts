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
  isPickupType,
  isVictoryType,
  isMazeSize,
  isLevelSource,
  isSurviveSeconds,
  isEnemyAggression,
  isMinimapMode,
  isMapOpenBehavior,
  isParchmentLifecycle,
  type EnemySpawn,
  type EnemyState,
  type EnemyAggression,
  type LevelSource,
  type MazeSize,
  type PickupType,
  type VictoryType,
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

// ---------------------------------------------------------------------------
// F-D-quality-HIGH-2 + D-16: UI-boundary type guards. The old code reached
// for `as PickupType` / `as VictoryType` / `as MazeSize` / `as LevelSource`
// / `as 30 | 60 | 90 | 120` after reading a raw `<select>` value, trusting
// that the only writer was the same component. A guard makes the trust
// explicit: an untrusted `string` from an event target has to pass a check
// before it is treated as a literal-union member.
// ---------------------------------------------------------------------------

const PICKUP_TYPES: readonly PickupType[] = ['time', 'health', 'key'];
const VICTORY_TYPES: readonly VictoryType[] = ['reach-exit', 'survive', 'time-trial', 'caught-by-enemy'];
const LEVEL_SOURCES: readonly LevelSource[] = ['teaching', 'random', 'custom', 'seed'];
const MAZE_SIZES: readonly MazeSize[] = [15, 30, 50];

describe('isPickupType (F-D-quality-HIGH-2)', () => {
  it.each(PICKUP_TYPES)('accepts the documented %s literal', (t) => {
    expect(isPickupType(t)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isPickupType('ammo')).toBe(false);
    expect(isPickupType('')).toBe(false);
    expect(isPickupType('TIME')).toBe(false); // case-sensitive
  });

  it('rejects non-string values', () => {
    expect(isPickupType(null)).toBe(false);
    expect(isPickupType(undefined)).toBe(false);
    expect(isPickupType(42)).toBe(false);
    expect(isPickupType({})).toBe(false);
    expect(isPickupType(['time'])).toBe(false);
  });
});

describe('isVictoryType (F-D-quality-HIGH-2)', () => {
  it.each(VICTORY_TYPES)('accepts the documented %s literal', (t) => {
    expect(isVictoryType(t)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isVictoryType('boss')).toBe(false);
    expect(isVictoryType('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isVictoryType(null)).toBe(false);
    expect(isVictoryType(undefined)).toBe(false);
    expect(isVictoryType(0)).toBe(false);
  });
});

// F-2026-06-17-F-M-3: explicit guard coverage for the P2-11
// `caught-by-enemy` literal and the canonical "garbage" non-string
// inputs. The each-loop above already exercises caught-by-enemy
// transitively, but a dedicated block makes the guard contract
// readable in isolation — important because the union was extended
// post-freeze (P2-11) and the runtime whitelist is the single source
// of truth that drives `crossesExit`'s "caught by enemy" branch.
describe('isVictoryType — explicit guard coverage (F-M-3)', () => {
  it('accepts the P2-11 caught-by-enemy literal', () => {
    expect(isVictoryType('caught-by-enemy')).toBe(true);
  });

  it('rejects arbitrary unknown strings', () => {
    expect(isVictoryType('invalid')).toBe(false);
    expect(isVictoryType('CAUGHT-BY-ENEMY')).toBe(false); // case-sensitive
    expect(isVictoryType('caught_by_enemy')).toBe(false); // underscore vs dash
  });

  it('rejects the canonical non-string garbage inputs', () => {
    expect(isVictoryType(null)).toBe(false);
    expect(isVictoryType(undefined)).toBe(false);
    expect(isVictoryType(123)).toBe(false);
    expect(isVictoryType({})).toBe(false);
    expect(isVictoryType(['caught-by-enemy'])).toBe(false);
  });
});

describe('isMazeSize (F-D-quality-D-16)', () => {
  it.each(MAZE_SIZES)('accepts the documented size %d', (n) => {
    expect(isMazeSize(n)).toBe(true);
  });

  it('rejects sizes outside the 15 / 30 / 50 enum', () => {
    expect(isMazeSize(7)).toBe(false);
    expect(isMazeSize(16)).toBe(false);
    expect(isMazeSize(29)).toBe(false);
    expect(isMazeSize(100)).toBe(false);
  });

  it('rejects non-number values', () => {
    expect(isMazeSize('15')).toBe(false);
    expect(isMazeSize(null)).toBe(false);
    expect(isMazeSize(undefined)).toBe(false);
    expect(isMazeSize(NaN)).toBe(false); // NaN is the canonical "garbage" case from Number()
  });
});

describe('isLevelSource (F-D-quality-D-16)', () => {
  it.each(LEVEL_SOURCES)('accepts the documented %s literal', (t) => {
    expect(isLevelSource(t)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isLevelSource('community')).toBe(false);
    expect(isLevelSource('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isLevelSource(null)).toBe(false);
    expect(isLevelSource(undefined)).toBe(false);
    expect(isLevelSource(0)).toBe(false);
  });
});

describe('isSurviveSeconds (F-D-quality-D-16)', () => {
  it.each(SURVIVE_SECONDS_VALUES)('accepts %d', (value) => {
    expect(isSurviveSeconds(value)).toBe(true);
  });

  it('rejects values outside the 30 / 60 / 90 / 120 enum', () => {
    expect(isSurviveSeconds(0)).toBe(false);
    expect(isSurviveSeconds(45)).toBe(false);
    expect(isSurviveSeconds(180)).toBe(false);
    expect(isSurviveSeconds(60.5)).toBe(false);
  });

  it('rejects non-number values', () => {
    expect(isSurviveSeconds('60')).toBe(false);
    expect(isSurviveSeconds(null)).toBe(false);
    expect(isSurviveSeconds(undefined)).toBe(false);
    expect(isSurviveSeconds(NaN)).toBe(false);
  });
});

// F-2026-06-17-D-L-3: mirror the isVictoryType / isPickupType guard tests
// for the P2-11 `enemyAggression` literal union. Validates the guard
// catches the same edge cases (case-sensitivity, non-string garbage,
// unknown values) the other guards pin.
const ENEMY_AGGRESSION_LITERALS: readonly EnemyAggression[] = ['easy', 'medium', 'hard'];

describe('isEnemyAggression (F-2026-06-17-D-L-3)', () => {
  it.each(ENEMY_AGGRESSION_LITERALS)('accepts the documented %s literal', (a) => {
    expect(isEnemyAggression(a)).toBe(true);
  });

  it('rejects unknown strings (case-sensitive)', () => {
    expect(isEnemyAggression('Easy')).toBe(false);
    expect(isEnemyAggression('MEDIUM')).toBe(false);
    expect(isEnemyAggression('insane')).toBe(false);
    expect(isEnemyAggression('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isEnemyAggression(null)).toBe(false);
    expect(isEnemyAggression(undefined)).toBe(false);
    expect(isEnemyAggression(1)).toBe(false);
    expect(isEnemyAggression({})).toBe(false);
    expect(isEnemyAggression(['easy'])).toBe(false);
  });
});

// F-2026-06-30: P2-16 — three new type guards mirror the
// isEnemyAggression / isVictoryType shape. Validates each guard
// accepts every documented literal, rejects case-mismatches, and
// rejects non-string garbage (null / undefined / numbers / objects).
const MINIMAP_MODE_LITERALS = ['top-right', 'parchment', 'hidden'] as const;
const MAP_OPEN_BEHAVIOR_LITERALS = ['pause', 'continue'] as const;
const PARCHMENT_LIFECYCLE_LITERALS = ['reset-on-death', 'persist'] as const;

describe('isMinimapMode (P2-16)', () => {
  it.each(MINIMAP_MODE_LITERALS)('accepts the documented %s literal', (a) => {
    expect(isMinimapMode(a)).toBe(true);
  });

  it('rejects unknown strings (case-sensitive, no auto-typo forgiveness)', () => {
    expect(isMinimapMode('Top-Right')).toBe(false);
    expect(isMinimapMode('PARCHMENT')).toBe(false);
    expect(isMinimapMode('parchment ')).toBe(false);
    expect(isMinimapMode('off')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isMinimapMode(null)).toBe(false);
    expect(isMinimapMode(undefined)).toBe(false);
    expect(isMinimapMode(1)).toBe(false);
    expect(isMinimapMode({})).toBe(false);
    expect(isMinimapMode(['parchment'])).toBe(false);
  });
});

describe('isMapOpenBehavior (P2-16)', () => {
  it.each(MAP_OPEN_BEHAVIOR_LITERALS)('accepts the documented %s literal', (a) => {
    expect(isMapOpenBehavior(a)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isMapOpenBehavior('Pause')).toBe(false);
    expect(isMapOpenBehavior('play')).toBe(false);
    expect(isMapOpenBehavior('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isMapOpenBehavior(null)).toBe(false);
    expect(isMapOpenBehavior(undefined)).toBe(false);
    expect(isMapOpenBehavior(0)).toBe(false);
    expect(isMapOpenBehavior({})).toBe(false);
  });
});

describe('isParchmentLifecycle (P2-16)', () => {
  it.each(PARCHMENT_LIFECYCLE_LITERALS)('accepts the documented %s literal', (a) => {
    expect(isParchmentLifecycle(a)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isParchmentLifecycle('Reset-On-Death')).toBe(false);
    expect(isParchmentLifecycle('keep')).toBe(false);
    expect(isParchmentLifecycle('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isParchmentLifecycle(null)).toBe(false);
    expect(isParchmentLifecycle(undefined)).toBe(false);
    expect(isParchmentLifecycle(1)).toBe(false);
    expect(isParchmentLifecycle({})).toBe(false);
  });
});
