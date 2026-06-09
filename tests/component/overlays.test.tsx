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
  enemies: [],
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

  it('WinOverlay shows time used from elapsedTime', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ elapsedTime: 25 });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText(/用时 00:25/)).toBeInTheDocument();
  });

  it('WinOverlay shows elapsedTime when time pickups push timeRemaining past initialTime', () => {
    useGameStore.getState().startLevel(maze);
    // Player picked up a +15s time pickup, then played for 10s and reached the exit.
    // elapsedTime=10, timeRemaining=60-10+15=65 (past initialTime).
    useGameStore.setState({ timeRemaining: 65, elapsedTime: 10 });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText(/用时 00:10/)).toBeInTheDocument();
  });

  it('WinOverlay shows "新纪录！" when lastWinIsNewRecord is true (P2-4a FR-18)', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ elapsedTime: 30, lastWinIsNewRecord: true });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText('新纪录！')).toBeInTheDocument();
  });

  it('GameOverOverlay in survive mode shows 坚持时间 + 击中数 (P2-4a FR-18)', () => {
    useGameStore.getState().startLevel(maze, { mode: 'survive', surviveSeconds: 60 });
    useGameStore.setState({ elapsedTime: 17, pickupCount: { collected: 3, total: 5 } });
    render(<GameOverOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText('坚持失败')).toBeInTheDocument();
    expect(screen.getByText(/坚持了 00:17/)).toBeInTheDocument();
    expect(screen.getByText(/击中数 3/)).toBeInTheDocument();
  });

  it('GameOverOverlay in non-survive mode keeps the original "时间到！" copy', () => {
    // goToMenu doesn't reset currentMode (preexisting gap), so explicitly
    // pin it for this case.
    useGameStore.setState({ currentMode: 'reach-exit' });
    render(<GameOverOverlay onRetry={() => {}} onQuit={() => {}} />);
    expect(screen.getByText('时间到！')).toBeInTheDocument();
    expect(screen.queryByText('坚持失败')).toBeNull();
    expect(screen.queryByText(/坚持了/)).toBeNull();
    expect(screen.queryByText(/击中数/)).toBeNull();
  });
});
