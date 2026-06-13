import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import {
  downloadAsJsonFile,
  readJsonFile,
  sanitizeFilename,
} from '../../maze/importExport';
import { ImportError } from '../../maze/importExport';
import type { EditorTool } from '../../maze/types';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useConfirm } from '../useConfirm';

// F-2026-06-12-H1: how long a `lastError` from the store stays visible
// before the toolbar auto-clears it. Long enough to read, short enough
// that a stale message from an earlier click doesn't haunt the user.
const LAST_ERROR_DISPLAY_MS = 3000;

const TOOLS: readonly { tool: EditorTool; label: string; hint: string }[] = [
  { tool: 'select', label: '选择', hint: 'V' },
  { tool: 'wall', label: '墙', hint: 'W' },
  { tool: 'start', label: '起点', hint: 'S' },
  { tool: 'exit', label: '终点', hint: 'E' },
  { tool: 'pickup', label: '拾取', hint: 'P' },
  { tool: 'enemy', label: '敌人', hint: 'M' },
  { tool: 'pan', label: '平移', hint: 'H' },
];

const TOOLBAR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel)',
  flexWrap: 'wrap' as const,
};

const TOOL_BTN_BASE = {
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 13,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--fg)',
};
const TOOL_BTN_ACTIVE = {
  background: 'var(--accent)',
  color: '#1a1a1a',
  borderColor: 'var(--accent)',
};
const TOOL_BTN_DISABLED = {
  opacity: 0.4,
  cursor: 'not-allowed',
};

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

// F-2026-06-12-F1: format a wall-clock ms timestamp as HH:MM:SS for the
// "已自动保存 HH:MM:SS" status string. The toolbar runs in a single
// time zone, so the user's local clock is the right one to show.
function formatHHMMSS(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface EditorToolbarProps {
  onExit?: () => void;
  onSaveAndExit?: () => void;
}

export function EditorToolbar({ onExit, onSaveAndExit }: EditorToolbarProps) {
  // P2-7: themed confirm dialog replaces native window.confirm().
  const confirm = useConfirm();
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const newLevel = useEditorStore((s) => s.newLevel);
  const saveLevel = useEditorStore((s) => s.saveLevel);
  const updateName = useEditorStore((s) => s.updateName);
  const exportJson = useEditorStore((s) => s.exportJson);
  const importJson = useEditorStore((s) => s.importJson);
  // F-2026-06-12-H1: subscribe to the store's `lastError` so silent-reject
  // feedback (e.g. "无法在起点放置墙") is surfaced in the status area
  // alongside save/import results. Auto-clears after LAST_ERROR_DISPLAY_MS.
  const lastError = useEditorStore((s) => s.lastError);
  const clearLastError = useEditorStore((s) => s.clearLastError);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // F-2026-06-12-F1: wire the auto-save hook. On each 30s tick, the
  // hook calls saveLevel() iff dirty. We surface a "已自动保存
  // HH:MM:SS" status on success and a "自动保存失败: ..." status on
  // validator failure. The B1 effect (rising edge of `dirty`) clears
  // any local status as soon as the user makes a new edit, so the
  // "已自动保存" message never coexists with "● 未保存".
  useAutoSave({
    onAutoSaved: (ts) => setStatus({ kind: 'ok', message: `已自动保存 ${formatHHMMSS(ts)}` }),
    onAutoSaveError: (msg) => setStatus({ kind: 'error', message: `自动保存失败：${msg}` }),
  });

  useEffect(() => {
    if (lastError === null) return undefined;
    const id = window.setTimeout(() => clearLastError(), LAST_ERROR_DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [lastError, clearLastError]);

  // F-2026-06-12-B1: when the user makes a new edit (dirty→true) any
  // prior local "已保存" message is stale — clear it so the toolbar
  // never shows "已保存" + "● 未保存" at the same time. Track the
  // previous value to detect the rising edge.
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
    setStatus(
      result.ok
        ? { kind: 'ok', message: '已保存' }
        : { kind: 'error', message: `保存失败：${result.error}` },
    );
  };

  const handleSaveAndExit = (): void => {
    const result = saveLevel();
    if (!result.ok) {
      setStatus({ kind: 'error', message: `保存失败：${result.error}` });
      return;
    }
    onSaveAndExit?.() ?? onExit?.();
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
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    // F-N4: don't silently overwrite unsaved work. importJson clears
    // past/future + resets dirty, so a single click can obliterate
    // 10 minutes of editing. Match handleNew's confirm pattern.
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

  return (
    <div data-testid="editor-toolbar" style={TOOLBAR_STYLE}>
      <div style={{ display: 'flex', gap: 4 }} role="toolbar" aria-label="Editor tools">
        {TOOLS.map(({ tool: t, label, hint }) => {
          const active = tool === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              data-testid={`tool-${t}`}
              aria-pressed={active}
              title={hint}
              style={{
                ...TOOL_BTN_BASE,
                ...(active ? TOOL_BTN_ACTIVE : {}),
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        data-testid="tool-undo"
        title="撤销 (Cmd/Ctrl+Z)"
        style={{ ...TOOL_BTN_BASE, ...(canUndo ? {} : TOOL_BTN_DISABLED) }}
      >
        ↶ 撤销
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        data-testid="tool-redo"
        title="重做 (Cmd/Ctrl+Shift+Z)"
        style={{ ...TOOL_BTN_BASE, ...(canRedo ? {} : TOOL_BTN_DISABLED) }}
      >
        ↷ 重做
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

      <input
        type="text"
        value={level.name}
        // F-project-review-2026-06-13-D-1: clamp the level name so a
        // single paste can't balloon `maze3d.editorDraft.v1` autosaves
        // (a 10k-char CJK string × every-2s draft = a quick way to hit
        // the 5MB localStorage quota). Newlines are collapsed to spaces
        // so the name stays single-line in the toolbar input and the
        // exported JSON. The cap matches the public/levels/*.json
        // authoring limit (64 chars, ASCII-or-CJK mixed).
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
        style={{
          padding: '4px 8px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--fg)',
          fontSize: 13,
          minWidth: 160,
        }}
      />
      {dirty && (
        <span data-testid="tool-dirty" style={{ color: 'var(--accent)', fontSize: 13 }}>
          ● 未保存
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={handleNew}
        data-testid="tool-new"
        style={TOOL_BTN_BASE}
      >
        新建
      </button>
      <button
        type="button"
        onClick={handleSave}
        data-testid="tool-save"
        style={TOOL_BTN_BASE}
      >
        保存
      </button>
      <button
        type="button"
        onClick={handleSaveAndExit}
        data-testid="tool-save-exit"
        style={TOOL_BTN_BASE}
      >
        保存并退出
      </button>
      <button
        type="button"
        onClick={handleExport}
        data-testid="tool-export"
        style={TOOL_BTN_BASE}
      >
        导出
      </button>
      <button
        type="button"
        onClick={handleImportClick}
        data-testid="tool-import"
        style={TOOL_BTN_BASE}
      >
        导入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.maze3d.json,application/json"
        onChange={handleImportChange}
        data-testid="tool-import-input"
        style={{ display: 'none' }}
      />

      {(() => {
        // F-2026-06-12-H1: `lastError` (from silent-reject placement
        // actions) takes priority over the local `status` (from
        // save/import/new). Compute a single display tuple so the JSX
        // below stays readable.
        const display: { kind: 'ok' | 'error'; message: string } | null =
          lastError !== null
            ? { kind: 'error', message: lastError }
            : status.kind !== 'idle'
              ? status
              : null;
        if (display === null) return null;
        return (
          <span
            data-testid="tool-status"
            style={{
              fontSize: 12,
              color: display.kind === 'error' ? 'var(--danger)' : 'var(--accent)',
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {display.message}
          </span>
        );
      })()}
    </div>
  );
}
