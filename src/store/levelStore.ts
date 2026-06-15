import { create } from 'zustand';
import { loadJSON, safeSetItem, type PersistResult } from './persist';
// F-project-review-2026-06-13-D-21: route every localStorage load through
// the migration chokepoint so a future v2 schema bump can transform v1
// data on load without touching the call site here.
import { applyLevelMigrations, parseStorageKeyVersion } from './migrations';
import { validateMaze } from '../maze/JsonMazeProvider';
import type { Algorithm, MazeData, MazeSize, Seed } from '../maze/types';

const VALID_ALGORITHMS: readonly Algorithm[] = [
  'recursive-backtracker',
  'kruskal',
  'prim',
  'hunt-and-kill',
];
const VALID_SIZES: readonly MazeSize[] = [15, 30, 50];
const MAZE_SEED_RE = /^[0-9a-f]{16}$/;

export interface BestRecord {
  levelId: string;
  timeUsed: number;
  collected: number;
  total: number;
  date: string; // ISO
  // P2-3: optional structured seed for procedural bests. Hand-crafted levels
  // (loaded from public/levels/*.json) leave this undefined. When present
  // it must round-trip through AlgorithmMazeProvider to regenerate the same
  // maze, so it carries the algorithm + size + 16-hex mazeSeed triple.
  seed?: Seed;
}

interface LevelStore {
  bestByLevel: Record<string, BestRecord>;
  record: (r: BestRecord) => void;
  getBest: (levelId: string) => BestRecord | undefined;
  // Pure read: would `record(r)` actually store r? Single source of truth
  // shared with the win-overlay bridge so the two cannot drift.
  peekIsBetter: (r: BestRecord) => boolean;
  // P2-4b: user-authored levels saved by the in-browser level editor.
  // Kept in a separate localStorage key from bestByLevel so an editor wipe
  // can never erase best records (and vice versa).
  customLevels: Record<string, MazeData>;
  saveCustom: (level: MazeData) => void;
  getCustom: (id: string) => MazeData | undefined;
  deleteCustom: (id: string) => void;
  listCustom: () => string[];
  // F-project-review-2026-06-13-D-10: transient field set during init when
  // localStorage entries were dropped (sanitization rejection) or a
  // migration threw. The UI reads this once on mount to show a one-time
  // toast like "3 custom levels were skipped because they're from a
  // newer format." — same shape as `useConfirm` for surfacing errors.
  // `null` means "nothing was dropped on this load"; the toast component
  // treats `null` as "don't render."
  lastLoadSummary: LoadSummary | null;
  dismissLoadSummary: () => void;
  // F-2026-06-15-H-3.1: transient field set when a `record()` / `saveCustom()`
  // localStorage write fails (quota exceeded, storage disabled, payload too
  // large). Previously these failures fell through `saveJSON` with only a
  // `console.warn`, silently losing best records and custom levels. The
  // store now routes through `safeSetItem` and exposes the failure via this
  // field so the UI can surface a toast. `null` means "no pending write
  // failure". The latest failure replaces any older one — the user is
  // notified on next dismissal/reload at the latest, which is the right
  // cadence for a best-effort persistence layer.
  lastWriteError: WriteError | null;
  dismissWriteError: () => void;
}

/**
 * F-2026-06-15-H-3.1: structured write-failure record. `kind` discriminates
 * the call site so the UI can render a context-specific message (e.g. "本次
 * 最佳成绩未能保存" vs "自定义关卡保存失败"). `reason` reuses the
 * PersistResult discriminator from persist.ts so adding a new reason there
 * automatically widens this type.
 */
export interface WriteError {
  kind: 'record' | 'customLevel';
  // The PersistResult.reason from the failed safeSetItem call. Bundled with
  // the call-site kind so the UI doesn't have to thread two enums.
  reason: Extract<PersistResult, { ok: false }>['reason'];
}

/**
 * F-project-review-2026-06-13-D-10: summary of what was lost during init.
 * Each list is empty when nothing of that kind was dropped. The migration-
 * error fields capture a wholesale-load failure (the entire key was
 * rejected because a v_n → v_{n+1} chain blew up) — distinct from the
 * per-entry `*DroppedKeys` arrays which capture per-row rejections.
 */
export interface LoadSummary {
  recordsDroppedKeys: string[];
  customsDroppedKeys: string[];
  recordsMigrationError: string | null;
  customsMigrationError: string | null;
}

function buildLoadSummary(
  recordsDropped: string[],
  customsDropped: string[],
  recordsMigrationError: string | null,
  customsMigrationError: string | null,
): LoadSummary | null {
  if (
    recordsDropped.length === 0 &&
    customsDropped.length === 0 &&
    recordsMigrationError === null &&
    customsMigrationError === null
  ) return null;
  return { recordsDroppedKeys: recordsDropped, customsDroppedKeys: customsDropped, recordsMigrationError, customsMigrationError };
}

const STORAGE_KEY = 'maze3d.levels.v1';
// P2-4b: custom-level storage. Distinct key on purpose: an editor reset or
// a corrupted customLevels entry must never cascade into wiping the user's
// best records. Versioned (v1) so a future schema change can migrate or
// reset in isolation.
//
// F-project-review-2026-06-13-D-21: both keys carry their schema version
// in the key name. When a future bump adds a v2, the init code below
// routes the loaded value through `applyLevelMigrations` so v1 data on
// disk is transformed on load instead of being orphaned.
const CUSTOM_STORAGE_KEY = 'maze3d.customLevels.v1';

function isValidSeed(raw: unknown): raw is Seed {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.algorithm !== 'string' || !VALID_ALGORITHMS.includes(s.algorithm as Algorithm)) {
    return false;
  }
  if (typeof s.size !== 'number' || !VALID_SIZES.includes(s.size as MazeSize)) {
    return false;
  }
  if (typeof s.mazeSeed !== 'string' || !MAZE_SEED_RE.test(s.mazeSeed)) {
    return false;
  }
  return true;
}

export function isBestRecord(raw: unknown): raw is BestRecord {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.levelId !== 'string' || r.levelId === '') return false;
  if (typeof r.timeUsed !== 'number' || !Number.isFinite(r.timeUsed) || r.timeUsed < 0) return false;
  if (typeof r.collected !== 'number' || !Number.isFinite(r.collected) || r.collected < 0) return false;
  if (typeof r.total !== 'number' || !Number.isFinite(r.total) || r.total < 0) return false;
  if (r.collected > r.total) return false;
  if (typeof r.date !== 'string' || Number.isNaN(Date.parse(r.date))) return false;
  // Seed is optional, but if it is present it must be a well-formed Seed
  // object. A malformed seed silently turns the procedural level into a
  // non-replayable black box, so reject the record rather than persist it.
  if (r.seed !== undefined && !isValidSeed(r.seed)) return false;
  return true;
}

// F-project-review-2026-06-13-D-10: signature changed to return
// `{ map, dropped }` so the caller can surface dropped keys as a toast.
// The dropped list is the contract — the previous "no UI feedback" path
// is what triggered this finding. console.warn is preserved as a
// dev-time breadcrumb (the toast is the user-time breadcrumb).
export function sanitizeBestRecordMap(raw: unknown): { map: Record<string, BestRecord>; dropped: string[] } {
  if (typeof raw !== 'object' || raw === null) return { map: {}, dropped: [] };
  const out: Record<string, BestRecord> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isBestRecord(v)) out[k] = v;
    else {
      dropped.push(k);
      console.warn(`levelStore: dropped invalid record for level '${k}'`);
    }
  }
  return { map: out, dropped };
}

// P2-4b: best-effort load of custom levels on init. We can't rely on
// `validateMaze` to know the id a-priori — for each entry the id is the
// map key, so we re-validate the value against that key. Anything that
// fails to parse (malformed JSON, missing walls, start on a wall, etc.)
// is dropped with a console.warn so a bad hand-edit in localStorage
// doesn't brick the editor on next page load.
//
// F-project-review-2026-06-13-D-10: signature changed (same shape as
// sanitizeBestRecordMap) so the caller can collect dropped keys for the
// init toast.
export function sanitizeCustomLevelsMap(raw: unknown): { map: Record<string, MazeData>; dropped: string[] } {
  if (typeof raw !== 'object' || raw === null) return { map: {}, dropped: [] };
  const out: Record<string, MazeData> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    try {
      out[k] = validateMaze(v, k);
    } catch (e) {
      dropped.push(k);
      console.warn(`levelStore: dropped invalid custom level '${k}':`, e instanceof Error ? e.message : e);
    }
  }
  return { map: out, dropped };
}

export const useLevelStore = create<LevelStore>((set, get) => {
  // F-project-review-2026-06-13-D-10: switch from `create((set, get) => ({...}))`
  // to a function-bodied form so we can compute the per-key init result
  // (sanitized map + dropped keys + migration-error string) ONCE before
  // building the returned state object. The arrow-returning-object form
  // runs each IIFE in field-initializer order without a shared scope,
  // which would force us to either re-parse localStorage twice or stash
  // dropped keys in a module-level mutable (the latter is the anti-pattern
  // this refactor replaces).
  const recordsInit = (() => {
    const raw = loadJSON<unknown>(STORAGE_KEY, null);
    if (raw === null) return { map: {} as Record<string, BestRecord>, dropped: [] as string[], migrationError: null as string | null };
    // F-project-review-2026-06-13-D-21: route through the migration
    // chokepoint so a future v2 schema bump can transform v1 data on
    // load without changing this call site. Currently a no-op because
    // LEVEL_MIGRATIONS is empty and CURRENT_LEVEL_SCHEMA_VERSION is 1,
    // but the version-parse + apply call establishes the path.
    const fromVersion = parseStorageKeyVersion(STORAGE_KEY);
    if (fromVersion === null) {
      // Defensive: every key we write here carries the `.v1` suffix,
      // but if a hand-crafted key shows up without one we treat it as
      // v1 (the only schema that has ever existed) rather than refusing
      // to load — sanitizeBestRecordMap will drop any malformed entries.
      return { ...sanitizeBestRecordMap(raw), migrationError: null as string | null };
    }
    try {
      const migrated = applyLevelMigrations(raw, fromVersion);
      return { ...sanitizeBestRecordMap(migrated), migrationError: null as string | null };
    } catch (e) {
      console.warn(
        `levelStore: migration failed for '${STORAGE_KEY}':`,
        e instanceof Error ? e.message : e,
      );
      return { map: {} as Record<string, BestRecord>, dropped: [] as string[], migrationError: e instanceof Error ? e.message : String(e) };
    }
  })();
  const customsInit = (() => {
    const raw = loadJSON<unknown>(CUSTOM_STORAGE_KEY, null);
    if (raw === null) return { map: {} as Record<string, MazeData>, dropped: [] as string[], migrationError: null as string | null };
    // F-project-review-2026-06-13-D-21: same migration chokepoint as
    // bestByLevel — see the bestByLevel IIFE above for the rationale.
    const fromVersion = parseStorageKeyVersion(CUSTOM_STORAGE_KEY);
    if (fromVersion === null) {
      return { ...sanitizeCustomLevelsMap(raw), migrationError: null as string | null };
    }
    try {
      const migrated = applyLevelMigrations(raw, fromVersion);
      return { ...sanitizeCustomLevelsMap(migrated), migrationError: null as string | null };
    } catch (e) {
      console.warn(
        `levelStore: migration failed for '${CUSTOM_STORAGE_KEY}':`,
        e instanceof Error ? e.message : e,
      );
      return { map: {} as Record<string, MazeData>, dropped: [] as string[], migrationError: e instanceof Error ? e.message : String(e) };
    }
  })();
  // F-project-review-2026-06-13-D-10: surface dropped records / customs /
  // migration errors as a one-time store field. The UI reads this once
  // on mount and shows a toast like "3 custom levels were skipped because
  // they're from a newer format." `null` means "nothing to surface" and
  // is the common-case value (no drops).
  const lastLoadSummary = buildLoadSummary(
    recordsInit.dropped,
    customsInit.dropped,
    recordsInit.migrationError,
    customsInit.migrationError,
  );
  return {
  bestByLevel: recordsInit.map,
  peekIsBetter: (r) => {
    if (!isBestRecord(r)) return false;
    const cur = get().bestByLevel[r.levelId];
    return (
      !cur ||
      r.timeUsed < cur.timeUsed ||
      (r.timeUsed === cur.timeUsed && r.collected > cur.collected)
    );
  },
  record: (r) => {
    if (!isBestRecord(r)) {
      console.warn('levelStore.record: rejected invalid record', r);
      return;
    }
    if (!get().peekIsBetter(r)) return;
    const next = { ...get().bestByLevel, [r.levelId]: r };
    // F-2026-06-15-H-3.1: route through safeSetItem so a quota / storage
    // failure is captured in lastWriteError instead of being swallowed by
    // the silent saveJSON path. In-memory state is updated whether or not
    // persistence succeeds so the UI for the current session is consistent
    // — the toast tells the user the record won't survive reload.
    const result = safeSetItem(STORAGE_KEY, next);
    if (!result.ok) {
      console.warn('levelStore.record: persist failed', result.reason);
      set({ bestByLevel: next, lastWriteError: { kind: 'record', reason: result.reason } });
      return;
    }
    set({ bestByLevel: next, lastWriteError: null });
  },
  getBest: (levelId) => get().bestByLevel[levelId],

  // ---- P2-4b: custom (editor-authored) levels ----
  customLevels: customsInit.map,
  // Throws on structural failure (delegated to validateMaze) so the editor
  // can surface a user-facing error before any persistence happens. On
  // success the level is idempotently merged into both state and storage.
  saveCustom: (level) => {
    const validated = validateMaze(level, level.id);
    const next = { ...get().customLevels, [validated.id]: validated };
    // F-2026-06-15-H-3.1: same surfacing pattern as record() above —
    // editor save UX needs to know when persistence actually failed.
    const result = safeSetItem(CUSTOM_STORAGE_KEY, next);
    if (!result.ok) {
      console.warn('levelStore.saveCustom: persist failed', result.reason);
      set({ customLevels: next, lastWriteError: { kind: 'customLevel', reason: result.reason } });
      return;
    }
    set({ customLevels: next, lastWriteError: null });
  },
  getCustom: (id) => get().customLevels[id],
  // No-op when the id is unknown. Deleting a missing key from a plain
  // object is safe; localStorage.removeItem on a missing key is a no-op,
  // so this stays consistent with the state path.
  deleteCustom: (id) => {
    if (!(id in get().customLevels)) return;
    const next = { ...get().customLevels };
    delete next[id];
    // F-2026-06-15-H-3.1: same safeSetItem treatment as saveCustom — a
    // delete that fails to persist (very unlikely, but possible in private
    // mode) still updates in-memory state and surfaces the failure.
    const result = safeSetItem(CUSTOM_STORAGE_KEY, next);
    if (!result.ok) {
      console.warn('levelStore.deleteCustom: persist failed', result.reason);
      set({ customLevels: next, lastWriteError: { kind: 'customLevel', reason: result.reason } });
      return;
    }
    set({ customLevels: next, lastWriteError: null });
  },
  listCustom: () => Object.keys(get().customLevels),
  // F-project-review-2026-06-13-D-10: see `lastLoadSummary` declaration
  // and `buildLoadSummary` helper above for the contract. Captured at
  // construction; cleared when the toast is dismissed.
  lastLoadSummary,
  dismissLoadSummary: () => set({ lastLoadSummary: null }),
  // F-2026-06-15-H-3.1: write-failure surface. Starts null (no pending
  // failure); record() / saveCustom() / deleteCustom() set it on a
  // safeSetItem rejection. dismissWriteError clears it (user acknowledged
  // the toast). The next successful write also clears it.
  lastWriteError: null,
  dismissWriteError: () => set({ lastWriteError: null }),
  };
});
