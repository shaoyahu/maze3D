import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MainMenu } from '../../src/ui/MainMenu';
import { LevelSelect, type LevelDef } from '../../src/ui/LevelSelect';
import { Settings } from '../../src/ui/Settings';
import { useSettingsStore } from '../../src/store/settingsStore';

describe('menu components', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
  });

  it('MainMenu shows title and triggers onStart/onSettings callbacks', () => {
    const onStart = vi.fn();
    const onSettings = vi.fn();
    render(<MainMenu onStart={onStart} onSettings={onSettings} />);
    expect(screen.getByText('3D Maze')).toBeInTheDocument();
    fireEvent.click(screen.getByText('开始'));
    expect(onStart).toHaveBeenCalled();
    fireEvent.click(screen.getByText('设置'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('MainMenu shows the level editor button only when onEditor is provided (P2-4b FR-1)', () => {
    const { rerender } = render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(screen.queryByTestId('main-menu-editor')).not.toBeInTheDocument();
    const onEditor = vi.fn();
    rerender(<MainMenu onStart={() => {}} onSettings={() => {}} onEditor={onEditor} />);
    fireEvent.click(screen.getByTestId('main-menu-editor'));
    expect(onEditor).toHaveBeenCalled();
  });

  it('LevelSelect renders available levels and triggers onPick and onBack', () => {
    const onPick = vi.fn();
    const onBack = vi.fn();
    const levels: LevelDef[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
    render(<LevelSelect available={levels} onPick={onPick} onBack={onBack} />);
    fireEvent.click(screen.getByText('Alpha'));
    // Hand-crafted level: just the id, no StartLevelOptions.
    expect(onPick).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });

  it('LevelSelect shows a hint about the random cards when no hand-crafted levels are loaded', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    // The exact text changed in P2-3: with procedural entries added, the
    // hint now points the player at the random cards instead of a flat
    // "暂无可用关卡" dead end.
    expect(screen.getByText(/暂无固定关卡/)).toBeInTheDocument();
  });

  // P2-3 FR-10: LevelSelect has two extra entries for procedural play:
  //   (1) "随机关卡" — 3 size cards (15/30/50) → time-trial with a random seed
  //   (2) "指定种子关卡" — seed input + algorithm + size + mode + start
  describe('P2-3 procedural entries', () => {
    it('renders a 随机关卡 section with a size dropdown + random card button', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.getByText('随机关卡')).toBeInTheDocument();
      // P2-5 FR-9/FR-16: size is a <select>, random card is a single button.
      expect(screen.getByTestId('size-select')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /30×30 随机关卡/ })).toBeInTheDocument();
    });

    it('clicking the random card button calls onPick with a procedural seed id + default mode', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      // Switch size to 15 then click the random card.
      fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
      fireEvent.click(screen.getByRole('button', { name: /15×15 随机关卡/ }));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      // id must be a well-formed procedural seed id (algo-v1-*-15-xxxxxxxxxxxxxxxx).
      expect(id).toMatch(/^algo-v1-[a-z-]+-15-[0-9a-f]{16}$/);
      // default mode is time-trial (FR-17: algorithmForMode(time-trial) = prim)
      expect(options?.mode).toBe('time-trial');
      expect(options?.seed?.size).toBe(15);
    });

    it('changing the size dropdown passes that size in the random-card options', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      // Default size is 30, but switch to 50 to verify the dropdown drives the seed.
      fireEvent.change(screen.getByTestId('size-select'), { target: { value: '50' } });
      fireEvent.click(screen.getByRole('button', { name: /50×50 随机关卡/ }));
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/-50-[0-9a-f]{16}$/);
      expect(options?.seed?.size).toBe(50);
    });

    it('renders a 指定种子关卡 section with the 进阶 fold collapsed by default', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.getByText('指定种子关卡')).toBeInTheDocument();
      // P2-5 FR-13: seed input is hidden behind the 进阶 fold until clicked.
      expect(screen.queryByLabelText(/seed/i)).toBeNull();
      expect(screen.getByTestId('advanced-toggle')).toBeInTheDocument();
      // Open the fold and confirm the seed input + start button now appear.
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      expect(screen.getByLabelText(/seed/i)).toBeInTheDocument();
      // The seed-section start button is exactly "开始" (the random-card
      // button is "开始 30×30 随机关卡"), so use an exact match.
      expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
    });

    it('clicking start with a valid hex seed calls onPick with that seed', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: '0123456789abcdef' } });
      fireEvent.click(screen.getByRole('button', { name: '开始' }));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/^algo-v1-[a-z-]+-\d+-0123456789abcdef$/);
      expect(options?.seed?.mazeSeed).toBe('0123456789abcdef');
    });

    it('clicking start with an invalid (non-hex / wrong-length) seed does NOT call onPick', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: 'not-hex' } });
      fireEvent.click(screen.getByRole('button', { name: '开始' }));
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  // P2-4a FR-13/FR-20: 4 procedural controls + last-seed persistence.
  describe('P2-4a procedural controls', () => {
    it('renders the 4 procedural controls (mode / survive seconds / enemy count / progressive)', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.getByTestId('procedural-controls')).toBeInTheDocument();
      // P2-5 FR-8: mode is a <select> with stable testids on each <option>.
      const modeSelect = screen.getByTestId('mode-select');
      expect(within(modeSelect).getByTestId('mode-reach-exit')).toBeInTheDocument();
      expect(within(modeSelect).getByTestId('mode-time-trial')).toBeInTheDocument();
      expect(within(modeSelect).getByTestId('mode-survive')).toBeInTheDocument();
      // survive-seconds only shows when mode === 'survive' (default is time-trial)
      expect(screen.queryByTestId('survive-seconds-select')).toBeNull();
      // P2-5 FR-15: enemy count is a 0..10 <select> with default 3.
      // Switch to survive so the enemy count control is rendered.
      fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
      const enemySelect = screen.getByTestId('enemy-count-select') as HTMLSelectElement;
      expect(enemySelect.tagName).toBe('SELECT');
      expect(enemySelect.value).toBe('3');
      // The options should cover the 0..10 range.
      const values = Array.from(enemySelect.options).map((o) => o.value);
      expect(values).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
      // progressive toggle defaults to on
      expect(screen.getByTestId('progressive-spawn')).toBeChecked();
    });

    it('switching to survive mode reveals the survive-seconds select with stable option testids', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.queryByTestId('survive-seconds-select')).toBeNull();
      // P2-5 FR-8: mode testids live on <option> elements inside the <select>.
      fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
      const select = screen.getByTestId('survive-seconds-select') as HTMLSelectElement;
      expect(select.tagName).toBe('SELECT');
      // Stable per-value testids on each <option> (still queryable from the tree).
      expect(screen.getByTestId('survive-30')).toBeInTheDocument();
      expect(screen.getByTestId('survive-60')).toBeInTheDocument();
      expect(screen.getByTestId('survive-90')).toBeInTheDocument();
      expect(screen.getByTestId('survive-120')).toBeInTheDocument();
      // And verify they live inside the select.
      expect(within(select).getByTestId('survive-30')).toBeInTheDocument();
    });

    it('forwards mode + enemyCount + spawnSchedule on the random-card start callback', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      // Switch to survive and configure enemy + spawn options.
      fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
      // survive-seconds is a <select>; change value via fireEvent.change.
      fireEvent.change(screen.getByTestId('survive-seconds-select'), { target: { value: '30' } });
      fireEvent.click(screen.getByTestId('progressive-spawn')); // toggle off
      // P2-5 FR-16: there is no15-size card anymore; click the random card
      // button (which uses the current size dropdown, default 30).
      fireEvent.click(screen.getByRole('button', { name: /30×30 随机关卡/ }));
      const [, options] = onPick.mock.calls[0];
      expect(options?.mode).toBe('survive');
      expect(options?.surviveSeconds).toBe(30);
      expect(options?.enemyCount).toBe(3);
      expect(options?.spawnSchedule?.enabled).toBe(false);
    });

    it('persists the last valid seed to localStorage on a successful start', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      // P2-5 FR-13: open the 进阶 fold first.
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: '0123456789abcdef' } });
      fireEvent.click(screen.getByRole('button', { name: '开始' }));
      expect(localStorage.getItem('maze3d.lastSeed')).toBe('0123456789abcdef');
    });

    it('does NOT persist a seed that fails the hex check (FR-20)', () => {
      localStorage.setItem('maze3d.lastSeed', 'previoustoolongvalue');
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: 'not-hex' } });
      fireEvent.click(screen.getByRole('button', { name: '开始' }));
      // Invalid seed must not clobber the prior value.
      expect(localStorage.getItem('maze3d.lastSeed')).toBe('previoustoolongvalue');
    });

    it('pre-fills the seed input from localStorage once the 进阶 fold is opened (FR-20 round-trip)', () => {
      localStorage.setItem('maze3d.lastSeed', 'feedfacefeedface');
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      // P2-5 FR-13: input is hidden behind the 进阶 fold on mount.
      expect(screen.queryByLabelText(/seed/i)).toBeNull();
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      expect(seedInput.value).toBe('feedfacefeedface');
    });

    it('ignores a non-hex value in localStorage and leaves the input empty', () => {
      localStorage.setItem('maze3d.lastSeed', 'totally-not-hex');
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      // P2-5 FR-13: open the fold so the seed input is queryable.
      fireEvent.click(screen.getByTestId('advanced-toggle'));
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      expect(seedInput.value).toBe('');
    });
  });

  it('Settings renders current sensitivity and updates via set', () => {
    const onBack = vi.fn();
    render(<Settings onBack={onBack} />);
    expect(screen.getByText(/rad\/px/)).toBeInTheDocument();
    // Two sliders now (sensitivity + FOV). Pick the one whose min matches
    // the sensitivity range so the test stays unambiguous if the FOV
    // slider's range ever changes.
    const slider = screen.getAllByRole('slider').find(
      (el) => (el as HTMLInputElement).min === '0.0005',
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.004' } });
    expect(useSettingsStore.getState().pointerSensitivity).toBeCloseTo(0.004);
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });
});
