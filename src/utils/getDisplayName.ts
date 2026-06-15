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
 */
export function getDisplayName(maze: Pick<MazeData, 'name' | 'i18n'>, locale: Locale): string {
  if (locale === 'zh') return maze.name;
  const localized = maze.i18n?.[locale];
  if (typeof localized === 'string' && localized.length > 0) return localized;
  return maze.name;
}