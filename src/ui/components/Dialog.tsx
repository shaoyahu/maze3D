import {
  useCallback,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ConfirmAction } from '../useConfirm';
import { useFocusRestore, useFocusTrap } from './modalHooks';

/**
 * P2-7: Portal-based modal dialog primitive.
 *
 * Mounts to document.body to escape parent stacking contexts (the editor
 * uses position:absolute; inset:0 which would otherwise clip / re-layer
 * the dialog). Implements minimal accessibility:
 *
 * - role="dialog" + aria-labelledby/aria-describedby
 * - Esc closes (via onClose)
 * - Backdrop click closes (via onClose)
 * - First action auto-focuses on open
 * - Tab/Shift+Tab cycles within the dialog (full focus trap, scoped
 *   to all focusable descendants — not just the action buttons)
 * - Focus is restored to the element that was active when the dialog
 *   opened once the dialog closes
 *
 * Visual style matches the project's CSS variable palette (--panel,
 * --border, --danger, --accent) so the dialog respects light/dark themes.
 */

export interface DialogProps {
  open: boolean;
  title: string;
  message: string;
  actions: ConfirmAction[];
  /** When true, the card border uses --danger instead of --border. */
  danger?: boolean;
  onAction: (value: string) => void;
  onClose: () => void;
}

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

function makeCardStyle(danger: boolean): CSSProperties {
  return {
    // F-2026-06-17-L-11: --panel → --bg-elevated. Identical color
    // (--panel is defined as var(--bg-elevated) in theme.css), but
    // using the canonical token avoids the legacy-rename debt when
    // P3 eventually drops --panel.
    background: 'var(--bg-elevated)',
    border: `1px solid ${danger ? 'var(--danger)' : 'var(--border)'}`,
    borderRadius: 8,
    padding: 20,
    maxWidth: 480,
    minWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: 'var(--fg)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  };
}

const TITLE_STYLE: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 600 };
const MESSAGE_STYLE: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.5 };
const ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  marginTop: 8,
};

// Action buttons are styled inline (not via the shared <Button>) so we can
// keep refs local without forwarding through a forwardRef wrapper. The
// style mirrors Button's variant mapping:
//   primary   → accent bg,  dark text
//   secondary → panel bg,   fg text
//   danger    → danger bg,  dark text
function actionButtonStyle(variant: ConfirmAction['variant']): CSSProperties {
  const v = variant ?? 'secondary';
  return {
    padding: '8px 16px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    // F-2026-06-17-L-11: prefer --bg-elevated over deprecated --panel (see theme.css:91).
    background: v === 'primary' ? 'var(--accent)' : v === 'danger' ? 'var(--danger)' : 'var(--bg-elevated)',
    color: v === 'secondary' ? 'var(--fg)' : '#1a1a1a',
  };
}

export function Dialog({
  open,
  title,
  message,
  actions,
  danger = false,
  onAction,
  onClose,
}: DialogProps): JSX.Element | null {
  // F-2026-06-30: P2-16 — ref to the dialog card so the shared
  // focus-trap can query focusable descendants. We trap on the card
  // (not the backdrop) so the trap doesn't see the portal root.
  const cardRef = useRef<HTMLDivElement | null>(null);
  // F-2026-06-17-E-L-6: useId() gives every dialog instance its own
  // stable id so multiple dialogs can coexist in the DOM without
  // aria-labelledby collisions. The previous hard-coded
  // 'confirm-dialog-title' / 'confirm-dialog-message' literals were
  // fine in isolation but undefined as soon as a second dialog was
  // mounted (e.g. confirm + help drawer).
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const messageId = `${reactId}-message`;

  // F-2026-06-30: P2-16 — full focus trap scoped to the dialog card
  // (title + message + all action buttons). Replaces the old
  // action-only cycle so non-action focusable content is also
  // reachable via Tab.
  useFocusTrap(cardRef, open);
  // F-2026-06-30: P2-16 — return focus to the element that was
  // active when the dialog opened. No-op when `open` is false.
  useFocusRestore(open);

  // Esc-to-close. Tab/Shift+Tab handling is owned by the focus
  // trap, so this handler only deals with Escape.
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Backdrop click closes; clicks on the card itself do not bubble up.
  const handleBackdropClick = useCallback(
    (_e: ReactMouseEvent<HTMLDivElement>): void => {
      onClose();
    },
    [onClose],
  );

  const handleCardClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
    },
    [],
  );

  if (!open) return null;

  return createPortal(
    <div
      data-testid="confirm-dialog"
      style={BACKDROP_STYLE}
      onClick={handleBackdropClick}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        style={makeCardStyle(danger)}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} data-testid="confirm-title" style={TITLE_STYLE}>
          {title}
        </h2>
        <p id={messageId} data-testid="confirm-message" style={MESSAGE_STYLE}>
          {message}
        </p>
        <div style={ACTIONS_STYLE}>
          {actions.map((a, i) => (
            <button
              key={a.value}
              // F-2026-06-30: P2-16 — autoFocus the first action so
              // keyboard users land on the primary CTA on open. The
              // focus trap's Tab cycle then picks up naturally from
              // there.
              autoFocus={i === 0}
              type="button"
              onClick={() => onAction(a.value)}
              data-testid={`confirm-action-${a.value}`}
              style={actionButtonStyle(a.variant)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}