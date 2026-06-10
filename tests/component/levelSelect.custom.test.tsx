import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('LevelSelect custom levels group (P2-4b #17)', () => {
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

  it('does not render the group when customLevels is empty', () => {
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.queryByTestId('custom-levels-group')).not.toBeInTheDocument();
  });

  it('renders one row per custom level with name + size', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'My First', 10, 10),
        'custom-2': makeCustom('custom-2', 'My Second', 15, 15),
      },
    });
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId('custom-levels-group')).toBeInTheDocument();
    expect(screen.getByTestId('custom-level-custom-1').textContent).toContain('My First');
    expect(screen.getByTestId('custom-level-custom-1').textContent).toContain('10×10');
    expect(screen.getByTestId('custom-level-custom-2').textContent).toContain('My Second');
    expect(screen.getByTestId('custom-level-custom-2').textContent).toContain('15×15');
  });

  it('clicking a custom level row calls onPick with the level id', () => {
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    const onPick = vi.fn();
    render(<LevelSelect available={[]} onPick={onPick} onBack={() => {}} />);
    fireEvent.click(screen.getByText('My First'));
    expect(onPick).toHaveBeenCalledWith('custom-1');
  });

  it('clicking the delete button (after confirm) calls deleteCustom', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('delete-custom-custom-1'));
    expect(useLevelStore.getState().customLevels['custom-1']).toBeUndefined();
  });

  it('clicking the delete button without confirm does NOT delete', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'My First', 10, 10) },
    });
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('delete-custom-custom-1'));
    expect(useLevelStore.getState().customLevels['custom-1']).toBeDefined();
  });

  it('sorts custom levels by name', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-2': makeCustom('custom-2', 'Banana', 10, 10),
        'custom-1': makeCustom('custom-1', 'Apple', 10, 10),
      },
    });
    render(<LevelSelect available={[]} onPick={() => {}} onBack={() => {}} />);
    const group = screen.getByTestId('custom-levels-group');
    // Apple should appear before Banana in the rendered group.
    expect(group.textContent?.indexOf('Apple')).toBeLessThan(group.textContent?.indexOf('Banana') ?? -1);
  });
});
