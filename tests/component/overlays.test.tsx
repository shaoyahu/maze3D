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
  traps: [],
  doors: [],
};

describe('overlays', () => {
  beforeEach(() => useGameStore.getState().goToMenu());

  it('PauseOverlay shows collected count and resume callback', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ pickupCount: { collected: 2, total: 5 } });
    const onResume = vi.fn();
    render(<PauseOverlay onResume={onResume} onQuit={() => {}} />);
    expect(screen.getByText(/已收集/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('继续游戏'));
    expect(onResume).toHaveBeenCalled();
  });

  // P2-5+ UI revamp: 暂停页 3 个垂直按钮
  it('PauseOverlay shows 3 vertically-stacked buttons with the same width', () => {
    useGameStore.getState().startLevel(maze);
    render(<PauseOverlay onResume={() => {}} onQuit={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual(['继续游戏', '设置', '返回主菜单']);
    // 按钮容器应为 column 布局
    const btnRow = buttons[0].parentElement as HTMLElement;
    expect(btnRow.style.display).toBe('flex');
    expect(btnRow.style.flexDirection).toBe('column');
    // 3 个按钮的 width 样式应一致
    const widths = buttons.map((b) => (b as HTMLButtonElement).style.width);
    expect(widths[0]).toBeTruthy();
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
  });

  it('PauseOverlay buttons have distinct background colors and hover styles', () => {
    useGameStore.getState().startLevel(maze);
    render(<PauseOverlay onResume={() => {}} onQuit={() => {}} />);
    const buttons = screen.getAllByRole('button');
    const bgs = buttons.map((b) => (b as HTMLButtonElement).style.background);
    // 3 个不同背景色
    expect(new Set(bgs).size).toBe(3);
    // 3 个不同 hover 类
    const hoverClasses = buttons.map((b) => {
      const cls = (b as HTMLButtonElement).className;
      const match = cls.match(/btn-hover-(lift|glow|fade)/);
      return match?.[1] ?? null;
    });
    expect(new Set(hoverClasses).size).toBe(3);
  });

  it('PauseOverlay "设置" button opens the Settings panel', () => {
    useGameStore.getState().startLevel(maze);
    render(<PauseOverlay onResume={() => {}} onQuit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    // Settings 页面渲染 (有 <h2>设置</h2>、深色模式 checkbox 等)
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('PauseOverlay Settings "返回" button returns to the pause menu', () => {
    useGameStore.getState().startLevel(maze);
    render(<PauseOverlay onResume={() => {}} onQuit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    // 回到暂停页:标题"已暂停" + 3 个按钮
    expect(screen.getByText('已暂停')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
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
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} onLevels={() => {}} />);
    // F-P2-N (WinOverlay revamp): the time label and value are now in
    // separate StatTile nodes; assert each one independently rather
    // than a single regex across the whole string.
    expect(screen.getByText('用时')).toBeInTheDocument();
    expect(screen.getByText('00:25')).toBeInTheDocument();
  });

  it('WinOverlay shows elapsedTime when time pickups push timeRemaining past initialTime', () => {
    useGameStore.getState().startLevel(maze);
    // Player picked up a +15s time pickup, then played for 10s and reached the exit.
    // elapsedTime=10, timeRemaining=60-10+15=65 (past initialTime).
    useGameStore.setState({ timeRemaining: 65, elapsedTime: 10 });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} onLevels={() => {}} />);
    // F-P2-N: same split-stat-tile assertion as the test above.
    expect(screen.getByText('用时')).toBeInTheDocument();
    expect(screen.getByText('00:10')).toBeInTheDocument();
  });

  it('WinOverlay shows "新纪录！" when lastWinIsNewRecord is true (P2-4a FR-18)', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ elapsedTime: 30, lastWinIsNewRecord: true });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} onLevels={() => {}} />);
    // F-P2-N: the new-record badge is prefixed with a ✦ glyph and
    // wrapped in a pill; the text is split across the glyph + the
    // label, so query by the dedicated testid instead of the string.
    expect(screen.getByTestId('win-new-record')).toBeInTheDocument();
  });

  // P2-11: caught-by-enemy tutorial completion path. Different title +
  // subtitle, suppresses the new-record badge (chase has no timer).
  it('WinOverlay shows caught-by-enemy copy when lastWinKind is set (P2-11)', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({
      elapsedTime: 30,
      lastWinKind: 'caught-by-enemy',
      lastWinIsNewRecord: true,
    });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} onLevels={() => {}} />);
    expect(screen.getByTestId('win-title').textContent).toBe('被追上了 — 教学完成');
    expect(screen.queryByTestId('win-new-record')).toBeNull();
  });

  it('WinOverlay falls back to reach-exit copy when lastWinKind is null (P2-11)', () => {
    useGameStore.getState().startLevel(maze);
    useGameStore.setState({ elapsedTime: 30, lastWinKind: null });
    render(<WinOverlay onRetry={() => {}} onQuit={() => {}} onLevels={() => {}} />);
    expect(screen.getByTestId('win-title').textContent).toBe('通关！');
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
