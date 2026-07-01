// P2-17: Editor Tutorial Manual.
//
// A chapter-based tutorial manual that guides users through the level
// editor's features. Opened via the 📖 button in EditorTopBar.
// Independent from EditorHelpDrawer (the `?` cheat-sheet).
//
// Layout: center modal with a left TOC sidebar and right content area.
// Navigation: click TOC items or use Prev/Next buttons at the bottom.
//
// All copy is driven through `useT()` — the manual lives entirely in
// `src/i18n/resources/{zh,en}.ts` under the `editor.manual.*` namespace.
//
// Pattern mirror: `EditorHelpDrawer` — same `createPortal` + backdrop +
// ESC + click-outside idiom, but centered modal instead of top-anchored
// slide-down, and z-index 1300 (above HelpDrawer's 1200).
//
// Enhancement: closing animation (panel shrinks toward the 📖 button),
// auto-open preference checkbox, and `prefers-reduced-motion` support.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';

/** Chapter metadata — key matches i18n namespace, sections = number of subsections. */
const CHAPTERS = [
  { key: 'ch1', sections: 3 },
  { key: 'ch2', sections: 5 },
  { key: 'ch3', sections: 3 },
  { key: 'ch4', sections: 4 },
  { key: 'ch5', sections: 3 },
  { key: 'ch6', sections: 4 },
] as const;

/** Selector for the closing animation duration (kept in sync with theme.css). */
const CLOSE_ANIM_MS = 400;

export interface EditorTutorialManualProps {
  open: boolean;
  onClose: () => void;
}

export function EditorTutorialManual({
  open,
  onClose,
}: EditorTutorialManualProps): React.ReactElement | null {
  const t = useT();
  const titleId = `${useId()}-title`;
  const autoOpenLabelId = `${useId()}-auto-open`;
  const [activeChapter, setActiveChapter] = useState(0);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus restoration: capture the element that was focused right before the
  // manual opened, and restore focus to it once the close animation finishes.
  // Without this, keyboard users get dropped at <body> after dismiss.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Generation counter: bumped on every handleClose invocation. Stale
  // animationend/timeout closures from a prior invocation check this and
  // bail out, preventing double-fire races (e.g. ESC + backdrop click
  // in the same tick).
  const generationRef = useRef(0);

  // Refs used by the animationend useEffect below to call into the
  // current handleClose closure's `finalize` without re-binding.
  const pendingFinalizeRef = useRef<(() => void) | null>(null);
  const timeoutFallbackRef = useRef<number | null>(null);

  const autoOpen = useSettingsStore((s) => s.tutorialManualAutoOpen);
  const setSetting = useSettingsStore((s) => s.set);

  // Reset to first chapter when opening
  useEffect(() => {
    if (open) setActiveChapter(0);
  }, [open]);

  // Capture previously-focused element on open so we can restore it on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  // When `open` goes false externally, reset closing state
  useEffect(() => {
    if (!open && closing) {
      setClosing(false);
    }
  }, [open, closing]);

  const handleClose = useCallback((): void => {
    // Already closing — prevent double-fire from a second ESC / backdrop click
    // while the previous close animation is still playing.
    if (closing) return;

    // Capture the focus target BEFORE we start tearing down — the element
    // will still be mounted and accessible here.
    const restoreTarget = previouslyFocusedRef.current;

    // Bump generation so any stale animationend / timeout from a prior
    // invocation that hasn't yet been cleaned up will short-circuit.
    const generation = ++generationRef.current;

    /** Local guard: prevents double-fire from animationend + timeout both
     *  resolving in the same close cycle. */
    let closed = false;
    const finalize = (): void => {
      // Stale closure from a previous handleClose invocation — ignore.
      if (generation !== generationRef.current) return;
      if (closed) return;
      closed = true;
      // Restore focus to whichever element opened the manual (📖 button
      // in the typical case) so keyboard users land somewhere sensible.
      if (restoreTarget && typeof restoreTarget.focus === 'function') {
        restoreTarget.focus();
      }
      onClose();
    };

    // prefers-reduced-motion: skip animation, close immediately
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      finalize();
      return;
    }

    // Calculate fly-target: the 📖 button in EditorTopBar
    const btn = document.querySelector<HTMLElement>('[data-testid="tool-tutorial-manual"]');
    const panel = panelRef.current;
    if (btn && panel) {
      const btnRect = btn.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const dx = (btnRect.left + btnRect.width / 2) - (panelRect.left + panelRect.width / 2);
      const dy = (btnRect.top + btnRect.height / 2) - (panelRect.top + panelRect.height / 2);
      panel.style.setProperty('--manual-fly-x', `${dx}px`);
      panel.style.setProperty('--manual-fly-y', `${dy}px`);
    }

    setClosing(true);

    // Listen for animation end; fall back to CLOSE_ANIM_MS timeout. The
    // actual listener attachment is in a separate useEffect keyed on
    // `closing` so it auto-cleans on unmount or animation cancellation.
    // We use a ref-stashed finalize here so the useEffect can call into
    // the same closure without re-binding on every render.
    pendingFinalizeRef.current = finalize;
    timeoutFallbackRef.current = window.setTimeout(() => {
      finalize();
    }, CLOSE_ANIM_MS);
  }, [closing, onClose]);

  // Animationend listener effect: bound only while `closing` is true,
  // removed automatically on cleanup (when `closing` flips back, the
  // component unmounts, or the animation completes).
  useEffect(() => {
    if (!closing) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const onAnimEnd = (): void => {
      // Cancel the timeout fallback so it doesn't fire after us.
      if (timeoutFallbackRef.current !== null) {
        window.clearTimeout(timeoutFallbackRef.current);
        timeoutFallbackRef.current = null;
      }
      const finalize = pendingFinalizeRef.current;
      pendingFinalizeRef.current = null;
      finalize?.();
    };
    panel.addEventListener('animationend', onAnimEnd);
    return () => {
      panel.removeEventListener('animationend', onAnimEnd);
      // If we unmount mid-animation, also cancel the fallback timeout.
      if (timeoutFallbackRef.current !== null) {
        window.clearTimeout(timeoutFallbackRef.current);
        timeoutFallbackRef.current = null;
      }
      pendingFinalizeRef.current = null;
    };
  }, [closing]);

  // ESC closes the manual. Bound on document with stopPropagation so
  // sibling listeners (HelpDrawer, EditorViewport) don't also fire.
  useEffect(() => {
    if (!open || closing) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closing, handleClose]);

  // Focus trap: while the modal is open and visible, cycle Tab / Shift-Tab
  // among focusable descendants so keyboard users can't escape into the
  // page behind the backdrop. Also pull focus into the panel on open
  // (after a tick so the close button is mounted).
  useEffect(() => {
    if (!open || closing) return undefined;

    const getFocusable = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      const selector = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');
      return Array.from(panel.querySelectorAll<HTMLElement>(selector))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    };

    // Initial focus: pull focus to the close button (the most keyboard-
    // friendly landing spot). Runs after mount so the panel exists.
    const focusTimer = window.setTimeout(() => {
      const focusable = getFocusable();
      const closeBtn = focusable.find(
        (el) => el.getAttribute('data-testid') === 'editor-manual-close',
      );
      (closeBtn ?? focusable[0])?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panelRef.current?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closing]);

  // Two-stage render guard: (1) not open and not animating → unmount;
  // (2) SSR / no document → portal can't be created. Split into two
  // early returns so each branch's intent stays legible.
  if (!open && !closing) return null;
  if (typeof document === 'undefined') return null;

  const chapter = CHAPTERS[activeChapter];
  const isFirst = activeChapter === 0;
  const isLast = activeChapter === CHAPTERS.length - 1;

  const handleBackdrop = (): void => handleClose();
  const stop = (e: React.MouseEvent<HTMLDivElement>): void => e.stopPropagation();

  /** Split body text on `\n` into separate paragraphs. */
  const renderBody = (text: string): React.ReactElement[] =>
    text.split('\n').map((line, i) => (
      <p key={i} className="editor-manual__step">
        {line}
      </p>
    ));

  return createPortal(
    <div
      data-testid="editor-manual-backdrop"
      className={`editor-manual__backdrop${closing ? ' editor-manual__backdrop--closing' : ''}`}
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="editor-manual-panel"
        className={`editor-manual__panel${closing ? ' editor-manual__panel--closing' : ''}`}
        onClick={stop}
      >
        {/* Header */}
        <div className="editor-manual__header">
          <h2 id={titleId} className="editor-manual__title">
            {t('editor.manual.title')}
          </h2>
          <div className="editor-manual__header-actions">
            {/* console-checkbox: project-wide custom checkbox style. The
                wrapping <label> already associates the input with the
                visible text; we add aria-labelledby pointing to that text
                span for AT users who don't pick up the implicit label. */}
            <label className="console-checkbox editor-manual__auto-open-label">
              <input
                type="checkbox"
                className="editor-manual__auto-open-checkbox"
                checked={!autoOpen}
                onChange={() => setSetting('tutorialManualAutoOpen', !autoOpen)}
                aria-labelledby={autoOpenLabelId}
              />
              <span className="console-checkbox__box" aria-hidden="true" />
              <span id={autoOpenLabelId}>
                {t('editor.manual.dontAutoOpen')}
              </span>
            </label>
            <button
              type="button"
              data-testid="editor-manual-close"
              aria-label={t('editor.manual.closeAria')}
              className="editor-manual__close"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body: TOC sidebar + Content */}
        <div className="editor-manual__body">
          {/* TOC sidebar (hidden on narrow screens) */}
          <nav className="editor-manual__toc" aria-label={t('editor.manual.title')}>
            {CHAPTERS.map((ch, i) => (
              <button
                key={ch.key}
                type="button"
                data-testid={`editor-manual-toc-${ch.key}`}
                className={`editor-manual__toc-item${i === activeChapter ? ' editor-manual__toc-item--active' : ''}`}
                onClick={() => setActiveChapter(i)}
                aria-current={i === activeChapter ? 'page' : undefined}
              >
                {t(`editor.manual.${ch.key}.title`)}
              </button>
            ))}
          </nav>

          {/* Mobile dropdown (visible on narrow screens only) */}
          <select
            className="editor-manual__toc-select"
            data-testid="editor-manual-toc-select"
            value={activeChapter}
            onChange={(e) => setActiveChapter(Number(e.target.value))}
            aria-label={t('editor.manual.title')}
          >
            {CHAPTERS.map((ch, i) => (
              <option key={ch.key} value={i}>
                {t(`editor.manual.${ch.key}.title`)}
              </option>
            ))}
          </select>

          {/* Content area */}
          <div className="editor-manual__content" data-testid="editor-manual-content">
            <h3 className="editor-manual__chapter-title">
              {t(`editor.manual.${chapter.key}.title`)}
            </h3>
            <p className="editor-manual__chapter-intro">
              {t(`editor.manual.${chapter.key}.intro`)}
            </p>

            {Array.from({ length: chapter.sections }, (_, i) => (
              <section key={i} className="editor-manual__section">
                <h4 className="editor-manual__section-title">
                  {t(`editor.manual.${chapter.key}.s${i + 1}.title`)}
                </h4>
                {renderBody(t(`editor.manual.${chapter.key}.s${i + 1}.body`))}
              </section>
            ))}
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="editor-manual__nav">
          <button
            type="button"
            data-testid="editor-manual-prev"
            className={`editor-manual__nav-btn${isFirst ? ' editor-manual__nav-btn--disabled' : ''}`}
            disabled={isFirst}
            onClick={() => setActiveChapter((i) => Math.max(0, i - 1))}
          >
            {t('editor.manual.nav.prev')}
          </button>
          <button
            type="button"
            data-testid="editor-manual-next"
            className={`editor-manual__nav-btn${isLast ? ' editor-manual__nav-btn--disabled' : ''}`}
            disabled={isLast}
            onClick={() => setActiveChapter((i) => Math.min(CHAPTERS.length - 1, i + 1))}
          >
            {t('editor.manual.nav.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}