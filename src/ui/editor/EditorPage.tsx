import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { EditorToolbar } from './EditorToolbar';
import { EditorViewport } from './EditorViewport';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { EditorStatusBar } from './EditorStatusBar';

const DRAFT_KEY = 'maze3d.editorDraft.v1';
const AUTOSAVE_DELAY_MS = 2000;
// F3 (P0): exported so tests can pin the wording and prevent the dialog
// text/behavior from drifting apart again. Native window.confirm only has
// 2 buttons, so the spec's "保存 / 不保存 / 取消" 3-option intent is
// collapsed to a "discard?" prompt with a SAFE default — "确定" = discard
// & exit, "取消" = continue editing. The "save & exit" path is reached
// via the toolbar's "保存并退出" button (handleSaveAndExit's saveLevel
// call clears dirty before handleExit sees it).
export const DIRTY_EXIT_PROMPT =
  '当前关卡有未保存的修改。\n（取消 = 继续编辑，确定 = 放弃修改并退出）';
const PAGE_STYLE = {
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  background: 'var(--bg)',
  color: 'var(--fg)',
};

// Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo) — applied to the
// editor only when focus is NOT inside a text field, so the user can still
// undo native text edits inside the toolbar's name input or any number
// field in the properties panel.
function isUndoRedoTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (target.isContentEditable) return false;
  return true;
}

export interface EditorPageProps {
  onExit: () => void;
}

export function EditorPage({ onExit }: EditorPageProps) {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveDraft = useEditorStore((s) => s.saveDraft);
  const loadDraft = useEditorStore((s) => s.loadDraft);
  const level = useEditorStore((s) => s.level);

  // ---- Draft recovery on mount ----------------------------------------
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return;
    if (window.confirm('发现上次未保存的草稿，是否恢复？')) {
      loadDraft();
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [loadDraft]);

  // ---- Autosave: 2s debounce on level identity change ------------------
  // Reference equality on `level` is enough — every mutating action builds
  // a new MazeData object, so an unchanged level won't re-fire the timer.
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      saveDraft();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [level, saveDraft]);

  // ---- Global keyboard shortcuts --------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!isUndoRedoTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleExit = (): void => {
    const dirty = useEditorStore.getState().dirty;
    if (dirty) {
      // F3 (P0) + FR-33: native confirm is binary, so we collapse the
      // spec's 3-option "保存 / 不保存 / 取消" prompt to a 2-option
      // "discard?" prompt with a SAFE default. "确定" = explicit data
      // loss (discard & exit); "取消" = continue editing (no work lost).
      // The "save & exit" path is handled by the toolbar's "保存并退出"
      // button, which calls saveLevel() first and falls through to
      // handleExit with dirty=false — so this dialog is never reached
      // from that button (the existing tests pin that behavior).
      const discard = window.confirm(DIRTY_EXIT_PROMPT);
      if (!discard) return;
    }
    // Either clean state, or user explicitly chose to discard: drop the
    // draft so re-entering the editor doesn't restore the abandoned
    // in-memory state.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DRAFT_KEY);
    }
    onExit();
  };

  return (
    <div data-testid="editor-page" style={PAGE_STYLE}>
      <EditorToolbar onExit={handleExit} onSaveAndExit={handleExit} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <EditorViewport />
        </div>
        <EditorPropertiesPanel />
      </div>
      <EditorStatusBar />
    </div>
  );
}
