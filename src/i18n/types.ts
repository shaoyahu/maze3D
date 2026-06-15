/**
 * P2-8: minimal i18n types. See `docs/increments/p2-8-i18n/spec.md` §3.1.
 *
 * - `Locale` is the closed union of supported locales. Adding a new
 *   locale requires updating this union, both resource files, and the
 *   `settingsStore.language` field schema (TypeScript catches the gaps).
 * - `Translations` is a flat string→string map. Keys use dotted namespaces
 *   (`app.menu.title`, `settings.locale.label`) so consumers can grep
 *   for them and missing keys surface as visible strings in the UI
 *   (paired with `console.warn`).
 * - `TFunction` is the call shape: `t(key, vars?)` where `vars` is a
 *   simple `{name: value}` map. We deliberately do NOT support ICU
 *   MessageFormat; plurals and gender are out of scope for v1.
 */

export type Locale = 'zh' | 'en';

export type Translations = Readonly<Record<string, string>>;

export type TVars = Readonly<Record<string, string | number>>;

export type TFunction = (key: string, vars?: TVars) => string;

/**
 * The list of supported locales, exported so `settingsStore.sanitize`
 * and the Settings UI segmented control can validate against it without
 * hardcoding the union a second time.
 */
export const LOCALES: readonly Locale[] = ['zh', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'zh';

/** Type guard mirroring the union above; re-exported for stores. */
export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}