import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LevelSelect } from '../../src/ui/LevelSelect';

beforeEach(() => {
  localStorage.clear();
});

describe('LevelSelect P2-5 UI revamp', () => {
  // FR-7: 2-col grid
  it('renders the root with grid layout', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const root = screen.getByTestId('level-select-root');
    expect(root.style.display).toBe('grid');
  });

  // FR-8: mode is a native <select>; testids stable on <option>
  it('renders mode as a native select with stable testids on each option', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const select = screen.getByTestId('mode-select') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getByTestId('mode-reach-exit')).toBeInTheDocument();
    expect(within(select).getByTestId('mode-time-trial')).toBeInTheDocument();
    expect(within(select).getByTestId('mode-survive')).toBeInTheDocument();
  });

  it('changing mode select updates internal state', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
    // After switch to survive, enemy-count select should appear
    expect(screen.getByTestId('enemy-count-select')).toBeInTheDocument();
    // And progressive-spawn checkbox
    expect(screen.getByTestId('progressive-spawn')).toBeInTheDocument();
    // And survive-seconds select
    expect(screen.getByTestId('survive-seconds-select')).toBeInTheDocument();
  });

  // FR-10 + FR-12: enemy / progressive hidden in non-survive
  it('hides enemy-count + progressive in non-survive mode', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.queryByTestId('enemy-count-select')).toBeNull();
    expect(screen.queryByTestId('progressive-spawn')).toBeNull();
  });

  it('shows a "当前模式无敌人" placeholder in non-survive mode', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/当前模式无敌人/)).toBeInTheDocument();
  });

  // FR-9: size is a native select
  it('renders size as a native select with 15/30/50 options', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const select = screen.getByTestId('size-select') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '15×15 (小)', '30×30 (中)', '50×50 (大)',
    ]);
  });

  // FR-13: advanced fold
  it('hides the seed input by default (advanced fold closed)', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.queryByLabelText(/seed/i)).toBeNull();
  });

  it('reveals the seed input when 进阶 ▾ is clicked', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    expect(screen.getByLabelText(/seed/i)).toBeInTheDocument();
  });

  it('hides the seed input again on second click of the toggle', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const toggle = screen.getByTestId('advanced-toggle');
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/seed/i)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/seed/i)).toBeNull();
  });

  // FR-13: "使用上次 seed" button restores a stored seed after the input is cleared.
  it('restores the stored seed via reuse button after the input is cleared', () => {
    localStorage.setItem('maze3d.lastSeed', 'deadbeefcafebabe');
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    const input = screen.getByLabelText(/seed/i) as HTMLInputElement;
    // Clear whatever was pre-filled on mount.
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    // Reuse button repopulates from localStorage.
    fireEvent.click(screen.getByTestId('reuse-last-seed'));
    expect(input.value).toBe('deadbeefcafebabe');
  });

  // FR-16: 随机关卡按钮 用 size 下拉
  it('uses the size dropdown value for the random card button', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '50' } });
    // 唯一存在的"开始 XXxXX 随机关卡" 按钮
    const btn = screen.getByRole('button', { name: /50×50 随机关卡/ });
    fireEvent.click(btn);
    const [id, options] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-[a-z-]+-50-[0-9a-f]{16}$/);
    expect(options?.seed?.size).toBe(50);
  });

  // FR-17: algorithmForMode 在 onPick 的 seed 编码里生效
  it('encodes recursive-backtracker for reach-exit random level', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    // default mode = time-trial, but here we explicitly pick reach-exit
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'reach-exit' } });
    // Switch size dropdown to 15 so the random button reads "15×15 随机关卡".
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /15×15 随机关卡/ }));
    const [id] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-recursive-backtracker-15-/);
  });

  it('encodes kruskal for survive random level', () => {
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /15×15 随机关卡/ }));
    const [id] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-kruskal-15-/);
  });
});