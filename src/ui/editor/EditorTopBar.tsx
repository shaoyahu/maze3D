import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import {
  downloadAsJsonFile,
  readJsonFile,
  sanitizeFilename,
  ImportError,
} from '../../maze/importExport';
import type { EditorTool } from '../../maze/types';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useConfirm } from '../useConfirm';
import { useLevelStore } from '../../store/levelStore';
import { useT } from '../../i18n';

const LAST_ERROR_DISPLAY_MS = 3000;

const TOOL_HINT_KEYS: Record<EditorTool, string> = {
  select: 'editor.toolbar.hint.select',
  wall:   'editor.toolbar.hint.wall',
  start:  'editor.toolbar.hint.start',
  exit:   'editor.toolbar.hint.exit',
  pickup: 'editor.toolbar.hint.pickup',
  enemy:  'editor.toolbar.hint.enemy',
  pan:    'editor.toolbar.hint.pan',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

function formatHHMMSS(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface EditorTopBarProps {
  onExit?: () => void;
  onSaveAndExit?: () => void;
}

export function EditorTopBar({ onExit, onSaveAndExit }: EditorTopBarProps): React.ReactElement {
  const t = useT();
  const confirm = useConfirm();
  const tool = useEditorStore((s) => s.tool);
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const updateName = useEditorStore((s) => s.updateName);
  const newLevel = useEditorStore((s) => s.newLevel);
  const saveLevel = useEditorStore((s) => s.saveLevel);
  const exportJson = useEditorStore((s) => s.exportJson);
  const importJson = useEditorStore((s) => s.importJson);
  const lastError = useEditorStore((s) => s.lastError);
  const lastErrorKey = useEditorStore((s) => s.lastErrorKey);
  const clearLastError = useEditorStore((s) => s.clearLastError);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useAutoSave({
    onAutoSaved: (ts) => setStatus({ kind: 'ok', message: t('editor.toolbar.autoSaved', { time: formatHHMMSS(ts) }) }),
    onAutoSaveError: (msg) => setStatus({ kind: 'error', message: t('editor.toolbar.autoSaveError', { msg }) }),
  });

  useEffect(() => {
    if (lastError === null && lastErrorKey === null) return undefined;
    const id = window.setTimeout(() => clearLastError(), LAST_ERROR_DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [lastError, lastErrorKey, clearLastError]);

  const prevDirtyRef = useRef<boolean>(dirty);
  useEffect(() => {
    if (!prevDirtyRef.current && dirty) {
      setStatus({ kind: 'idle' });
    }
    prevDirtyRef.current = dirty;
  }, [dirty]);

  const handleNew = async (): Promise<void> => {
    if (dirty) {
      const choice = await confirm({
        title: t('editor.toolbar.dirtyExitTitle'),
        message: t('editor.toolbar.dirtyNewMessage'),
        actions: [
          { label: t('common.cancel'), value: 'cancel', variant: 'secondary' },
          { label: t('editor.toolbar.ok'), value: 'ok', variant: 'primary' },
        ],
      });
      if (choice !== 'ok') return;
    }
    newLevel(15, 15);
    setStatus({ kind: 'ok', message: t('editor.toolbar.newEmpty') });
  };

  const handleSave = (): void => {
    const result = saveLevel();
    if (result.ok) {
      useLevelStore.getState().saveCustom(result.level);
      setStatus({ kind: 'ok', message: t('editor.toolbar.saved') });
    } else {
      setStatus({ kind: 'error', message: t('editor.toolbar.saveError', { reason: result.error }) });
    }
  };

  const handleSaveAndExit = (): void => {
    const result = saveLevel();
    if (!result.ok) {
      setStatus({ kind: 'error', message: t('editor.toolbar.saveError', { reason: result.error }) });
      return;
    }
    useLevelStore.getState().saveCustom(result.level);
    if (onSaveAndExit) onSaveAndExit();
    else onExit?.();
  };

  const handleExport = (): void => {
    const json = exportJson();
    const filename = `${sanitizeFilename(level.name) || 'level'}.maze3d.json`;
    downloadAsJsonFile(filename, json);
    setStatus({ kind: 'ok', message: t('editor.toolbar.exported', { filename }) });
  };

  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (dirty) {
      const choice = await confirm({
        title: t('editor.toolbar.dirtyExitTitle'),
        message: t('editor.toolbar.dirtyImportMessage'),
        actions: [
          { label: t('common.cancel'), value: 'cancel', variant: 'secondary' },
          { label: t('editor.toolbar.ok'), value: 'ok', variant: 'primary' },
        ],
      });
      if (choice !== 'ok') return;
    }
    try {
      const raw = await readJsonFile(file);
      importJson(raw);
      setStatus({ kind: 'ok', message: t('editor.toolbar.imported', { filename: file.name }) });
    } catch (err) {
      const msg = err instanceof ImportError ? err.message : String(err);
      setStatus({ kind: 'error', message: t('editor.toolbar.importError', { msg }) });
    }
  };

  const display: { kind: 'ok' | 'error'; message: string } | null =
    lastErrorKey !== null
      ? { kind: 'error', message: t(lastErrorKey) }
      : lastError !== null
        ? { kind: 'error', message: lastError }
        : status.kind !== 'idle'
          ? status
          : null;

  return (
    <header data-testid="editor-toolbar" className="editor-topbar">
      <div className="editor-topbar__brand">
        <span className="editor-topbar__brand-mark">
          <span className="editor-topbar__brand-mark__dot" aria-hidden />
          MAZE/3D
        </span>
        <span aria-hidden className="editor-topbar__divider" />
        <input
          type="text"
          value={level.name}
          onChange={(e) => {
            const sanitized = e.target.value
              .replace(/[\r\n]+/g, ' ')
              .slice(0, 64);
            updateName(sanitized);
          }}
          maxLength={64}
          title={t('editor.toolbar.nameTitle')}
          data-testid="tool-name-input"
          aria-label={t('editor.toolbar.nameAria')}
          className="editor-topbar__name"
        />
        {dirty ? (
          <span data-testid="tool-dirty" role="status" aria-live="polite" className="editor-topbar__dirty">
            <span className="editor-topbar__dirty__dot" aria-hidden />
            {t('editor.toolbar.unsaved')}
          </span>
        ) : lastSavedAt != null ? (
          <span className="editor-topbar__saved">{t('editor.toolbar.savedTime', { time: formatHHMMSS(lastSavedAt) })}</span>
        ) : null}
      </div>

      <div className="editor-topbar__hint" data-testid="tool-hint">
        <span className="editor-topbar__hint__tool">{tool.toUpperCase()}</span>
        {' · '}
        {t(TOOL_HINT_KEYS[tool])}
      </div>

      <div className="editor-topbar__actions">
        {display !== null && (
          <span
            data-testid="tool-status"
            className={`editor-chip ${display.kind === 'error' ? 'editor-chip--danger' : 'editor-chip--accent'} editor-topbar__chip-text`}
          >
            <span className="editor-chip__icon">{display.kind === 'error' ? '⚠' : '✓'}</span>
            <span>{display.message}</span>
          </span>
        )}
        <button type="button" onClick={handleNew} data-testid="tool-new" className="editor-topbar__btn editor-topbar__btn--ghost">
          {t('editor.toolbar.new')}
        </button>
        <button type="button" onClick={handleSave} data-testid="tool-save" className="editor-topbar__btn">
          {t('editor.toolbar.save')}
        </button>
        <button
          type="button"
          onClick={handleSaveAndExit}
          data-testid="tool-save-exit"
          className="editor-topbar__btn editor-topbar__btn--primary"
        >
          {t('editor.toolbar.saveAndExit')}
        </button>
        <button type="button" onClick={handleExport} data-testid="tool-export" className="editor-topbar__btn">
          {t('editor.toolbar.export')}
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          data-testid="tool-import"
          className="editor-topbar__btn"
        >
          {t('editor.toolbar.import')}
        </button>
        <button
          type="button"
          onClick={() => onExit?.()}
          data-testid="tool-exit"
          className="editor-topbar__btn editor-topbar__btn--danger"
          title={t('editor.toolbar.exitTitle')}
        >
          {t('editor.toolbar.exit')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.maze3d.json,application/json"
          onChange={handleImportChange}
          data-testid="tool-import-input"
          aria-label={t('editor.toolbar.importAria')}
          style={{ display: 'none' }}
        />
      </div>
    </header>
  );
}