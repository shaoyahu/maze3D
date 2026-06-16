# P2-9 关卡编辑器 UX 修复 + 使用手册 — 实施计划（Plan）

**Spec**: `docs/increments/p2-9-editor-ux-fix-and-help/spec.md`
**复杂度**: Small–Medium
**日期**: 2026-06-16

> 步骤使用 `- []` 语法追踪。一次只做一个 Task，完成后勾选 + 跑验证。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `EditorTool` 增加 `'erase'` |
| `src/store/editorStore.ts` | UPDATE | `placeWall` set-to-1；新增 `placeErase`；`placePickup` 加 lastErrorKey |
| `src/ui/editor/EditorLeftDrawer.tsx` | UPDATE | TOOLS 数组增 'erase' + label "通道"；pickup label → 道具 |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | `handleCellClick` 增 erase 分支；顶部加 `?` 按钮 + 渲染 drawer |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 改 `addEnemyNode` 默认坐标算法 |
| `src/ui/editor/EditorTopBar.tsx` | UPDATE | 简化 hint 拼接（去重 pan 提示） |
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | "拾取" → "道具" |
| `src/ui/editor/EditorHelpDrawer.tsx` | CREATE | cheat-sheet 抽屉组件 |
| `src/i18n/resources/zh.ts` | UPDATE | 新增 `editor.help.*` + 改文案 |
| `src/i18n/resources/en.ts` | UPDATE | 新增 `editor.help.*` + 改文案 |
| `src/styles/theme.css` | UPDATE | 新增 `.editor-help__*` 样式 |
| `tests/unit/store/editorStore.test.ts` | UPDATE | placeWall / placeErase / placePickup 断言同步 |
| `tests/component/editor/EditorViewport.test.tsx` | UPDATE | wall → set；新增 erase 分支 |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | UPDATE | addEnemyNode 默认坐标断言 |
| `tests/component/editor/EditorLeftDrawer.test.tsx` | UPDATE | label 断言（拾取 → 道具）+ 新增 erase |
| `tests/component/editor/EditorHelpDrawer.test.tsx` | CREATE | cheat-sheet 测试 |
| `tests/e2e/editor.spec.ts` | UPDATE | `carveLShape` helper 适配 + 新增 `?` drawer 用例 |

## 任务清单

### Task 1: 拆分 wall / erase 工具（types + store + drawer + viewport）
- [ ] **Action**:
  - `src/maze/types.ts`: `EditorTool` 联合加 `'erase'`
  - `src/store/editorStore.ts`:
    - 改 `placeWall`：set-to-1（已是墙 no-op）；start/exit guard 不变
    - 新增 `placeErase(x, z)`：set-to-0；start/exit guard + `eraseOnStart` / `eraseOnExit` lastErrorKey
    - 加 `placeErase` action 到 `EditorStoreState` 接口
  - `src/ui/editor/EditorLeftDrawer.tsx`: TOOLS 加 `{ tool: 'erase', label: '通道', shortcut: 'B', icon: '⌫' }`，放在 `wall` 之后
  - `src/ui/editor/EditorViewport.tsx`: `handleCellClick` 增 `else if (tool === 'erase') placeErase(x, z);`
- [ ] **Mirror**: `placeStart` 的 silent-reject + lastErrorKey 模式
- [ ] **Test**: 单测 + 组件测覆盖 wall set-to-1 / erase set-to-0 / start-exit 保护
- [ ] **Validate**: `npm run typecheck && npx vitest run tests/unit/store/editorStore.test.ts tests/component/editor/EditorViewport.test.tsx tests/component/editor/EditorLeftDrawer.test.tsx`

### Task 2: 修复 `addEnemyNode` 默认坐标算法（panel + store）
- [ ] **Action**:
  - `src/ui/editor/EditorPropertiesPanel.tsx`:
    - 计算默认 `(x, z)`：取 `path[length-1]` + 末段方向（dx, dz 各自 = +1 / -1 / 0）
    - 若 OOB 或与末节点重合 → 改用 spawn 坐标兜底（现状行为）
    - 加 lastErrorKey：`editor.lastError.pathNodeOverlap` / `pathNodeOutOfBounds`
  - `src/store/editorStore.ts`: `addEnemyNode` 增加 lastErrorKey（OOB / 重合时）
- [ ] **Mirror**: `appendEnemyPathNode` 的 last 节点检测模式
- [ ] **Test**: 改 `EditorPropertiesPanel.test.tsx` 现有 addEnemyNode 断言 + 新增"OOB 不变"用例
- [ ] **Validate**: `npx vitest run tests/component/editor/EditorPropertiesPanel.test.tsx`

### Task 3: `placePickup` 加 lastErrorKey 通道（store + i18n）
- [ ] **Action**:
  - `src/store/editorStore.ts`:
    - `placePickup` 在墙上 → `set({ lastErrorKey: 'editor.lastError.pickupOnWall' })`
  - `src/i18n/resources/zh.ts` + `en.ts`: 加 `editor.lastError.pickupOnWall` 两条翻译
- [ ] **Mirror**: 现有 `editor.lastError.wallOnStart` 模式
- [ ] **Test**: 加单测 `placePickup` on wall cell → lastErrorKey
- [ ] **Validate**: `npx vitest run tests/unit/store/editorStore.test.ts`

### Task 4: UI 文案统一（tool label + hint + status bar + properties）
- [ ] **Action**:
  - `src/ui/editor/EditorLeftDrawer.tsx`: `pickup` label "拾取" → "道具"
  - `src/ui/editor/EditorStatusBar.tsx`: `editor.status.pickups` 文案 → "道具"
  - `src/ui/editor/EditorPropertiesPanel.tsx`: `pickupCard` label "拾取物" → "道具"
  - `src/ui/editor/EditorTopBar.tsx` + `src/i18n/resources/{zh,en}.ts`:
    - `editor.toolbar.hint.*` 6 条统一去掉"右键拖动平移"片段
    - 在 `EditorTopBar` 中独立渲染 pan 提示 chip（仅当 tool === 'pan' 时显示）
- [ ] **Mirror**: 现有 hint 模板
- [ ] **Test**: 改 `EditorLeftDrawer.test.tsx` label 断言；改 `EditorTopBar` 相关断言（如有）
- [ ] **Validate**: `npx vitest run tests/component/editor/`

### Task 5: 新增 EditorHelpDrawer 组件 + 顶部 `?` 入口
- [ ] **Action**:
  - 新建 `src/ui/editor/EditorHelpDrawer.tsx`:
    - `createPortal` + backdrop + ESC 关闭 + 点击 backdrop 关闭
    - 内容：4 章节（工具总览表 / 快捷键表 / 流程步骤 / 验收清单）
    - 所有文案走 `useT()` + i18n key
  - `src/ui/editor/EditorViewport.tsx`: 顶部右侧加 `?` 圆形按钮（icon "?" 或 "ⓘ"）
  - `src/i18n/resources/zh.ts` + `en.ts`: 加 `editor.help.*` 约 25-35 条
  - `src/styles/theme.css`: 加 `.editor-help__*` 样式（mirror `.warnings-popup__*` 命名）
- [ ] **Mirror**: `WarningsPopup` in `EditorStatusBar.tsx:25-109`
- [ ] **Test**: 新建 `EditorHelpDrawer.test.tsx`，覆盖：open/close/ESC/backdrop/章节内容渲染
- [ ] **Validate**: `npx vitest run tests/component/editor/EditorHelpDrawer.test.tsx`

### Task 6: 同步现有测试断言（wall set-to-1 / pickup label / etc.）
- [ ] **Action**:
  - `tests/unit/store/editorStore.test.ts`: 改所有 `placeWall` 断言（toggle → set-to-1）
  - `tests/component/editor/EditorViewport.test.tsx`: 改 wall toggle 测试 → set-to-1 测试；新增 erase 测试
  - `tests/component/editor/EditorLeftDrawer.test.tsx`: 改 "拾取" label 断言 → "道具"；新增 'erase' 按钮存在
  - `tests/component/editor/EditorPropertiesPanel.test.tsx`: 改 addEnemyNode 默认坐标断言
  - `tests/e2e/editor.spec.ts`: `carveLShape` helper 改用 erase 工具调用；新增 `?` drawer 用例
- [ ] **Validate**: `npm test && npm run test:e2e`

### Task 7: 跑全套验证 + 类型检查 + 文档收尾
- [ ] **Action**:
  - `npm run typecheck` → 0 error
  - `npm test` → 0 fail
  - `npm run build` → 0 error
  - `npm run test:e2e` → 0 fail（除已 skip 的）
  - `docs/roadmap.md` 把 P2-9 状态从 `🔄 in-progress` → `✅ done`
- [ ] **Validate**: 上述 4 个命令全绿

## 验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `placeWall` 行为变更破坏现有测试 | 高 | Task 6 同步改测试断言 |
| 现有 E2E `carveLShape` helper 依赖 toggle | 高 | Task 6 改用 erase 工具 |
| `addEnemyNode` 新默认坐标算法可能仍有问题 | 中 | Task 2 双重 guard（OOB + 重合），失败回退到 spawn |
| 帮助手册 i18n key parity | 低 | `keysParity.test.ts` 自动校验 |
| E2E 文字断言受 toolbar hint 改动影响 | 中 | grep e2e spec 中工具 hint 选择器 |

## 验收

- [ ] 所有 Task 1-7 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] `docs/roadmap.md` 中 P2-9 行从 `in-progress` → `done`
- [ ] 不自动 commit，等用户手动 `git add` + `git commit`

---

## 执行日志（实施时填写）

### 实施日期
2026-06-16

### 实际改动文件
（实施完成后回填）

### 遇到的偏差
（实施过程中与 spec 的差异）

### 测试覆盖
- 单元覆盖率：...%
- 新增 / 修改测试：...（条数）

### 备注
（任何给后续增量有参考价值的发现）
