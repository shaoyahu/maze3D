import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LevelSelect } from '../../src/ui/LevelSelect';
import { useLevelStore } from '../../src/store/levelStore';
import { useSettingsStore } from '../../src/store/settingsStore';
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
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
  };
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

describe('LevelSelect P2-6 cascading redesign', () => {
  // ---- Case 1: 主 dropdown 含 4 选项,各自 testid ----
  it('renders the main level-source dropdown with 4 options, each with stable testid', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const select = screen.getByTestId('level-source-select') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getByTestId('level-source-teaching')).toBeInTheDocument();
    expect(within(select).getByTestId('level-source-random')).toBeInTheDocument();
    expect(within(select).getByTestId('level-source-custom')).toBeInTheDocument();
    expect(within(select).getByTestId('level-source-seed')).toBeInTheDocument();
  });

  // ---- Case 2: 默认选「教学」时 sublevel-select 渲染,available=[] 时 disabled ----
  it('defaults to teaching and renders sublevel-select (disabled when available=[])', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const sub = screen.getByTestId('sublevel-select') as HTMLSelectElement;
    expect(sub.tagName).toBe('SELECT');
    expect(sub).toBeDisabled();
  });

  it('lists available teaching levels in sublevel-select options', () => {
    render(
      <LevelSelect
        available={[
          { id: 'level-small', name: '教学关 A' },
          { id: 'level-tiny', name: '教学关 B' },
        ]}
        onPick={() => {}}
        onBack={() => {}}
      />,
    );
    const sub = screen.getByTestId('sublevel-select') as HTMLSelectElement;
    expect(sub).not.toBeDisabled();
    expect(within(sub).getByTestId('sublevel-option-level-small')).toBeInTheDocument();
    expect(within(sub).getByTestId('sublevel-option-level-tiny')).toBeInTheDocument();
  });

  // ---- Case 3: 切到「随机」: mode+size dropdown 出现,sublevel-select 消失 ----
  it('switching to random shows mode+size dropdowns and hides sublevel-select', () => {
    render(<LevelSelect available={[{ id: 'x', name: 'X' }]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    expect(screen.queryByTestId('sublevel-select')).toBeNull();
    expect(screen.getByTestId('mode-select')).toBeInTheDocument();
    expect(screen.getByTestId('size-select')).toBeInTheDocument();
  });

  // ---- Case 4: 切到「我的」: sublevel-select 渲染 customLevels 列表 ----
  it('switching to custom shows sublevel-select with custom level rows', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'My First', 10, 10),
      },
    });
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'custom' } });
    const sub = screen.getByTestId('sublevel-select') as HTMLSelectElement;
    expect(within(sub).getByTestId('sublevel-option-custom-1')).toBeInTheDocument();
  });

  // ---- Case 5: 切到「指定种子」: seed-input 渲染,reuse-last-seed 可用 ----
  it('switching to seed shows seed-input and reuse-last-seed button', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'seed' } });
    expect(screen.getByTestId('seed-input')).toBeInTheDocument();
    expect(screen.getByTestId('reuse-last-seed')).toBeInTheDocument();
    expect(screen.queryByTestId('sublevel-select')).toBeNull();
  });

  // ---- Case 6: mode='survive' 时 4 个设置出现(input + 4 chip + checkbox + max-input) ----
  it('mode=survive reveals survive-seconds input + 4 chips + progressive + max-input', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });

    expect(screen.getByTestId('survive-seconds-input')).toBeInTheDocument();
    expect(screen.getByTestId('survive-chip-30')).toBeInTheDocument();
    expect(screen.getByTestId('survive-chip-60')).toBeInTheDocument();
    expect(screen.getByTestId('survive-chip-90')).toBeInTheDocument();
    expect(screen.getByTestId('survive-chip-120')).toBeInTheDocument();
    expect(screen.getByTestId('progressive-spawn')).toBeInTheDocument();
    expect(screen.getByTestId('progressive-max-input')).toBeInTheDocument();
  });

  // ---- Case 7: chip 点击: 同步到 input value + active className ----
  it('clicking survive-chip-60 syncs to input value and adds active className', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });

    const chip = screen.getByTestId('survive-chip-60') as HTMLButtonElement;
    fireEvent.click(chip);

    const input = screen.getByTestId('survive-seconds-input') as HTMLInputElement;
    expect(input.value).toBe('60');
    expect(chip.className).toContain('survive-chip--active');
  });

  // ---- Case 8: input 越界: clamp + aria-invalid="true" ----
  it('out-of-range survive-seconds input clamps to bounds and sets aria-invalid', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });

    const input = screen.getByTestId('survive-seconds-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    expect(Number(input.value)).toBeGreaterThanOrEqual(10);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '9999' } });
    expect(Number(input.value)).toBeLessThanOrEqual(600);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  // ---- Case 9: 渐进 checkbox 取消: progressive-max-input 消失 ----
  it('unchecking progressive hides the max-input', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });

    expect(screen.getByTestId('progressive-max-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('progressive-spawn'));
    expect(screen.queryByTestId('progressive-max-input')).toBeNull();
  });

  // ---- Case 10: start-button 点击: 调用 onPick 一次 + options 字段正确 ----
  it('clicking start-button invokes onPick once with correct id + options (random)', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id, options] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-[a-z-]+-15-[0-9a-f]{16}$/);
    expect(options).toBeDefined();
    expect(options.mode).toBe('time-trial');
    expect(options.seed?.size).toBe(15);
    expect(typeof options.enemyCount).toBe('number');
    expect(options.spawnSchedule).toBeDefined();
  });

  // ---- Case 11: validation 失败: start-button disabled, onPick 未调 ----
  it('disables start-button when teaching source has no available levels', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    // default source = teaching, available=[]
    const btn = screen.getByTestId('start-button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('disables start-button when seed source has invalid seed', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'seed' } });
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: 'not-hex' } });

    const btn = screen.getByTestId('start-button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPick).not.toHaveBeenCalled();
  });

  // ---- Case 12: 关键老 testid 兼容 ----
  it('preserves all P2-5 legacy testid containers (level-select-root / procedural-controls / mode-select / enemy-count-select / size-select / progressive-spawn / custom-levels-group / specified-seed-section)', () => {
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    render(
      <LevelSelect
        available={[{ id: 'level-small', name: '教学关 A' }]}
        onPick={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByTestId('level-select-root')).toBeInTheDocument();
    expect(screen.getByTestId('procedural-controls')).toBeInTheDocument();
    // mode/size/enemy/progressive require switching source to 'random' + mode='survive'
    fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
    expect(screen.getByTestId('mode-select')).toBeInTheDocument();
    expect(screen.getByTestId('size-select')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
    expect(screen.getByTestId('enemy-count-select')).toBeInTheDocument();
    expect(screen.getByTestId('progressive-spawn')).toBeInTheDocument();
    // custom-levels-group + specified-seed-section are top-level container testids
    expect(screen.getByTestId('custom-levels-group')).toBeInTheDocument();
    expect(screen.getByTestId('specified-seed-section')).toBeInTheDocument();
  });
});