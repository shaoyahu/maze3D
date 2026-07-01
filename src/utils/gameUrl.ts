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
} from '../maze/types';
import { decodeSeed, encodeSeed } from './seed';

const SEED_QUERY = 'seed';
const ID_QUERY = 'id';
const MODE_QUERY = 'mode';
const SURVIVE_QUERY = 'survive';
const ENEMIES_QUERY = 'enemies';
const PROGRESSIVE_QUERY = 'progressive';

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
  | 'bad-progressive';

export interface ParsedGameUrl {
  // Procedural levels carry the encoded algo-v1-... id; non-procedural
  // levels carry the raw level id. Exactly one is set.
  id: string;
  options: StartLevelOptions;
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

  return { ok: true, options };
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
    return { ok: true, parsed: { id, options } };
  }

  // Procedural path. seed is non-null here per the both-seed-and-id gate.
  let decoded;
  try {
    decoded = decodeSeed(seed!);
  } catch {
    return { ok: false, error: 'bad-seed' };
  }
  options.seed = decoded;
  return { ok: true, parsed: { id: encodeSeed(decoded), options } };
}

// F-project-review-2026-06-14: reverse direction. Builds the ?seed=&mode=...
// query that round-trips the StartLevelOptions LevelSelect handed us. Used
// when navigating from /levels to /game so the URL mirrors what the user
// just configured.
export function buildGameSearchParams(
  id: string,
  options?: StartLevelOptions,
): URLSearchParams {
  const params = new URLSearchParams();
  const isProcedural = id.startsWith('algo-v1-');
  if (isProcedural) {
    params.set(SEED_QUERY, id);
  } else {
    params.set(ID_QUERY, id);
  }
  if (!options) return params;

  // Re-encode so the URL carries the canonical algorithm+size+seed in the
  // seed id (we'd rather trust encodeSeed than the caller's pre-built id).
  if (isProcedural && options.seed) {
    params.set(SEED_QUERY, encodeSeed(options.seed));
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
} as const;

// Re-exports for callers that want the size guard inline.
export { isMazeSize };
export type { MazeSize, SpawnSchedule };
export type { VictoryType };