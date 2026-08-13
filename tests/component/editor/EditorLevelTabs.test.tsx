// P3-1c H-1 fix: EditorLevelTabs component test.
//
// Covers the multi-level tab bar that was missing from the editor UI:
//   - Renders N tabs for levelCount = N
//   - Active tab matches currentLevel
//   - Click a tab → setCurrentLevel
//   - + button → addLevel, - button → removeLevel (after confirm)
//
// Uses ConfirmProvider because removeLevel pops a confirmation dialog
// (the spec asks for an undo path so the user doesn't accidentally nuke
// a layer with placed entities).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EditorLevelTabs } from '../../../src/ui/editor/LevelTabs';
import { ConfirmProvider } from '../../../src/ui/useConfirm';
import { useEditorStore } from '../../../src/store/editorStore';
import { resetEditor } from '../../_helpers/editorMocks';
import type { CellType } from '../../../src/maze/types';

beforeEach(() => {
  resetEditor();
});

describe('EditorLevelTabs (P3-1c H-1)', () => {
  it('renders a single L1 tab when levelCount is 1 (default)', () => {
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    expect(screen.getByTestId('level-tab-0')).toBeInTheDocument();
    expect(screen.queryByTestId('level-tab-1')).toBeNull();
  });

  it('marks the active tab with aria-selected=true and the --active class', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 3 } });
    useEditorStore.setState({ currentLevel: 1 });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    const tab0 = screen.getByTestId('level-tab-0');
    const tab1 = screen.getByTestId('level-tab-1');
    expect(tab0).toHaveAttribute('aria-selected', 'false');
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(tab1.className).toMatch(/editor-leveltabs__tab--active/);
  });

  it('clicking a tab calls setCurrentLevel', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 3 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('level-tab-2'));
    expect(useEditorStore.getState().currentLevel).toBe(2);
  });

  it('+ button calls addLevel and bumps levelCount by 1', () => {
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    expect(useEditorStore.getState().level.levelCount ?? 1).toBe(1);
    fireEvent.click(screen.getByTestId('level-add'));
    expect(useEditorStore.getState().level.levelCount).toBe(2);
  });

  it('+ button is disabled at the 6-layer cap', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 6 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    const addBtn = screen.getByTestId('level-add');
    expect(addBtn).toBeDisabled();
    expect(addBtn.getAttribute('data-disabled')).toBe('true');
  });

  // P1-5: addLevelEmpty — second addLevel variant. The `+ ∅` button
  // calls addLevelEmpty (which adds an empty grid rather than a
  // clone). Same 1..6 clamp, same data-testid pattern as `+`.
  it('+ ∅ button calls addLevelEmpty and bumps levelCount by 1', () => {
    // Start with a 2-layer level that has a non-trivial top
    // layer (so the "empty" assertion is meaningful — if the
    // implementation accidentally cloned the top, the new L2
    // would carry the pattern instead of being all 0).
    const topWithWalls: CellType[][] = [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ];
    useEditorStore.setState({
      level: {
        ...useEditorStore.getState().level,
        levelCount: 2,
        walls2d: [
          useEditorStore.getState().level.walls!.map((r) => r.slice()),
          topWithWalls.map((r) => r.slice()),
        ],
        walls: undefined,
      },
      currentLevel: 1,
    });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('level-add-empty'));
    const after = useEditorStore.getState().level;
    expect(after.levelCount).toBe(3);
    expect(after.walls2d).toHaveLength(3);
    // The new L2 is all 0 — not a clone of the previous top.
    const allEmpty = after.walls2d![2]!.every((row) =>
      row.every((c) => c === 0),
    );
    expect(allEmpty).toBe(true);
  });

  it('+ ∅ button is disabled at the 6-layer cap', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 6 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    const addEmptyBtn = screen.getByTestId('level-add-empty');
    expect(addEmptyBtn).toBeDisabled();
    expect(addEmptyBtn.getAttribute('data-disabled')).toBe('true');
  });

  it('- button is disabled at levelCount=1 (cannot remove the bottom layer)', () => {
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    const rmBtn = screen.getByTestId('level-remove');
    expect(rmBtn).toBeDisabled();
    expect(rmBtn.getAttribute('data-disabled')).toBe('true');
  });

  it('clicking - opens a confirmation dialog and only removes on confirm', async () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 3 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('level-remove'));
    // Dialog buttons expose data-testid="confirm-action-{value}".
    // Our confirm() uses value: 'ok' for the danger action and
    // 'cancel' for the safe one — see EditorLevelTabs.tsx:39-46.
    // waitFor handles the async setState that mounts the dialog.
    const okBtn = await screen.findByTestId('confirm-action-ok');
    await act(async () => {
      fireEvent.click(okBtn);
    });
    await waitFor(() => {
      expect(useEditorStore.getState().level.levelCount).toBe(2);
    });
  });

  it('clicking - and then cancelling leaves levelCount unchanged', async () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 3 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('level-remove'));
    const cancelBtn = await screen.findByTestId('confirm-action-cancel');
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    expect(useEditorStore.getState().level.levelCount).toBe(3);
  });

  it('renders 6 tabs when levelCount is 6 (the cap)', () => {
    useEditorStore.setState({ level: { ...useEditorStore.getState().level, levelCount: 6 } });
    render(<ConfirmProvider><EditorLevelTabs /></ConfirmProvider>);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`level-tab-${i}`)).toBeInTheDocument();
    }
  });
});
