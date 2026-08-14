import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../store/editorStore';
import { validateDesign, type ValidationIssue } from './editorValidation';
import { SCHEMA_VERSION } from '../../maze/types';
import type { MazeData } from '../../maze/types';
import { useT } from '../../i18n';
// P1-6: per-layer breakdown chip reuses the LevelTabs helper so
// the entity counts stay in lockstep across the status bar
// and the level tab tooltips. Single source of truth.
import { countEntitiesOnLevel } from './LevelTabs';

function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function wallCount(level: MazeData): number {
  // P5-editor-multilayer: count walls on the L0 grid (the status
  // bar's "wall count" chip is a quick at-a-glance health metric,
  // not a per-layer breakdown — the per-layer breakdown belongs
  // in the per-layer tab tooltips landed in Phase 2). Falls back
  // to `walls2d[0]` for multi-layer levels per the strict mutex.
  const layerWalls = level.walls ?? level.walls2d![0]!;
  let n = 0;
  for (const row of layerWalls) {
    for (const cell of row) {
      if (cell === 1) n++;
    }
  }
  return n;
}

function WarningsPopup({
  issues,
  onClose,
}: {
  issues: ValidationIssue[];
  onClose: () => void;
}): React.ReactElement | null {
  const t = useT();
  // F-2026-06-17-E-L-6: per-instance id for aria-labelledby. Replaces
  // the hard-coded `warnings-popup-title` literal.
  const titleId = `${useId()}-title`;
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
        aria-labelledby={titleId}
        data-testid="warnings-popup"
        className="warnings-popup__card"
        onClick={stop}
        onKeyDown={handleKey}
      >
        <div className="warnings-popup__header">
          <h2 id={titleId} className="warnings-popup__title">
            {t('editor.status.issues', { count: issues.length })}
          </h2>
          <button
            type="button"
            data-testid="warnings-popup-close"
            aria-label={t('editor.status.closeAria')}
            className="warnings-popup__close"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </div>
        {issues.length === 0 ? (
          <div className="warnings-popup__empty">{t('editor.status.empty')}</div>
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
                <span className="warnings-popup__message">{t(issue.messageKey, issue.messageVars)}</span>
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
  const t = useT();
  const level = useEditorStore((s) => s.level);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const lastDraftError = useEditorStore((s) => s.lastDraftError);
  const clearStorageFull = useEditorStore((s) => s.clearStorageFull);

  const issues = validateDesign(level);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const totalIssues = issues.length;

  // P5-editor-multilayer (Task 9): multi-layer status text. Single
  // layer keeps the historical "1 layer" label; multi-layer shows
  // "Layer 1/3" so the user always knows which layer is current.
  // Picked up from the store via two narrow selectors so a level
  // edit (which mutates `level`) doesn't re-render this chip when
  // neither the level count nor the current level changed.
  const levelCount = useEditorStore((s) => s.level.levelCount ?? 1);
  const currentLevel = useEditorStore((s) => s.currentLevel);

  const [popupOpen, setPopupOpen] = useState(false);

  return (
    <div data-testid="editor-status-bar" className="editor-statusbar">
      <span
        data-testid="status-dirty"
        className={`editor-chip ${dirty ? 'editor-chip--accent' : ''}`}
      >
        <span className="editor-chip__icon">{dirty ? '●' : '✓'}</span>
        <span>
          {dirty ? t('editor.status.dirty') : lastSavedAt != null ? t('editor.status.savedAt', { time: formatClock(lastSavedAt) }) : t('editor.status.notModified')}
        </span>
      </span>

      {/* P5-editor-multilayer (Task 9): layer indicator chip. Lives
          right after the dirty chip so the user always sees the
          current layer at the leftmost position. Single-layer
          levels keep the historical "1 layer" text; multi-layer
          shows "Layer 1/3" (or local equivalent). */}
      <span
        data-testid="status-layer-indicator"
        className={`editor-chip ${levelCount > 1 ? 'editor-chip--accent' : ''}`}
      >
        <span className="editor-chip__icon">▤</span>
        <span>
          {levelCount > 1
            ? t('editor.status.layerIndicator.multi', { current: currentLevel + 1, total: levelCount })
            : t('editor.status.layerIndicator.single')}
        </span>
      </span>

      <button
        type="button"
        data-testid="status-warnings"
        className={`editor-chip editor-chip--button ${totalIssues > 0 ? 'editor-chip--danger' : ''}`}
        onClick={() => setPopupOpen(true)}
        aria-label={
          totalIssues > 0 ? t('editor.status.viewIssues', { count: totalIssues }) : t('editor.status.viewIssuesEmpty')
        }
        title={t('editor.status.issuesTitle')}
      >
        <span className="editor-chip__icon">⚠</span>
        <span className="editor-chip__value" data-testid="status-warnings-count">
          {totalIssues}
        </span>
        <span>{errorCount > 0 ? t('editor.status.problems') : t('editor.status.warnings')}</span>
      </button>

      <span data-testid="status-stats" className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--wall">▦</span>
        <span className="editor-chip__value">{wallCount(level)}</span>
        <span>{t('editor.status.walls')}</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--pickup">✦</span>
        <span className="editor-chip__value">{level.pickups.length}</span>
        <span>{t('editor.status.pickups')}</span>
      </span>
      <span className="editor-chip">
        <span className="editor-chip__icon editor-chip__icon--enemy">◉</span>
        <span className="editor-chip__value">{level.enemies.length}</span>
        <span>{t('editor.status.enemies')}</span>
      </span>

      {/* P1-6: transition count chip. P2-18 lock exposes
          `level.transitions` (stair / hole / ladder entries);
          the status bar's existing wall / pickup / enemy chips
          don't cover them. Designers working on a multi-layer
          level (P3-1 + P5-2) immediately see "how many vertical
          connections does this level have?" at the bottom of
          the editor. 0 transitions is still rendered so the
          chip count stays consistent with the other entity
          chips. The `--accent` modifier lights up the chip when
          the level is multi-layer (transitions are a multi-
          layer feature; single-layer transitions are technically
          valid but unusual, so a designer hovering a single-
          layer level with a non-zero count immediately sees the
          accent visual as "this is unusual".) */}
      <span
        data-testid="status-transitions"
        className={`editor-chip ${levelCount > 1 ? 'editor-chip--accent' : ''}`}
        aria-label={t('editor.status.transitionsAria', { count: level.transitions?.length ?? 0 })}
        title={t('editor.status.transitions')}
      >
        <span className="editor-chip__icon">↕</span>
        <span className="editor-chip__value">{level.transitions?.length ?? 0}</span>
        <span>{t('editor.status.transitions')}</span>
      </span>

      {/* P1-6: per-layer entity breakdown chip. Multi-layer
          only — single-layer levels don't need a breakdown
          because the existing wall / pickup / enemy chips
          already cover the only layer. The format is compact
          ("L0: 3·1·0  L1: 0·2·0") so the chip stays single-
          line on narrow viewports; the tooltip spells out the
          full breakdown (mirrors the LevelTabs tooltip but for
          the whole level at a glance). The same countEntitiesOnLevel
          helper is used as LevelTabs so the numbers stay in
          lockstep across surfaces. */}
      {levelCount > 1 && (
        <span
          data-testid="status-layer-breakdown"
          className="editor-chip"
          title={(() => {
            const lines: string[] = [];
            for (let i = 0; i < levelCount; i++) {
              const c = countEntitiesOnLevel(level, i);
              lines.push(
                t('editor.status.layerBreakdownLine', {
                  level: i + 1,
                  enemies: c.enemies,
                  pickups: c.pickups,
                  traps: c.traps,
                  doors: c.doors,
                  transitions: c.transitions,
                }),
              );
            }
            return lines.join('\n');
          })()}
        >
          <span className="editor-chip__icon">▤</span>
          <span>
            {(() => {
              const parts: string[] = [];
              for (let i = 0; i < levelCount; i++) {
                const c = countEntitiesOnLevel(level, i);
                parts.push(
                  t('editor.status.layerBreakdownCompact', {
                    level: i + 1,
                    enemies: c.enemies,
                    pickups: c.pickups,
                  }),
                );
              }
              return parts.join('  ');
            })()}
          </span>
        </span>
      )}

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
            aria-label={t('editor.status.storageHintCloseAria')}
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