/**
 * F-project-review-2026-06-13 (A-HIGH-3, D-5, D-18, D-23, D-26, D-29):
 * persistent-JSON helpers. The previous version of this module used a
 * single `saveJSON` that swallowed every error with a `console.warn`,
 * which meant a `QuotaExceededError` (or a 50-step × 25KB draft balloon)
 * could fail for minutes before the user noticed. The current module
 * exposes a `safeSetItem` primitive that returns a discriminated
 * `PersistResult` so the caller (e.g. `editorStore.saveDraft`) can
 * surface the failure mode — storage unavailable, payload too large,
 * or quota exceeded — instead of letting it vanish into a console warn.
 */

/**
 * F-project-review-2026-06-13-D-23: 1 MiB upper bound for the editor's
 * draft payload. The draft is rewritten by `useAutoSave` on every 2s
 * `dirty` tick, so a runaway size hits localStorage's ~5MB cap within
 * a few ticks. 1 MiB comfortably fits a 50×50 maze with a 64-char
 * name + a handful of pickups/enemies AND leaves headroom for the
 * other keys (`maze3d.customLevels.v1`, settings, etc.).
 */
export const MAX_DRAFT_BYTES = 1_048_576;

export type PersistResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'too-large' | 'quota' | 'serialization' };

export function isStorageAvailable(): boolean {
  try {
    const k = '__test__';
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadJSON<T>(
  key: string,
  fallback: T,
  validate?: (raw: unknown) => raw is T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * F-project-review-2026-06-13-D-26: explicit guard for `localStorage`
 * writes. Returns a `PersistResult` instead of throwing / silently
 * swallowing the failure.
 *
 * - `unavailable` — `localStorage` itself is not writable (private
 *   mode, disabled cookies, SSR without a polyfill, etc.).
 * - `too-large` — the serialized payload exceeds `maxBytes` (when
 *   supplied). We bail BEFORE calling `setItem` so a single oversized
 *   write doesn't evict unrelated keys on quota-strict browsers.
 * - `quota` — `setItem` threw a `QuotaExceededError` (or its
 *   Safari/iOS private-mode cousin `NS_ERROR_DOM_QUOTA_REACHED`).
 * - `serialization` — `JSON.stringify` threw (cyclic data, BigInt,
 *   etc.) — the caller passed something structurally un-stringifyable.
 */
export function safeSetItem(key: string, value: unknown, maxBytes?: number): PersistResult {
  if (!isStorageAvailable()) return { ok: false, reason: 'unavailable' };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, reason: 'serialization' };
  }
  if (maxBytes !== undefined && serialized.length > maxBytes) {
    return { ok: false, reason: 'too-large' };
  }
  try {
    localStorage.setItem(key, serialized);
    return { ok: true };
  } catch (e) {
    // F-project-review-2026-06-13-D-18: detect quota errors so the
    // caller can surface a "存储已满" status instead of a generic
    // warning. We check both the standard name and the Safari alias.
    const name = e instanceof Error ? e.name : '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return { ok: false, reason: 'quota' };
    }
    // Unknown failure: re-throw so a non-quota regression still shows
    // up in the dev console instead of being silently lost.
    throw e;
  }
}

/**
 * Backwards-compatible best-effort writer. Used for non-critical writes
 * (best records, settings) where a silent fallthrough is acceptable.
 * For the editor's draft payload prefer {@link safeSetItem} so a quota
 * failure can be surfaced in the UI.
 */
export function saveJSON(key: string, value: unknown): void {
  const result = safeSetItem(key, value);
  if (!result.ok) {
    console.warn('persist: failed to save', key, result.reason);
  }
}
