import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { ParchmentMap } from '../../src/ui/components/ParchmentMap';
import { useGameStore } from '../../src/store/gameStore';
import { createEmptyParchment } from '../../src/engine/ParchmentState';
import type { MazeData } from '../../src/maze/types';

// F-2026-06-30: P2-16 — component tests for the parchment modal.
// The canvas isn't easy to inspect directly in happy-dom (no real
// 2D context), so we exercise the modal's behavior: render
// conditions, close button, ESC key, and damage-region driven
// re-renders. Per-cell drawing is covered by visual inspection in
// the E2E spec; here we only need to prove the wiring works.

const parchmentMaze: MazeData = {
  id: 'parchment-test',
  name: 'Parchment',
  size: { width: 5, depth: 3 },
  cellSize: 2,
  start: { x: 0, z: 0 },
  exit: { x: 4, z: 2 },
  walls: [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  pickups: [
    { id: 'p1', x: 2, z: 1, type: 'time', value: 10 },
  ],
  rules: {
    initialTime: 30,
    maxHealth: 3,
    victory: 'reach-exit',
    timeOnPickup: 10,
    minimapMode: 'parchment',
  },
  enemies: [],
  traps: [],
  doors: [],
};

const normalMaze: MazeData = {
  ...parchmentMaze,
  id: 'normal',
  rules: { ...parchmentMaze.rules, minimapMode: 'top-right' },
};

// P3-1: §6.3 — multi-level parchment maze. The level tabs
// (L1..L{levelCount}) read `maze.levelCount`; the visiting
// filter reads `parchment.visitedCells.get(viewingLevel)`.
// Three layers is enough to exercise the Tab-key cycle
// (0 → 1 → 2 → 0 wraps around at the boundary).
const multiLevelMaze: MazeData = {
  ...parchmentMaze,
  id: 'multi-level',
  levelCount: 3,
};

beforeEach(() => {
  useGameStore.setState({ parchment: createEmptyParchment() });
});

describe('ParchmentMap (P2-16)', () => {
  it('does NOT render the modal when minimapMode is not "parchment"', () => {
    render(<ParchmentMap maze={normalMaze} />);
    expect(screen.queryByTestId('parchment-map')).toBeNull();
  });

  it('does NOT render the modal when parchment.isOpen is false', () => {
    render(<ParchmentMap maze={parchmentMaze} />);
    expect(screen.queryByTestId('parchment-map')).toBeNull();
  });

  it('renders the modal when minimapMode is parchment AND isOpen is true', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    expect(screen.getByTestId('parchment-map')).toBeInTheDocument();
    expect(screen.getByTestId('parchment-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('parchment-close')).toBeInTheDocument();
  });

  // LOW: aria-label pin. The modal root is the discovery surface for
  // screen-reader users — if a future refactor drops the i18n label
  // or replaces it with a bare class, AT users would land on an
  // unlabeled dialog. Pin the aria-label is non-empty and equal to
  // the visible <h2> title text so screen-reader / sighted users
  // land on the same string.
  it('parchment modal exposes the i18n title as an aria-label on the root', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    const modal = screen.getByTestId('parchment-map');
    const ariaLabel = modal.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!.length).toBeGreaterThan(0);
    // The visible <h2> uses the same i18n key — aria-label and
    // visible title must agree so screen-reader and sighted users
    // hear/see the same name.
    const visibleTitle = modal.querySelector('h2')?.textContent ?? '';
    expect(ariaLabel).toBe(visibleTitle);
  });

  it('close button calls closeParchment', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    fireEvent.click(screen.getByTestId('parchment-close'));
    expect(useGameStore.getState().parchment.isOpen).toBe(false);
  });

  it('ESC key calls closeParchment', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    });
    expect(useGameStore.getState().parchment.isOpen).toBe(false);
  });

  it('re-renders the canvas when the parchment reference changes (e.g. damage)', () => {
    useGameStore.getState().openParchment();
    const { rerender } = render(<ParchmentMap maze={parchmentMaze} />);
    const before = screen.getByTestId('parchment-canvas');
    // Push a new reference with a damage region — the canvas
    // re-renders but the testid is stable.
    useGameStore.setState({
      parchment: {
        visitedCells: new Map(),
        damageRegions: [
          { type: 'water', cx: 1, cz: 1, radius: 1, seed: 1, createdAtTick: 0, level: 0 },
        ],
        isOpen: true,
      },
    });
    rerender(<ParchmentMap maze={parchmentMaze} />);
    const after = screen.getByTestId('parchment-canvas');
    expect(after).toBe(before);
  });

  it('auto-closes when the document becomes hidden', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    // F-2026-06-30: P2-16 — happy-dom doesn't always fire
    // visibilitychange on the document, so we dispatch the event
    // manually and stub `document.hidden` to true.
    const origHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(useGameStore.getState().parchment.isOpen).toBe(false);
    } finally {
      if (origHidden) Object.defineProperty(document, 'hidden', origHidden);
    }
  });
});

// P3-1: §6.3 — multi-level tab bar + Tab-key cycle + per-level
// filter. The modal mounts only when `parchment.isOpen` is true
// AND `maze.rules.minimapMode === 'parchment'`. The tab bar
// is `L1..L{maze.levelCount}`; the `viewingLevel` local state
// is the source of truth for the canvas's per-level filter.
describe('ParchmentMap P3-1 level tab bar', () => {
  beforeEach(() => {
    useGameStore.setState({
      parchment: createEmptyParchment(),
      // P3-1: seed the player mirror so the modal re-opens
      // with the right default viewing level. We use 0 here
      // (the single-layer-equivalent default) so the
      // "initial viewing level = player level" assertion is
      // unambiguous.
      player: { currentLevel: 0 },
    });
  });

  it('renders one tab per layer, with the player layer highlighted by default', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={multiLevelMaze} />);
    const tablist = screen.getByTestId('parchment-tabs');
    expect(tablist).toBeInTheDocument();
    // Three layers → three buttons (data-testid is
    // `parchment-tab-{i}`). Default viewingLevel mirrors
    // `player.currentLevel` (0), so tab 0 is active.
    for (let i = 0; i < multiLevelMaze.levelCount!; i++) {
      const tab = screen.getByTestId(`parchment-tab-${i}`);
      expect(tab).toBeInTheDocument();
      expect(tab.textContent).toBe(`L${i + 1}`);
    }
    expect(screen.getByTestId('parchment-tab-0').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('parchment-tab-1').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('parchment-tab-2').getAttribute('data-active')).toBe('false');
  });

  it('falls back to a single tab when the maze has no `levelCount` (back-compat)', () => {
    // The pre-P3-1 parchmentMaze fixture has no `levelCount`,
    // so the modal renders ONE tab (L1) and the canvas filters
    // by layer 0 — exactly the legacy behavior.
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={parchmentMaze} />);
    const tab = screen.getByTestId('parchment-tab-0');
    expect(tab).toBeInTheDocument();
    expect(tab.textContent).toBe('L1');
    // No L2 / L3 tabs.
    expect(screen.queryByTestId('parchment-tab-1')).toBeNull();
  });

  it('clicking a tab moves the highlighted state and updates the canvas data-level', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={multiLevelMaze} />);
    // Click L2 → tab 1 active, canvas data-level = 1.
    fireEvent.click(screen.getByTestId('parchment-tab-1'));
    expect(screen.getByTestId('parchment-tab-0').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('parchment-tab-1').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('parchment-tab-2').getAttribute('data-active')).toBe('false');
    const canvas = screen.getByTestId('parchment-canvas');
    expect(canvas.getAttribute('data-level')).toBe('1');
  });

  it('the Tab key cycles viewingLevel 0 → 1 → 2 → 0 (Q11 决策) when the modal is open', () => {
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={multiLevelMaze} />);
    const canvas = screen.getByTestId('parchment-canvas');
    expect(canvas.getAttribute('data-level')).toBe('0');
    // Tab → L1
    act(() => {
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });
    });
    expect(screen.getByTestId('parchment-canvas').getAttribute('data-level')).toBe('1');
    expect(screen.getByTestId('parchment-tab-1').getAttribute('data-active')).toBe('true');
    // Tab → L2
    act(() => {
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });
    });
    expect(screen.getByTestId('parchment-canvas').getAttribute('data-level')).toBe('2');
    expect(screen.getByTestId('parchment-tab-2').getAttribute('data-active')).toBe('true');
    // Tab → wraps to L0
    act(() => {
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });
    });
    expect(screen.getByTestId('parchment-canvas').getAttribute('data-level')).toBe('0');
    expect(screen.getByTestId('parchment-tab-0').getAttribute('data-active')).toBe('true');
  });

  it('the Tab key is a no-op when the modal is closed', () => {
    // Don't open the modal; the listener is mounted on the
    // impl, which is gated on `parchment.isOpen`. A stray
    // Tab press should not flip the viewing level because
    // nothing is rendered.
    useGameStore.setState({ parchment: { ...createEmptyParchment(), isOpen: false } });
    render(<ParchmentMap maze={multiLevelMaze} />);
    expect(screen.queryByTestId('parchment-canvas')).toBeNull();
    // Dispatching Tab on document while the modal is closed
    // should be ignored (the listener was never installed).
    act(() => {
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });
    });
    expect(screen.queryByTestId('parchment-canvas')).toBeNull();
  });

  it('re-syncs viewingLevel to the player layer when the modal re-opens', () => {
    // Open the modal on L0, click L2, close. Re-open on
    // L1 (player crossed a transition while the modal was
    // closed). The new viewing level should be L1, not the
    // stale L2 from before.
    useGameStore.getState().openParchment();
    const { unmount } = render(<ParchmentMap maze={multiLevelMaze} />);
    fireEvent.click(screen.getByTestId('parchment-tab-2'));
    expect(screen.getByTestId('parchment-tab-2').getAttribute('data-active')).toBe('true');
    unmount();
    // Close the modal, then move the player to L1 and re-open.
    useGameStore.getState().closeParchment();
    useGameStore.setState({ player: { currentLevel: 1 } });
    useGameStore.getState().openParchment();
    render(<ParchmentMap maze={multiLevelMaze} />);
    // The new default is L1 (player's current level), not the
    // stale L2 from before the close.
    expect(screen.getByTestId('parchment-canvas').getAttribute('data-level')).toBe('1');
    expect(screen.getByTestId('parchment-tab-1').getAttribute('data-active')).toBe('true');
  });

  it('filters the canvas draw loop by the viewing level (per-level visited cells)', () => {
    // L0 has two visited cells, L1 has one, L2 has none. With
    // viewingLevel = 1, the canvas's per-level filter
    // (`drawVisitedForLevel`) only paints L1's single cell.
    useGameStore.getState().openParchment();
    useGameStore.setState({
      parchment: {
        visitedCells: new Map([
          [0, new Set<string>(['0,0', '1,0'])],
          [1, new Set<string>(['2,2'])],
          [2, new Set<string>()],
        ]),
        damageRegions: [],
        isOpen: true,
      },
    });
    render(<ParchmentMap maze={multiLevelMaze} />);
    fireEvent.click(screen.getByTestId('parchment-tab-1'));
    // The data-level attribute pins the canvas's per-level
    // contract — the draw loop uses this value to select the
    // visited subset. We don't try to inspect the canvas's
    // pixel buffer (happy-dom has no real 2D context); the
    // data-level + the Tab-cycling test above cover the
    // render-path contract end-to-end.
    const canvas = screen.getByTestId('parchment-canvas');
    expect(canvas.getAttribute('data-level')).toBe('1');
  });
});
