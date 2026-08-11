// Game URL <-> level identity helpers.
//
// /game carries the entire level identity in the query string so the URL is
// the canonical source of truth: refreshing the page replays the same level,
// sharing the URL gives another player the same maze + mode setup, and the
// browser back button naturally returns the user to wherever they navigated
// from.
//
// Two query keys encode the level id:
//
//   ?seed=algo-v1-recursive-backtracker-30-0123456789abcdef
//       procedural levels. The seed id is already self-describing (it
//       encodes algorithm + size + hex seed) so we round-trip it as a
//       single string with no further decomposition.
//
//   ?id=teaching-001  (or custom-…, builtin-…)
//       non-procedural levels (hand-crafted teaching / custom editor
//       output / built-in JSON).
//
// Mode options (mode / survive / enemies / progressive) are round-tripped
// for BOTH procedural and hand-crafted levels: gameStore.startLevel accepts
// them as overrides (e.g. a time-trial overlay on a teaching level), and
// the F9 retry test relies on the URL preserving them so re-clicking 重试
// re-applies the same configuration. For hand-crafted levels the level's
// own rules.victory still drives default behavior when mode is omitted.

import {
  ENEMY_COUNT_MAX,
  ENEMY_COUNT_MIN,
  SPAWN_PROGRESSIVE_MAX_MAX,
  SPAWN_PROGRESSIVE_MAX_MIN,
  SPAWN_SCHEDULE_DEFAULT,
  SURVIVE_SECONDS_MAX,
  SURVIVE_SECONDS_MIN,
  isMazeSize,
  isVictoryType,
  normalizeSurviveSeconds,
  type MazeSize,
  type SpawnSchedule,
  type StartLevelOptions,
  type VictoryType,
  type ViewMode,
} from '../maze/types';
import { decodeSeed, encodeSeed, encodeSeedV2 } from './seed';

const SEED_QUERY = 'seed';
const ID_QUERY = 'id';
const MODE_QUERY = 'mode';
const SURVIVE_QUERY = 'survive';
const ENEMIES_QUERY = 'enemies';
const PROGRESSIVE_QUERY = 'progressive';
// P3-1 fix-progressive-max: the LevelSelect "渐进上限" input is
// round-tripped through the URL as `?progressiveMax=N` (lockstep
// with `?progressive=0|1`). The clamp range is the same one
// the input enforces (`SPAWN_PROGRESSIVE_MAX_MIN..MAX` in
// types.ts), so a hand-crafted URL with an out-of-range value
// falls into the same lenient-bad-input policy the other
// `?progressive=…` branch uses (clamp + use, never reject).
const PROGRESSIVE_MAX_QUERY = 'progressiveMax';
// P4 refactor-fp2d: `?view=2d|fp3d` switches between 2D
// top-down rendering and the new first-person 3D mode (which
// still consumes the v1/v2 2D multi-layer data, just rendered
// with a perspective camera). Default is `2d` for back-compat
// with every URL minted before this branch landed.
const VIEW_QUERY = 'view';
const VIEW_DEFAULT: ViewMode = '2d';
const VIEW_VALUES: readonly ViewMode[] = ['2d', 'fp3d'];

export function isViewMode(v: unknown): v is ViewMode {
  return typeof v === 'string' && (VIEW_VALUES as readonly string[]).includes(v);
}

// Reasons the parser rejects a /game URL. Strings are user-visible (they
// flow through to a LevelLoadError surfaced by App), so they are kept short
// and machine-recognizable.
export type GameUrlError =
  | 'missing-id'
  | 'both-seed-and-id'
  | 'bad-seed'
  | 'bad-mode'
  | 'bad-survive'
  | 'bad-enemies'
  | 'bad-size'
  | 'bad-progressive'
  | 'bad-progressive-max'
  | 'bad-view';

export interface ParsedGameUrl {
  // Procedural levels carry the encoded algo-v1-... id; non-procedural
  // levels carry the raw level id. Exactly one is set.
  id: string;
  options: StartLevelOptions;
  // P4 refactor-fp2d: the rendering mode the Game should boot
  // with. Lives at the same level as `id` because view is not a
  // per-level rule (it doesn't go into rules.victory) — it's a
  // presentation toggle that the user picks from LevelSelect.
  view: ViewMode;
}

// F-project-review-2026-06-14: read the mode / survive / enemies /
// progressive keys off a URLSearchParams, returning a partial
// StartLevelOptions. Both the procedural and non-procedural code paths
// call this so the option shape stays identical.
function readOptions(params: URLSearchParams): { ok: true; options: StartLevelOptions } | { ok: false; error: GameUrlError } {
  const options: StartLevelOptions = {};

  const modeRaw = params.get(MODE_QUERY);
  if (modeRaw !== null) {
    if (!isVictoryType(modeRaw)) return { ok: false, error: 'bad-mode' };
    options.mode = modeRaw;
  }

  const surviveRaw = params.get(SURVIVE_QUERY);
  if (surviveRaw !== null) {
    const n = Number(surviveRaw);
    if (!Number.isFinite(n)) return { ok: false, error: 'bad-survive' };
    const clamped = Math.max(SURVIVE_SECONDS_MIN, Math.min(SURVIVE_SECONDS_MAX, n));
    // F-D-quality-D-16: same boundary check as LevelSelect — the literal
    // union is for the menu/options entry point, but a deep-link from a
    // shared URL can carry any clamped value, so we fall back to the
    // default instead of widening unsafely. normalizeSurviveSeconds is
    // the same function the gameStore uses on the runtime path.
    options.surviveSeconds = normalizeSurviveSeconds(clamped);
  }

  const enemiesRaw = params.get(ENEMIES_QUERY);
  if (enemiesRaw !== null) {
    const n = Number(enemiesRaw);
    if (!Number.isFinite(n)) return { ok: false, error: 'bad-enemies' };
    const clamped = Math.max(ENEMY_COUNT_MIN, Math.min(ENEMY_COUNT_MAX, Math.trunc(n)));
    options.enemyCount = clamped;
  }

  const progressiveRaw = params.get(PROGRESSIVE_QUERY);
  if (progressiveRaw !== null) {
    if (progressiveRaw !== '0' && progressiveRaw !== '1') {
      return { ok: false, error: 'bad-progressive' };
    }
    const enabled = progressiveRaw === '1';
    options.spawnSchedule = { ...SPAWN_SCHEDULE_DEFAULT, enabled };
  }

  // P3-1 fix-progressive-max: parse `?progressiveMax=N` (lockstep
  // with `?progressive=…`). A non-finite value (NaN / Infinity)
  // is a bad-progressive-max error; an out-of-range value is
  // clamped into [PROGRESSIVE_MAX_MIN, PROGRESSIVE_MAX_MAX] using
  // the same lenient-bad-input policy as the other numeric
  // queries (`survive` / `enemies`). The clamped value is then
  // overlaid on top of any spawnSchedule the `?progressive=…`
  // branch above just constructed (or onto a fresh default if
  // that branch didn't fire), so the two params stay in lockstep.
  const progressiveMaxRaw = params.get(PROGRESSIVE_MAX_QUERY);
  if (progressiveMaxRaw !== null) {
    const n = Number(progressiveMaxRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: 'bad-progressive-max' };
    }
    const clamped = Math.max(SPAWN_PROGRESSIVE_MAX_MIN, Math.min(SPAWN_PROGRESSIVE_MAX_MAX, Math.trunc(n)));
    options.spawnSchedule = {
      ...SPAWN_SCHEDULE_DEFAULT,
      ...(options.spawnSchedule ?? {}),
      max: clamped,
    };
  }

  return { ok: true, options };
}

// P4 refactor-fp2d: parse `?view=…` independently from the
// options object. View is a presentation toggle (not a
// per-level rule), so it doesn't belong in StartLevelOptions —
// it sits on ParsedGameUrl as a sibling of `id` and is consumed
// by GameCanvas when it dispatches which Game class to build.
// The lenient policy is "invalid value falls back to 2d, no
// error" so a stale `?view=foo` link doesn't break the page;
// the only strict failure is a non-finite / wrong-type value
// (e.g. a number from a hand-crafted URL), which is rare
// enough to merit a `bad-view` error for the error-boundary UI.
function readView(params: URLSearchParams): { ok: true; view: ViewMode } | { ok: false; error: GameUrlError } {
  const raw = params.get(VIEW_QUERY);
  if (raw === null) return { ok: true, view: VIEW_DEFAULT };
  if (!isViewMode(raw)) return { ok: false, error: 'bad-view' };
  return { ok: true, view: raw };
}

// F-project-review-2026-06-14: query-string parser. The shape mirrors the
// URLSearchParams API but is bounded to known keys so a deep-link with
// unexpected keys (e.g. ?<script>) is rejected at the boundary.
export function parseGameSearchParams(
  params: URLSearchParams,
): { ok: true; parsed: ParsedGameUrl } | { ok: false; error: GameUrlError } {
  const seed = params.get(SEED_QUERY);
  const id = params.get(ID_QUERY);
  if (!seed && !id) return { ok: false, error: 'missing-id' };
  if (seed && id) return { ok: false, error: 'both-seed-and-id' };

  // F-project-review-2026-06-14: mode / survive / enemies / progressive
  // are parsed BEFORE the id-vs-seed branch so both procedural and
  // hand-crafted levels share the same option-reading path. Without this
  // the F9 retry test breaks: LevelSelect passes these options for hand-
  // crafted levels too, and the URL needs to round-trip them.
  const optsResult = readOptions(params);
  if (!optsResult.ok) return optsResult;
  const options = optsResult.options;

  const viewResult = readView(params);
  if (!viewResult.ok) return viewResult;
  const view = viewResult.view;

  if (id !== null) {
    // Non-procedural: id is taken as-is. Empty string is treated as missing.
    if (id.length === 0) return { ok: false, error: 'missing-id' };
    // F-2026-07-01 M-54: cap id length at 256 chars. Built-in ids
    // (teaching-*, builtin-*) and encoded seed ids (algo-v1-…) all
    // sit well under 100 chars; a 256-char ceiling gives future custom
    // id formats (e.g. UUID-based editor exports) plenty of room while
    // bounding the surface for URL-injection / memory-DoS attacks via
    // a deep-link carrying a multi-megabyte `id` parameter. Overflow
    // falls back to the default level rather than throwing — matches
    // the lenient-bad-input policy used by every other validation
    // branch in this parser.
    if (id.length > 256) return { ok: false, error: 'missing-id' };
    return { ok: true, parsed: { id, options, view } };
  }

  // Procedural path. seed is non-null here per the both-seed-and-id gate.
  let decoded;
  try {
    decoded = decodeSeed(seed!);
  } catch {
    return { ok: false, error: 'bad-seed' };
  }
  options.seed = decoded;
  // P3-1: preserve the v2 wire format on round-trip. A deep-link
  // carrying a v2 id must come back out as a v2 id; otherwise
  // refreshing the page would silently downgrade the level to
  // 1 layer. `encodeSeed` (v1) only fires when the seed has no
  // `levelCount` (i.e. it was a v1 id to begin with, or a v2 id
  // with the back-compat `levelCount=1` value — which decodes
  // identically so the codec-version swap is invisible).
  //
  // P4 refactor-fp2d: the v3 (3D voxel) wire format is removed.
  // 3D mode is now a "first-person view of 2D multi-layer"
  // rendering (P4 refactor spec), so 3D voxel seeds are no
  // longer produced. An old v3 id (`algo-v3-…`) fails the v1
  // /v2 regexes and lands in the `bad-seed` error path here.
  // The view toggle is independent of the seed format: a v1 or
  // v2 id with `view=fp3d` boots the same data in first-person
  // rendering, and `view=2d` (default) is the historical
  // top-down rendering.
  const seedId =
    decoded.levelCount && decoded.levelCount > 1
      ? encodeSeedV2(decoded, decoded.levelCount)
      : encodeSeed(decoded);
  return { ok: true, parsed: { id: seedId, options, view } };
}

// F-project-review-2026-06-14: reverse direction. Builds the ?seed=&mode=...
// query that round-trips the StartLevelOptions LevelSelect handed us. Used
// when navigating from /levels to /game so the URL mirrors what the user
// just configured.
//
// P4 refactor-fp2d: now also takes a `view` arg (the rendering mode
// LevelSelect picked). view=fp3d writes `?view=fp3d`; the default
// `2d` is omitted to keep the URL clean for the (much more common)
// top-down case. view is a presentation toggle, not a per-level
// rule, so it lives outside StartLevelOptions.
export function buildGameSearchParams(
  id: string,
  options?: StartLevelOptions,
  view: ViewMode = VIEW_DEFAULT,
): URLSearchParams {
  const params = new URLSearchParams();
  // P3-1: P3-1a added the algo-v2-… seed format (carries a level
  // count between `size` and the hex mazeSeed). v2 ids are still
  // procedural — they round-trip through `?seed=…` the same way v1
  // ids do — so the isProcedural gate has to accept both prefixes.
  // P4 refactor-fp2d: the v3 (3D voxel) prefix is removed. 3D
  // mode is now a presentation toggle (`view=fp3d`) that
  // consumes the same v1/v2 2D data, so the seed format space
  // shrinks back to v1 + v2 only. A stale `algo-v3-…` id never
  // reaches this function in normal flow (the JSON provider no
  // longer emits it, and LevelSelect's procedural dropdown is
  // 2D-only) — the `id.startsWith('algo-v3-')` branch was
  // removed in lockstep with the v3 codec deprecation.
  const isProcedural = id.startsWith('algo-v1-') || id.startsWith('algo-v2-');
  if (isProcedural) {
    params.set(SEED_QUERY, id);
  } else {
    params.set(ID_QUERY, id);
  }
  if (!options) return params;

  // Re-encode so the URL carries the canonical algorithm+size+seed in the
  // seed id (we'd rather trust encodeSeed than the caller's pre-built id).
  // P3-1: route through encodeSeedV2 when the seed carries a level
  // count, otherwise the URL silently downgrades a multi-layer
  // level to 1 layer on every navigation. `encodeSeed` (v1) is
  // still the right call for v1 ids and v2 ids that decode to
  // levelCount=1 (the back-compat-1 case is byte-identical
  // between the two encoders except for the wire prefix, and v1
  // is the canonical name for it because every historical best
  // record is on the v1 codec).
  if (isProcedural && options.seed) {
    const seed = options.seed;
    if (seed.levelCount && seed.levelCount > 1) {
      params.set(SEED_QUERY, encodeSeedV2(seed, seed.levelCount));
    } else {
      params.set(SEED_QUERY, encodeSeed(seed));
    }
  }
  if (options.mode) params.set(MODE_QUERY, options.mode);
  if (options.mode === 'survive' && typeof options.surviveSeconds === 'number') {
    params.set(SURVIVE_QUERY, String(options.surviveSeconds));
  }
  if (options.mode === 'survive' && typeof options.enemyCount === 'number') {
    params.set(ENEMIES_QUERY, String(options.enemyCount));
  }
  if (options.spawnSchedule) {
    // F-2026-06-16-H-2: round-trip the disabled case too. Previously this
    // only wrote '1' on enabled, so a user who turned progressive OFF
    // and shared the URL would have the param dropped on write, then
    // the parser would leave spawnSchedule undefined, and startLevel
    // would fall back to SPAWN_SCHEDULE_DEFAULT (enabled: true) —
    // silently re-enabling progressive on every page load.
    params.set(PROGRESSIVE_QUERY, options.spawnSchedule.enabled ? '1' : '0');
    // P3-1 fix-progressive-max: write the cap in lockstep with
    // `?progressive=…`. The DEFAULT carries `max:
    // SPAWN_PROGRESSIVE_MAX_DEFAULT` (= 10), so the param is
    // always emitted; a future bump of the default would just
    // shift the value the URL hands back to the parser, with no
    // round-trip drift. (Round-tripping only when the value
    // differs from DEFAULT would be cleaner but loses the "URL
    // self-documents" property the other progressive fields
    // preserve.)
    params.set(PROGRESSIVE_MAX_QUERY, String(options.spawnSchedule.max));
  }
  // P4 refactor-fp2d: emit `?view=fp3d` when the user picked
  // first-person 3D rendering. The default `2d` is intentionally
  // omitted to keep historical URLs short and the top-down
  // experience indistinguishable from a pre-refactor link.
  if (view === 'fp3d') {
    params.set(VIEW_QUERY, view);
  }
  return params;
}

// Re-exported for tests / debugging.
export const GAME_URL_QUERY_KEYS = {
  SEED_QUERY,
  ID_QUERY,
  MODE_QUERY,
  SURVIVE_QUERY,
  ENEMIES_QUERY,
  PROGRESSIVE_QUERY,
  PROGRESSIVE_MAX_QUERY,
  VIEW_QUERY,
} as const;

// Re-exports for callers that want the size guard inline.
export { isMazeSize };
export type { MazeSize, SpawnSchedule };
export type { VictoryType };