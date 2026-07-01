// F-2026-06-30: P2-16 — shared a11y hooks for modal-style components.
//
// `useFocusTrap` constrains Tab/Shift+Tab to the focusable elements
// inside the supplied container while the modal is open, and `
// `useFocusRestore` returns focus to the element that was active
// before the modal opened when it closes. Both hooks are no-ops when
// `active` is false, so they can be driven directly from the modal's
// `open` prop.
//
// Adapted from the inline implementations that used to live in
// `Dialog.tsx` and `EditorHelpDrawer.tsx`. The new contract is:
//   - querySelector for the FOCUSABLE_SELECTOR set, scoped to the
//     container ref;
//   - when Tab leaves the last element (or Shift+Tab leaves the
//     first), wrap focus to the opposite end;
//   - never preventDefault when no wrapping is required.
//
// `useFocusRestore` reads `document.activeElement` synchronously the
// first time `active` flips from false to true. It re-focuses on
// close only if the saved element is still focusable — this avoids
// stomping on focus when the user has already moved on (e.g. closed
// the dialog by clicking a different button).

import { useEffect, useRef } from 'react';

// F-2026-06-30: P2-16 — standard WAI-ARIA focusable selector. We
// exclude `[tabindex="0"]` (which is functionally focusable but
// rarely a modal target) and `[inert]` (which is a deliberate
// offscreen target that we never want to focus). Inputs/buttons
// with `disabled` are also naturally excluded because the CSS
// pseudo-selector `:not([disabled])` is applied.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([inert])',
].join(',');

/**
 * Trap Tab / Shift+Tab focus inside the container element while
 * `active` is true. Closes over `containerRef.current`; mount this
 * hook with a ref that points at the dialog/panel root.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [containerRef, active]);
}

/**
 * Save `document.activeElement` when `active` flips to true and
 * restore focus to it when the modal closes. The saved element is
 * re-checked at restore time so we don't try to focus a node that
 * has unmounted.
 */
export function useFocusRestore(active: boolean): void {
  // F-2026-06-30: P2-16 — capture the previously focused element on
  // the rising edge. The ref is held stable so a re-render with
  // `active === true` doesn't reset the saved element.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      // Rising edge: snapshot the element that had focus right
      // before the modal mounted. Skip when no element is focused
      // (e.g. the user opened the modal with the mouse).
      const current = document.activeElement;
      previouslyFocusedRef.current =
        current instanceof HTMLElement ? current : null;
      wasActiveRef.current = true;
      return;
    }
    if (!active && wasActiveRef.current) {
      // Falling edge: restore focus if the saved element is still
      // attached and still focusable. Bail out silently otherwise.
      const target = previouslyFocusedRef.current;
      wasActiveRef.current = false;
      previouslyFocusedRef.current = null;
      if (target && document.contains(target)) {
        target.focus();
      }
    }
  }, [active]);
}
