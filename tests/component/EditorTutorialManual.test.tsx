// P2-17: EditorTutorialManual component tests.
//
// Covers: rendering guard, TOC navigation, chapter switching,
// Prev/Next, disabled boundaries, ESC key, backdrop click, close
// button, ARIA attributes, mobile dropdown, auto-open checkbox,
// closing animation, and reduced-motion support.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EditorTutorialManual } from '../../src/ui/editor/EditorTutorialManual';
import { useSettingsStore } from '../../src/store/settingsStore';

// ---------- helpers ---------------------------------------------------

function renderManual(overrides: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <EditorTutorialManual
      open={overrides.open ?? true}
      onClose={onClose}
    />,
  );
  return { ...result, onClose };
}

// ---------- tests -----------------------------------------------------

describe('EditorTutorialManual', () => {
  beforeEach(() => {
    // Reset settingsStore to defaults so checkbox state is deterministic
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      enemyAggression: 'medium',
      tutorialManualAutoOpen: true,
      set: useSettingsStore.getState().set,
    });
  });

  // ---- basic rendering ----

  it('does not render when open=false', () => {
    renderManual({ open: false });
    expect(screen.queryByTestId('editor-manual-panel')).toBeNull();
  });

  it('renders the panel when open=true', () => {
    renderManual();
    expect(screen.getByTestId('editor-manual-panel')).toBeTruthy();
  });

  it('has dialog role and aria-modal', () => {
    renderManual();
    const panel = screen.getByTestId('editor-manual-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('has an aria-labelledby pointing to the title', () => {
    renderManual();
    const panel = screen.getByTestId('editor-manual-panel');
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const title = document.getElementById(labelledBy!);
    expect(title).toBeTruthy();
  });

  // ---- TOC ----

  it('renders 6 TOC items', () => {
    renderManual();
    // H-22: every chapter in CHAPTERS must render — not just ch1/ch6.
    for (let i = 1; i <= 6; i += 1) {
      expect(screen.getByTestId(`editor-manual-toc-ch${i}`)).toBeTruthy();
    }
  });

  it('switches chapter on TOC click and updates the content area', () => {
    renderManual();
    // Capture the ch1 title text so we can assert the content area
    // actually changes — the previous test asserted on an empty
    // string, which was a no-op.
    const ch1Title = screen.getByTestId('editor-manual-content').querySelector('h3')!.textContent;
    fireEvent.click(screen.getByTestId('editor-manual-toc-ch2'));
    // Active class must move to ch2.
    const ch2Btn = screen.getByTestId('editor-manual-toc-ch2');
    expect(ch2Btn.classList.contains('editor-manual__toc-item--active')).toBe(true);
    // The content area's chapter title must have changed to ch2.
    const ch2Title = screen.getByTestId('editor-manual-content').querySelector('h3')!.textContent;
    expect(ch2Title).not.toBe(ch1Title);
    expect(ch2Title).toBeTruthy();
  });

  // ---- mobile dropdown ----

  it('renders a mobile TOC select', () => {
    renderManual();
    expect(screen.getByTestId('editor-manual-toc-select')).toBeTruthy();
  });

  it('switches chapter on mobile select change', () => {
    renderManual();
    const select = screen.getByTestId('editor-manual-toc-select');
    // M-55: the original test asserted on ch3 but the dropdown uses
    // the chapter *index* as the option value, so value='2' maps to
    // CHAPTERS[2] which is ch3 (0-indexed). Pin the active class on
    // ch3 — and assert the other chapters are NOT active, so a
    // regression that re-mapped the option value would surface here.
    fireEvent.change(select, { target: { value: '2' } });
    const ch3Btn = screen.getByTestId('editor-manual-toc-ch3');
    expect(ch3Btn.classList.contains('editor-manual__toc-item--active')).toBe(true);
    expect(screen.getByTestId('editor-manual-toc-ch1').classList.contains('editor-manual__toc-item--active')).toBe(false);
  });

  it('re-opening the manual resets activeChapter back to 0 (M-56)', () => {
    const onClose = vi.fn();
    const { unmount } = renderManual({ open: true, onClose });
    // Navigate to ch3 via the mobile select.
    fireEvent.change(screen.getByTestId('editor-manual-toc-select'), { target: { value: '2' } });
    expect(screen.getByTestId('editor-manual-toc-ch3').classList.contains('editor-manual__toc-item--active')).toBe(true);
    // Close (advance the close animation via animationend so onClose fires).
    fireEvent.click(screen.getByTestId('editor-manual-close'));
    act(() => {
      fireEvent.animationEnd(screen.getByTestId('editor-manual-panel'));
    });
    expect(onClose).toHaveBeenCalled();
    // Unmount and remount with the same `open={true}` value — this
    // simulates a re-open of the same EditorPage after the user
    // dismissed the manual. A rerender with the same open value would
    // not retrigger the `useEffect([open])` reset (React skips effects
    // when the dep is unchanged), so unmount/remount is the faithful
    // shape of the production re-open path.
    unmount();
    render(<EditorTutorialManual open={true} onClose={onClose} />);
    expect(screen.getByTestId('editor-manual-toc-ch1').classList.contains('editor-manual__toc-item--active')).toBe(true);
    expect(screen.getByTestId('editor-manual-toc-ch3').classList.contains('editor-manual__toc-item--active')).toBe(false);
  });

  // ---- Prev / Next ----

  it('disables Prev on first chapter', () => {
    renderManual();
    expect(screen.getByTestId('editor-manual-prev').hasAttribute('disabled')).toBe(true);
  });

  it('disables Next on last chapter', () => {
    renderManual();
    // Navigate to last chapter
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByTestId('editor-manual-next'));
    }
    expect(screen.getByTestId('editor-manual-next').hasAttribute('disabled')).toBe(true);
  });

  it('navigates forward and back with Next/Prev', () => {
    renderManual();
    fireEvent.click(screen.getByTestId('editor-manual-next'));
    expect(screen.getByTestId('editor-manual-toc-ch2').classList.contains('editor-manual__toc-item--active')).toBe(true);
    fireEvent.click(screen.getByTestId('editor-manual-prev'));
    expect(screen.getByTestId('editor-manual-toc-ch1').classList.contains('editor-manual__toc-item--active')).toBe(true);
  });

  // ---- close methods ----

  it('closes on close button click', () => {
    const onClose = vi.fn();
    renderManual({ onClose });
    // With animation, the close is deferred via handleClose.
    // In test env, matchMedia for reduced-motion is typically not available,
    // so the animation runs but the 400ms timeout fires.
    // We simulate animationend to avoid flaky timing.
    const panel = screen.getByTestId('editor-manual-panel');
    fireEvent.click(screen.getByTestId('editor-manual-close'));
    // Panel should get the --closing class
    expect(panel.classList.contains('editor-manual__panel--closing')).toBe(true);
    // Simulate animationend
    act(() => {
      fireEvent.animationEnd(panel);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on ESC key', () => {
    const onClose = vi.fn();
    renderManual({ onClose });
    const panel = screen.getByTestId('editor-manual-panel');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel.classList.contains('editor-manual__panel--closing')).toBe(true);
    act(() => {
      fireEvent.animationEnd(panel);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    renderManual({ onClose });
    const backdrop = screen.getByTestId('editor-manual-backdrop');
    const panel = screen.getByTestId('editor-manual-panel');
    fireEvent.click(backdrop);
    expect(panel.classList.contains('editor-manual__panel--closing')).toBe(true);
    act(() => {
      fireEvent.animationEnd(panel);
    });
    expect(onClose).toHaveBeenCalled();
  });

  // ---- auto-open checkbox ----

  it('renders the auto-open checkbox reflecting the current setting', () => {
    renderManual();
    // tutorialManualAutoOpen defaults to true → checkbox checked=!true = false
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('toggling checkbox persists the preference', () => {
    renderManual();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    // Now tutorialManualAutoOpen should be false (checkbox shows checked=!false=true)
    expect(useSettingsStore.getState().tutorialManualAutoOpen).toBe(false);
    expect(checkbox.checked).toBe(true);
  });

  // ---- closing animation ----

  it('adds --closing class to panel and backdrop on close, and second click is gated (M-57)', () => {
    const onClose = vi.fn();
    renderManual({ onClose });
    const panel = screen.getByTestId('editor-manual-panel');
    const backdrop = screen.getByTestId('editor-manual-backdrop');
    // First close — both surfaces flip to --closing.
    fireEvent.click(screen.getByTestId('editor-manual-close'));
    expect(panel.classList.contains('editor-manual__panel--closing')).toBe(true);
    expect(backdrop.classList.contains('editor-manual__backdrop--closing')).toBe(true);
    // Second click on the close button while already closing must
    // NOT spawn a second close cycle — the existing animation/timeout
    // are the only path to onClose.
    fireEvent.click(screen.getByTestId('editor-manual-close'));
    act(() => {
      fireEvent.animationEnd(panel);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // H-24: the close path has TWO terminations: an animationend listener
  // and a 400ms timeout fallback. The previous test only fired
  // animationend, leaving the timeout branch unexercised. This test
  // skips the animation event and advances fake timers instead — the
  // exact path that fires when CSS animations are disabled (or the
  // animationend event is lost, e.g. tab is hidden mid-animation).
  it('closing falls back to the 400ms timeout when animationend never fires (H-24)', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      renderManual({ onClose });
      fireEvent.click(screen.getByTestId('editor-manual-close'));
      // Sanity: --closing class is on.
      expect(
        screen.getByTestId('editor-manual-panel').classList.contains('editor-manual__panel--closing'),
      ).toBe(true);
      // Just shy of the timeout: onClose must NOT yet be called.
      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(onClose).not.toHaveBeenCalled();
      // Past the timeout: onClose fires exactly once.
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents double-close (closing state gates ESC)', () => {
    const onClose = vi.fn();
    renderManual({ onClose });
    // First close
    fireEvent.keyDown(document, { key: 'Escape' });
    // Second ESC while closing — should not trigger another close cycle
    fireEvent.keyDown(document, { key: 'Escape' });
    const panel = screen.getByTestId('editor-manual-panel');
    act(() => {
      fireEvent.animationEnd(panel);
    });
    // onClose should have been called only once
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---- reduced-motion ----

  it('skips animation and calls onClose directly when prefers-reduced-motion is active', () => {
    const onClose = vi.fn();
    // M-58: mock matchMedia BEFORE render. The component reads
    // `window.matchMedia(...)` synchronously inside handleClose (called
    // from the click handler), so a mock installed after render would
    // still take effect for this test — but a future refactor that
    // reads matchMedia earlier (e.g. inside an effect) would silently
    // miss the mock and start the animation. Install first to match
    // the production readiness pattern used in EditorHelpDrawer tests.
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      renderManual({ onClose });
      fireEvent.click(screen.getByTestId('editor-manual-close'));
      // Reduced motion path: --closing class must NOT be on (no
      // animation runs) and onClose fires synchronously.
      expect(
        screen.getByTestId('editor-manual-panel').classList.contains('editor-manual__panel--closing'),
      ).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      });
    }
  });
});
