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

// F-2026-06-12-H1: how long a `lastError` from the store stays visible
// before the toolbar auto-clears it. Exported so the auto-clear test
// pins this exact value instead of a magic 3050ms offset.
export const LAST_ERROR_DISPLAY_MS = 3000;

// Tool → human hint string shown in the topbar center.
const TOOL_HINTS: Record<EditorTool, string> = {
  select: '点击对象查看属性',
  wall:   '在格子上点击放置墙体 · 右键拖动平移',
  start:  '点击格子设置玩家起点',
  exit:   '点击格子设置出口',
  pickup: '点击格子放置拾取物',
  enemy:  '点击格子放置敌人 · 选中后在右侧编辑路径',
  pan:    '右键拖动平移视图',
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
  const clearLastError = useEditorStore((s) => s.clearLastError);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useAutoSave({
    onAutoSaved: (ts) => setStatus({ kind: 'ok', message: `已自动保存 ${formatHHMMSS(ts)}` }),
    onAutoSaveError: (msg) => setStatus({ kind: 'error', message: `自动保存失败：${msg}` }),
  });

  useEffect(() => {
    if (lastError === null) return undefined;
    const id = window.setTimeout(() => clearLastError(), LAST_ERROR_DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [lastError, clearLastError]);

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
        title: '未保存的修改',
        message: '当前关卡有未保存的修改，确定新建？',
        actions: [
          { label: '取消', value: 'cancel', variant: 'secondary' },
          { label: '确定', value: 'ok', variant: 'primary' },
        ],
      });
      if (choice !== 'ok') return;
    }
    newLevel(15, 15);
    setStatus({ kind: 'ok', message: '已新建 15×15 空关卡' });
  };

  const handleSave = (): void => {
    const result = saveLevel();
    if (result.ok) {
      useLevelStore.getState().saveCustom(result.level);
      setStatus({ kind: 'ok', message: '已保存' });
    } else {
      setStatus({ kind: 'error', message: `保存失败：${result.error}` });
    }
  };

  const handleSaveAndExit = (): void => {
    const result = saveLevel();
    if (!result.ok) {
      setStatus({ kind: 'error', message: `保存失败：${result.error}` });
      return;
    }
    useLevelStore.getState().saveCustom(result.level);
    // Prefer onSaveAndExit, fall back to onExit. The previous
    // `onSaveAndExit?.() ?? onExit?.()` form was buggy: a void function
    // returns undefined, and `undefined ?? x` evaluates `x`, so when
    // both props were defined BOTH callbacks fired. Branch explicitly.
    if (onSaveAndExit) onSaveAndExit();
    else onExit?.();
  };

  const handleExport = (): void => {
    const json = exportJson();
    const filename = `${sanitizeFilename(level.name) || 'level'}.maze3d.json`;
    downloadAsJsonFile(filename, json);
    setStatus({ kind: 'ok', message: `已导出 ${filename}` });
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
        title: '未保存的修改',
        message: '当前关卡有未保存的修改，确定导入？',
        actions: [
          { label: '取消', value: 'cancel', variant: 'secondary' },
          { label: '确定', value: 'ok', variant: 'primary' },
        ],
      });
      if (choice !== 'ok') return;
    }
    try {
      const raw = await readJsonFile(file);
      importJson(raw);
      setStatus({ kind: 'ok', message: `已导入 ${file.name}` });
    } catch (err) {
      const msg = err instanceof ImportError ? err.message : String(err);
      setStatus({ kind: 'error', message: `导入失败：${msg}` });
    }
  };

  const display: { kind: 'ok' | 'error'; message: string } | null =
    lastError !== null
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
          title="最长 64 字符，换行会被替换成空格"
          data-testid="tool-name-input"
          aria-label="关卡名"
          className="editor-topbar__name"
        />
        {dirty ? (
          <span data-testid="tool-dirty" role="status" aria-live="polite" className="editor-topbar__dirty">
            <span className="editor-topbar__dirty__dot" aria-hidden />
            未保存
          </span>
        ) : lastSavedAt != null ? (
          <span className="editor-topbar__saved">已保存 · {formatHHMMSS(lastSavedAt)}</span>
        ) : null}
      </div>

      <div className="editor-topbar__hint" data-testid="tool-hint">
        <span className="editor-topbar__hint__tool">{tool.toUpperCase()}</span>
        {' · '}
        {TOOL_HINTS[tool]}
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
          新建
        </button>
        <button type="button" onClick={handleSave} data-testid="tool-save" className="editor-topbar__btn">
          保存
        </button>
        <button
          type="button"
          onClick={handleSaveAndExit}
          data-testid="tool-save-exit"
          className="editor-topbar__btn editor-topbar__btn--primary"
        >
          保存并退出
        </button>
        <button type="button" onClick={handleExport} data-testid="tool-export" className="editor-topbar__btn">
          导出
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          data-testid="tool-import"
          className="editor-topbar__btn"
        >
          导入
        </button>
        <button
          type="button"
          onClick={() => onExit?.()}
          data-testid="tool-exit"
          className="editor-topbar__btn editor-topbar__btn--danger"
          title="退出编辑器"
        >
          退出
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.maze3d.json,application/json"
          onChange={handleImportChange}
          data-testid="tool-import-input"
          aria-label="导入关卡文件"
          style={{ display: 'none' }}
        />
      </div>
    </header>
  );
}
