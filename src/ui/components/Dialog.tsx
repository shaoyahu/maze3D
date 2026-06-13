import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ConfirmAction } from '../useConfirm';

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
 * - Tab cycles within the action list (a small, deliberate scope; not
 *   a full WAI-ARIA roving tabindex)
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
    background: 'var(--panel)',
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
    background: v === 'primary' ? 'var(--accent)' : v === 'danger' ? 'var(--danger)' : 'var(--panel)',
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
  // Refs for the action buttons so we can (a) focus the first one on open
  // and (b) implement Tab cycling within the action list.
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const titleId = 'confirm-dialog-title';
  const messageId = 'confirm-dialog-message';

  // Focus the first action button when the dialog opens; reset on close.
  useEffect(() => {
    if (!open) {
      buttonRefs.current = [];
      return;
    }
    const first = buttonRefs.current[0];
    if (first) first.focus();
  }, [open]);

  // Esc-to-close + minimal Tab cycling within the action list.
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const buttons = buttonRefs.current.filter((b): b is HTMLButtonElement => b !== null);
      if (buttons.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? buttons.indexOf(active as HTMLButtonElement) : -1;
      if (e.shiftKey) {
        // Shift+Tab from the first (or outside) wraps to last.
        if (idx <= 0) {
          e.preventDefault();
          buttons[buttons.length - 1]?.focus();
        }
      } else if (idx === buttons.length - 1) {
        // Tab from the last wraps to first.
        e.preventDefault();
        buttons[0]?.focus();
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
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
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