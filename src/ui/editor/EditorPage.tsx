import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { EditorToolbar } from './EditorToolbar';
import { EditorViewport } from './EditorViewport';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { EditorStatusBar } from './EditorStatusBar';
import { useConfirm } from '../useConfirm';

const DRAFT_KEY = 'maze3d.editorDraft.v1';
const AUTOSAVE_DELAY_MS = 2000;
// P2-7: 3-option dirty-exit dialog. Exported so tests can pin the wording
// and prevent the dialog text/behavior from drifting apart. Replaces the
// 2-option "discard?" collapse that the spec's 3-option intent was
// downgraded to under native window.confirm.
export const DIRTY_EXIT_TITLE = '未保存的修改';
export const DIRTY_EXIT_MESSAGE =
  '当前关卡有未保存的修改，请选择操作（继续编辑 = 留在此页）。';
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
  // P2-7: themed confirm dialog replaces native window.confirm().
  const confirm = useConfirm();

  // ---- Draft recovery on mount ----------------------------------------
  // F-L6: StrictMode dev 双调用 useEffect 会让用户进编辑器看 2 次 confirm。
  // ref 标记已处理,保证 confirm 只弹一次(整个组件生命周期)。
  //
  // P2-7: state-driven render — first effect just flips a flag, second
  // effect (gated on that flag) drives the async confirm. This avoids
  // awaiting inside the StrictMode-doubled first effect.
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const draftPromptedRef = useRef(false);
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (draftPromptedRef.current) return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return;
    draftPromptedRef.current = true;
    setShowDraftPrompt(true);
  }, [loadDraft]);

  useEffect(() => {
    if (!showDraftPrompt) return;
    let cancelled = false;
    (async () => {
      const choice = await confirm({
        title: '恢复草稿',
        message: '发现上次未保存的草稿，是否恢复？',
        actions: [
          { label: '放弃', value: 'cancel', variant: 'secondary' },
          { label: '恢复', value: 'ok', variant: 'primary' },
        ],
      });
      if (cancelled) return;
      if (choice === 'ok') {
        loadDraft();
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(DRAFT_KEY);
      }
      setShowDraftPrompt(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showDraftPrompt, confirm, loadDraft]);

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

  const handleExit = async (): Promise<void> => {
    const dirty = useEditorStore.getState().dirty;
    if (dirty) {
      // P2-7: 3-option dirty-exit dialog (save / discard / cancel)
      // replaces the 2-option window.confirm collapse. The save action
      // calls saveLevel() inline; if validation fails we stay in the
      // editor so the user can fix the level. The toolbar's "保存并退出"
      // button still bypasses this dialog by calling saveLevel() itself
      // before invoking onSaveAndExit, so this branch only fires when
      // the user clicks plain "退出" with unsaved work.
      const choice = await confirm({
        title: DIRTY_EXIT_TITLE,
        message: DIRTY_EXIT_MESSAGE,
        actions: [
          { label: '保存并退出', value: 'save', variant: 'primary' },
          { label: '放弃修改', value: 'discard', variant: 'danger' },
          { label: '继续编辑', value: 'cancel', variant: 'secondary' },
        ],
        danger: false,
      });
      if (choice === 'cancel' || choice === null) return;
      if (choice === 'save') {
        const r = useEditorStore.getState().saveLevel();
        if (!r.ok) return; // stay in editor on save failure
      }
      // discard path falls through to clear-draft + onExit.
    }
    // Either clean state, save succeeded, or user explicitly chose to
    // discard: drop the draft so re-entering the editor doesn't restore
    // the abandoned in-memory state.
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
