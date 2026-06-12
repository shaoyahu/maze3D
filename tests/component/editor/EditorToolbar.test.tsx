import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { EditorToolbar } from '../../../src/ui/editor/EditorToolbar';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';

vi.mock('../../../src/maze/importExport', async () => {
  const actual = await vi.importActual<typeof import('../../../src/maze/importExport')>(
    '../../../src/maze/importExport',
  );
  return {
    ...actual,
    downloadAsJsonFile: vi.fn(),
  };
});

import { downloadAsJsonFile } from '../../../src/maze/importExport';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'custom-test-id',
      name: 'Test',
      size: { width: 5, depth: 4 },
      cellSize: 2,
      start: { x: 0, z: 0 },
      exit: { x: 4, z: 3 },
      walls: [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
      pickups: [],
      enemies: [],
      rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    },
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
  });
}

describe('EditorToolbar (P2-4b #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEditor();
  });

  it('renders all 7 tool buttons', () => {
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-select')).toBeInTheDocument();
    expect(screen.getByTestId('tool-wall')).toBeInTheDocument();
    expect(screen.getByTestId('tool-start')).toBeInTheDocument();
    expect(screen.getByTestId('tool-exit')).toBeInTheDocument();
    expect(screen.getByTestId('tool-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('tool-enemy')).toBeInTheDocument();
    expect(screen.getByTestId('tool-pan')).toBeInTheDocument();
  });

  it('marks the active tool with aria-pressed=true', () => {
    useEditorStore.setState({ tool: 'wall' });
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-wall').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a tool button dispatches setTool', () => {
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-pickup'));
    expect(useEditorStore.getState().tool).toBe('pickup');
  });

  it('Undo is disabled when past is empty', () => {
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-undo')).toBeDisabled();
  });

  it('Redo is disabled when future is empty', () => {
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-redo')).toBeDisabled();
  });

  it('Undo is enabled when past is non-empty and triggers undo on click', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-undo')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('tool-undo'));
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it('Redo is enabled when future is non-empty and triggers redo on click', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-redo')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('tool-redo'));
    expect(useEditorStore.getState().future.length).toBe(0);
  });

  it('name input is controlled and updateName is called on change', () => {
    render(<EditorToolbar />);
    const input = screen.getByTestId('tool-name-input') as HTMLInputElement;
    expect(input.value).toBe('Test');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    expect(useEditorStore.getState().level.name).toBe('Renamed');
  });

  it('shows the dirty marker when dirty is true', () => {
    useEditorStore.setState({ dirty: true });
    render(<EditorToolbar />);
    expect(screen.getByTestId('tool-dirty')).toBeInTheDocument();
  });

  it('hides the dirty marker when not dirty', () => {
    useEditorStore.setState({ dirty: false });
    render(<EditorToolbar />);
    expect(screen.queryByTestId('tool-dirty')).not.toBeInTheDocument();
  });

  it('New button calls newLevel(15, 15) without confirm when not dirty', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-new'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useEditorStore.getState().level.size).toEqual({ width: 15, depth: 15 });
  });

  it('New button shows confirm when dirty and aborts if declined', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    useEditorStore.setState({ dirty: true });
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-new'));
    expect(confirmSpy).toHaveBeenCalled();
    // Still the original level.
    expect(useEditorStore.getState().level.size).toEqual({ width: 5, depth: 4 });
  });

  it('New button creates a new level when dirty and confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useEditorStore.setState({ dirty: true });
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-new'));
    expect(useEditorStore.getState().level.size).toEqual({ width: 15, depth: 15 });
  });

  it('Save calls saveLevel (levelStore.saveCustom) and shows success status', () => {
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-save'));
    expect(useLevelStore.getState().customLevels['custom-test-id']).toBeDefined();
    expect(screen.getByTestId('tool-status').textContent).toBe('已保存');
  });

  // F-2026-06-12-B1: regression for the "已保存 + ● 未保存" contradiction
  // reported by the user. The local "已保存" status is set by handleSave
  // but never cleared — if the user makes another edit afterwards
  // (dirty→true) the toolbar shows both the stale "已保存" message and
  // the dirty indicator, which is contradictory. The local status must
  // be cleared as soon as dirty flips false→true.
  it('clears the local "已保存" status when the user makes a new edit (dirty→true)', () => {
    // Arrange — simulate: user just saved (status="已保存", dirty=false).
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-save'));
    expect(screen.getByTestId('tool-status').textContent).toBe('已保存');
    // Act — user makes another edit (placeWall on a non-start/non-exit
    // cell toggles a wall and pushes history, which sets dirty=true).
    // Wrap in act() so the toolbar's useEffect re-runs and clears the
    // local status before we assert on the DOM.
    act(() => {
      useEditorStore.getState().placeWall(1, 0);
    });
    // Assert — the stale "已保存" is gone, the dirty indicator appears,
    // and the two contradictory messages are no longer both visible.
    expect(screen.queryByTestId('tool-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('tool-dirty')).toBeInTheDocument();
  });

  // F-2026-06-12-S1: when the editor is in an invalid state (e.g. start
  // on a wall), Save must surface the validator's actual error string so
  // the user can fix the level. Previously it showed a fixed
  // "保存失败：关卡结构不合法" with no detail.
  it('Save shows the validator detail in the status when the level is invalid', () => {
    // Arrange — put start on a wall so validateMaze rejects with
    // 'start is on a wall'.
    useEditorStore.setState({
      level: {
        id: 'custom-invalid',
        name: 'invalid',
        size: { width: 5, depth: 4 },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: 4, z: 3 },
        walls: [[1,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
        pickups: [],
        enemies: [],
        rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      },
    });
    render(<EditorToolbar />);
    // Act
    fireEvent.click(screen.getByTestId('tool-save'));
    // Assert
    const status = screen.getByTestId('tool-status').textContent ?? '';
    expect(status).toMatch(/保存失败/);
    expect(status).toMatch(/start is on a wall/);
  });

  it('Save & Exit calls onSaveAndExit on success', () => {
    const onSaveAndExit = vi.fn();
    render(<EditorToolbar onSaveAndExit={onSaveAndExit} />);
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onSaveAndExit).toHaveBeenCalled();
  });

  it('Save & Exit falls back to onExit when onSaveAndExit is not provided', () => {
    const onExit = vi.fn();
    render(<EditorToolbar onExit={onExit} />);
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
  });

  it('Export calls exportJson and downloadAsJsonFile with sanitized filename', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, name: 'Test 关卡 / 1' } });
    render(<EditorToolbar />);
    fireEvent.click(screen.getByTestId('tool-export'));
    expect(downloadAsJsonFile).toHaveBeenCalledTimes(1);
    const [filename, content] = (downloadAsJsonFile as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(filename).toBe('Test______1.maze3d.json');
    expect(typeof content).toBe('string');
    expect(JSON.parse(content as string).schemaVersion).toBe(1);
  });

  it('Import reads the chosen file and dispatches importJson with success status', async () => {
    const validJson = JSON.stringify({
      schemaVersion: 1,
      level: {
        id: 'imported-level',
        name: 'Imported',
        size: { width: 3, depth: 3 },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: 2, z: 2 },
        walls: [[0,0,0],[0,0,0],[0,0,0]],
        pickups: [],
        enemies: [],
        rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      },
    });
    const file = new File([validJson], 'good.maze3d.json', { type: 'application/json' });
    render(<EditorToolbar />);
    fireEvent.change(screen.getByTestId('tool-import-input'), { target: { files: [file] } });
    await waitFor(() => {
      expect(useEditorStore.getState().level.id.startsWith('custom-')).toBe(true);
    });
    expect(useEditorStore.getState().level.name).toBe('Imported');
    expect(screen.getByTestId('tool-status').textContent).toMatch(/已导入/);
  });

  it('Import shows an error status when the file is invalid', async () => {
    const file = new File(['not-json-at-all'], 'bad.maze3d.json', { type: 'application/json' });
    render(<EditorToolbar />);
    fireEvent.change(screen.getByTestId('tool-import-input'), { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByTestId('tool-status').textContent).toMatch(/导入失败/);
    });
  });

  it('Import shows an error status when schemaVersion is not 1', async () => {
    const badJson = JSON.stringify({ schemaVersion: 2, level: {} });
    const file = new File([badJson], 'wrong-version.maze3d.json', { type: 'application/json' });
    render(<EditorToolbar />);
    fireEvent.change(screen.getByTestId('tool-import-input'), { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByTestId('tool-status').textContent).toMatch(/导入失败/);
    });
  });

  // F-2026-06-12-H1: silent-reject from `placeWall` (or any other action)
  // would be invisible to the user. The toolbar MUST surface `lastError`
  // in the same status area used for save/import messages, so the user
  // learns why a click was dropped.
  it('shows lastError from the store in the status area', () => {
    // Arrange
    useEditorStore.setState({ lastError: '无法在起点放置墙（墙不能覆盖起点）' });
    // Act
    render(<EditorToolbar />);
    // Assert
    expect(screen.getByTestId('tool-status').textContent).toMatch(/无法在起点放置墙/);
  });

  it('hides the status area when lastError is null and no local status is set', () => {
    // Arrange
    useEditorStore.setState({ lastError: null });
    // Act
    render(<EditorToolbar />);
    // Assert
    expect(screen.queryByTestId('tool-status')).not.toBeInTheDocument();
  });

  it('auto-clears lastError after ~3s (so a stale message does not linger forever)', () => {
    vi.useFakeTimers();
    try {
      // Arrange
      useEditorStore.setState({ lastError: 'stale' });
      render(<EditorToolbar />);
      expect(screen.getByTestId('tool-status').textContent).toMatch(/stale/);
      // Act — advance past the 3s auto-clear window. The useEffect inside
      // EditorToolbar schedules a setTimeout that calls clearLastError.
      // The toolbar uses LAST_ERROR_DISPLAY_MS = 3000; 3050 gives a small
      // safety margin without coupling this test to that internal constant.
      vi.advanceTimersByTime(3050);
      // Assert
      expect(useEditorStore.getState().lastError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // F-2026-06-12-F1: the toolbar wires useAutoSave with a 30s default
  // tick. When dirty, the next tick calls saveLevel and surfaces a
  // "已自动保存 HH:MM:SS" status. Pin the wiring here so a future
  // refactor can't silently drop the auto-save UX.
  it('surfaces "已自动保存 HH:MM:SS" in the status after a 30s auto-save tick', () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-06-12T03:04:05').getTime();
      vi.setSystemTime(now);
      render(<EditorToolbar />);
      // Make the level dirty so the hook actually fires saveLevel on tick.
      act(() => {
        useEditorStore.getState().placeWall(1, 0);
      });
      // Right after the edit: no auto-save yet, but the dirty marker
      // is visible (and any stale "已保存" from a prior render is gone
      // — that's the B1 rising-edge clear).
      expect(screen.queryByTestId('tool-status')).not.toBeInTheDocument();
      expect(screen.getByTestId('tool-dirty')).toBeInTheDocument();
      // Advance to the 30s tick.
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      // Now the status area should show "已自动保存 03:04:35" (3:04:05 + 30s).
      // We match the prefix so the test isn't coupled to the exact
      // formatting of the timestamp suffix.
      expect(screen.getByTestId('tool-status').textContent).toMatch(/^已自动保存 \d{2}:\d{2}:\d{2}$/);
      // And the dirty marker is gone (lastSavedHash advanced).
      expect(screen.queryByTestId('tool-dirty')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // F-2026-06-12-F1: on auto-save failure (validator rejected the
  // in-memory level), the toolbar must surface the validator's
  // message — same UX as a manual save failure.
  it('surfaces the validator message via "自动保存失败：..." when auto-save fails', () => {
    vi.useFakeTimers();
    try {
      // Build an invalid level: start on a wall.
      useEditorStore.setState({
        level: {
          id: 'custom-toolbar-autosave-invalid',
          name: 'Invalid',
          size: { width: 5, depth: 4 },
          cellSize: 2,
          start: { x: 0, z: 0 },
          exit: { x: 4, z: 3 },
          walls: [
            [1, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
          pickups: [],
          enemies: [],
          rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
        },
        dirty: true,
      });
      render(<EditorToolbar />);
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      const status = screen.getByTestId('tool-status').textContent ?? '';
      expect(status).toMatch(/自动保存失败/);
      expect(status).toMatch(/start is on a wall/);
    } finally {
      vi.useRealTimers();
    }
  });
});
