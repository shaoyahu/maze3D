import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';

export interface Settings {
  pointerSensitivity: number; // rad/px
  darkMode: boolean;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

const DEFAULTS: Settings = { pointerSensitivity: 0.002, darkMode: false };
const STORAGE_KEY = 'maze3d.settings.v1';

function isSettings(raw: unknown): raw is Settings {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.pointerSensitivity !== 'number' || !Number.isFinite(s.pointerSensitivity)) return false;
  if (typeof s.darkMode !== 'boolean') return false;
  return true;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...loadJSON<Settings>(STORAGE_KEY, DEFAULTS, isSettings),
  set: (k, v) => {
    const next = { ...get(), [k]: v } as Settings;
    saveJSON(STORAGE_KEY, next);
    set(next as Partial<SettingsStore>);
  },
}));
