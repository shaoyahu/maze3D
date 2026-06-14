import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store/editorStore';
import { validateDesign, type ValidationIssue } from './editorValidation';
import { SCHEMA_VERSION } from '../../maze/types';
import type { MazeData } from '../../maze/types';

// 24h HH:MM:SS format; locale-independent so the status reads the same
// everywhere (spec FR-32 calls for a clock-style timestamp).
function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function wallCount(level: MazeData): number {
  let n = 0;
  for (const row of level.walls) {
    for (const cell of row) {
      if (cell === 1) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Warnings popup — opens when the user clicks the warning chip in the
// status bar. Lists every ValidationIssue (warnings + errors) returned by
// validateDesign(level), each tagged with its severity and `where`.
// ---------------------------------------------------------------------------
function WarningsPopup({
  issues,
  onClose,
}: {
  issues: ValidationIssue[];
  onClose: () => void;
}): React.ReactElement | null {
  // Esc-to-close + minimal a11y wiring: role="dialog", aria-modal,
  // focus the close button on open so Enter / Space dismisses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdrop = (_e: ReactMouseEvent<HTMLDivElement>): void => onClose();
  const stop = (e: ReactMouseEvent<HTMLDivElement>): void => e.stopPropagation();
  const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-testid="warnings-popup-backdrop"
      className="warnings-popup__backdrop"
      onClick={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="warnings-popup-title"
        data-testid="warnings-popup"
        className="warnings-popup__card"
        onClick={stop}
        onKeyDown={handleKey}
      >
        <div className="warnings-popup__header">
          <h2 id="warnings-popup-title" className="warnings-popup__title">
            关卡检查 · {issues.length} 项
          </h2>
          <button
            type="button"
            data-testid="warnings-popup-close"
            aria-label="关闭"
            className="warnings-popup__close"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </div>
        {issues.length === 0 ? (
          <div className="warnings-popup__empty">无问题</div>
        ) : (
          <ul className="warnings-popup__list" data-testid="warnings-popup-list">
            {issues.map((issue, i) => (
              <li
                key={i}
                className={`warnings-popup__item warnings-popup__item--${issue.severity}`}
                data-testid={`warnings-popup-item-${i}`}
                data-severity={issue.severity}
              >
                <span className="warnings-popup__severity">
                  {issue.severity === 'error' ? '⛔' : '⚠'}
                </span>
                <span className="warnings-popup__message">{issue.message}</span>
                {issue.where !== undefined && (
                  <span className="warnings-popup__where">{issue.where}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function EditorStatusBar(): React.ReactElement {
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const lastDraftError = useEditorStore((s) => s.lastDraftError);
  const clearStorageFull = useEditorStore((s) => s.clearStorageFull);

  // Issues are recomputed on every render — validateDesign is a pure
  // function over the in-memory level and is cheap (single BFS for the
  // reachability check, O(w*h + enemies) for the rest).
  const issues = validateDesign(level);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const totalIssues = issues.length;

  const [popupOpen, setPopupOpen] = useState(false);

  return (
    <div data-testid="editor-status-bar" className="editor-statusbar">
      <span
        data-testid="status-dirty"
        className={`editor-chip ${dirty ? 'editor-chip--accent' : ''}`}
      >
        <span className="editor-chip__icon">{dirty ? '●' : '✓'}</span>
        <span>
          {dirty ? '未保存' : lastSavedAt != null ? `已保存 ${formatClock(lastSavedAt)}` : '未改动'}
        </span>
      </span>

      <button
        type="button"
        data-testid="status-warnings"
        className={`editor-chip editor-chip--button ${totalIssues > 0 ? 'editor-chip--danger' : ''}`}
        onClick={() => setPopupOpen(true)}
        aria-label={
          totalIssues > 0 ? `查看 ${totalIssues} 项问题` : '查看关卡问题（当前无）'
        }
        title="点击查看详细问题列表"
      >
        <span className="editor-chip__icon">⚠</span>
        <span className="editor-chip__value" data-testid="status-warnings-count">
          {totalIssues}
        </span>
        <span>{errorCount > 0 ? '问题' : '警告'}</span>
      </button>

      <span data-testid="status-stats" className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--wall">▦</span>
        <span className="editor-chip__value">{wallCount(level)}</span>
        <span>墙</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--pickup">✦</span>
        <span className="editor-chip__value">{level.pickups.length}</span>
        <span>拾取</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--enemy">◉</span>
        <span className="editor-chip__value">{level.enemies.length}</span>
        <span>敌人</span>
      </span>

      {lastDraftError !== null && (
        <span
          data-testid="status-storage"
          className="editor-statusbar__storage"
          title={lastDraftError}
        >
          <span className="editor-chip__icon">⚠</span>
          <span
            style={{
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lastDraftError}
          </span>
          <button
            type="button"
            onClick={clearStorageFull}
            data-testid="status-storage-dismiss"
            aria-label="知道了，关闭存储提示"
            className="editor-statusbar__storage-dismiss"
          >
            ×
          </button>
        </span>
      )}

      <span data-testid="status-schema" className="editor-statusbar__schema">
        schema v{SCHEMA_VERSION}
      </span>

      {popupOpen && (
        <WarningsPopup issues={issues} onClose={() => setPopupOpen(false)} />
      )}
    </div>
  );
}
