import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HUD } from '../../src/ui/HUD';
import { useGameStore } from '../../src/store/gameStore';
import type { MazeData } from '../../src/maze/types';

// F-2026-06-30: P2-16 — HUD's MapHint shows up only when the
// active level's minimapMode is 'parchment'. The component lives
// inline in HUD.tsx (not extracted to its own file because there's
// no behavior beyond the conditional render).

const parchmentMaze: MazeData = {
  id: 'parchment-hud',
  name: 'Parchment HUD',
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
    minimapMode: 'parchment',
  },
  enemies: [],
  traps: [],
  doors: [],
};

const normalMaze: MazeData = {
  ...parchmentMaze,
  id: 'normal-hud',
  rules: { ...parchmentMaze.rules, minimapMode: 'top-right' },
};

describe('HUD MapHint (P2-16)', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentMaze: null,
      health: 0,
      inventory: [null, null],
    });
  });

  it('shows the M-key hint when minimapMode is parchment', () => {
    useGameStore.setState({ currentMaze: parchmentMaze });
    render(<HUD />);
    expect(screen.getByTestId('hud-map-hint')).toBeInTheDocument();
  });

  it('does NOT show the M-key hint when minimapMode is top-right', () => {
    useGameStore.setState({ currentMaze: normalMaze });
    render(<HUD />);
    expect(screen.queryByTestId('hud-map-hint')).toBeNull();
  });

  it('does NOT show the M-key hint when no maze is loaded', () => {
    useGameStore.setState({ currentMaze: null });
    render(<HUD />);
    expect(screen.queryByTestId('hud-map-hint')).toBeNull();
  });
});
