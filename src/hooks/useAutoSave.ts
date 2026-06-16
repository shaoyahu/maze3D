import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
// F-project-review-2026-06-13-A-HIGH-2: saveLevel no longer persists
// to the level store as a side effect. The tick now hands the
// validated level to useLevelStore.saveCustom so the level store
// actually receives the auto-save.
import { useLevelStore } from '../store/levelStore';

/** F-2026-06-12-F1: default auto-save tick. 30s balances the user's
 *  wish for "periodic" with not flooding the level store on every
 *  keystroke. Tunable per-mount via `useAutoSave({ intervalMs })`. */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

// F-project-review-2026-06-13-B-ui-M-5: exponential backoff after
// consecutive auto-save failures. The toolbar surfaces "自动保存失败: ..."
// every tick the hook fires onAutoSaveError. Without backoff, a structurally
// invalid editor state (e.g. start on a wall) means the error pops every 30s
// indefinitely — pure noise after the first one, because the user already
// sees the error and can't act on identical repeats.
//
// Schedule (cap at 5 min):
//   failures=1 → next attempt 60s  after the failed save  (skip 1 tick)
//   failures=2 → next attempt 120s after the failed save  (skip 3 ticks)
//   failures=3+ → next attempt 300s after the failed save (skip 9 ticks)
//
// Reset rules:
//   - successful save → failure count back to 0, next attempt at base interval
//   - dirty toggles false (user reverted) → reset so a fresh failure on the
//     next dirty cycle fires immediately
function computeAutoSaveBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 1) return 60_000;
  if (consecutiveFailures === 2) return 120_000;
  return 300_000;
}

export interface UseAutoSaveOptions {
  /** Tick interval in ms. Defaults to {@link DEFAULT_AUTOSAVE_INTERVAL_MS}. */
  intervalMs?: number;
  /** Fired after a successful auto-save with the wall-clock ms timestamp.
   *  The consumer (typically `EditorToolbar`) uses this to surface a
   *  "已自动保存 HH:MM:SS" status string. */
  onAutoSaved?: (timestamp: number) => void;
  /** Fired when `saveLevel()` returns `{ ok: false, error }` — most
   *  commonly when the editor is in a structurally invalid state (e.g.
   *  start sitting on a wall). The hook itself does NOT touch the
   *  store's `lastError`; the consumer decides whether to surface the
   *  message in the toolbar status, set `lastError`, or swallow it. */
  onAutoSaveError?: (message: string) => void;
}

/** F-2026-06-12-F1: periodic auto-save hook.
 *
 *  Ticks every `intervalMs` (default 30s). On each tick:
 *  - If the editor is **not** `dirty` → no-op (don't waste a save while
 *    the user hasn't touched anything).
 *  - If the editor **is** `dirty` → call `useEditorStore.saveLevel()`.
 *    - On `{ ok: true }` → fire `onAutoSaved(Date.now())`.
 *    - On `{ ok: false, error }` → fire `onAutoSaveError(error)`.
 *
 *  Implementation notes:
 *  - The interval's closure reads `useEditorStore.getState()` lazily on
 *    every tick, so the hook never captures a stale `dirty` or
 *    `saveLevel` reference.
 *  - Callbacks are held in refs and refreshed on every render. This
 *    means consumers can pass inline arrow functions (e.g.
 *    `setStatus(...)` in JSX) without retriggering the `useEffect`.
 *  - The interval is cleared on unmount.
 */
export function useAutoSave(options: UseAutoSaveOptions = {}): void {
  const {
    intervalMs = DEFAULT_AUTOSAVE_INTERVAL_MS,
    onAutoSaved,
    onAutoSaveError,
  } = options;
  // Refs keep the interval's closure stable while still letting the
  // consumer pass fresh callbacks on every render. Without refs, an
  // inline `onAutoSaved={(ts) => setStatus(...)}` in JSX would
  // re-create the interval on every render, defeating the debounce.
  const onAutoSavedRef = useRef(onAutoSaved);
  const onAutoSaveErrorRef = useRef(onAutoSaveError);
  onAutoSavedRef.current = onAutoSaved;
  onAutoSaveErrorRef.current = onAutoSaveError;

  // F-project-review-2026-06-13-B-ui-M-5: consecutive-failure tracker
  // backing the backoff window. Held as refs so they survive across
  // ticks without invalidating the interval (which would reset the
  // counters and defeat the very throttle we're installing).
  const failureCountRef = useRef(0);
  const nextAttemptAtRef = useRef<number | null>(null);

  useEffect(() => {
    // F-project-review-2026-06-13-A-HIGH-1: the interval closure lazily
    // reads `useEditorStore.getState().dirty` on every tick, so a stale
    // store report of `dirty=true` could still drive `saveLevel()` even
    // after the consumer has unmounted. StrictMode's dev double-mount
    // amplifies this race — the first mount's interval can outlive the
    // second mount's cleanup. The local `mounted` flag guarantees the
    // tick is a no-op (and the callbacks are not invoked) once the host
    // component is gone.
    let mounted = true;
    const id = window.setInterval(() => {
      if (!mounted) return;
      const state = useEditorStore.getState();
      if (!state.dirty) {
        // F-B-ui-M-5: reverting to a clean editor resets the backoff so
        // the next dirty cycle's first failure fires immediately rather
        // than inheriting the previous run's throttle window.
        failureCountRef.current = 0;
        nextAttemptAtRef.current = null;
        return;
      }
      // F-B-ui-M-5: silent skip while inside the backoff window. Using
      // strict less-than means the boundary tick (Date.now() ===
      // nextAttemptAt) attempts the save, which keeps the schedule
      // exactly aligned with multiples of the base interval.
      if (nextAttemptAtRef.current !== null && Date.now() < nextAttemptAtRef.current) {
        return;
      }
      const result = state.saveLevel();
      if (!mounted) return;
      if (result.ok) {
        // F-project-review-2026-06-13-A-HIGH-2: saveLevel is now
        // validation-only; the tick is responsible for handing the
        // validated level to the level store.
        useLevelStore.getState().saveCustom(result.level);
        failureCountRef.current = 0;
        nextAttemptAtRef.current = null;
        onAutoSavedRef.current?.(Date.now());
      } else {
        failureCountRef.current += 1;
        nextAttemptAtRef.current =
          Date.now() + computeAutoSaveBackoffMs(failureCountRef.current);
        onAutoSaveErrorRef.current?.(result.error);
      }
    }, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
