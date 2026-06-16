import { useEditorStore } from '../../store/editorStore';
import type { EditorTool } from '../../maze/types';

// One entry per placement tool. `select` and `pan` are modifier tools —
// their icon is a pointer/hand glyph rather than a maze element.
interface ToolEntry {
  tool: EditorTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: readonly ToolEntry[] = [
  { tool: 'select', label: '选择',   shortcut: 'V', icon: '↖' },
  { tool: 'wall',   label: '墙体',   shortcut: 'W', icon: '▦' },
  // F-P2-9: dedicated erase / carve tool. `B` shortcut chosen to avoid
  // collision with existing V/W/S/E/P/M/H. Icon is a small eraser
  // glyph; the label "通道" reads as "carve a passage / corridor".
  { tool: 'erase',  label: '通道',   shortcut: 'B', icon: '⌫' },
  { tool: 'start',  label: '起点',   shortcut: 'S', icon: '▲' },
  // Exit: render a small SVG flag mirroring the in-grid marker so the
  // drawer icon and the cell marker read as the same thing.
  {
    tool: 'exit',
    label: '终点',
    shortcut: 'E',
    icon: (
      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
        <line x1={6} y1={3} x2={6} y2={22} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M6 3 L21 7.5 L6 12 Z" fill="currentColor" stroke="currentColor" strokeWidth={0.5} strokeLinejoin="round" />
        <circle cx={6} cy={22} r={1.4} fill="currentColor" />
      </svg>
    ),
  },
  { tool: 'pickup', label: '拾取',   shortcut: 'P', icon: '✦' },
  { tool: 'enemy',  label: '敌人',   shortcut: 'M', icon: '◉' },
  { tool: 'pan',    label: '平移',   shortcut: 'H', icon: '✥' },
];

interface HistoryEntry {
  action: 'undo' | 'redo';
  label: string;
  shortcut: string;
  icon: string;
  enabled: boolean;
  onClick: () => void;
  testId: string;
}

export function EditorLeftDrawer(): React.ReactElement {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const historyEntries: HistoryEntry[] = [
    {
      action: 'undo',
      label: '撤销',
      shortcut: '⌘Z',
      icon: '↶',
      enabled: canUndo,
      onClick: undo,
      testId: 'tool-undo',
    },
    {
      action: 'redo',
      label: '重做',
      shortcut: '⌘⇧Z',
      icon: '↷',
      enabled: canRedo,
      onClick: redo,
      testId: 'tool-redo',
    },
  ];

  return (
    <aside
      data-testid="editor-left-drawer"
      className="editor-drawer"
      role="toolbar"
      aria-label="Editor tools"
    >
      {TOOLS.map(({ tool: t, label, shortcut, icon }) => {
        const active = tool === t;
        return (
          <div key={t} className="editor-tool-btn-wrap">
            <button
              type="button"
              onClick={() => setTool(t)}
              data-testid={`tool-${t}`}
              aria-pressed={active}
              aria-label={`${label} (${shortcut})`}
              title={`${label}  ${shortcut}`}
              className={`editor-tool-btn${active ? ' editor-tool-btn--active' : ''}`}
            >
              <span aria-hidden className="editor-tool-btn__icon">
                {icon}
              </span>
              <span className="editor-tool-btn__shortcut">{shortcut}</span>
            </button>
            <span className="editor-tooltip" role="tooltip">
              {label}
            </span>
          </div>
        );
      })}

      <div className="editor-drawer__divider" aria-hidden />

      {historyEntries.map(({ action, label, shortcut, icon, enabled, onClick, testId }) => (
        <div key={action} className="editor-tool-btn-wrap">
          <button
            type="button"
            onClick={onClick}
            disabled={!enabled}
            data-testid={testId}
            aria-label={`${label} (${shortcut})`}
            title={`${label}  ${shortcut}`}
            className="editor-tool-btn"
            data-disabled={!enabled}
          >
            <span aria-hidden className="editor-tool-btn__icon">
              {icon}
            </span>
          </button>
          <span className="editor-tooltip" role="tooltip">
            {label}
          </span>
        </div>
      ))}

      <div className="editor-drawer__spacer" />
    </aside>
  );
}
