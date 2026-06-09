import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';
import type { Algorithm, MazeSize, Seed } from '../maze/types';

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
}

const STORAGE_KEY = 'maze3d.levels.v1';

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

export const useLevelStore = create<LevelStore>((set, get) => ({
  bestByLevel: (() => {
    const raw = loadJSON<unknown>(STORAGE_KEY, null);
    return raw ? sanitizeBestRecordMap(raw) : {};
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
}));
