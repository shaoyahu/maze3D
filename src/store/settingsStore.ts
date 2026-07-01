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
  // F-2026-06-30-M-N: opt-out for the auto-opened tutorial on first
  // editor visit. Persisted via maze3d.settings.v1.
  // P2-17: whether the tutorial manual auto-opens when the user enters
  // the level editor. Defaults to true so new users see it on first
  // visit; unchecking the "don't auto-open" checkbox sets it to false.
  tutorialManualAutoOpen: boolean;
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
  tutorialManualAutoOpen: true,
};
const STORAGE_KEY = 'maze3d.settings.v1';

export function sanitizeSettings(raw: unknown): Settings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  // F-2026-06-30-H-3 / M-11: lenient per-field fallback. A single
  // corrupted field (e.g. FOV saved as NaN) used to wipe the entire
  // settings record — including unrelated keys like
  // `tutorialManualAutoOpen` — forcing the user to re-pick their
  // preferences. Now each field falls back to its default independently,
  // matching the lenient pattern used for `enemyAggression` / `language`
  // / `tutorialManualAutoOpen` below. `set(k, v)` still rejects bad
  // values via `isValidSetting` at write time, so this only softens
  // *load* behavior.
  const pointerSensitivity =
    typeof s.pointerSensitivity === 'number' && Number.isFinite(s.pointerSensitivity) && s.pointerSensitivity > 0
      ? s.pointerSensitivity
      : DEFAULTS.pointerSensitivity;
  const fov =
    typeof s.fov === 'number' && Number.isFinite(s.fov) && s.fov >= 30 && s.fov <= 120
      ? s.fov
      : DEFAULTS.fov;
  const darkMode = typeof s.darkMode === 'boolean' ? s.darkMode : DEFAULTS.darkMode;
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
  // P2-17: lenient — pre-P2-17 persisted records won't have this field.
  const tutorialManualAutoOpen: boolean =
    typeof s.tutorialManualAutoOpen === 'boolean' ? s.tutorialManualAutoOpen : true;
  return {
    pointerSensitivity,
    fov,
    darkMode,
    enemyAggression: aggression,
    language,
    tutorialManualAutoOpen,
  };
}

function pickSettings(s: Settings): Settings {
  return {
    pointerSensitivity: s.pointerSensitivity,
    fov: s.fov,
    darkMode: s.darkMode,
    enemyAggression: s.enemyAggression,
    language: s.language,
    tutorialManualAutoOpen: s.tutorialManualAutoOpen,
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
  if (k === 'tutorialManualAutoOpen') {
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
