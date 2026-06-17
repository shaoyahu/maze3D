// P2-13: 编辑器左侧常驻面板(取代 P2-12 的 EditorMyLevelsDrawer)。
//
// 设计:
//   - 顶部 [+ 关卡] / [+ 文件夹] 按钮 → 新建/默认进"我的"文件夹
//   - 下方文件树,递归展开文件夹,关卡和文件夹都是节点
//   - 当前正在编辑的关卡高亮(左上角 + 名字加粗)
//   - hover 节点出现 ⋮ 按钮 → 重命名 / 移动到 / 删除
//   - 空状态文案:editor.leftPanel.empty
//
// 数据流:全部 useLevelStore(folders / customLevels) + useEditorStore
// (level + loadLevel + newLevel) + useConfirm + window.prompt。Recursive
// component 用 <FolderNode> 自我递归,展开/折叠状态保存在本组件内的
// useState<Record<id, bool>>。
//
// 模式 mirror:EditorMyLevelsDrawer(P2-12)的 useConfirm 习惯 + 列表
// 渲染;EditorHelpDrawer 的关闭/escape 习惯这里用不上(常驻面板)。
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLevelStore, DEFAULT_FOLDER_ID, type Folder } from '../../store/levelStore';
import { useEditorStore } from '../../store/editorStore';
import { useConfirm } from '../useConfirm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { getDisplayName } from '../../utils/getDisplayName';
import type { MazeData } from '../../maze/types';

// 节点按字母 / 中文 localeCompare 排序,name 相同的 fallback 到 id 字符串,
// 保证稳定不跳。
function sortByName<T extends { name: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, 'zh');
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });
}

// 从全量 folders 字典 + parentId 构造树。childrenOf[id] = 直接子项 list。
// O(n) 一次过 — 节点数小(N 通常 < 50),不需要做虚拟滚动。
function buildTree(folders: Record<string, Folder>): { childrenOf: Record<string, Folder[]> } {
  const childrenOf: Record<string, Folder[]> = {};
  for (const f of Object.values(folders)) {
    const key = f.parentId ?? '__root__';
    if (!childrenOf[key]) childrenOf[key] = [];
    childrenOf[key].push(f);
  }
  for (const k of Object.keys(childrenOf)) {
    childrenOf[k] = sortByName(childrenOf[k]);
  }
  return { childrenOf };
}

export function EditorLeftPanel(): React.ReactElement {
  const t = useT();
  const locale = useSettingsStore((s) => s.language);
  const confirm = useConfirm();
  // F-2026-06-17-E-H-3: collapse the three data selectors (folders,
  // customLevels, currentLevelId) into a single useShallow subscription.
  // With the original layout, a `customLevels` map change and a
  // `currentLevelId` change would each fire a separate re-render, and
  // Zustand's default Object.is would always see a new reference for the
  // map. useShallow does a shallow field comparison, so the panel only
  // re-renders when one of those three actually changed by value, not by
  // reference. Action selectors below keep their per-call form because
  // Zustand store actions are stable references (set() never re-binds
  // them) and don't trigger re-renders.
  const { folders, customLevels } = useLevelStore(
    useShallow((s) => ({ folders: s.folders, customLevels: s.customLevels })),
  );
  const currentLevelId = useEditorStore((s) => s.level.id);
  const createFolder = useLevelStore((s) => s.createFolder);
  const deleteFolder = useLevelStore((s) => s.deleteFolder);
  const renameFolder = useLevelStore((s) => s.renameFolder);
  const moveLevel = useLevelStore((s) => s.moveLevel);
  const moveFolder = useLevelStore((s) => s.moveFolder);
  const deleteCustom = useLevelStore((s) => s.deleteCustom);
  const loadLevel = useEditorStore((s) => s.loadLevel);
  const newLevel = useEditorStore((s) => s.newLevel);

  // 全部展开以减少状态复杂度 — 文件夹是用户分类的"标签",而不是
  // 真正的嵌套关系(每个 folder 里往往只有 1-3 个关卡);强制收起会
  // 强迫用户多点一下,得不偿失。后续若用户量级增长再做按需展开。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string): void => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const { childrenOf } = useMemo(() => buildTree(folders), [folders]);

  // 关卡分两类:有 folderId 且指向存在的 folder → 进那个 folder;
  // 否则(folderId 缺失 / 指向已删 folder)→ 进 "__orphan__" 桶,在
  // 根目录直接渲染,不归到默认文件夹的 children ul。
  // 这样 DEFAULT_FOLDER 的 children ul 只显示"用户在 default 桶下
  // 主动放进来的关卡" — 跟"无 folderId 的孤儿关卡"区分开。
  const { levelsByFolder, orphanLevels } = useMemo(() => {
    const m: Record<string, MazeData[]> = {};
    const orphans: MazeData[] = [];
    for (const lv of Object.values(customLevels)) {
      if (lv.folderId && lv.folderId in folders) {
        if (!m[lv.folderId]) m[lv.folderId] = [];
        m[lv.folderId].push(lv);
      } else {
        orphans.push(lv);
      }
    }
    for (const k of Object.keys(m)) m[k] = sortByName(m[k]);
    return { levelsByFolder: m, orphanLevels: sortByName(orphans) };
  }, [customLevels, folders]);

  // ───── 操作函数 ─────
  const handleNewLevel = (): void => {
    // newLevel 不带 folderId,后续 EditorTopBar 保存时会写到默认
    // "我的"。这里只切换画布。
    newLevel(15, 15);
  };
  const handleNewFolder = (): void => {
    const name = window.prompt(t('editor.leftPanel.folderNamePrompt'), t('editor.leftPanel.untitledFolder'));
    if (name === null) return;
    createFolder(name.trim() || t('editor.leftPanel.untitledFolder'), DEFAULT_FOLDER_ID);
  };

  const handleRenameFolder = (folder: Folder): void => {
    const name = window.prompt(t('editor.leftPanel.renamePrompt'), folder.name);
    if (name === null) return;
    renameFolder(folder.id, name.trim() || folder.name);
  };

  const handleDeleteFolder = async (folder: Folder): Promise<void> => {
    const choice = await confirm({
      title: t('editor.leftPanel.deleteFolderTitle'),
      message: t('editor.leftPanel.deleteFolderMessage', { name: folder.name }),
      actions: [
        { label: t('common.cancel'), value: 'cancel', variant: 'secondary' },
        { label: t('editor.leftPanel.delete'), value: 'ok', variant: 'danger' },
      ],
      danger: true,
    });
    if (choice !== 'ok') return;
    deleteFolder(folder.id);
  };

  const handleRenameLevel = (lv: MazeData): void => {
    const name = window.prompt(t('editor.leftPanel.renameLevelPrompt'), lv.name);
    if (name === null) return;
    // levelStore 没有专门的 renameLevel;走 saveCustom 整盘覆盖即可
    // (levelStore 已存,只要重命名后写一次)
    useLevelStore.getState().saveCustom({ ...lv, name: name.trim() || lv.name });
  };

  const handleDeleteLevel = async (lv: MazeData): Promise<void> => {
    const display = getDisplayName(lv, locale) || lv.name;
    const choice = await confirm({
      title: t('editor.leftPanel.deleteLevelTitle'),
      message: t('editor.leftPanel.deleteLevelMessage', { name: display }),
      actions: [
        { label: t('common.cancel'), value: 'cancel', variant: 'secondary' },
        { label: t('editor.leftPanel.delete'), value: 'ok', variant: 'danger' },
      ],
      danger: true,
    });
    if (choice !== 'ok') return;
    deleteCustom(lv.id);
  };

  const handleMoveTo = (lv: MazeData, folderId: string | null): void => {
    if (folderId === null) moveLevel(lv.id, DEFAULT_FOLDER_ID);
    else moveLevel(lv.id, folderId);
  };

  const handleMoveFolderTo = (folder: Folder, parentId: string | null): void => {
    moveFolder(folder.id, parentId);
  };

  // 递归渲染
  const renderFolder = (folder: Folder, depth: number): React.ReactElement => {
    const isCollapsed = collapsed[folder.id] === true;
    const subFolders = childrenOf[folder.id] ?? [];
    const subLevels = levelsByFolder[folder.id] ?? [];
    const isDefault = folder.id === DEFAULT_FOLDER_ID;
    const hasChildren = subFolders.length > 0 || subLevels.length > 0;
    return (
      <li
        key={folder.id}
        className={`editor-tree__folder${isDefault ? ' editor-tree__folder--default' : ''}`}
        data-testid={`folder-row-${folder.id}`}
      >
        <div
          className="editor-tree__row editor-tree__row--folder"
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <button
            type="button"
            className="editor-tree__chevron"
            onClick={() => toggle(folder.id)}
            aria-expanded={!isCollapsed}
            data-testid={`folder-toggle-${folder.id}`}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
          <span className="editor-tree__icon" aria-hidden>📁</span>
          <span className="editor-tree__name" title={folder.name}>{folder.name}</span>
          <RowMenu
            kind="folder"
            testIdSuffix={folder.id}
            onRename={() => handleRenameFolder(folder)}
            onDelete={() => void handleDeleteFolder(folder)}
            onMoveTo={(parentId) => handleMoveFolderTo(folder, parentId)}
            folderOptions={allFolderOptions(folders, folder.id)}
          />
        </div>
        {!isCollapsed && hasChildren && (
          <ul className="editor-tree__children" data-testid={`folder-children-${folder.id}`}>
            {subFolders.map((f) => renderFolder(f, depth + 1))}
            {subLevels.map((lv) => renderLevel(lv, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const renderLevel = (lv: MazeData, depth: number): React.ReactElement => {
    const display = getDisplayName(lv, locale) || lv.name;
    const isCurrent = lv.id === currentLevelId;
    return (
      <li
        key={lv.id}
        className={`editor-tree__level${isCurrent ? ' editor-tree__level--current' : ''}`}
        data-testid={`level-row-${lv.id}`}
      >
        <div
          className="editor-tree__row editor-tree__row--level"
          style={{ paddingLeft: 28 + depth * 14 }}
        >
          <span
            className="editor-tree__icon"
            aria-hidden
            data-testid={`level-icon-${lv.id}`}
          >
            {isCurrent ? '●' : '📄'}
          </span>
          <button
            type="button"
            className="editor-tree__name editor-tree__name--button"
            onClick={() => loadLevel(lv)}
            title={display}
            data-testid={`level-load-${lv.id}`}
          >
            {display}
          </button>
          <RowMenu
            kind="level"
            testIdSuffix={lv.id}
            onRename={() => handleRenameLevel(lv)}
            onDelete={() => void handleDeleteLevel(lv)}
            onMoveTo={(folderId) => handleMoveTo(lv, folderId)}
            folderOptions={allFolderOptions(folders, null)}
          />
        </div>
      </li>
    );
  };

  const rootFolders = childrenOf['__root__'] ?? [];
  // 关卡(无论有没有 folderId)统一按"实际桶"分类渲染。空状态只在
  // 全空(customLevels 为空)时出现 — 不管 default folder 是不是
  // 自动建,都不算"无内容"。
  const totalLevels = Object.values(customLevels).length;
  const totalFolders = Object.values(folders).filter((f) => f.id !== DEFAULT_FOLDER_ID).length;
  const hasAny = totalLevels > 0 || totalFolders > 0;

  return (
    <aside data-testid="editor-left-panel" className="editor-leftpanel">
      <div className="editor-leftpanel__actions">
        <button
          type="button"
          className="editor-leftpanel__btn editor-leftpanel__btn--primary"
          onClick={handleNewLevel}
          data-testid="leftpanel-new-level"
        >
          <span aria-hidden>+</span>
          <span>{t('editor.leftPanel.newLevel')}</span>
        </button>
        <button
          type="button"
          className="editor-leftpanel__btn"
          onClick={handleNewFolder}
          data-testid="leftpanel-new-folder"
        >
          <span aria-hidden>+</span>
          <span>{t('editor.leftPanel.newFolder')}</span>
        </button>
      </div>

      <div className="editor-leftpanel__tree" data-testid="editor-tree">
        {!hasAny ? (
          <div className="editor-leftpanel__empty" data-testid="leftpanel-empty">
            {t('editor.leftPanel.empty')}
          </div>
        ) : (
          <ul className="editor-tree__root">
            {rootFolders.map((f) => renderFolder(f, 0))}
            {orphanLevels.map((lv) => renderLevel(lv, 0))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ─────────────────── Row menu (hover ⋮ 按钮) ───────────────────

interface RowMenuProps {
  kind: 'folder' | 'level';
  testIdSuffix: string;
  onRename: () => void;
  onDelete: () => void;
  onMoveTo: (target: string | null) => void;
  folderOptions: Array<{ id: string; name: string }>;
}

// F-2026-06-17-E-H-3: RowMenu is wrapped in React.memo. Before this, every
// re-render of EditorLeftPanel produced a new renderFolder/renderLevel
// closure, which in turn produced fresh callback closures passed to
// RowMenu. Because RowMenu wasn't memoized, every row in the tree
// re-rendered on every parent render — including hover / setOpen events
// that should have been local to a single row. With memo, the row only
// re-renders when its props (kind / testIdSuffix / folderOptions) change
// by reference, and since folderOptions is recomputed only when folders
// changes, the cost is bounded to a real data change.
const RowMenu = memo(function RowMenu({ kind, testIdSuffix, onRename, onDelete, onMoveTo, folderOptions }: RowMenuProps): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState<boolean>(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: globalThis.MouseEvent): void => {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const stop = (e: ReactMouseEvent<HTMLDivElement>): void => e.stopPropagation();

  return (
    <div
      ref={wrapRef}
      className={`editor-tree__menu${open ? ' editor-tree__menu--open' : ''}`}
      onClick={stop}
    >
      <button
        type="button"
        className="editor-tree__menu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`row-menu-${kind}-${testIdSuffix}`}
        title={t('editor.leftPanel.menu')}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="editor-tree__menu-pop"
          data-testid={`row-menu-pop-${kind}-${testIdSuffix}`}
        >
          <button
            type="button"
            role="menuitem"
            className="editor-tree__menu-item"
            onClick={() => { setOpen(false); onRename(); }}
            data-testid={`row-rename-${kind}-${testIdSuffix}`}
          >
            {t('editor.leftPanel.rename')}
          </button>
          {folderOptions.length > 0 && (
            <div className="editor-tree__menu-sub" role="menu">
              <span className="editor-tree__menu-sub-label">{t('editor.leftPanel.moveTo')}</span>
              {folderOptions.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  className="editor-tree__menu-item"
                  onClick={() => { setOpen(false); onMoveTo(f.id); }}
                  data-testid={`row-move-${kind}-${testIdSuffix}-to-${f.id}`}
                >
                  📁 {f.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            className="editor-tree__menu-item editor-tree__menu-item--danger"
            onClick={() => { setOpen(false); onDelete(); }}
            data-testid={`row-delete-${kind}-${testIdSuffix}`}
          >
            {t('editor.leftPanel.delete')}
          </button>
        </div>
      )}
    </div>
  );
});

// 给 RowMenu 的"移动到"列出所有可选 folder。excludeId 是 folder 时,
// 不能把 folder 移到自己下;level 时 excludeId=null(可以挪到任何 folder)。
function allFolderOptions(
  folders: Record<string, Folder>,
  excludeId: string | null,
): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const f of Object.values(folders)) {
    if (f.id === excludeId) continue;
    out.push({ id: f.id, name: f.name });
  }
  return sortByName(out);
}
