import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftDrawer } from './EditorLeftDrawer';
import { EditorViewport } from './EditorViewport';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { EditorStatusBar } from './EditorStatusBar';
import { useConfirm } from '../useConfirm';
import { useLevelStore } from '../../store/levelStore';

const DRAFT_KEY = 'maze3d.editorDraft.v1';
const AUTOSAVE_DELAY_MS = 2000;
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

export function EditorPage({ onExit }: EditorPageProps): React.ReactElement {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveDraft = useEditorStore((s) => s.saveDraft);
  const loadDraft = useEditorStore((s) => s.loadDraft);
  const level = useEditorStore((s) => s.level);
  const confirm = useConfirm();

  // ---- Draft recovery on mount ----------------------------------------
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
        useLevelStore.getState().saveCustom(r.level);
      }
      // 'discard' falls through: clear the draft + onExit below.
    }
    // Either clean state, save succeeded, or user explicitly chose to
    // discard. Drop the draft so re-entering the editor doesn't restore
    // the abandoned in-memory state.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DRAFT_KEY);
    }
    onExit();
  };

  return (
    <div data-testid="editor-page" style={PAGE_STYLE}>
      <EditorTopBar onExit={handleExit} onSaveAndExit={handleExit} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <EditorLeftDrawer />
        <EditorViewport />
        <EditorPropertiesPanel />
      </div>
      <EditorStatusBar />
    </div>
  );
}
