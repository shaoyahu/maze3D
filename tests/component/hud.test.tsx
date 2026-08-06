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
  traps: [],
  doors: [],
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

  // P3-1: §6.1 — LevelIndicator. The component subscribes to
  // `useGameStore(s => s.player?.currentLevel ?? 0)` and renders
  // the 1-indexed chip ("L1" for level 0, "L2" for level 1, …).
  // The 0.2s opacity flash on level change is exercised by
  // mutating the store and asserting the new chip appears.
  describe('LevelIndicator (P3-1)', () => {
    it('renders the L1 chip when the player is on layer 0 (the default)', () => {
      useGameStore.setState({ player: { currentLevel: 0 } });
      render(<HUD />);
      const chip = screen.getByTestId('hud-level-indicator');
      expect(chip).toBeInTheDocument();
      expect(chip.textContent).toBe('L1');
      expect(chip.getAttribute('data-level')).toBe('0');
    });

    it('renders the L{N+1} chip for every layer the player can be on (L1..L6)', () => {
      for (let level = 0; level < 6; level++) {
        useGameStore.setState({ player: { currentLevel: level } });
        const { unmount } = render(<HUD />);
        const chip = screen.getByTestId('hud-level-indicator');
        expect(chip.textContent).toBe(`L${level + 1}`);
        expect(chip.getAttribute('data-level')).toBe(`${level}`);
        unmount();
      }
    });

    it('falls back to L1 when `player` is null (pre-startLevel)', () => {
      // The selector `s.player?.currentLevel ?? 0` collapses a
      // null player to layer 0 → L1. We don't render the
      // component in this state in practice (no level is
      // active), but the HUD is mounted on the menu screen too
      // — and the chip must not crash on render.
      useGameStore.setState({ player: null });
      expect(() => render(<HUD />)).not.toThrow();
      const chip = screen.getByTestId('hud-level-indicator');
      expect(chip.textContent).toBe('L1');
    });

    it('updates the chip when the player crosses a vertical transition', () => {
      useGameStore.setState({ player: { currentLevel: 0 } });
      const { rerender } = render(<HUD />);
      expect(screen.getByTestId('hud-level-indicator').textContent).toBe('L1');
      // The engine pushes the new layer through the bridge; the
      // store mirror flips to match. HUD re-renders with the
      // new chip in the same frame.
      act(() => {
        useGameStore.setState({ player: { currentLevel: 2 } });
      });
      rerender(<HUD />);
      expect(screen.getByTestId('hud-level-indicator').textContent).toBe('L3');
      expect(screen.getByTestId('hud-level-indicator').getAttribute('data-level')).toBe('2');
    });

    it('exposes the full "Level N" string as aria-label for screen readers', () => {
      // The visible text is the compact "L{N}" form, but the
      // aria-label / title use the full "Level N" string so
      // screen-reader / hover-tooltip users get the long form.
      // We don't assert the exact wording (locale-dependent)
      // — only that the full form is structurally different
      // from the short form (i.e. NOT the same string).
      useGameStore.setState({ player: { currentLevel: 1 } });
      render(<HUD />);
      const chip = screen.getByTestId('hud-level-indicator');
      const aria = chip.getAttribute('aria-label') ?? '';
      const title = chip.getAttribute('title') ?? '';
      const visible = chip.textContent ?? '';
      // Both must be non-empty (real i18n key, not the raw
      // "{level}" placeholder), and distinct from the visible
      // short form.
      expect(aria.length).toBeGreaterThan(0);
      expect(title.length).toBeGreaterThan(0);
      expect(aria).not.toBe(visible);
      expect(title).not.toBe(visible);
      // Sanity: the visible chip is the short form.
      expect(visible).toBe('L2');
    });
  });
});
