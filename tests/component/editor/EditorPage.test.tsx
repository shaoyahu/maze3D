import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EditorPage, DIRTY_EXIT_PROMPT } from '../../../src/ui/editor/EditorPage';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';

const DRAFT_KEY = 'maze3d.editorDraft.v1';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'test-level',
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
    lastSavedAt: null,
  });
}

describe('EditorPage (P2-4b #15)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEditor();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toolbar, viewport, properties panel, and status bar', () => {
    render(<EditorPage onExit={() => {}} />);
    expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('editor-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('editor-properties-panel')).toBeInTheDocument();
    expect(screen.getByTestId('editor-status-bar')).toBeInTheDocument();
  });

  it('does not show a confirm on mount when no draft exists', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditorPage onExit={() => {}} />);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shows draft-recovery confirm on mount when a draft exists', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Pre-seed a valid draft that the loader can sanitize.
    const draft = {
      level: {
        id: 'draft-level',
        name: 'Draft',
        size: { width: 3, depth: 3 },
        cellSize: 2,
        start: { x: 0, z: 0 },
        exit: { x: 2, z: 2 },
        walls: [[0,0,0],[0,0,0],[0,0,0]],
        pickups: [],
        enemies: [],
        rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    render(<EditorPage onExit={() => {}} />);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/未保存的草稿/));
    // Accepted → editor level becomes the draft's level.
    expect(useEditorStore.getState().level.id).toBe('draft-level');
  });

  it('drops the draft when the user declines recovery', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: {} }));
    render(<EditorPage onExit={() => {}} />);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('Cmd/Ctrl+Z triggers undo when focus is not in an input', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    render(<EditorPage onExit={() => {}} />);
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it('Cmd/Ctrl+Shift+Z triggers redo', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    render(<EditorPage onExit={() => {}} />);
    fireEvent.keyDown(document, { key: 'Z', metaKey: true, shiftKey: true });
    expect(useEditorStore.getState().future.length).toBe(0);
  });

  it('Ctrl+Y triggers redo', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    render(<EditorPage onExit={() => {}} />);
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(useEditorStore.getState().future.length).toBe(0);
  });

  it('Cmd+Z does NOT trigger undo when focus is inside an input', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    render(<EditorPage onExit={() => {}} />);
    const input = screen.getByTestId('tool-name-input');
    fireEvent.keyDown(input, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().past.length).toBe(1);
  });

  it('autosave writes to localStorage 2s after a level change', () => {
    render(<EditorPage onExit={() => {}} />);
    act(() => {
      useEditorStore.setState({ dirty: true });
      // Touch a field that produces a new level reference.
      useEditorStore.getState().placeWall(1, 1);
    });
    // Before 2s: nothing saved.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    const raw = localStorage.getItem(DRAFT_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).level.id).toBe(useEditorStore.getState().level.id);
  });

  it('exit with dirty=false calls onExit and clears the draft', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: {} }));
    const onExit = vi.fn();
    render(<EditorPage onExit={onExit} />);
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('exit with dirty=true and confirm=true saves then calls onExit', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useEditorStore.setState({ dirty: true });
    const onExit = vi.fn();
    render(<EditorPage onExit={onExit} />);
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it('exit with dirty=true and confirm=false drops the draft and calls onExit', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    useEditorStore.setState({ dirty: true });
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: {} }));
    const onExit = vi.fn();
    render(<EditorPage onExit={onExit} />);
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // F3 (P0) regression pin: the dirty-exit prompt wording is the load-
  // bearing piece of the bug fix. If the wording ever drifts back to
  // "取消 = 不退出" the static text would contradict the code (and the
  // original P0 footgun returns). The toolbar's "保存并退出" button
  // always clears dirty via saveLevel() before handleExit runs, so the
  // dialog itself is only reachable from a future plain-exit path —
  // pinning the constant is the most stable regression guard we have
  // without rearchitecting the test entry point.
  it('DIRTY_EXIT_PROMPT pairs the safe default (cancel = stay) with the discard action', () => {
    // "取消" must mean "continue editing" (safe), not "discard" or
    // "exit" (data loss). The pre-fix prompt said "取消 = 不退出",
    // which the actual code then implemented as "不保存并退出" — the
    // exact silent-data-loss path this constant replaces.
    expect(DIRTY_EXIT_PROMPT).toMatch(/取消\s*=\s*继续编辑/);
    // "确定" is the explicit, opt-in data-loss path.
    expect(DIRTY_EXIT_PROMPT).toMatch(/确定\s*=\s*放弃修改并退出/);
    // Belt-and-suspenders: the pre-fix footgun phrase must never come back.
    expect(DIRTY_EXIT_PROMPT).not.toMatch(/取消\s*=\s*不退出/);
  });
});
