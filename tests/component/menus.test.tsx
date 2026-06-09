import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    it('renders a 随机关卡 section with three size cards (15/30/50)', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.getByText('随机关卡')).toBeInTheDocument();
      // Each card is a button labeled with its size.
      expect(screen.getByRole('button', { name: /15/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /30/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /50/ })).toBeInTheDocument();
    });

    it('clicking a size card calls onPick with a procedural seed id + time-trial mode', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /15/ }));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      // id must be a well-formed procedural seed id (algo-v1-*-15-xxxxxxxxxxxxxxxx).
      expect(id).toMatch(/^algo-v1-[a-z-]+-15-[0-9a-f]{16}$/);
      expect(options?.mode).toBe('time-trial');
      expect(options?.seed?.size).toBe(15);
    });

    it('clicking a different size card passes that size in the options', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /30/ }));
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/-30-[0-9a-f]{16}$/);
      expect(options?.seed?.size).toBe(30);
    });

    it('renders a 指定种子关卡 section with seed input + start button', () => {
      render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
      expect(screen.getByText('指定种子关卡')).toBeInTheDocument();
      expect(screen.getByLabelText(/seed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /开始/ })).toBeInTheDocument();
    });

    it('clicking start with a valid hex seed calls onPick with that seed', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: '0123456789abcdef' } });
      fireEvent.click(screen.getByRole('button', { name: /开始/ }));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/^algo-v1-[a-z-]+-\d+-0123456789abcdef$/);
      expect(options?.seed?.mazeSeed).toBe('0123456789abcdef');
    });

    it('clicking start with an invalid (non-hex / wrong-length) seed does NOT call onPick', () => {
      const onPick = vi.fn();
      render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
      const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: 'not-hex' } });
      fireEvent.click(screen.getByRole('button', { name: /开始/ }));
      expect(onPick).not.toHaveBeenCalled();
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
