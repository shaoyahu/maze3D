import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LevelSelect } from '../../src/ui/LevelSelect';
import { useLevelStore } from '../../src/store/levelStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { ConfirmProvider } from '../../src/ui/useConfirm';
import type { MazeData } from '../../src/maze/types';

function makeCustom(id: string, name: string): MazeData {
  return {
    id,
    name,
    size: { width: 10, depth: 10 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 9, z: 9 },
    walls: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
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

// ---------------------------------------------------------------------------
// F-B-ui-M-7: 切换 levelSource 时保留每个源各自的最后选择。
// 旧实现:setSublevelId(null) on [levelSource] change → effectiveSublevelId
// 落到 sublevelOptions[0]?.id,丢用户选过的非首项。
// 新实现:useRef 缓存 { source → lastSublevelId },切换时回放。
// ---------------------------------------------------------------------------
describe('LevelSelect sublevel cache per source (F-B-ui-M-7)', () => {
  it('preserves teaching selection when user switches to custom and back', () => {
    useLevelStore.setState({
      customLevels: { 'custom-1': makeCustom('custom-1', 'Custom One') },
    });
    const available = [
      { id: 'teach-A', name: 'Teach A' },
      { id: 'teach-B', name: 'Teach B' },
    ];
    render(
      <ConfirmProvider>
        <LevelSelect available={available} onPick={() => {}} onBack={() => {}} />
      </ConfirmProvider>,
    );
    const sourceSel = screen.getByTestId('level-source-select');
    const subSel = screen.getByTestId('sublevel-select');

    // Pick Teach-B in teaching
    fireEvent.change(subSel, { target: { value: 'teach-B' } });
    expect(subSel).toHaveValue('teach-B');

    // Switch to custom then back to teaching — Teach-B must survive.
    fireEvent.change(sourceSel, { target: { value: 'custom' } });
    fireEvent.change(sourceSel, { target: { value: 'teaching' } });

    expect(subSel).toHaveValue('teach-B');
  });

  it('preserves custom selection when user switches to teaching and back', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'Custom One'),
        'custom-2': makeCustom('custom-2', 'Custom Two'),
      },
    });
    const available = [
      { id: 'teach-A', name: 'Teach A' },
      { id: 'teach-B', name: 'Teach B' },
    ];
    render(
      <ConfirmProvider>
        <LevelSelect available={available} onPick={() => {}} onBack={() => {}} />
      </ConfirmProvider>,
    );
    const sourceSel = screen.getByTestId('level-source-select');
    const subSel = screen.getByTestId('sublevel-select');

    // Switch to custom, pick Custom-Two (not the first option)
    fireEvent.change(sourceSel, { target: { value: 'custom' } });
    fireEvent.change(subSel, { target: { value: 'custom-2' } });
    expect(subSel).toHaveValue('custom-2');

    // Switch to teaching then back to custom — Custom-Two must survive.
    fireEvent.change(sourceSel, { target: { value: 'teaching' } });
    fireEvent.change(sourceSel, { target: { value: 'custom' } });

    expect(subSel).toHaveValue('custom-2');
  });

  it('keeps teaching and custom selections independently across mixed switches', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'Custom One'),
        'custom-2': makeCustom('custom-2', 'Custom Two'),
      },
    });
    const available = [
      { id: 'teach-A', name: 'Teach A' },
      { id: 'teach-B', name: 'Teach B' },
    ];
    render(
      <ConfirmProvider>
        <LevelSelect available={available} onPick={() => {}} onBack={() => {}} />
      </ConfirmProvider>,
    );
    const sourceSel = screen.getByTestId('level-source-select');
    const subSel = screen.getByTestId('sublevel-select');

    // Pick Teach-B in teaching
    fireEvent.change(subSel, { target: { value: 'teach-B' } });
    // Switch to custom, pick Custom-Two
    fireEvent.change(sourceSel, { target: { value: 'custom' } });
    fireEvent.change(subSel, { target: { value: 'custom-2' } });

    // Round-trip teaching: still Teach-B
    fireEvent.change(sourceSel, { target: { value: 'teaching' } });
    expect(subSel).toHaveValue('teach-B');

    // Round-trip custom: still Custom-Two (NOT Custom-One which is the first option)
    fireEvent.change(sourceSel, { target: { value: 'custom' } });
    expect(subSel).toHaveValue('custom-2');
  });

  it('first visit to a source still defaults to the first sublevel option (no regression)', () => {
    useLevelStore.setState({
      customLevels: {
        'custom-1': makeCustom('custom-1', 'Custom One'),
        'custom-2': makeCustom('custom-2', 'Custom Two'),
      },
    });
    const available = [
      { id: 'teach-A', name: 'Teach A' },
      { id: 'teach-B', name: 'Teach B' },
    ];
    render(
      <ConfirmProvider>
        <LevelSelect available={available} onPick={() => {}} onBack={() => {}} />
      </ConfirmProvider>,
    );
    const sourceSel = screen.getByTestId('level-source-select');
    const subSel = screen.getByTestId('sublevel-select');

    // Switch to custom for the first time — should default to Custom-One (first option).
    fireEvent.change(sourceSel, { target: { value: 'custom' } });
    expect(subSel).toHaveValue('custom-1');
  });
});