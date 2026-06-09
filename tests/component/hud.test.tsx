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

  describe('EnemyCounter + InvulnerableFlash (P2-4a)', () => {
    it('renders the enemy counter as "敌人 X/Y" using progressiveEnemyCount', () => {
      useGameStore.setState({ progressiveEnemyCount: 4 });
      render(<HUD />);
      expect(screen.getByTestId('enemy-counter').textContent).toContain('敌人 4 / 10');
    });

    it('does NOT render InvulnerableFlash when invulnerableUntil has passed', () => {
      useGameStore.setState({ invulnerableUntil: 0, elapsedTime: 5 });
      render(<HUD />);
      expect(screen.queryByTestId('invulnerable-flash')).toBeNull();
    });

    it('renders InvulnerableFlash when invulnerableUntil > elapsedTime', () => {
      useGameStore.setState({ invulnerableUntil: 1.0, elapsedTime: 0.5 });
      render(<HUD />);
      expect(screen.getByTestId('invulnerable-flash')).toBeInTheDocument();
    });

    it('HealthBar gains the flashing class during the invulnerable window', () => {
      useGameStore.setState({ invulnerableUntil: 1.0, elapsedTime: 0.5 });
      render(<HUD />);
      const bar = screen.getByTestId('health-bar');
      expect(bar.className).toContain('health-bar--flashing');
    });

    it('HealthBar drops the flashing class once the window elapses', () => {
      useGameStore.setState({ invulnerableUntil: 0, elapsedTime: 5 });
      render(<HUD />);
      const bar = screen.getByTestId('health-bar');
      expect(bar.className).not.toContain('health-bar--flashing');
    });
  });
});
