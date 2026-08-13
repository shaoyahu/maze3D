# P1-5 addLevel 空 grid variant — Plan

**Spec**: `docs/increments/p1-addlevel-empty/spec.md`
**复杂度**: Small (2-3h, 1 commit)
**日期**: 2026-08-13

> 1 commit ship 节奏 (跟 P5-2 commit 1 风格).

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `docs/increments/p1-addlevel-empty/spec.md` | CREATE | spec |
| `docs/increments/p1-addlevel-empty/plan.md` | CREATE | plan |
| `src/store/editorStore.ts` | UPDATE | 加 addLevelEmpty action (跟 addLevel 平行) |
| `src/ui/editor/LevelTabs.tsx` | UPDATE | 加 `+ ∅` button |
| `src/i18n/resources/en.ts` | UPDATE | 加 2 key (label + aria) |
| `src/i18n/resources/zh.ts` | UPDATE | 加 2 key (label + aria) |
| `tests/unit/store/editorStore.test.ts` | UPDATE | +3-4 case |
| `tests/component/editor/EditorLevelTabs.test.tsx` | UPDATE | +1-2 case |

## 任务清单

### Commit 1: addLevelEmpty action + UI + i18n + tests

- [ ] **Action 1.1**: `src/store/editorStore.ts` 加 addLevelEmpty action (跟 addLevel 平行的 8 行实现)
- [ ] **Action 1.2**: `src/ui/editor/LevelTabs.tsx` 加 `+ ∅` button (data-testid `level-add-empty`)
- [ ] **Action 1.3**: `src/i18n/resources/en.ts` 加 `addLevelEmpty` + `addLevelEmptyAria` 2 个 key
- [ ] **Action 1.4**: `src/i18n/resources/zh.ts` 加同上 2 个 key
- [ ] **Test**: `tests/unit/store/editorStore.test.ts` 加 3-4 case (单层→多层, 多层→多层, MAX 6 cap)
- [ ] **Test**: `tests/component/editor/EditorLevelTabs.test.tsx` 加 1-2 case (`+ ∅` 渲染 + click 调 action)
- [ ] **Validate**: `npx tsc --noEmit && npx vitest run`
- [ ] **Commit 1**: `feat(p1-addlevel-empty): addLevelEmpty — 第二个 addLevel variant (空 grid)`

## 验证

```bash
# 必须全部通过才能 ship
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| addLevelEmpty 跟 addLevel 路径意外分开 | 低 | 同样走 commitLevel + currentLevel jump + levelCount clamp |
| `+ ∅` button 视觉跟 `+` 太像误点 | 中 | CSS 区分 (secondary / ghost), title + aria-label |
| createEmptyGrid 复用不一致 | 低 | 复用同一个 helper, 单一 source of truth |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] PR 推 origin + 创建 PR #5

---

## 执行日志（实施时填写）

### 实施日期
2026-08-13

### 实际改动文件
（实施后填）

### 遇到的偏差
（实施后填）

### 测试覆盖
- 单元覆盖率：（实施后跑 coverage 填）

### 备注
（实施后填）
