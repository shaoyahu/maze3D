import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftDrawer } from './EditorLeftDrawer';
import { EditorViewport } from './EditorViewport';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { EditorStatusBar } from './EditorStatusBar';
import { useConfirm } from '../useConfirm';
import { useLevelStore } from '../../store/levelStore';
import { useT } from '../../i18n';

const DRAFT_KEY = 'maze3d.editorDraft.v1';
const AUTOSAVE_DELAY_MS = 2000;
// F-2026-06-17-E-L-3: the dirty-exit dialog wording used to be exposed
// as `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` so the P2-7 test could
// pin the strings. After P2-8 (i18n) landed, the runtime reads the
// dialog text through `t('editor.dirtyExit.*')` — the exports were
// no longer referenced by any production code path. Removed: the
// two exports + the matching test pins.

const PAGE_STYLE = {
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  background: 'var(--bg)',
  color: 'var(--fg)',
};

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
  const t = useT();
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
        title: t('editor.draft.title'),
        message: t('editor.draft.message'),
        actions: [
          { label: t('editor.draft.discard'), value: 'cancel', variant: 'secondary' },
          { label: t('editor.draft.restore'), value: 'ok',     variant: 'primary' },
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
  }, [showDraftPrompt, confirm, loadDraft, t]);

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
        title: t('editor.dirtyExit.title'),
        message: t('editor.dirtyExit.message'),
        actions: [
          { label: t('editor.dirtyExit.save'),    value: 'save',    variant: 'primary'   },
          { label: t('editor.dirtyExit.discard'), value: 'discard', variant: 'danger'    },
          { label: t('editor.dirtyExit.cancel'),  value: 'cancel',  variant: 'secondary' },
        ],
        danger: false,
      });
      if (choice === 'cancel' || choice === null) return;
      if (choice === 'save') {
        const r = useEditorStore.getState().saveLevel();
        if (!r.ok) return; // stay in editor on save failure
        useLevelStore.getState().saveCustom(r.level);
      }
    }
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