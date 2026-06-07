import { create } from 'zustand';
import { loadJSON, saveJSON } from './persist';

export interface Settings {
  pointerSensitivity: number; // rad/px
  fov: number; // degrees, vertical FOV of the camera
  darkMode: boolean;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

const DEFAULTS: Settings = { pointerSensitivity: 0.002, fov: 60, darkMode: false };
const STORAGE_KEY = 'maze3d.settings.v1';

export function sanitizeSettings(raw: unknown): Settings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.pointerSensitivity !== 'number' || !Number.isFinite(s.pointerSensitivity) || s.pointerSensitivity <= 0) return null;
  if (typeof s.fov !== 'number' || !Number.isFinite(s.fov) || s.fov < 30 || s.fov > 120) return null;
  if (typeof s.darkMode !== 'boolean') return null;
  return { pointerSensitivity: s.pointerSensitivity, fov: s.fov, darkMode: s.darkMode };
}

function pickSettings(s: Settings): Settings {
  return { pointerSensitivity: s.pointerSensitivity, fov: s.fov, darkMode: s.darkMode };
}

function isValidSetting(k: keyof Settings, v: unknown): v is Settings[keyof Settings] {
  if (k === 'pointerSensitivity') {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
  }
  if (k === 'fov') {
    return typeof v === 'number' && Number.isFinite(v) && v >= 30 && v <= 120;
  }
  if (k === 'darkMode') {
    return typeof v === 'boolean';
  }
  return false;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...(() => {
    const raw = loadJSON<unknown>(STORAGE_KEY, null);
    return sanitizeSettings(raw) ?? DEFAULTS;
  })(),
  set: (k, v) => {
    if (!isValidSetting(k, v)) {
      console.warn(`settingsStore.set: rejected invalid value for '${String(k)}'`, v);
      return;
    }
    const next: Settings = { ...pickSettings(get()), [k]: v };
    saveJSON(STORAGE_KEY, next);
    set(next);
  },
}));
