import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../../src/store/gameStore';
import { createEmptyParchment } from '../../../src/engine/ParchmentState';
import type { MazeData } from '../../../src/maze/types';

// F-2026-06-30: P2-16 — gameStore's parchment surface (5 actions +
// initial state + startLevel / goToMenu reset). The engine is the
// authoritative source; the store's role is to mirror the engine's
// pushes for the React tree and to expose UI-side setters that route
// through the engine via the bridge.

const maze: MazeData = {
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
  pickups: [],
  rules: {
    initialTime: 30,
    maxHealth: 3,
    victory: 'reach-exit',
    timeOnPickup: 10,
  },
  enemies: [],
};

describe('gameStore parchment (P2-16)', () => {
  beforeEach(() => {
    // Reset every P2-16 field to the factory default. The store
    // shares its other fields with the rest of the suite; we only
    // touch the parchment slice to keep test isolation tight.
    useGameStore.setState({ parchment: createEmptyParchment() });
  });

  it('initial state has an empty parchment', () => {
    const p = useGameStore.getState().parchment;
    expect(p.visitedCells.size).toBe(0);
    expect(p.damageRegions).toEqual([]);
    expect(p.isOpen).toBe(false);
  });

  it('openParchment flips isOpen from false to true', () => {
    useGameStore.getState().openParchment();
    expect(useGameStore.getState().parchment.isOpen).toBe(true);
  });

  it('openParchment is a no-op when already open (no re-render needed)', () => {
    useGameStore.getState().openParchment();
    const before = useGameStore.getState().parchment;
    useGameStore.getState().openParchment();
    const after = useGameStore.getState().parchment;
    // Same reference: Zustand's set() short-circuits when the
    // updater returns the prior state object.
    expect(after).toBe(before);
  });

  it('closeParchment flips isOpen back to false', () => {
    useGameStore.getState().openParchment();
    useGameStore.getState().closeParchment();
    expect(useGameStore.getState().parchment.isOpen).toBe(false);
  });

  it('toggleParchment alternates on each call', () => {
    useGameStore.getState().toggleParchment();
    expect(useGameStore.getState().parchment.isOpen).toBe(true);
    useGameStore.getState().toggleParchment();
    expect(useGameStore.getState().parchment.isOpen).toBe(false);
  });

  it('resetParchment clears visited + damage but preserves isOpen', () => {
    const seeded = {
      visitedCells: new Set(['0,0', '1,0']),
      damageRegions: [
        {
          type: 'water' as const,
          cx: 0,
          cz: 0,
          radius: 1,
          seed: 42,
          createdAtTick: 0,
        },
      ],
      isOpen: true,
    };
    useGameStore.setState({ parchment: seeded });

    useGameStore.getState().resetParchment();
    const p = useGameStore.getState().parchment;
    expect(p.visitedCells.size).toBe(0);
    expect(p.damageRegions).toEqual([]);
    expect(p.isOpen).toBe(true);
  });

  it('setParchment replaces the whole state reference', () => {
    const next = {
      visitedCells: new Set(['3,3']),
      damageRegions: [],
      isOpen: false,
    };
    useGameStore.getState().setParchment(next);
    expect(useGameStore.getState().parchment).toBe(next);
  });

  it('startLevel resets the parchment (visited + damage cleared)', () => {
    useGameStore.setState({
      parchment: {
        visitedCells: new Set(['0,0', '1,0']),
        damageRegions: [
          { type: 'burn', cx: 0, cz: 0, radius: 1, seed: 0, createdAtTick: 0 },
        ],
        isOpen: true,
      },
    });
    useGameStore.getState().startLevel(maze);
    const p = useGameStore.getState().parchment;
    expect(p.visitedCells.size).toBe(0);
    expect(p.damageRegions).toEqual([]);
    // isOpen is preserved across level reset — the player kept the
    // modal open, only the content resets.
    expect(p.isOpen).toBe(true);
  });

  it('goToMenu resets the parchment', () => {
    useGameStore.setState({
      parchment: {
        visitedCells: new Set(['0,0']),
        damageRegions: [
          { type: 'tear', cx: 0, cz: 0, radius: 2, seed: 0, createdAtTick: 0 },
        ],
        isOpen: false,
      },
    });
    useGameStore.getState().goToMenu();
    const p = useGameStore.getState().parchment;
    expect(p.visitedCells.size).toBe(0);
    expect(p.damageRegions).toEqual([]);
  });

  // M-70: the in-memory setter `setState({ parchment: ... })` is the
  // exact code path the engine bridge uses to push state out of the
  // game loop. Pin that a *direct* setState from "the engine" reaches
  // a UI consumer (via the Zustand subscription) — that's the
  // contract GameCanvas relies on to wire Three.js ticks to React.
  it('M-70: engine-style setState({ parchment: ... }) reaches the UI subscription', () => {
    // Simulate the engine pushing a new parchment reference with
    // populated visited cells + a damage region, plus isOpen=true so
    // a subscriber would render the parchment map.
    useGameStore.setState({
      parchment: {
        visitedCells: new Set(['0,0', '1,0', '2,1']),
        damageRegions: [
          { type: 'water', cx: 1, cz: 1, radius: 1, seed: 7, createdAtTick: 42 },
        ],
        isOpen: true,
      },
    });
    // Read via getState to confirm the store accepted the new ref.
    const p = useGameStore.getState().parchment;
    expect(p.isOpen).toBe(true);
    expect(p.visitedCells.size).toBe(3);
    expect(p.damageRegions).toHaveLength(1);
    // Subscribe and verify the new ref is delivered. The bridge in
    // GameCanvas reads via getState(), but a Zustand subscription is
    // the documented React-side contract — exercising it here pins
    // that the *next* consumer (any component imported after the
    // setState) sees the engine-pushed state.
    const seen: boolean[] = [];
    const unsub = useGameStore.subscribe((s) => {
      seen.push(s.parchment.isOpen);
    });
    // One more push to force a notification.
    useGameStore.getState().setParchment({
      visitedCells: new Set(),
      damageRegions: [],
      isOpen: false,
    });
    unsub();
    expect(seen).toContain(false);
  });
});
