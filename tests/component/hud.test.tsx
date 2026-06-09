import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HUD } from '../../src/ui/HUD';
import { useGameStore } from '../../src/store/gameStore';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]],
  pickups: [], rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
};

describe('HUD', () => {
  beforeEach(() => {
    useGameStore.getState().goToMenu();
    useGameStore.getState().startLevel(maze);
  });

  it('shows the timer with formatted time', () => {
    useGameStore.setState({ timeRemaining: 125 });
    render(<HUD />);
    expect(screen.getByRole('timer').textContent).toContain('02:05');
  });

  it('renders hearts matching health', () => {
    useGameStore.setState({ health: 2 });
    render(<HUD />);
    expect(screen.getAllByText('❤').length).toBeGreaterThanOrEqual(2);
  });

  it('renders inventory slot placeholders', () => {
    render(<HUD />);
    // F5: only the corner badge renders the digit now (the center
    // placeholder for empty slots was removed), so expect exactly 1
    // occurrence per slot.
    expect(screen.getAllByText('1').length).toBe(1);
    expect(screen.getAllByText('2').length).toBe(1);
  });
});
