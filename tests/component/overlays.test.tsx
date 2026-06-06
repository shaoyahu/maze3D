import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PauseOverlay } from '../../src/ui/PauseOverlay';
import { GameOverOverlay } from '../../src/ui/GameOverOverlay';
import { WinOverlay } from '../../src/ui/WinOverlay';
import { useGameStore } from '../../src/store/gameStore';
import type { MazeData } from '../../src/maze/types';

const maze: MazeData = {
  id: 'm1', name: 't', size: { width: 3, depth: 3 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 2, z: 2 },
  walls: [[1,1,1],[1,0,1],[1,1,1]],
  pickups: [], rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
};

describe('overlays', () => {
  beforeEach(() => useGameStore.getState().goToMenu());

  it('PauseOverlay shows collected count and resume callback', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ pickupCount: { collected: 2, total: 5 } });
    const onResume = vi.fn();
    render(<PauseOverlay onResume={onResume} onQuit={() => {}} />);
    expect(screen.getByText(/已收集/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('继续'));
    expect(onResume).toHaveBeenCalled();
  });

  it('GameOverOverlay shows retry button', () => {
    const onRetry = vi.fn();
    render(<GameOverOverlay onRetry={onRetry} onQuit={() => {}} />);
    fireEvent.click(screen.getByText('重试'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('WinOverlay shows time used', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ timeRemaining: 35 });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText(/用时 00:25/)).toBeInTheDocument();
  });
});
