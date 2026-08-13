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

  // F-2026-06-16-H-2: buildGameSearchParams previously dropped the
  // `progressive` param when enabled=false, so a user who disabled
  // progressive would lose the setting on URL round-trip
  // (parseGameSearchParams left spawnSchedule undefined → startLevel
  // fell back to SPAWN_SCHEDULE_DEFAULT with enabled=true).
  it('round-trips progressive=disabled (URL keeps `progressive=0` and the parsed options keep enabled=false)', () => {
    const built = buildGameSearchParams(VALID_SEED_ID, {
      mode: 'survive',
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, enabled: false },
    });
    // 1) The URL itself must contain the `progressive=0` key — otherwise
    //    the disabled state is dropped on the wire.
    expect(built.get(GAME_URL_QUERY_KEYS.PROGRESSIVE_QUERY)).toBe('0');
    // 2) Round-tripping through parseGameSearchParams must yield
    //    enabled=false on the parsed options, not fall back to enabled.
    const parsed = parseGameSearchParams(built);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.options.spawnSchedule?.enabled).toBe(false);
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

  // P3-1 fix-progressive-max: `?progressiveMax=N` round-trips
  // alongside `?progressive=…` so the LevelSelect "渐进上限"
  // input is preserved through deep-link sharing. The clamp range
  // is [1, 20] — out-of-range values are clamped, non-finite are
  // rejected as `bad-progressive-max`.
  it('parses ?progressiveMax=5 and round-trips through buildGameSearchParams', () => {
    const built = buildGameSearchParams(VALID_SEED_ID, {
      mode: 'survive',
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, max: 5 },
    });
    expect(built.get(GAME_URL_QUERY_KEYS.PROGRESSIVE_MAX_QUERY)).toBe('5');
    const parsed = parseGameSearchParams(built);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.options.spawnSchedule?.max).toBe(5);
    }
  });

  it('clamps out-of-range progressiveMax (negative / > 20) into [1, 20]', () => {
    // The lenient-bad-input policy the other numeric queries
    // (`survive` / `enemies`) use: out-of-range values are
    // clamped, never rejected. A 0 or negative value falls back
    // to PROGRESSIVE_MAX_MIN (= 1); a value > 20 falls back to
    // PROGRESSIVE_MAX_MAX (= 20).
    const builtLow = buildGameSearchParams(VALID_SEED_ID, {
      mode: 'survive',
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, max: 0 },
    });
    // The build step writes the raw `max` (0) into the URL.
    // The parser then clamps it on read.
    const parsedLow = parseGameSearchParams(builtLow);
    expect(parsedLow.ok).toBe(true);
    if (parsedLow.ok) {
      expect(parsedLow.parsed.options.spawnSchedule?.max).toBe(1);
    }

    const builtHigh = buildGameSearchParams(VALID_SEED_ID, {
      mode: 'survive',
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, max: 999 },
    });
    const parsedHigh = parseGameSearchParams(builtHigh);
    expect(parsedHigh.ok).toBe(true);
    if (parsedHigh.ok) {
      expect(parsedHigh.parsed.options.spawnSchedule?.max).toBe(20);
    }
  });

  it('rejects non-finite progressiveMax values (bad-progressive-max)', () => {
    // A hand-crafted URL like `?progressiveMax=abc` should not
    // be silently clamped to 1 — that would mask a typo and
    // silently change the cap. NaN / Infinity / non-numeric
    // strings are rejected as a bad-progressive-max error so
    // the caller can fall back to a fresh level.
    const parsed = parseGameSearchParams(new URLSearchParams('seed=algo-v1-kruskal-30-0123456789abcdef&progressiveMax=abc'));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('bad-progressive-max');
    }
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

  // P3-1: v2 ids are still procedural. The isProcedural gate
  // (line 172 pre-fix) only recognized `algo-v1-…`, so a v2 id
  // would slip into the `?id=…` branch and bypass the seed
  // round-trip — the URL would be wrong (the `?id=…` query
  // survives a refresh, but the startLevel path would then
  // hit a teaching-id lookup and surface a missing-level
  // error). The fix widens the gate to accept both prefixes.
  it('emits ?seed=… for a v2 procedural id (not ?id=…)', () => {
    const v2Id = 'algo-v2-recursive-backtracker-15-3-0123456789abcdef';
    const built = buildGameSearchParams(v2Id);
    expect(built.get(GAME_URL_QUERY_KEYS.SEED_QUERY)).toBe(v2Id);
    expect(built.get(GAME_URL_QUERY_KEYS.ID_QUERY)).toBeNull();
  });

  it('round-trips a v2 id through parseGameSearchParams (the deep-link entry point)', () => {
    // The URL a user gets when they share a multi-level level.
    // `parseGameSearchParams` must NOT route this to the
    // `bad-seed` error path — `decodeSeed` already validates
    // the v2 shape and returns levelCount=3. The `id` field
    // on the parsed result is the v2 string verbatim so a
    // follow-up `buildGameSearchParams` call round-trips it
    // back to `?seed=…`.
    const v2Id = 'algo-v2-recursive-backtracker-15-3-0123456789abcdef';
    const parsed = parseGameSearchParams(
      new URLSearchParams(`?${GAME_URL_QUERY_KEYS.SEED_QUERY}=${v2Id}`),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.id).toBe(v2Id);
      expect(parsed.parsed.options.seed?.algorithm).toBe('recursive-backtracker');
      expect(parsed.parsed.options.seed?.size).toBe(15);
      expect(parsed.parsed.options.seed?.mazeSeed).toBe('0123456789abcdef');
      // levelCount must survive the URL round-trip; otherwise the
      // downstream provider has no way to know this is a 3-layer
      // level and the engine would render 1 layer.
      expect(parsed.parsed.options.seed?.levelCount).toBe(3);
    }
  });
});

describe('parseGameSearchParams tamper resistance (P3-1 isProcedural fix)', () => {
  // F-2026-06-17 (P3-1a follow-up): a deep-link with a future
  // unknown seed prefix must land in the `bad-seed` error path
  // rather than be misclassified as a hand-crafted level id. The
  // isProcedural gate pre-fix would have flagged `algo-v3-…` as
  // a hand-crafted id (no `algo-v1-` prefix), and parseGameSearchParams
  // would have returned `ok: true` with a bogus non-procedural id.
  // The gameStore would then try to load a teaching level by that
  // name, surface a missing-level error, and the URL would silently
  // regress to a teaching default. Post-fix: `?seed=algo-v3-…` lands
  // in `bad-seed`, and the `?id=algo-v3-…` path keeps the gate
  // strict via the 256-char length cap on the `?id=` branch.
  it('rejects ?seed=algo-v3-… with a NON-3D algorithm (unknown to v3 whitelist) as bad-seed', () => {
    // P4: v3 ids are now a real format (3D voxel mazes). But
    // the v3 whitelist only accepts 3D-prefixed algorithm
    // names (`3d-recursive-backtracker`); a v3 id carrying a
    // 2D algorithm name is malformed and must be rejected.
    const r = parseGameSearchParams(
      new URLSearchParams('?seed=algo-v3-recursive-backtracker-30-0123456789abcdef'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-seed');
  });

  it('rejects ?seed=algo-v3-… (3D voxel prefix retired in P0-followup) as bad-seed', () => {
    // P0-followup: the v3 3D voxel seed format was retired in
    // P4-refactor-fp2d. A legacy `?seed=algo-v3-…` URL now lands
    // in `bad-seed` because the v1/v2 regex branches in
    // `decodeSeed` don't match the v3 prefix. The UI redirect
    // policy (P4-refactor-fp2d: console.warn + navigate to
    // /levels) handles the user-facing fallback.
    const v3Id = 'algo-v3-3d-recursive-backtracker-7-0123456789abcdef';
    const r = parseGameSearchParams(new URLSearchParams(`?seed=${v3Id}`));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-seed');
  });

  it('rejects ?seed=algo-v3-… even when the algorithm slot looks 3D-shaped', () => {
    // The v3 prefix is no longer on the isProcedural gate
    // (P0-followup) — even a well-formed v3 id with a
    // `3d-` prefixed algorithm falls through to the v1/v2
    // regex branches and fails the v1/v2 whitelists.
    const v3Id = 'algo-v3-3d-recursive-backtracker-7-0123456789abcdef';
    const r = parseGameSearchParams(new URLSearchParams(`?seed=${v3Id}`));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-seed');
  });

  it('rejects ?seed=algo-v99-future-… (any unknown prefix) as bad-seed', () => {
    const r = parseGameSearchParams(
      new URLSearchParams('?seed=algo-v99-anything-30-0123456789abcdef'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('bad-seed');
  });

  it('still accepts ?seed=algo-v1-… (back-compat: v1 ids continue to parse)', () => {
    const r = parseGameSearchParams(
      new URLSearchParams(`?seed=${VALID_SEED_ID}`),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.id).toBe(VALID_SEED_ID);
      expect(r.parsed.options.seed?.algorithm).toBe('recursive-backtracker');
    }
  });

  it('still accepts ?seed=algo-v2-… (P3-1: v2 ids continue to parse)', () => {
    const v2Id = 'algo-v2-recursive-backtracker-15-3-0123456789abcdef';
    const r = parseGameSearchParams(new URLSearchParams(`?seed=${v2Id}`));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.id).toBe(v2Id);
  });

  it('round-trips a v2 id through build → parse (URL persistence preserves the level count)', () => {
    const v2Id = 'algo-v2-kruskal-50-2-fedcba9876543210';
    const built = buildGameSearchParams(v2Id, { mode: 'reach-exit' });
    const parsed = parseGameSearchParams(built);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.id).toBe(v2Id);
      expect(parsed.parsed.options.seed?.levelCount).toBe(2);
      expect(parsed.parsed.options.mode).toBe('reach-exit');
    }
  });
});