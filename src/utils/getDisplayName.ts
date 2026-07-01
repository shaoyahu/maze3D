/**
 * P2-8: resolve the user-facing display name for a MazeData.
 *
 * `MazeData.name` is the canonical/Chinese name and stays the source of
 * truth for IDs and seed strings. For UI surfaces we want a localized
 * label; the optional `i18n?: { en?: string }` field carries per-locale
 * overrides and falls back to `name` if absent or empty.
 */
import type { MazeData } from '../maze/types';
import type { Locale } from '../i18n/types';

/**
 * Pure helper — safe to use in store tests, render code, and
 * selector maps. Do NOT call React hooks here.
 *
 * @param maze  Level record. Only the `name` + optional `i18n.en`
 *              fields are read; other fields are passed-through by
 *              the `Pick<>` type so callers don't have to construct
 *              a full MazeData for the common label-only call site.
 * @param locale  Active UI locale. For `zh` the canonical `name`
 *                field is returned (it is the Chinese string). For
 *                other locales the optional `maze.i18n[locale]`
 *                override is used if present and non-empty, falling
 *                back to `name` otherwise.
 * @returns  The locale-appropriate user-facing label, never null.
 *           Empty / missing translations degrade gracefully to
 *           `maze.name` so the calling UI can render something.
 */
export function getDisplayName(maze: Pick<MazeData, 'name' | 'i18n'>, locale: Locale): string {
  if (locale === 'zh') return maze.name;
  const localized = maze.i18n?.[locale];
  if (typeof localized === 'string' && localized.length > 0) return localized;
  return maze.name;
}