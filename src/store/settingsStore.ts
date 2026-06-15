import { create } from 'zustand';
import { loadJSON, saveJSONDebounced } from './persist';
import type { EnemyAggression } from '../maze/types';
import { isLocale, type Locale } from '../i18n/types';

const VALID_AGGRESSION: EnemyAggression[] = ['easy', 'medium', 'hard'];

export interface Settings {
  pointerSensitivity: number; // rad/px
  fov: number; // degrees, vertical FOV of the camera
  darkMode: boolean;
  // P2-4a: enemy chase-speed multiplier bracket. Persistence +
  // user-facing radio come in Task9; the field is defined now so
  // the engine's GameBridge can read it.
  enemyAggression: EnemyAggression;
  // P2-8: UI locale. Defaults to 'zh' so Chinese users get the existing
  // experience verbatim; English users toggle from /settings and the
  // change is persisted via the same `maze3d.settings.v1` channel.
  language: Locale;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

const DEFAULTS: Settings = {
  pointerSensitivity: 0.002,
  fov: 60,
  darkMode: false,
  enemyAggression: 'medium',
  language: 'zh',
};
const STORAGE_KEY = 'maze3d.settings.v1';

export function sanitizeSettings(raw: unknown): Settings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.pointerSensitivity !== 'number' || !Number.isFinite(s.pointerSensitivity) || s.pointerSensitivity <= 0) return null;
  if (typeof s.fov !== 'number' || !Number.isFinite(s.fov) || s.fov < 30 || s.fov > 120) return null;
  if (typeof s.darkMode !== 'boolean') return null;
  // Lenient on enemyAggression: a pre-P2-4a persisted record won't
  // have the field, so default to 'medium' instead of failing the
  // whole-settings validation. (Task9 will add a per-key arm here
  // that rejects obviously bad strings, but 'undefined' is a
  // forward-compat case, not a corruption case.)
  const aggression: EnemyAggression =
    typeof s.enemyAggression === 'string' && VALID_AGGRESSION.includes(s.enemyAggression as EnemyAggression)
      ? (s.enemyAggression as EnemyAggression)
      : 'medium';
  // P2-8: same lenient treatment for `language` — a pre-P2-8 record
  // (or a corrupted value) falls back to 'zh' instead of failing the
  // whole-settings validation. `set('language', unknown)` is still
  // rejected via `isValidSetting` at write time.
  const language: Locale = isLocale(s.language) ? s.language : 'zh';
  return {
    pointerSensitivity: s.pointerSensitivity,
    fov: s.fov,
    darkMode: s.darkMode,
    enemyAggression: aggression,
    language,
  };
}

function pickSettings(s: Settings): Settings {
  return {
    pointerSensitivity: s.pointerSensitivity,
    fov: s.fov,
    darkMode: s.darkMode,
    enemyAggression: s.enemyAggression,
    language: s.language,
  };
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
  if (k === 'enemyAggression') {
    return typeof v === 'string' && VALID_AGGRESSION.includes(v as EnemyAggression);
  }
  if (k === 'language') {
    return isLocale(v);
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
    // F-A-architecture-M7: a slider drag fires `set` dozens of times
    // per second. Debouncing the localStorage write coalesces the
    // burst into a single setItem 250ms after the last change. The
    // in-memory zustand state still updates immediately (line below),
    // so the UI is responsive; only the persistence is deferred. The
    // pagehide/visibilitychange listeners in persist.ts flush
    // pending writes on tab close.
    saveJSONDebounced(STORAGE_KEY, next);
    set(next);
  },
}));
