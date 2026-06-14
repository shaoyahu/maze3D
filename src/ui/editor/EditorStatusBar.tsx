import { useEditorStore } from '../../store/editorStore';
import { validateDesign } from './editorValidation';
import { SCHEMA_VERSION } from '../../maze/types';

// 24h HH:MM:SS format; locale-independent so the status reads the same
// everywhere (spec FR-32 calls for a clock-style timestamp).
function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function EditorStatusBar(): React.ReactElement {
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const lastDraftError = useEditorStore((s) => s.lastDraftError);
  const clearStorageFull = useEditorStore((s) => s.clearStorageFull);

  let wallCount = 0;
  for (const row of level.walls) {
    for (const cell of row) {
      if (cell === 1) wallCount++;
    }
  }
  const pickupCount = level.pickups.length;
  const enemyCount = level.enemies.length;
  const warningCount = validateDesign(level).filter((i) => i.severity === 'warning').length;

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

      <span
        data-testid="status-warnings"
        className={`editor-chip ${warningCount > 0 ? 'editor-chip--danger' : ''}`}
      >
        <span className="editor-chip__icon">⚠</span>
        <span className="editor-chip__value">{warningCount}</span>
        <span>警告</span>
      </span>

      <span data-testid="status-stats" className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--wall">▦</span>
        <span className="editor-chip__value">{wallCount}</span>
        <span>墙</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--pickup">✦</span>
        <span className="editor-chip__value">{pickupCount}</span>
        <span>拾取</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--enemy">◉</span>
        <span className="editor-chip__value">{enemyCount}</span>
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
    </div>
  );
}
