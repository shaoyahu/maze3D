import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
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
});
