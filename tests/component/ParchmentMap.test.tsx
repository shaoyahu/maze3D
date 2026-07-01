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
        visitedCells: new Set(),
        damageRegions: [
          { type: 'water', cx: 1, cz: 1, radius: 1, seed: 1, createdAtTick: 0 },
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
