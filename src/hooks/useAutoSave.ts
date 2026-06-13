import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';

/** F-2026-06-12-F1: default auto-save tick. 30s balances the user's
 *  wish for "periodic" with not flooding the level store on every
 *  keystroke. Tunable per-mount via `useAutoSave({ intervalMs })`. */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

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
      if (!state.dirty) return;
      const result = state.saveLevel();
      if (!mounted) return;
      if (result.ok) {
        onAutoSavedRef.current?.(Date.now());
      } else {
        onAutoSaveErrorRef.current?.(result.error);
      }
    }, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
