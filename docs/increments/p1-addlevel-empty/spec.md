# P1-5 addLevel 空 grid variant — Spec

**Slug**: `p1-addlevel-empty`
**状态**: draft → in-review → approved → done
**日期**: 2026-08-13
**对应路线图项**: P1 #5 (P0 follow-up 候选池 4 task 中 1)
**依赖**: P5-2 editor multi-layer (addLevel / removeLevel 锁)
**复杂度**: Small (2-3h, 1 commit)

> 1 commit ship 节奏. 跟 P5-2 commit 1 风格一致 (主功能 + review-fix).

## 1. 概述

P5-2 commit 1 锁的 addLevel 行为: **克隆当前 layer** (P5-2 Decision A2). 这对 "玩家想复制 L1 到 L2 (P5-1 teaching fixture 模式)" OK, 但对 "玩家想从零开始设计 L2" 不直观 — 必须先在 L1 删掉所有 wall/entity 然后 addLevel. P1 #5 加 **第二个 addLevel variant: 空 grid**, 1-click 产生一个全新空白 layer.

P5-2 决策 "addLevel 克隆当前" 是 A2 主路径, P1 #5 不破坏. P1 #5 加 A2 旁路: addLevelEmpty.

## 2. 目标 / 非目标

### 目标
- addLevelEmpty store action: 加全 0 grid (empty) 替代克隆当前
- LevelTabs UI: 加第 2 个 button `+ ∅` (data-testid `level-add-empty`)
- 2 个 i18n key (en + zh): `editor.leftPanel.addLevelEmpty` / `editor.leftPanel.addLevelEmptyAria`
- 1 click 全程 1 个操作 (no confirm dialog — empty layer 无 entity 风险)
- removeLevel 已有 confirm 行为不变
- 跨层 enemy 仍 hidden (P1-4 Phase 3 锁)
- audit grep 没报 (P0 #3 锁)

### 非目标
- 不改 addLevel 现有行为 (主路径仍是 clone)
- 不改 removeLevel 行为
- 不改 P5-1 teaching fixture (那个用 addLevel clone, 不是 addLevelEmpty)
- 不加 "Clone specific layer" / "Duplicate level" 等其他 variant
- 不改 spec/plan.md 锁的决策 A1-A5
- 不改 walls2d mutex 逻辑
- 不改 levelCount 1..6 范围

## 3. 用户故事

- 作为关卡设计者, 我希望一键加一个**空白** layer (不用先 clone 现有然后手动删), 这样我从零设计 L2 更快
- 作为关卡设计者, 我希望 addLevel 现有 "clone current" 行为不变 (P5-1 teaching fixture 模式)
- 作为关卡设计者, 我希望 2 个 button 在 UI 上视觉明显区分, 不会误点

## 4. 功能需求

### FR-1: addLevelEmpty store action
- F1.1: `editorStore.addLevelEmpty: () => void` — 加全 0 grid (size 跟 `level.size.width` × `level.size.depth` 一致)
- F1.2: 走跟 addLevel 一样的 `walls xor walls2d` mutex 流程:
  - 单层 → 多层: `promoteToMultiLayer(level, { clone: 'empty' })` (perLayerWalls 加 'empty' variant)
  - 多层 → 多层: append `Array.from({length: depth}, () => Array(width).fill(0))`
- F1.3: 跟 addLevel 一样的 1..6 clamp (`LEVEL_COUNT_VALUES`)
- F1.4: 跟 addLevel 一样 commitLevel (undo/redo)
- F1.5: 跟 addLevel 一样 `currentLevel = next - 1` (跳新 top)

### FR-2: perLayerWalls.createEmptyGrid 工具函数
- F2.1: `createEmptyGrid(width: number, depth: number): CellType[][]` — 已经在 P5-2 实现 (Decision A 附赠), 复用
- F2.2: 不动现有 `promoteToMultiLayer` signature — 改 internal 用 createEmptyGrid 替代克隆

### FR-3: LevelTabs UI 加空 grid button
- F3.1: 现有 `+` button 不变 (data-testid `level-add`)
- F3.2: 新增 button `+ ∅` (data-testid `level-add-empty`), 调 `addLevelEmpty`
- F3.3: 同样 disabled 当 `levelCount >= MAX_LEVEL` (6)
- F3.4: 同样不需要 confirm (empty layer 无 entity)
- F3.5: 视觉明显区分: 现有 `+` 是 outline button, 新增 `+ ∅` 是 secondary / ghost button

### FR-4: i18n
- F4.1: `editor.leftPanel.addLevelEmpty` = "Empty Layer" / "空白层"
- F4.2: `editor.leftPanel.addLevelEmptyAria` = "Add Empty Layer" / "加空白层"

## 5. 数据 / 类型变更

### editorStore 新增
- `addLevelEmpty: () => void` (跟 addLevel 同 signature)

### perLayerWalls 不动 signature
- 内部实现改: 走 createEmptyGrid 替代 clone (复用 P5-2 附赠的 helper)

### 不变的字段
- `MazeData.walls2d` shape (P3-1 锁)
- `MazeData.walls xor walls2d` mutex (P5-2 锁)
- `levelCount: 1..6` (P3-1 锁)
- `currentLevel` 索引语义

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/store/editorStore.ts` | UPDATE | 加 addLevelEmpty action (跟 addLevel 平行的 8 行) |
| `src/utils/perLayerWalls.ts` | UPDATE | (optional) `promoteToMultiLayer` 加 'empty' variant |
| `src/ui/editor/LevelTabs.tsx` | UPDATE | 加 `+ ∅` button (跟 `+` 平行) |
| `src/i18n/resources/en.ts` | UPDATE | 加 2 个 key (label + aria) |
| `src/i18n/resources/zh.ts` | UPDATE | 加 2 个 key (label + aria) |
| `tests/unit/store/editorStore.test.ts` | UPDATE | 加 addLevelEmpty test (3-4 case) |
| `tests/component/editor/EditorLevelTabs.test.tsx` | UPDATE | 加 `+ ∅` button test (1-2 case) |

### 边界检查
- 引擎层 (`src/engine/**`) 继续不 `import` react / zustand
- 新 action 跟 addLevel 共用 commitLevel path (single source of truth)
- audit grep 没动 (P0 #3 锁)

## 7. UI / UX 变更

### 屏幕 / 组件改动
- Editor 左侧 panel 底部 LevelTabs 工具栏: 现在是 `[L1 L2] [+] [-]` → 加 `+ ∅` button, 变成 `[L1 L2] [+] [+ ∅] [-]`

### 交互流程
1. 玩家 hover 左侧 panel bottom 看到 `[L1 L2 L3] [+] [+ ∅] [-]`
2. 点 `[+]`: 跟 P5-2 一样, 克隆 L3 到 L4 (新增空层先复制 L3 内容)
3. 点 `[+ ∅]`: 新增全 0 grid L4, currentLevel 跳 L4
4. 点 `[-]`: confirm dialog → 删 L4 (跟 P5-2 一样)

## 8. 错误处理

### 兜底行为
- editorStore addLevelEmpty 跟 addLevel 一样 1..6 clamp, 越界静默 return
- 现有 createEmptyGrid helper 是 P5-2 锁的, 复用零风险

## 9. 测试策略

### 单元测试
- `tests/unit/store/editorStore.test.ts` 加 3 case:
  - addLevelEmpty 单层 → 多层: 验证 walls2d 长度 + 0 + 走 mutex
  - addLevelEmpty 多层 → 多层: 验证新层全 0, 不复制当前
  - addLevelEmpty 6 层 (MAX) → 静默 return
- `tests/component/editor/EditorLevelTabs.test.tsx` 加 1-2 case:
  - 渲染 `+ ∅` button 存在
  - click `+ ∅` 调 addLevelEmpty (mock store)

### 性能 / 安全
- 无新 perf regression (addLevelEmpty 跟 addLevel 同样 O(width × depth) 操作)

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 加 addLevelEmpty 跟 addLevel 路径意外分开 | 低 | 同样走 commitLevel + currentLevel jump + levelCount clamp |
| `+ ∅` button 视觉跟 `+` 太像误点 | 中 | CSS 区分 (secondary / ghost), title + aria-label 描述 |
| createEmptyGrid 跟 P5-2 已 ship 的复用不同 | 低 | 复用同一个 helper, 单一 source of truth |
| editorStore 测试 fail (现有 test 期望 addLevel clone 行为不变) | 低 | addLevel 行为完全不变, 只加新 action |

## 11. 完成清单 (dod)

### 11.1 功能验收
- [ ] FR-1 addLevelEmpty store action
- [ ] FR-2 perLayerWalls 'empty' variant
- [ ] FR-3 LevelTabs `+ ∅` button
- [ ] FR-4 i18n 2 keys × 2 locales

### 11.2 引擎 / 架构边界
- [ ] 引擎层继续不 `import` react / zustand
- [ ] 公开 API 不破坏 (addLevel 行为完全不变)
- [ ] mutex 保持 (walls xor walls2d)

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%
- [ ] +3-4 editorStore case + +1-2 EditorLevelTabs case
- [ ] `npm run typecheck` 与 `npm run build` 通过
- [ ] pre-commit audit 没报 (P0 #3 锁)

### 11.4 文档
- [ ] `docs/increments/p1-addlevel-empty/spec.md` 已写
- [ ] `docs/increments/p1-addlevel-empty/plan.md` 已写

### 11.5 持久化与兼容
- [ ] 不破坏 localStorage schema
- [ ] 不新增 settings
- [ ] 现有 P5-1 teaching fixture 不变 (用 addLevel clone, 不是 addLevelEmpty)

### 11.6 安全与健壮性
- [ ] typecheck 0 error
- [ ] 0 console.log 残留
- [ ] 6 层 cap 静默 return (无 throw)

## 12. 参考

- P5-2 Decision A2: addLevel 克隆当前 layer (保留为主路径)
- P5-2 review L-2/L-3: over-defensive `?? 0` / `getCurrentLayerWalls` fallback
- P3-1 锁: levelCount 1..6
- P5-2 锁: walls xor walls2d mutex + perLayerWalls utils
- P0 #3 锁: pre-commit grep audit
- P1-4 review L-2: 跟 addLevelEmpty 无关但同 pattern (新 variant 加)
- createEmptyGrid helper (P5-2 附赠) 复用
