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
    expect(onPick).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });

  it('LevelSelect shows empty-state message when no levels are available', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.getByText('暂无可用关卡')).toBeInTheDocument();
  });

  it('Settings renders current sensitivity and updates via set', () => {
    const onBack = vi.fn();
    render(<Settings onBack={onBack} />);
    expect(screen.getByText(/rad\/px/)).toBeInTheDocument();
    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.004' } });
    expect(useSettingsStore.getState().pointerSensitivity).toBeCloseTo(0.004);
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });
});
