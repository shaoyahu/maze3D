import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { EditorTool } from '../../maze/types';
import { EditorTopBar } from './EditorTopBar';
import { EditorLeftPanel } from './EditorLeftPanel';
import { EditorToolbar } from './EditorToolbar';
import { EditorViewport } from './EditorViewport';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';
import { EditorStatusBar } from './EditorStatusBar';
import { EditorTutorialManual } from './EditorTutorialManual';
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
  const setTool = useEditorStore((s) => s.setTool);
  const saveDraft = useEditorStore((s) => s.saveDraft);
  const loadDraft = useEditorStore((s) => s.loadDraft);
  const level = useEditorStore((s) => s.level);
  const confirm = useConfirm();
  // F-2026-06-18: lastError is now surfaced as a modal dialog
  // (see useConfirm below) instead of a toolbar chip, because the
  // chip was 1200px+ from where the user clicked and timed out in
  // 3s — both easy to miss. The modal can't auto-dismiss and the
  // backdrop blocks input until the user explicitly OKs.
  const lastError = useEditorStore((s) => s.lastError);
  const lastErrorKey = useEditorStore((s) => s.lastErrorKey);
  const clearLastError = useEditorStore((s) => s.clearLastError);

  // P2-17: tutorial manual open state. Lives in EditorPage (not
  // editorStore) because it's purely cosmetic UI state that must
  // not affect dirty / history / save. EditorPage owns it because
  // both EditorTopBar (the 📖 button) and EditorViewport (the ESC
  // gate) need to know about it.
  const [manualOpen, setManualOpen] = useState(false);

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

  // P2-17 enhancement: auto-open tutorial manual on first editor visit.
  // Waits for draft prompt to resolve before opening, so two modals
  // never appear simultaneously. Persists via settingsStore so the
  // user can opt out ("don't auto-open next time").
  //
  // F-2026-06-30-M-30 / M-31: the previous implementation used an
  // `autoOpenAttemptedRef` latch that permanently disabled re-auto-open
  // for the lifetime of the EditorPage mount. That was correct for
  // "open at most once on first visit" but it also blocked re-opening
  // if the user dismissed the manual and later toggled the
  // `tutorialManualAutoOpen` setting back on (e.g. a fresh sign-in
  // share-link). The cleaner pattern is to gate the effect on
  // `manualOpen` itself: while the manual is open (or after it has
  // been auto-opened and the user has not yet closed it), the effect
  // is a no-op; once it closes, the effect re-runs and is again a
  // candidate to open — but only if `showDraftPrompt` is done and
  // the user still has the auto-open preference enabled.
  const tutorialManualAutoOpen = useSettingsStore((s) => s.tutorialManualAutoOpen);
  useEffect(() => {
    if (manualOpen) return;
    if (showDraftPrompt) return;
    if (tutorialManualAutoOpen) {
      setManualOpen(true);
    }
  }, [manualOpen, showDraftPrompt, tutorialManualAutoOpen]);

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

  // F-2026-06-18: surface lastError / lastErrorKey as a non-blocking
  // toast at the top-center of the editor. The toast auto-dismisses
  // after 2.5s and never blocks clicks — the user can keep
  // placing/erasing while the previous rejection is still on screen.
  // (Earlier this used a `useConfirm` modal, but the user asked
  // for a *reminder* not a *blocker* — see F-2026-06-18 below.)
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'warn' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastShownIdRef = useRef<number>(0);
  useEffect(() => {
    // F-2026-06-30-H-15: when a `lastErrorKey` is set, prefer the
    // translated string from i18n. If the translator returns the
    // key verbatim (i.e. the key is missing from the active locale),
    // fall back to the raw `lastError` message — which the editor
    // store populates with a non-localized human-readable sentence.
    // This way an unfinished translation never shows a raw i18n key
    // in the toast; the user always gets a real sentence.
    const translated = lastErrorKey !== null ? t(lastErrorKey) : null;
    const message = translated !== null && translated !== lastErrorKey ? translated : lastError;
    if (message === null) return;
    // Bump the id even on identical messages so consecutive rejections
    // still restart the fade-out timer.
    lastShownIdRef.current += 1;
    const id = lastShownIdRef.current;
    setToast({ id, message, tone: 'warn' });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
      clearLastError();
      toastTimerRef.current = null;
    }, 2500);
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [lastError, lastErrorKey, clearLastError, t]);

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
  // - ⌘Z / ⌘⇧Z / ⌘Y: undo / redo (also Ctrl on non-mac)
  // - V / W / B / S / E / P / M / H: switch the active placement tool.
  //   Mirrors the shortcuts shown on the toolbar chips, so the user
  //   doesn't have to reach for the mouse after learning them visually.
  //   Skip when focus is in an editable field (so typing "w" in the
  //   level name doesn't switch to the wall tool).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!isUndoRedoTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
        }
        return;
      }
      // No modifier — single-key tool switch. lowercased so Caps Lock
      // doesn't break the binding.
      const toolKey = e.key.toLowerCase();
      const TOOL_SHORTCUTS: Record<string, EditorTool> = {
        v: 'select',
        w: 'wall',
        b: 'erase',
        s: 'start',
        e: 'exit',
        p: 'pickup',
        m: 'enemy',
        h: 'pan',
      };
      const next = TOOL_SHORTCUTS[toolKey];
      if (next !== undefined) {
        e.preventDefault();
        setTool(next);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo, setTool]);

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
      {/* F-2026-06-30-M-33: skip link. The editor page is dense with
          chrome (top bar, three side panels, status bar) and the
          viewport is the primary working surface. A keyboard-only
          user tabbing from the URL bar otherwise walks the whole
          toolbar tree before reaching the canvas. The link is
          visually hidden until focused, then jumps to the viewport
          element. The id is set on EditorViewport's wrapper (see
          data-testid="editor-viewport" + id="editor-viewport"). */}
      <a
        href="#editor-viewport"
        style={{
          position: 'absolute',
          left: -9999,
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
        onFocus={(e) => {
          e.currentTarget.style.position = 'fixed';
          e.currentTarget.style.left = '12px';
          e.currentTarget.style.top = '12px';
          e.currentTarget.style.width = 'auto';
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.zIndex = '9999';
        }}
        onBlur={(e) => {
          e.currentTarget.style.position = 'absolute';
          e.currentTarget.style.left = '-9999px';
          e.currentTarget.style.top = 'auto';
          e.currentTarget.style.width = '1px';
          e.currentTarget.style.height = '1px';
        }}
      >
        跳到主内容
      </a>
      <EditorTopBar onExit={handleExit} onSaveAndExit={handleExit} onTutorialManual={() => setManualOpen(true)} />
      {/* P2-13.8: 三栏 — 左 / 中(顶部 toolbar + viewport) / 右,三栏
          都在 outer row 平行,各自跨越整个高度。右栏(属性)跟左栏
          (文件树)一样"独立成栏" — 不再挤在 middle column 的 inner row
          里,工具行因此不再出现在属性栏"上方那一行"。 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <EditorLeftPanel />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <EditorToolbar />
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <EditorViewport anyOverlayOpen={manualOpen} />
          </div>
        </div>
        <EditorPropertiesPanel />
      </div>
      <EditorStatusBar />
      {/* F-2026-06-18: non-blocking lastError toast. `pointer-events:
          none` on the wrapper means the user can keep clicking cells
          while a previous rejection's message is still on screen —
          no OK button, no backdrop, just a 2.5s reminder. */}
      {toast !== null && (
        <div
          className="editor-toast"
          role="status"
          aria-live="polite"
          data-testid="editor-toast"
        >
          <span className="editor-toast__icon" aria-hidden>!</span>
          <div className="editor-toast__body">{toast.message}</div>
        </div>
      )}
      {/* P2-17: Tutorial manual overlay. Rendered as a portal so it
          sits above the entire editor layout. */}
      <EditorTutorialManual open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}