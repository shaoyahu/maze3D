// F-project-review-2026-06-14: URL <-> level identity round-trip tests for
// the routing layer. These guard the /game query semantics: a deep-link
// must boot the same level + options the user originally picked, and the
// browser back/forward buttons must restore the exact same URL.

import { describe, it, expect } from 'vitest';
import {
  parseGameSearchParams,
  buildGameSearchParams,
  GAME_URL_QUERY_KEYS,
} from '../../../src/utils/gameUrl';
import { SPAWN_SCHEDULE_DEFAULT, SURVIVE_SECONDS_DEFAULT } from '../../../src/maze/types';
import { encodeSeed } from '../../../src/utils/seed';

const VALID_HEX = '0123456789abcdef';
const VALID_SEED_ID = `algo-v1-recursive-backtracker-30-${VALID_HEX}`;

describe('parseGameSearchParams', () => {
  it('rejects an empty query (no seed, no id)', () => {
    const r = parseGameSearchParams(new URLSearchParams(''));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('missing-id');
  });

  it('rejects both seed and id (ambiguous URL)', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}&${GAME_URL_QUERY_KEYS.ID_QUERY}=teaching-001`),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('both-seed-and-id');
  });

  it('accepts a procedural seed id and decodes it via decodeSeed', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}`),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.id).toBe(VALID_SEED_ID);
      expect(r.parsed.options.seed?.algorithm).toBe('recursive-backtracker');
      expect(r.parsed.options.seed?.size).toBe(30);
      expect(r.parsed.options.seed?.mazeSeed).toBe(VALID_HEX);
    }
  });

  it('accepts a hand-crafted level id with no options', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.ID_QUERY}=teaching-001`),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.id).toBe('teaching-001');
      expect(r.parsed.options).toEqual({});
    }
  });

  it('rejects a malformed seed id', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.SEED_QUERY}=not-a-valid-seed`),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-seed');
  });

  it('rejects an unknown victory mode', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}&${GAME_URL_QUERY_KEYS.MODE_QUERY}=invalid-mode`),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-mode');
  });

  it('clamps survive seconds into the [MIN, MAX] range', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.MODE_QUERY}=survive` +
        `&${GAME_URL_QUERY_KEYS.SURVIVE_QUERY}=99999`,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 99999 clamps to SURVIVE_SECONDS_MAX, then normalizeSurviveSeconds
      // falls back to the default for non-preset values.
      expect(r.parsed.options.surviveSeconds).toBe(SURVIVE_SECONDS_DEFAULT);
    }
  });

  it('accepts an exact preset survive-seconds value', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.MODE_QUERY}=survive` +
        `&${GAME_URL_QUERY_KEYS.SURVIVE_QUERY}=60`,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.options.surviveSeconds).toBe(60);
  });

  it('clamps enemy count to [MIN, MAX]', () => {
    const lo = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.ENEMIES_QUERY}=-5`,
      ),
    );
    expect(lo.ok).toBe(true);
    if (lo.ok) expect(lo.parsed.options.enemyCount).toBe(0);

    const hi = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.ENEMIES_QUERY}=99`,
      ),
    );
    expect(hi.ok).toBe(true);
    if (hi.ok) expect(hi.parsed.options.enemyCount).toBe(10);
  });

  it('rejects a non-numeric enemy count', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.ENEMIES_QUERY}=not-a-number`,
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-enemies');
  });

  it('parses progressive=1 as enabled, progressive=0 as disabled', () => {
    const on = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.PROGRESSIVE_QUERY}=1`,
      ),
    );
    expect(on.ok).toBe(true);
    if (on.ok) {
      expect(on.parsed.options.spawnSchedule?.enabled).toBe(true);
      // Interval defaults to the schedule default so the runtime path is
      // unchanged when only the enabled flag is overridden.
      expect(on.parsed.options.spawnSchedule?.intervalSec).toBe(SPAWN_SCHEDULE_DEFAULT.intervalSec);
    }

    const off = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.PROGRESSIVE_QUERY}=0`,
      ),
    );
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.parsed.options.spawnSchedule?.enabled).toBe(false);
  });

  it('rejects progressive values that are not 0 or 1', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(
        `?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${VALID_SEED_ID}` +
        `&${GAME_URL_QUERY_KEYS.PROGRESSIVE_QUERY}=yes`,
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-progressive');
  });

  it('round-trips mode + survive + enemies for a hand-crafted id (F9 retry path)', () => {
    // F9: LevelSelect hands App (id, options) for hand-crafted levels too.
    // The URL must round-trip them so retry preserves the configuration.
    const params = new URLSearchParams(
      `?${GAME_URL_QUERY_KEYS.ID_QUERY}=teaching-001` +
      `&${GAME_URL_QUERY_KEYS.MODE_QUERY}=survive` +
      `&${GAME_URL_QUERY_KEYS.SURVIVE_QUERY}=30` +
      `&${GAME_URL_QUERY_KEYS.ENEMIES_QUERY}=4`,
    );
    const r = parseGameSearchParams(params);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.id).toBe('teaching-001');
      expect(r.parsed.options.mode).toBe('survive');
      expect(r.parsed.options.surviveSeconds).toBe(30);
      expect(r.parsed.options.enemyCount).toBe(4);
    }
  });
});

describe('buildGameSearchParams', () => {
  it('emits ?seed=… for procedural ids and ?id=… otherwise', () => {
    const proc = buildGameSearchParams(VALID_SEED_ID);
    expect(proc.get(GAME_URL_QUERY_KEYS.SEED_QUERY)).toBe(VALID_SEED_ID);
    expect(proc.get(GAME_URL_QUERY_KEYS.ID_QUERY)).toBeNull();

    const builtin = buildGameSearchParams('teaching-001');
    expect(builtin.get(GAME_URL_QUERY_KEYS.ID_QUERY)).toBe('teaching-001');
    expect(builtin.get(GAME_URL_QUERY_KEYS.SEED_QUERY)).toBeNull();
  });

  it('round-trips mode + survive + enemies + progressive for procedural levels', () => {
    const built = buildGameSearchParams(VALID_SEED_ID, {
      mode: 'survive',
      surviveSeconds: 90,
      enemyCount: 5,
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, enabled: true },
    });
    const parsed = parseGameSearchParams(built);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.id).toBe(VALID_SEED_ID);
      expect(parsed.parsed.options.mode).toBe('survive');
      expect(parsed.parsed.options.surviveSeconds).toBe(90);
      expect(parsed.parsed.options.enemyCount).toBe(5);
      expect(parsed.parsed.options.spawnSchedule?.enabled).toBe(true);
    }
  });

  it('omits survive/enemies keys for non-survive modes (they are silently dropped)', () => {
    const built = buildGameSearchParams('teaching-001', {
      mode: 'reach-exit',
      surviveSeconds: 60,
      enemyCount: 5,
    });
    expect(built.get(GAME_URL_QUERY_KEYS.MODE_QUERY)).toBe('reach-exit');
    // Survive + enemies are only meaningful for survive mode; the build
    // helper drops them so the URL stays minimal for non-survive play.
    expect(built.get(GAME_URL_QUERY_KEYS.SURVIVE_QUERY)).toBeNull();
    expect(built.get(GAME_URL_QUERY_KEYS.ENEMIES_QUERY)).toBeNull();
  });

  it('uses encodeSeed to canonicalize the seed id even when the caller pre-built one', () => {
    // Caller passes a procedurally-shaped seed via options.seed; the id
    // parameter is the same raw string. buildGameSearchParams re-encodes
    // so the URL stays consistent with the canonical algo-v1-… format.
    const built = buildGameSearchParams(VALID_SEED_ID, {
      seed: { algorithm: 'kruskal', size: 15, mazeSeed: 'fedcba9876543210' },
    });
    const expected = encodeSeed({ algorithm: 'kruskal', size: 15, mazeSeed: 'fedcba9876543210' });
    expect(built.get(GAME_URL_QUERY_KEYS.SEED_QUERY)).toBe(expected);
  });
});