import { useEditorStore } from '../../store/editorStore';
import { validateDesign } from './editorValidation';
import { SCHEMA_VERSION } from '../../maze/types';

// 24h HH:MM:SS format; locale-independent so the status reads the same
// everywhere (spec FR-32 calls for a clock-style timestamp).
function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function EditorStatusBar() {
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

  const wallCount = level.walls.reduce((n, row) => n + row.filter((c) => c === 1).length, 0);
  const pickupCount = level.pickups.length;
  const enemyCount = level.enemies.length;
  const warningCount = validateDesign(level).filter((i) => i.severity === 'warning').length;

  return (
    <div
      data-testid="editor-status-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        height: 32,
        padding: '0 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--panel)',
        fontSize: 12,
        color: 'var(--fg)',
      }}
    >
      <span data-testid="status-dirty">
        {dirty ? (
          <span style={{ color: 'var(--accent)' }}>● 未保存</span>
        ) : lastSavedAt != null ? (
          <span style={{ opacity: 0.8 }}>已保存于 {formatClock(lastSavedAt)}</span>
        ) : (
          <span style={{ opacity: 0.5 }}>未保存（未改动）</span>
        )}
      </span>

      <span data-testid="status-warnings" style={{ color: warningCount > 0 ? 'var(--accent)' : 'inherit' }}>
        警告 {warningCount}
      </span>

      <span data-testid="status-stats" style={{ opacity: 0.75 }}>
        墙 {wallCount} · 拾取 {pickupCount} · 敌人 {enemyCount}
      </span>

      <span style={{ flex: 1 }} />

      <span data-testid="status-schema" style={{ opacity: 0.6 }}>
        schema v{SCHEMA_VERSION}
      </span>
    </div>
  );
}
