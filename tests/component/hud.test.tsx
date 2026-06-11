import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
    it('renders the enemy counter as "敌人 X/Y" using currentEnemyCount (F9)', () => {
      // F9: the HUD now subscribes to currentEnemyCount (the actual count
      // of enemies in the current level after startLevel injects spawns),
      // not progressiveEnemyCount (the spawn-event tally from the
      // scheduler). The two diverge: progressive spawn can fire without
      // any new enemy mesh appearing in the scene.
      useGameStore.setState({ currentMode: 'survive', currentEnemyCount: 4 });
      render(<HUD />);
      expect(screen.getByTestId('enemy-counter').textContent).toContain('敌人 4 / 10');
    });

    // F1 (fix): invulnerableUntil is in wall-clock seconds (set via
    // Date.now()/1000 + 0.5 by gameStore.damage). The UI compares against
    // Date.now()/1000, not elapsedTime (game-time). Tests use values
    // relative to the current wall-clock so the comparison is meaningful.
    const invulnNow = () => Date.now() / 1000 + 0.5;
    const invulnExpired = () => Date.now() / 1000 - 0.1;

    it('does NOT render InvulnerableFlash when invulnerableUntil has passed', () => {
      useGameStore.setState({ invulnerableUntil: 0 });
      render(<HUD />);
      expect(screen.queryByTestId('invulnerable-flash')).toBeNull();
    });

    it('renders InvulnerableFlash when invulnerableUntil is in the future', () => {
      useGameStore.setState({ invulnerableUntil: invulnNow() });
      render(<HUD />);
      expect(screen.getByTestId('invulnerable-flash')).toBeInTheDocument();
    });

    it('HealthBar gains the flashing class during the invulnerable window', () => {
      useGameStore.setState({ invulnerableUntil: invulnNow() });
      render(<HUD />);
      const bar = screen.getByTestId('health-bar');
      expect(bar.className).toContain('health-bar--flashing');
    });

    it('HealthBar drops the flashing class once the window elapses', () => {
      useGameStore.setState({ invulnerableUntil: invulnExpired() });
      render(<HUD />);
      const bar = screen.getByTestId('health-bar');
      expect(bar.className).not.toContain('health-bar--flashing');
    });

    // F4: when a second enemy contact lands inside the 0.5s invulnerable
    // window, invulnerableUntil doesn't change much, so the overlay/
    // HealthBar would normally not re-render — leaving the CSS flash
    // animation stuck on its first frame. Subscribing to hitCount and
    // using it as a key (or marking it on the element) forces a re-mount
    // so the animation restarts on every contact.
    it('InvulnerableFlash re-renders on every hit (re-mount via hitCount, F4)', () => {
      useGameStore.setState({ hitCount: 1, invulnerableUntil: invulnNow() });
      render(<HUD />);
      const first = screen.getByTestId('invulnerable-flash');
      expect(first.getAttribute('data-hit-count')).toBe('1');
      // Second contact inside the same window — health unchanged, but the
      // overlay must re-render with the new hitCount so the CSS animation
      // restarts.
      act(() => {
        useGameStore.setState({ hitCount: 2, invulnerableUntil: invulnNow() });
      });
      const second = screen.getByTestId('invulnerable-flash');
      expect(second.getAttribute('data-hit-count')).toBe('2');
    });

    it('HealthBar re-renders on every hit (re-mount via hitCount, F4)', () => {
      useGameStore.setState({ hitCount: 1, invulnerableUntil: invulnNow() });
      render(<HUD />);
      const first = screen.getByTestId('health-bar');
      expect(first.getAttribute('data-hit-count')).toBe('1');
      act(() => {
        useGameStore.setState({ hitCount: 2, invulnerableUntil: invulnNow() });
      });
      const second = screen.getByTestId('health-bar');
      expect(second.getAttribute('data-hit-count')).toBe('2');
    });
  });
});
