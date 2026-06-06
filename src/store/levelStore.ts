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

export const useLevelStore = create<LevelStore>((set, get) => ({
  bestByLevel: loadJSON<Record<string, BestRecord>>(STORAGE_KEY, {}),
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
