import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';
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

export function sanitizeBestRecordMap(raw: unknown): Record<string, BestRecord> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, BestRecord> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isBestRecord(v)) out[k] = v;
    else console.warn(`levelStore: dropped invalid record for level '${k}'`);
  }
  return out;
}

// P2-4b: best-effort load of custom levels on init. We can't rely on
// `validateMaze` to know the id a-priori — for each entry the id is the
// map key, so we re-validate the value against that key. Anything that
// fails to parse (malformed JSON, missing walls, start on a wall, etc.)
// is dropped with a console.warn so a bad hand-edit in localStorage
// doesn't brick the editor on next page load.
export function sanitizeCustomLevelsMap(raw: unknown): Record<string, MazeData> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, MazeData> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    try {
      out[k] = validateMaze(v, k);
    } catch (e) {
      console.warn(`levelStore: dropped invalid custom level '${k}':`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

export const useLevelStore = create<LevelStore>((set, get) => ({
  bestByLevel: (() => {
    const raw = loadJSON<unknown>(STORAGE_KEY, null);
    if (raw === null) return {};
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
      return sanitizeBestRecordMap(raw);
    }
    try {
      const migrated = applyLevelMigrations(raw, fromVersion);
      return sanitizeBestRecordMap(migrated);
    } catch (e) {
      console.warn(
        `levelStore: migration failed for '${STORAGE_KEY}':`,
        e instanceof Error ? e.message : e,
      );
      return {};
    }
  })(),
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
    saveJSON(STORAGE_KEY, next);
    set({ bestByLevel: next });
  },
  getBest: (levelId) => get().bestByLevel[levelId],

  // ---- P2-4b: custom (editor-authored) levels ----
  customLevels: (() => {
    const raw = loadJSON<unknown>(CUSTOM_STORAGE_KEY, null);
    if (raw === null) return {};
    // F-project-review-2026-06-13-D-21: same migration chokepoint as
    // bestByLevel — see the bestByLevel IIFE above for the rationale.
    const fromVersion = parseStorageKeyVersion(CUSTOM_STORAGE_KEY);
    if (fromVersion === null) {
      return sanitizeCustomLevelsMap(raw);
    }
    try {
      const migrated = applyLevelMigrations(raw, fromVersion);
      return sanitizeCustomLevelsMap(migrated);
    } catch (e) {
      console.warn(
        `levelStore: migration failed for '${CUSTOM_STORAGE_KEY}':`,
        e instanceof Error ? e.message : e,
      );
      return {};
    }
  })(),
  // Throws on structural failure (delegated to validateMaze) so the editor
  // can surface a user-facing error before any persistence happens. On
  // success the level is idempotently merged into both state and storage.
  saveCustom: (level) => {
    const validated = validateMaze(level, level.id);
    const next = { ...get().customLevels, [validated.id]: validated };
    saveJSON(CUSTOM_STORAGE_KEY, next);
    set({ customLevels: next });
  },
  getCustom: (id) => get().customLevels[id],
  // No-op when the id is unknown. Deleting a missing key from a plain
  // object is safe; localStorage.removeItem on a missing key is a no-op,
  // so this stays consistent with the state path.
  deleteCustom: (id) => {
    if (!(id in get().customLevels)) return;
    const next = { ...get().customLevels };
    delete next[id];
    saveJSON(CUSTOM_STORAGE_KEY, next);
    set({ customLevels: next });
  },
  listCustom: () => Object.keys(get().customLevels),
}));
