import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LevelSelect } from '../../src/ui/LevelSelect';
import { useLevelStore } from '../../src/store/levelStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { ConfirmProvider } from '../../src/ui/useConfirm';
import type { MazeData } from '../../src/maze/types';

function makeCustom(id: string, name: string, w: number, d: number): MazeData {
  return {
    id,
    name,
    size: { width: w, depth: d },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: w - 1, z: d - 1 },
    walls: Array.from({ length: d }, () => Array.from({ length: w }, () => 0)),
    pickups: [],
    enemies: [],
    traps: [],
    doors: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
  };
}

// P2-6 适配: 渲染 LevelSelect 并切到「我的」源, 返回 sublevel-select 元素。
// 把"切源 + 拿到 dropdown"这一步抽出来, 6 case 共享。
// P2-7: 必须包 <ConfirmProvider>, 因为 LevelSelect 在 render 期就调 useConfirm()
function renderWithCustomSource(
  props: { available: Array<{ id: string; name: string }>; onPick: (id: string, options?: unknown) => void; onBack: () => void },
) {
  render(
    <ConfirmProvider>
      <LevelSelect {...props} />
    </ConfirmProvider>,
  );
  fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'custom' } });
  return screen.getByTestId('sublevel-select') as HTMLSelectElement;
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    pointerSensitivity: 0.002,
    fov: 60,
    darkMode: false,
    set: useSettingsStore.getState().set,
  });
  useLevelStore.setState({ customLevels: {} });
});

describe('LevelSelect custom levels group (P2-4b #17 / P2-6 cascading)', () => {
  // Case 1 (老: "group 不渲染") → 新: 源=custom 且 customLevels={} 时
  // sublevel-select 禁用 + 没有 custom 选项。老的 custom-levels-group
  // 容器按 FR-16 永远在 DOM 里(无 children), 所以这里只断言"无 rows"和
  // "sublevel-select 禁用"。
  it('shows disabled sublevel-select and no custom-level rows when customLevels is empty', () => {
    const sub = renderWithCustomSource({ available: [], onPick: () => {}, onBack: () => {} });
    expect(sub).toBeDisabled();
    // 老 row 容器存在但 children 为空 (FR-16: 容器永远渲染, rows 仅在有数据时渲染)
    expect(screen.queryByTestId('custom-level-custom-1')).toBeNull();
    expect(within(sub).queryByTestId('sublevel-option-custom-1')).toBeNull();
  });

  // Case 2 (老: 1 row 1 row + name + size) → 新: sublevel-select 列出
  // customLevels, 老的 custom-level-{id} row 容器按 FR-16 仍保留 name + size。
  it('lists each custom level in sublevel-select options + preserves legacy custom-level-{id} rows with name and size', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'My First', 10, 10),
        'custom-2': makeCustom('custom-2', 'My Second', 15, 15),
      },
    });
    const sub = renderWithCustomSource({ available: [], onPick: () => {}, onBack: () => {} });
    // 新路径: sublevel-select 的 option
    expect(within(sub).getByTestId('sublevel-option-custom-1')).toBeInTheDocument();
    expect(within(sub).getByTestId('sublevel-option-custom-2')).toBeInTheDocument();
    // 老路径 (FR-16 兼容): 容器 row + name + size
    expect(screen.getByTestId('custom-level-custom-1').textContent).toContain('My First');
    expect(screen.getByTestId('custom-level-custom-1').textContent).toContain('10×10');
    expect(screen.getByTestId('custom-level-custom-2').textContent).toContain('My Second');
    expect(screen.getByTestId('custom-level-custom-2').textContent).toContain('15×15');
  });

  // Case 3 (老: 点击 row 触发 onPick) → 新: 走"主 dropdown=我的 → sublevel
  // 选 custom-1 → start-button" 级联路径, onPick 收到 ('custom-1')。
  // custom / teaching 不传 options — MazeData 已自带 rules, 引擎按 maze.rules
  // 走 (P2-3 起 procedural 才走 options.seed / mode)。start-button 自动选中
  // 唯一一项 (effectiveSublevelId = sublevelId ?? sublevelOptions[0]?.id)。
  it('selecting custom-1 from sublevel-select + clicking start-button calls onPick with "custom-1"', () => {
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    const onPick = vi.fn();
    renderWithCustomSource({ available: [], onPick, onBack: () => {} });
    fireEvent.change(screen.getByTestId('sublevel-select'), { target: { value: 'custom-1' } });
    fireEvent.click(screen.getByTestId('start-button'));
    expect(onPick).toHaveBeenCalledTimes(1);
    const [id, options] = onPick.mock.calls[0];
    expect(id).toBe('custom-1');
    // custom 源不传 options: App.startLevel 直接走 maze.rules。
    expect(options).toBeUndefined();
  });

  // P2-12: "删除自定义关卡" 入口已从 /levels 搬到 EditorMyLevelsDrawer
  // (编辑器内)。/levels 不再渲染 delete-custom-{id} 按钮,改断言它
  // 不存在。这条 case 替代了原来的"点击删除"两个 case (case 4 / 5)。
  it('does not render a delete button for custom levels (P2-12 moved to editor)', () => {
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    render(
      <ConfirmProvider>
        <LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />
      </ConfirmProvider>,
    );
    expect(screen.queryByTestId('delete-custom-custom-1')).toBeNull();
    // 自定义关卡卡片仍然可点(进入游戏)— 决策 C。
    const card = screen.getByTestId('custom-level-custom-1');
    expect(card).toBeInTheDocument();
  });

  // Case 6 (老: group 内按 name 排序) → 新: 源=custom 时 sublevel-select
  // 的 <option> 顺序按 name 升序 (customDefs 已 .sort(localeCompare 'zh'))。
  it('sorts sublevel-select options for custom source by name', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-2': makeCustom('custom-2', 'Banana', 10, 10),
        'custom-1': makeCustom('custom-1', 'Apple', 10, 10),
      },
    });
    const sub = renderWithCustomSource({ available: [], onPick: () => {}, onBack: () => {} });
    const options = within(sub).getAllByRole('option');
    const labels = options.map((o) => o.textContent ?? '');
    expect(labels.indexOf('Apple')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Apple')).toBeLessThan(labels.indexOf('Banana'));
  });
});
