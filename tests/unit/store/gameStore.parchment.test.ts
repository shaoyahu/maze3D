import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../../src/store/gameStore';
import { createEmptyParchment, type DamageRegion } from '../../../src/engine/ParchmentState';
import type { MazeData } from '../../../src/maze/types';

// F-2026-06-30: P2-16 — gameStore's parchment surface (5 actions +
// initial state + startLevel / goToMenu reset). The engine is the
// authoritative source; the store's role is to mirror the engine's
// pushes for the React tree and to expose UI-side setters that route
// through the engine via the bridge.
//
// P3-1: the per-level Map shape (`visitedCells: Map<level, Set<cell>>`)
// replaces the pre-P3-1 single Set. The test fixtures below use a
// small helper (`seededParchment`) to build a ParchmentState with
// one or two layers of pre-populated cells, mirroring the new
// engine contract.

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
  traps: [],
  doors: [],
};

// P3-1: build a per-level visited map from a flat list of
// (level, "x,z") entries. The flat shape keeps the test fixtures
// readable; the helper expands them into the engine's Map<level,
// Set<cell>> shape.
function visitedFromTuples(tuples: Array<[number, string]>): Map<number, ReadonlySet<string>> {
  const map = new Map<number, ReadonlySet<string>>();
  for (const [level, key] of tuples) {
    const existing = map.get(level);
    const next = new Set<string>(existing);
    next.add(key);
    map.set(level, next);
  }
  return map;
}

function damageRegion(overrides: Partial<DamageRegion>): DamageRegion {
  return {
    type: 'water',
    cx: 0,
    cz: 0,
    radius: 1,
    seed: 0,
    createdAtTick: 0,
    level: 0,
    ...overrides,
  };
}

describe('gameStore parchment (P2-16 + P3-1 per-level)', () => {
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
      visitedCells: visitedFromTuples([
        [0, '0,0'],
        [0, '1,0'],
      ]),
      damageRegions: [damageRegion({ type: 'water', cx: 0, cz: 0, radius: 1, seed: 42 })],
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
      visitedCells: visitedFromTuples([[0, '3,3']]),
      damageRegions: [],
      isOpen: false,
    };
    useGameStore.getState().setParchment(next);
    expect(useGameStore.getState().parchment).toBe(next);
  });

  it('startLevel resets the parchment (visited + damage cleared)', () => {
    useGameStore.setState({
      parchment: {
        visitedCells: visitedFromTuples([
          [0, '0,0'],
          [0, '1,0'],
        ]),
        damageRegions: [damageRegion({ type: 'burn', cx: 0, cz: 0, radius: 1 })],
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
        visitedCells: visitedFromTuples([[0, '0,0']]),
        damageRegions: [damageRegion({ type: 'tear', cx: 0, cz: 0, radius: 2 })],
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
        visitedCells: visitedFromTuples([
          [0, '0,0'],
          [0, '1,0'],
          [0, '2,1'],
        ]),
        damageRegions: [damageRegion({ type: 'water', cx: 1, cz: 1, radius: 1, seed: 7, createdAtTick: 42 })],
        isOpen: true,
      },
    });
    // Read via getState to confirm the store accepted the new ref.
    const p = useGameStore.getState().parchment;
    expect(p.isOpen).toBe(true);
    expect(p.visitedCells.size).toBe(1); // all three cells on layer 0
    expect(p.visitedCells.get(0)?.size).toBe(3);
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
    useGameStore.getState().setParchment(createEmptyParchment());
    unsub();
    expect(seen).toContain(false);
  });

  // P3-1: per-level visited cells are preserved across `setParchment`
  // pushes. A level-0 + level-1 push is read back as two distinct
  // map entries; the per-layer subsets are independent.
  it('preserves per-level visited cells on a direct setState', () => {
    const seeded = {
      visitedCells: visitedFromTuples([
        [0, '0,0'],
        [1, '2,2'],
        [1, '3,3'],
      ]),
      damageRegions: [],
      isOpen: false,
    };
    useGameStore.setState({ parchment: seeded });
    const p = useGameStore.getState().parchment;
    expect(p.visitedCells.size).toBe(2);
    expect(p.visitedCells.get(0)?.has('0,0')).toBe(true);
    expect(p.visitedCells.get(1)?.has('2,2')).toBe(true);
    expect(p.visitedCells.get(1)?.has('3,3')).toBe(true);
    expect(p.visitedCells.get(0)?.has('2,2')).toBe(false);
  });
});
