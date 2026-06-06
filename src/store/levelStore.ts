import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';

export interface BestRecord {
  levelId: string;
  timeUsed: number;
  collected: number;
  total: number;
  date: string; // ISO
}

interface LevelStore {
  bestByLevel: Record<string, BestRecord>;
  record: (r: BestRecord) => void;
  getBest: (levelId: string) => BestRecord | undefined;
}

const STORAGE_KEY = 'maze3d.levels.v1';

function isBestRecord(raw: unknown): raw is BestRecord {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.levelId !== 'string') return false;
  if (typeof r.timeUsed !== 'number' || !Number.isFinite(r.timeUsed)) return false;
  if (typeof r.collected !== 'number' || !Number.isFinite(r.collected)) return false;
  if (typeof r.total !== 'number' || !Number.isFinite(r.total)) return false;
  if (typeof r.date !== 'string') return false;
  return true;
}

function isBestRecordMap(raw: unknown): raw is Record<string, BestRecord> {
  if (typeof raw !== 'object' || raw === null) return false;
  for (const v of Object.values(raw)) {
    if (!isBestRecord(v)) return false;
  }
  return true;
}

export const useLevelStore = create<LevelStore>((set, get) => ({
  bestByLevel: loadJSON<Record<string, BestRecord>>(STORAGE_KEY, {}, isBestRecordMap),
  record: (r) => {
    const cur = get().bestByLevel[r.levelId];
    const isBetter =
      !cur ||
      r.timeUsed < cur.timeUsed ||
      (r.timeUsed === cur.timeUsed && r.collected > cur.collected);
    if (!isBetter) return;
    const next = { ...get().bestByLevel, [r.levelId]: r };
    saveJSON(STORAGE_KEY, next);
    set({ bestByLevel: next });
  },
  getBest: (levelId) => get().bestByLevel[levelId],
}));
