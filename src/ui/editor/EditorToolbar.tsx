// P2-13: 编辑器中央上方工具栏(取代 P2-9 的 EditorLeftDrawer)。
//
// 设计:水平布局 — 8 个 placement 工具(select / wall / erase / start /
// exit / pickup / enemy / pan)+ 分隔线 + 2 个历史按钮(undo / redo)。
// 取代原本左侧 drawer 的"竖排 8 + 2"布局;移到 viewport 上方的好处:
//   - 节省横向空间(原 64px drawer 现在变成顶部 40-48px)
//   - 工具和 canvas 视觉上更近,符合"工具在画布上方"的工业惯例
//   - 左栏腾出来给文件树(EditorLeftPanel)
//
// 模式 mirror:EditorLeftDrawer 的 TOOLS 数组(原样复用)+ HistoryEntry
// 模式;EditorTopBar 的 hint 区域(本组件不再有 hint — 当前工具名
// 已经在 active 按钮的 aria-label / title 上体现了)。

import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import type { EditorTool } from '../../maze/types';

interface ToolEntry {
  tool: EditorTool;
  labelKey: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: readonly ToolEntry[] = [
  { tool: 'select', labelKey: 'editor.toolbar.tool.select', shortcut: 'V', icon: '↖' },
  { tool: 'wall',   labelKey: 'editor.toolbar.tool.wall',   shortcut: 'W', icon: '▦' },
  { tool: 'erase',  labelKey: 'editor.toolbar.tool.erase',  shortcut: 'B', icon: '⌫' },
  { tool: 'start',  labelKey: 'editor.toolbar.tool.start',  shortcut: 'S', icon: '▲' },
  {
    tool: 'exit',
    labelKey: 'editor.toolbar.tool.exit',
    shortcut: 'E',
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
        <line x1={6} y1={3} x2={6} y2={22} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M6 3 L21 7.5 L6 12 Z" fill="currentColor" stroke="currentColor" strokeWidth={0.5} strokeLinejoin="round" />
        <circle cx={6} cy={22} r={1.4} fill="currentColor" />
      </svg>
    ),
  },
  { tool: 'pickup', labelKey: 'editor.toolbar.tool.pickup', shortcut: 'P', icon: '✦' },
  { tool: 'enemy',  labelKey: 'editor.toolbar.tool.enemy',  shortcut: 'M', icon: '◉' },
  { tool: 'pan',    labelKey: 'editor.toolbar.tool.pan',    shortcut: 'H', icon: '✥' },
];

interface HistoryEntry {
  action: 'undo' | 'redo';
  labelKey: string;
  shortcut: string;
  icon: string;
  enabled: boolean;
  onClick: () => void;
  testId: string;
}

export function EditorToolbar(): React.ReactElement {
  const t = useT();
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const historyEntries: HistoryEntry[] = [
    { action: 'undo', labelKey: 'editor.toolbar.undo', shortcut: '⌘Z', icon: '↶', enabled: canUndo, onClick: undo, testId: 'tool-undo' },
    { action: 'redo', labelKey: 'editor.toolbar.redo', shortcut: '⌘⇧Z', icon: '↷', enabled: canRedo, onClick: redo, testId: 'tool-redo' },
  ];

  return (
    <div data-testid="editor-tool-top" className="editor-toolbar" role="toolbar" aria-label="Editor tools">
      <div className="editor-toolbar__group">
        {TOOLS.map(({ tool: t2, labelKey, shortcut, icon }) => {
          const active = tool === t2;
          return (
            <button
              key={t2}
              type="button"
              onClick={() => setTool(t2)}
              data-testid={`tool-${t2}`}
              aria-pressed={active}
              aria-label={`${t(labelKey)} (${shortcut})`}
              title={`${t(labelKey)}  ${shortcut}`}
              className={`editor-toolbar__btn${active ? ' editor-toolbar__btn--active' : ''}`}
            >
              <span aria-hidden className="editor-toolbar__icon">{icon}</span>
              <span className="editor-toolbar__label">{t(labelKey)}</span>
              <span aria-hidden className="editor-toolbar__shortcut">{shortcut}</span>
            </button>
          );
        })}
      </div>

      <div className="editor-toolbar__divider" aria-hidden />

      <div className="editor-toolbar__group">
        {historyEntries.map(({ action, labelKey, shortcut, icon, enabled, onClick, testId }) => (
          <button
            key={action}
            type="button"
            onClick={onClick}
            disabled={!enabled}
            data-testid={testId}
            aria-label={`${t(labelKey)} (${shortcut})`}
            title={`${t(labelKey)}  ${shortcut}`}
            className="editor-toolbar__btn editor-toolbar__btn--history"
            data-disabled={!enabled}
          >
            <span aria-hidden className="editor-toolbar__icon">{icon}</span>
            <span className="editor-toolbar__label">{t(labelKey)}</span>
            <span aria-hidden className="editor-toolbar__shortcut">{shortcut}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
