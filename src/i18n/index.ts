/**
 * P2-8: minimal i18n implementation.
 *
 * - `getT(locale)` returns a pure translator function `t(key, vars?)`.
 * - `useT()` is the React-facing hook that subscribes to the active
 *   `settingsStore.language` so a switch re-renders all consumers.
 *
 * Design notes (see `docs/increments/p2-8-i18n/spec.md` §3):
 *   - Missing key → console.warn + return the key string verbatim.
 *   - Unknown locale → console.warn + fall back to `DEFAULT_LOCALE`
 *     (lenient, mirroring `sanitizeSettings` behavior).
 *   - Placeholders: `{name}` syntax; missing var → leave token + warn.
 *   - No ICU MessageFormat; out of scope for v1.
 */

import { useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { zh } from './resources/zh';
import { en } from './resources/en';
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type TFunction,
  type TVars,
  type Translations,
} from './types';

const resources: Record<Locale, Translations> = { zh, en };

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function resolveLocale(locale: unknown): Locale {
  if ((LOCALES as readonly string[]).includes(locale as string)) {
    return locale as Locale;
  }
  // L-5 (2026-07-01): console.warn is intentional here. A bad locale
  // arrives from localStorage corruption or a future migration that
  // hasn't been wired yet — silent fallback would mask the data
  // problem; loud warn surfaces it in the dev console without
  // breaking the production UI (rendering always falls back to
  // DEFAULT_LOCALE). Don't suppress.
  // eslint-disable-next-line no-console
  console.warn(
    `[i18n] unsupported locale "${String(locale)}"; falling back to "${DEFAULT_LOCALE}"`,
  );
  return DEFAULT_LOCALE;
}

function interpolate(template: string, vars: TVars | undefined): string {
  if (!vars) return template;
  // L-6 (2026-07-01): per-template `warned` flag (boolean, not a Set)
  // is intentional. interpolate() is called once per `t(key, vars)`
  // invocation and the `warned` closure dies with the function — a
  // Set-based cache would survive across calls and across renders,
  // turning a transient dev-time breadcrumb into a permanent
  // suppression. Keeping it local matches the "log once per
  // problematic template, then keep quiet within that render" intent.
  let warned = false;
  const out = template.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const v = vars[name];
      return v == null ? '' : String(v);
    }
    if (!warned) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing var "${name}" in template "${template}"`);
      warned = true;
    }
    return match;
  });
  return out;
}

/**
 * Pure translator factory. Use directly in non-React contexts (store
 * tests, error mappers) and indirectly via `useT()` inside components.
 */
export function getT(locale: Locale): TFunction {
  const resolved = resolveLocale(locale);
  const table = resources[resolved];
  return (key: string, vars?: TVars): string => {
    const template = table[key];
    if (template == null) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing ${resolved} key "${key}"`);
      return key;
    }
    return interpolate(template, vars);
  };
}

/**
 * React hook returning a `t` function bound to the current
 * `settingsStore.language`. Components calling `useT()` re-render on
 * language change because they subscribe via Zustand's selector.
 */
export function useT(): TFunction {
  const locale = useSettingsStore((s) => s.language);
  // L-7 (2026-07-01): memoize `getT(locale)` so a component that
  // re-renders for an unrelated reason (parent re-render, hook
  // ordering change) keeps the SAME `t` reference unless `locale`
  // actually flipped. Without useMemo every render builds a fresh
  // closure + reads `resources[locale]` + looks up the key on every
  // call site, which both wastes work and breaks referential
  // equality in downstream memoized children.
  return useMemo(() => getT(locale), [locale]);
}

// Re-exports for ergonomic consumer imports:
//   import { useT, getT, type Locale } from '@/i18n';
export type { Locale, TFunction, TVars, Translations } from './types';
export { LOCALES, DEFAULT_LOCALE, isLocale } from './types';