// P3-1c: 编辑器层 tab bar。
//
// 设计(spec §3 Q5「tab 切换,沿用现有 UI 风格」+ spec §12 Q5「左侧 panel
// 加 level tab bar」):
//   - 渲染 1..levelCount 个 tab(L1 / L2 / ... / Ln),当前 currentLevel 高亮
//   - 点击 tab → setCurrentLevel(n-1)
//   - 右侧 [+]/[-] 按钮:加层 / 删顶层
//   - 删层弹确认对话框(避免误删把 L3 的实体清空)
//
// 集成位置:EditorLeftPanel 底部(在 file tree 下方),这样用户切换
// 关卡和切换层都集中在左侧。
//
// 状态来源:useEditorStore(level.levelCount / level.currentLevel
// / setCurrentLevel / addLevel / removeLevel)。addLevel / removeLevel
// 内部已经做了 1..6 clamp,UI 这边只负责禁用按钮 + 走 useConfirm。
//
// F-P3-1c-H-1: 这块 UI 之前在 P3-1c 数据/逻辑完成后 **从未** 渲染,
// 导致 editor 多层关卡用户看不到层切换入口。本组件补齐。
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { useConfirm } from '../useConfirm';
import { isLevelCount, LEVEL_COUNT_VALUES } from '../../maze/types';
import type { LevelCount } from '../../maze/types';

const MAX_LEVEL = LEVEL_COUNT_VALUES[LEVEL_COUNT_VALUES.length - 1] ?? 6;

// F-P3-1c-verifier-M-1: memo + useShallow pattern, matching the
// existing EditorLeftPanel convention (RowMenu is wrapped in memo,
// the data selectors are bundled via useShallow). The leaf only
// re-renders when one of the subscribed fields actually changes.
export const EditorLevelTabs = memo(function EditorLevelTabs(): React.ReactElement {
  const t = useT();
  const confirm = useConfirm();
  // F-P3-1c-verifier-M-2: defensive levelCount coercion. The store
  // field is `number | undefined` (not `LevelCount`); a future
  // hand-edited JSON or a draft-fix that skips validateMaze could
  // land any number here. Run through the runtime whitelist so the
  // UI can never paint 9 tabs from a malformed level.
  const { levelCount, currentLevel } = useEditorStore(
    useShallow((s) => {
      const raw = s.level.levelCount ?? 1;
      return {
        levelCount: (isLevelCount(raw) ? raw : 1) as LevelCount,
        currentLevel: s.currentLevel,
      };
    }),
  );
  const setCurrentLevel = useEditorStore((s) => s.setCurrentLevel);
  const addLevel = useEditorStore((s) => s.addLevel);
  const removeLevel = useEditorStore((s) => s.removeLevel);

  const atMax = levelCount >= MAX_LEVEL;
  const atMin = levelCount <= 1;

  const handleRemove = async (): Promise<void> => {
    const choice = await confirm({
      title: t('editor.leftPanel.removeLevelTitle'),
      message: t('editor.leftPanel.removeLevelMessage', { count: levelCount }),
      actions: [
        { label: t('common.cancel'), value: 'cancel', variant: 'secondary' },
        { label: t('editor.leftPanel.removeLevel'), value: 'ok', variant: 'danger' },
      ],
      danger: true,
    });
    if (choice === 'ok') removeLevel();
  };

  return (
    <div className="editor-leveltabs" data-testid="editor-leveltabs">
      <div className="editor-leveltabs__tabs" role="tablist" aria-label="Level tabs">
        {Array.from({ length: levelCount }, (_, i) => {
          const idx = i;
          const isActive = idx === currentLevel;
          return (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={t('editor.leftPanel.levelTabAria', { level: idx + 1 })}
              title={t('editor.leftPanel.levelTabAria', { level: idx + 1 })}
              data-testid={`level-tab-${idx}`}
              className={`editor-leveltabs__tab${isActive ? ' editor-leveltabs__tab--active' : ''}`}
              onClick={() => setCurrentLevel(idx)}
            >
              {t('editor.leftPanel.levelTab', { level: idx + 1 })}
            </button>
          );
        })}
      </div>
      <div className="editor-leveltabs__actions">
        <button
          type="button"
          className="editor-leveltabs__btn"
          onClick={addLevel}
          disabled={atMax}
          aria-label={t('editor.leftPanel.addLevelAria', { count: levelCount })}
          title={t('editor.leftPanel.addLevel')}
          data-testid="level-add"
          // F-P3-1c-verifier-L-1: omit the attribute when not disabled
          // so a future `[data-disabled]` (no value) CSS selector
          // can't accidentally style enabled buttons.
          {...(atMax ? { 'data-disabled': 'true' } : {})}
        >
          <span aria-hidden>+</span>
        </button>
        <button
          type="button"
          className="editor-leveltabs__btn"
          onClick={() => void handleRemove()}
          disabled={atMin}
          aria-label={t('editor.leftPanel.removeLevelAria', { count: levelCount })}
          title={t('editor.leftPanel.removeLevel')}
          data-testid="level-remove"
          {...(atMin ? { 'data-disabled': 'true' } : {})}
        >
          <span aria-hidden>−</span>
        </button>
      </div>
    </div>
  );
});
