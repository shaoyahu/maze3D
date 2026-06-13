import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import {
  EditorPage,
  DIRTY_EXIT_TITLE,
  DIRTY_EXIT_MESSAGE,
} from '../../../src/ui/editor/EditorPage';
import { useEditorStore } from '../../../src/store/editorStore';
import { useLevelStore } from '../../../src/store/levelStore';
import { ConfirmProvider } from '../../../src/ui/useConfirm';

const DRAFT_KEY = 'maze3d.editorDraft.v1';

function resetEditor(): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: {
      id: 'custom-test-level',
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

function renderPage(props: { onExit?: () => void } = {}): ReturnType<typeof render> {
  return render(
    <ConfirmProvider>
      <EditorPage onExit={props.onExit ?? (() => {})} />
    </ConfirmProvider>,
  );
}

// P2-7: EditorPage migrated from `window.confirm()` to `useConfirm()`.
// These tests use the themed dialog DOM via testids (`confirm-dialog`,
// `confirm-title`, `confirm-action-{value}`) instead of spying on the
// native window.confirm. Global fake timers are intentionally avoided
// here because async dialog tests use `findByTestId` which polls real
// time — the autosave test enables fake timers locally only.
describe('EditorPage (P2-7 ConfirmProvider)', () => {
  beforeEach(() => {
    resetEditor();
  });

  it('renders editor-page container with toolbar, viewport, properties panel, and status bar', () => {
    renderPage();
    expect(screen.getByTestId('editor-page')).toBeInTheDocument();
    expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('editor-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('editor-properties-panel')).toBeInTheDocument();
    expect(screen.getByTestId('editor-status-bar')).toBeInTheDocument();
  });

  it('does not show a confirm dialog on mount when no draft exists', async () => {
    renderPage();
    // Allow the mount-time draft-check useEffect to run; with no draft
    // the effect short-circuits before flipping `showDraftPrompt`.
    await Promise.resolve();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('shows the draft-recovery dialog on mount when a draft exists', async () => {
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
    renderPage();
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('confirm-title').textContent).toMatch(/恢复草稿/);
  });

  it('loads the draft when the user clicks 恢复 (confirm-action-ok)', async () => {
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
    renderPage();
    await screen.findByTestId('confirm-dialog');
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    await waitFor(() => {
      expect(useEditorStore.getState().level.id).toBe('draft-level');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
  });

  it('drops the draft when the user clicks 放弃 (confirm-action-cancel)', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
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
      }),
    );
    renderPage();
    await screen.findByTestId('confirm-dialog');
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-cancel'));
    });
    await waitFor(() => {
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
  });

  // B-M4 regression: when the user navigates away from the editor (or
  // otherwise unmounts EditorPage) while the draft-recovery confirm
  // dialog is still up, the post-await code must not run on the
  // unmounted tree.
  //
  // Mechanism:
  //   1. Mount with a draft in localStorage -> the confirm dialog appears.
  //   2. EditorPage's effect cleanup (added in cf8c586f) flips
  //      `cancelled = true`.
  //   3. useConfirm's Provider unmount cleanup (src/ui/useConfirm.ts:141-150)
  //      resolves the pending confirm promise with `null`.
  //   4. The post-await code hits `if (cancelled) return;` at line 86
  //      and skips `loadDraft()`, `localStorage.removeItem(DRAFT_KEY)`,
  //      and `setShowDraftPrompt(false)`.
  //
  // Observable consequence if the guard is removed: the `else` branch
  // (choice !== 'ok', and choice is null after Provider unmount) calls
  // `localStorage.removeItem(DRAFT_KEY)`, wiping the draft.
  it('unmounting while the draft-recovery confirm is pending preserves the draft (B-M4)', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
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
      }),
    );
    const { unmount } = renderPage();
    // Confirm the dialog is up so we know the async function is awaiting.
    await screen.findByTestId('confirm-dialog');
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    // User navigates away (or the editor is otherwise torn down) while
    // the confirm is still pending. EditorPage effect cleanup sets
    // cancelled=true; Provider unmount cleanup resolves confirm with null.
    unmount();
    // Yield so any pending microtasks flush.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    // The guard must have short-circuited the post-await code, so the
    // draft is still in localStorage. If the guard were missing, the
    // `else` branch (choice !== 'ok', with choice=null after Provider
    // unmount) would have removed the key.
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('Cmd/Ctrl+Z triggers undo when focus is not in an input', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    renderPage();
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it('Cmd/Ctrl+Shift+Z triggers redo', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    renderPage();
    fireEvent.keyDown(document, { key: 'Z', metaKey: true, shiftKey: true });
    expect(useEditorStore.getState().future.length).toBe(0);
  });

  it('Ctrl+Y triggers redo', () => {
    const futureLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ future: [{ level: futureLevel, selection: null }] });
    renderPage();
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(useEditorStore.getState().future.length).toBe(0);
  });

  it('Cmd+Z does NOT trigger undo when focus is inside an input', () => {
    const pastLevel = { ...useEditorStore.getState().level };
    useEditorStore.setState({ past: [{ level: pastLevel, selection: null }] });
    renderPage();
    const input = screen.getByTestId('tool-name-input');
    fireEvent.keyDown(input, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().past.length).toBe(1);
  });

  it('autosave writes the draft to localStorage 2s after a level change', () => {
    // Local fake timers — the file otherwise uses real timers so that
    // async dialog tests can rely on `findByTestId` polling.
    vi.useFakeTimers();
    try {
      renderPage();
      act(() => {
        useEditorStore.getState().placeWall(1, 1);
      });
      // Before the 2s debounce elapses, nothing is persisted.
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      const raw = localStorage.getItem(DRAFT_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).level.id).toBe(useEditorStore.getState().level.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('save-and-exit with dirty=false calls onExit and clears the draft', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ level: {} }));
    const onExit = vi.fn();
    renderPage({ onExit });
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // The "保存并退出" button always saves first inside EditorToolbar, so by
  // the time handleExit's dirty check runs the level has been persisted
  // and dirty has already flipped to false. The 3-option dirty-exit
  // dialog therefore stays unreachable through this UI path; assert
  // that no confirm-dialog ever appears here.
  it('save-and-exit with dirty=true saves then calls onExit without showing the 3-option dialog', () => {
    useEditorStore.setState({ dirty: true });
    const onExit = vi.fn();
    renderPage({ onExit });
    fireEvent.click(screen.getByTestId('tool-save-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  // P2-7 regression PINs for the 3-option dirty-exit dialog wording.
  // The dialog itself is currently unreachable through the toolbar UI
  // (the "保存并退出" button clears dirty before handleExit's dirty
  // check runs), but the constants are still wired into handleExit so
  // a future "plain exit" entry point will reuse the same wording.
  // Pinning the strings is the most stable guard against drift between
  // intent ("safe stay" default) and code.
  it('DIRTY_EXIT_TITLE matches the "未保存的修改" intent', () => {
    expect(DIRTY_EXIT_TITLE).toMatch(/未保存的修改/);
  });

  it('DIRTY_EXIT_MESSAGE describes the three-option choice with a safe-stay hint', () => {
    expect(DIRTY_EXIT_MESSAGE).toMatch(/未保存的修改/);
    expect(DIRTY_EXIT_MESSAGE).toMatch(/继续编辑/);
    expect(DIRTY_EXIT_MESSAGE).toMatch(/留在此页/);
  });
});
