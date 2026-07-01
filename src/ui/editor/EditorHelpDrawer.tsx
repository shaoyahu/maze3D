// P2-9: Editor help manual drawer.
//
// A cheat-sheet panel that drops down from the top of the editor
// viewport. Activated by the `?` toggle button in the top-right
// corner of the viewport. Closes on ESC, on backdrop click, and on
// the close button in the drawer header.
//
// All copy is driven through `useT()` — the manual lives entirely in
// `src/i18n/resources/{zh,en}.ts` under the `editor.help.*` namespace
// so language switching immediately re-renders the drawer.
//
// Pattern mirror: `WarningsPopup` (EditorStatusBar.tsx:25-109) — same
// `createPortal` + backdrop + ESC + click-outside idiom, but the
// drawer anchors to the top of the viewport instead of the centre
// and the panel slides down rather than rising.

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { useFocusRestore, useFocusTrap } from '../components/modalHooks';

export interface EditorHelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function EditorHelpDrawer({
  open,
  onClose,
}: EditorHelpDrawerProps): React.ReactElement | null {
  const t = useT();
  // F-2026-06-17-E-L-6: per-instance id so the aria-labelledby contract
  // stays correct when more than one dialog is open at once. Replaces
  // the hard-coded `editor-help-title` literal.
  const titleId = `${useId()}-title`;
  // F-2026-06-30: P2-16 — ref to the drawer panel so the shared
  // focus-trap and focus-restore hooks can drive keyboard navigation
  // and post-close focus restoration.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);
  useFocusRestore(open);

  // ESC closes the drawer. Bound on document so the binding survives
  // any focusable input inside the drawer losing focus.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Click on the backdrop closes; clicks on the panel itself stop
  // propagation so the user can interact with the cheat-sheet
  // content without accidentally dismissing it.
  const handleBackdrop = (): void => onClose();
  const stop = (e: React.MouseEvent<HTMLDivElement>): void => e.stopPropagation();

  return createPortal(
    <div
      data-testid="editor-help-backdrop"
      className="editor-help__backdrop"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="editor-help-drawer"
        className="editor-help__panel"
        onClick={stop}
      >
        <div className="editor-help__header">
          <h2 id={titleId} className="editor-help__title">
            {t('editor.help.title')}
          </h2>
          <button
            type="button"
            data-testid="editor-help-close"
            aria-label={t('editor.help.closeAria')}
            className="editor-help__close"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </div>

        <div className="editor-help__body">
          {/* ----- Section 1: 工具总览 ----- */}
          <section className="editor-help__section" data-testid="editor-help-section-tools">
            <h3 className="editor-help__section-title">{t('editor.help.section.tools')}</h3>
            <p className="editor-help__section-intro">{t('editor.help.section.toolsIntro')}</p>
            <table className="editor-help__table">
              <thead>
                <tr>
                  <th>{t('editor.help.col.tool')}</th>
                  <th>{t('editor.help.col.shortcut')}</th>
                  <th>{t('editor.help.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('editor.help.tool.select')}</td>
                  <td><kbd>V</kbd></td>
                  <td>{t('editor.help.tool.selectDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.wall')}</td>
                  <td><kbd>W</kbd></td>
                  <td>{t('editor.help.tool.wallDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.erase')}</td>
                  <td><kbd>B</kbd></td>
                  <td>{t('editor.help.tool.eraseDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.start')}</td>
                  <td><kbd>S</kbd></td>
                  <td>{t('editor.help.tool.startDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.exit')}</td>
                  <td><kbd>E</kbd></td>
                  <td>{t('editor.help.tool.exitDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.pickup')}</td>
                  <td><kbd>P</kbd></td>
                  <td>{t('editor.help.tool.pickupDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.enemy')}</td>
                  <td><kbd>M</kbd></td>
                  <td>{t('editor.help.tool.enemyDesc')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.tool.pan')}</td>
                  <td><kbd>H</kbd></td>
                  <td>{t('editor.help.tool.panDesc')}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ----- Section 2: 快捷键 ----- */}
          <section className="editor-help__section" data-testid="editor-help-section-shortcuts">
            <h3 className="editor-help__section-title">{t('editor.help.section.shortcuts')}</h3>
            <table className="editor-help__table">
              <thead>
                <tr>
                  <th>{t('editor.help.col.shortcut')}</th>
                  <th>{t('editor.help.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><kbd>Esc</kbd></td>
                  <td>{t('editor.help.shortcut.esc')}</td>
                </tr>
                <tr>
                  <td><kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd></td>
                  <td>{t('editor.help.shortcut.undo')}</td>
                </tr>
                <tr>
                  <td><kbd>⌘⇧Z</kbd> / <kbd>Ctrl+Shift+Z</kbd></td>
                  <td>{t('editor.help.shortcut.redo')}</td>
                </tr>
                <tr>
                  <td>{t('editor.help.col.wheel')}</td>
                  <td>{t('editor.help.shortcut.wheel')}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ----- Section 3: 常用流程 ----- */}
          <section className="editor-help__section" data-testid="editor-help-section-flow">
            <h3 className="editor-help__section-title">{t('editor.help.section.flow')}</h3>
            <ol className="editor-help__steps">
              <li>{t('editor.help.flow.step1')}</li>
              <li>{t('editor.help.flow.step2')}</li>
              <li>{t('editor.help.flow.step3')}</li>
              <li>{t('editor.help.flow.step4')}</li>
              <li>{t('editor.help.flow.step5')}</li>
            </ol>
          </section>

          {/* ----- Section 4: 验收清单 ----- */}
          <section className="editor-help__section" data-testid="editor-help-section-checklist">
            <h3 className="editor-help__section-title">{t('editor.help.section.checklist')}</h3>
            <ul className="editor-help__checklist">
              <li>{t('editor.help.checklist.reachable')}</li>
              <li>{t('editor.help.checklist.wallsClosed')}</li>
              <li>{t('editor.help.checklist.pickups')}</li>
              <li>{t('editor.help.checklist.enemyPath')}</li>
              <li>{t('editor.help.checklist.rules')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
