import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import { useGameStore } from '../../src/store/gameStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useLevelStore } from '../../src/store/levelStore';
import type { MazeData } from '../../src/maze/types';

// F9: App.tsx onRetry 不传 activeOptions — 每次 retry 把玩家选好的 mode /
// surviveSeconds / enemyCount / spawnSchedule 全部退回默认。
//
// 测试策略：
//  1) mock EditorMazeProvider，让 provider.load('m1') 返回合成的 maze；
//     list() 返回 ['m1']
//  2) mock GameCanvas（Three.js 路径），让 App 树在 happy-dom 下能 render
//  3) 走完 MainMenu → LevelSelect → 点关卡，让 App 自己的 activeOptions
//     state 真的被填上（App 自己持有一份 options 副本，gameStore 并不存）
//  4) 通过 store.startLevel 模拟"玩家选了 time-trial 等"进 game
//  5) 切到 game-over / win，点 重试 / 重玩，断言 store 里的 currentMode /
//     currentSurviveSeconds / currentEnemyCount 仍然等于原始 options
vi.mock('../../src/ui/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas-stub" />,
}));

// Mock LevelSelect to expose a "start with options" button. We need a way
// to put non-default StartLevelOptions into App's internal activeOptions
// state without going through a full LevelSelect UI (which doesn't surface
// mode / surviveSeconds / enemyCount for hand-crafted levels). The mock
// renders the same "Test Level" label so the existing flow works, but
// clicking it calls onPick(id, options) with the test-supplied options.
let levelSelectOptions: object | undefined = undefined;
vi.mock('../../src/ui/LevelSelect', () => ({
  LevelSelect: (props: { onPick: (id: string, options?: object) => void; onBack: () => void }) => (
    <div>
      <button data-testid="pick-test-level" onClick={() => props.onPick('m1', levelSelectOptions)}>
        Test Level
      </button>
      <button data-testid="level-back" onClick={() => props.onBack()}>返回</button>
    </div>
  ),
}));

const maze: MazeData = {
  id: 'm1', name: 'Test Level', size: { width: 5, depth: 5 }, cellSize: 2,
  start: { x: 0, z: 0 }, exit: { x: 4, z: 4 },
  // 5x5 with a corridor of open cells so the spawner has candidates with
  // walkable neighbors (and so the player can actually move). Walls=1,
  // walkable=0.
  walls: [
    [0,0,0,0,1],
    [1,1,0,1,1],
    [1,0,0,0,0],
    [1,0,1,1,1],
    [1,0,0,0,0],
  ],
  pickups: [], rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 15 },
  enemies: [],
};

vi.mock('../../src/maze/EditorMazeProvider', () => ({
  EditorMazeProvider: class {
    async list() { return [maze.id]; }
    async load(id: string) { return id === maze.id ? maze : Promise.reject(new Error(`unknown id ${id}`)); }
  },
}));

describe('App onRetry (F9)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
    useLevelStore.setState({ customLevels: {} });
    useGameStore.getState().goToMenu();
  });

  // 走完 menu 流程让 App 进 game 屏，把 options 注入 LevelSelect.onPick 让
  // App 自己的 setActiveOptions(options) 真的被填上（这是 F9 bug 的关键
  // 状态 — App 自己持有一份 options 副本，gameStore 并不存）
  async function startLevelWith(options: object | undefined) {
    levelSelectOptions = options;
    render(<App />);
    // MainMenu → LevelSelect
    await waitFor(() => expect(screen.getByText('开始')).toBeInTheDocument());
    fireEvent.click(screen.getByText('开始'));
    // Mocked LevelSelect 用 data-testid="pick-test-level" 而不是 "Test Level" 文本
    await waitFor(() => expect(screen.getByTestId('pick-test-level')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pick-test-level'));
    // App.startLevel 是 async（等 provider.load），等 gameStore 进 playing
    await waitFor(() => expect(useGameStore.getState().screen).toBe('playing'));
  }

  it('GameOverOverlay 重试 preserves time-trial mode (F9: onRetry must pass activeOptions)', async () => {
    await startLevelWith({ mode: 'time-trial', enemyCount: 5 });
    expect(useGameStore.getState().currentMode).toBe('time-trial');

    await act(async () => {
      useGameStore.setState({ screen: 'game-over' });
    });
    expect(screen.getByText('重试')).toBeInTheDocument();

    // F9 bug：onRetry 不传 activeOptions → startLevel(maze) → currentMode
    // 退回 maze.rules.victory = 'reach-exit'。
    // F9 fix：onRetry 传 activeOptions → currentMode 保持 'time-trial'。
    await act(async () => {
      fireEvent.click(screen.getByText('重试'));
    });

    const s = useGameStore.getState();
    expect(s.currentMode).toBe('time-trial');
    // P2-5 FR-18: enemy spawner injection is hard-gated to survive mode.
    // Time-trial + enemyCount: 5 → the gate clamps injected enemies to
    // 0 (and the test maze declares no hand-crafted enemies), so the
    // HUD count is 0. F9 (onRetry preserves options) is still proven
    // by currentMode === 'time-trial' above.
    expect(s.currentEnemyCount).toBe(0);
  });

  it('GameOverOverlay 重试 preserves survive-mode surviveSeconds + enemyCount (F9)', async () => {
    await startLevelWith({ mode: 'survive', surviveSeconds: 30, enemyCount: 0 });

    await act(async () => {
      useGameStore.setState({ screen: 'game-over' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('重试'));
    });

    const s = useGameStore.getState();
    expect(s.currentMode).toBe('survive');
    expect(s.currentSurviveSeconds).toBe(30);
    expect(s.currentEnemyCount).toBe(0);
  });

  it('WinOverlay 重玩 also preserves options (F9 affects both overlays)', async () => {
    await startLevelWith({ mode: 'survive', surviveSeconds: 60, enemyCount: 4 });

    await act(async () => {
      useGameStore.setState({ screen: 'win' });
    });
    expect(screen.getByText('重玩')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('重玩'));
    });

    const s = useGameStore.getState();
    expect(s.currentMode).toBe('survive');
    expect(s.currentSurviveSeconds).toBe(60);
    expect(s.currentEnemyCount).toBe(4);
  });

  it('F9 control case: hand-crafted level with no options → retry still uses defaults', async () => {
    // startLevelWith 不传 options — App 走 LevelSelect.onPick(id) → activeOptions = undefined
    await startLevelWith(undefined);

    await act(async () => {
      useGameStore.setState({ screen: 'game-over' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('重试'));
    });

    const s = useGameStore.getState();
    // maze.rules.victory = 'reach-exit'
    expect(s.currentMode).toBe('reach-exit');
    // P2-5 FR-18: reach-exit + no options → no enemy injection; the test
    // maze has no hand-crafted enemies, so the HUD count is 0. (F9
    // control case is still proven by currentMode === 'reach-exit'.)
    expect(s.currentEnemyCount).toBe(0);
  });
});
