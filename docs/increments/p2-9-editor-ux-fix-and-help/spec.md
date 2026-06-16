# P2-9 关卡编辑器 UX 修复 + 使用手册 — 设计文档（Spec）

**Slug**: p2-9-editor-ux-fix-and-help
**状态**: in-progress（draft 2026-06-16）
**日期**: 2026-06-16
**对应路线图项**: P2-9
**依赖**: P2-4b（关卡编辑器）
**复杂度**: Small–Medium

## 1. 概述

P2-4b 交付了关卡编辑器，但实际使用暴露了多处语义错误、命名混淆与 UX 死路。本增量集中修复 5 个已知 bug，并为首次进入编辑器的用户提供可随时调用的"使用手册"面板（cheat-sheet drawer）作为长期可查的参考文档。修复后编辑器工具语义清晰、行为可预测、文档随手可查。

## 2. 目标 / 非目标

### 目标
- G-1：消除 `wall` 工具 toggle 行为与 UI 文案/用户期望的不一致
- G-2：消除 `EnemyForm` "+ 添加节点" 按钮产生零长度路径 segment 的隐性 bug
- G-3：让 `placePickup` 的静默拒绝走与其他放置操作一致的错误反馈通道
- G-4：把"拾取"工具 label 改成更直观的"道具"（UI 文本层）
- G-5：把"右键拖动平移"提示从每个工具 hint 中抽离，去重
- G-6：在 viewport 顶部加可折叠 cheat-sheet drawer，提供完整使用手册

### 非目标
- 不重做 minimap 渲染、不改 viewport 缩放
- 不改 properties panel 的 Card 折叠默认值
- 不改 `handleNew` 默认 15×15 行为
- 不重做 history 系统
- 不改 `Pickup` 类型名 / enum（仅 UI 文本层 rename）

## 3. 用户故事

- 作为 关卡设计师，我希望点"墙体"工具时**点击格子=放墙**，而不是"凿墙成路"，以便我能可预测地绘制迷宫布局
- 作为 关卡设计师，我希望"通道/橡皮擦"是一个独立工具，以便我能精准地把"墙体"工具的成果凿回成路
- 作为 关卡设计师，我希望敌人路径编辑的"+ 节点"按钮默认产生一个**有意义的下一个巡逻点**，而不是重复 spawn
- 作为 关卡设计师，我希望在拾取工具下点墙格时得到**明确的错误反馈**，而不是沉默无响应
- 作为 关卡设计师，我希望工具按钮 label 一看就懂（"墙体" / "通道" / "起点" / "终点" / "道具" / "敌人" / "平移" / "选择"），而不是模棱两可的"拾取"
- 作为 关卡设计师，我希望首次进入编辑器时能快速看到一份**完整使用手册**，且随时可重新打开查阅

## 4. 功能需求

- FR-1：`placeWall` 改为"始终设为墙"（set-to-1），已是墙时 no-op；保留 start/exit 保护 + lastErrorKey 通道
- FR-2：新增 `EditorTool = 'wall' | 'erase'` 的 `'erase'` 工具；新增 `placeErase(x, z)` set-to-0；起点/终点保护 + lastErrorKey 通道
- FR-3：`placePickup` 对墙上格子 → silent reject + set lastErrorKey (`editor.lastError.pickupOnWall`)
- FR-4：`addEnemyNode` 在 UI 调用处的默认坐标算法：从 `path[length-1]` 出发延伸一格（方向沿末段向量），OOB / 与末节点重合时 no-op
- FR-5：UI 文案：
  - tool label "拾取" → "道具"
  - tool hint 模板统一：`{action}`（不再每条重复"右键拖动平移"）
  - 顶部常驻 pan 提示（独立 line）
- FR-6：新增 `EditorHelpDrawer` 组件（cheat-sheet drawer）：
  - 入口：viewport 顶部右侧 `?` toggle 按钮
  - 抽屉从 viewport 顶部下滑展开，不挤压 viewport 宽度
  - 内容分 4 章节：① 工具总览；② 快捷键；③ 常用流程；④ 验收清单
  - ESC 关闭、点击 backdrop 关闭
  - i18n 完整（zh + en）

## 5. 数据 / 类型变更

### 新增 / 修改的类型
- `src/maze/types.ts`:
  ```ts
  export type EditorTool =
    | 'select'
    | 'wall'
    | 'erase'    // ← 新增
    | 'start'
    | 'exit'
    | 'pickup'
    | 'enemy'
    | 'pan';
  ```

### 新增 / 修改的 Store 字段
- `useEditorStore`（`src/store/editorStore.ts`）:
  - 改 `placeWall(x, z)`：set-to-1；已是墙 → no-op；保留 start/exit guard
  - 新增 `placeErase(x, z)`：set-to-0；起点/终点保护 + lastErrorKey
  - 改 `placePickup(x, z)`：增加 `editor.lastError.pickupOnWall` 通道
  - 改 `addEnemyNode`：保持 API（x, z 仍由 UI 决定），但 UI 调用处改用新算法

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `EditorTool` 增加 `'erase'` |
| `src/store/editorStore.ts` | UPDATE | `placeWall` 改语义；新增 `placeErase`；`placePickup` 加 lastErrorKey |
| `src/ui/editor/EditorLeftDrawer.tsx` | UPDATE | TOOLS 数组顺序 + 加 'erase' 入口（label "通道"，shortcut `B`）|
| `src/ui/editor/EditorViewport.tsx` | UPDATE | `handleCellClick` 增加 `tool === 'erase'` 分支 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 改 `addEnemyNode` 默认坐标算法 |
| `src/ui/editor/EditorTopBar.tsx` | UPDATE | hint 拼接方式简化（去掉 pan 重复片段）|
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE | "拾取" → "道具" |
| `src/ui/editor/EditorHelpDrawer.tsx` | CREATE | cheat-sheet drawer 组件 |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | 顶部右侧加 `?` 按钮，渲染 `EditorHelpDrawer` |
| `src/i18n/resources/zh.ts` | UPDATE | 新增 `editor.help.*` + 改文案 |
| `src/i18n/resources/en.ts` | UPDATE | 同上 |
| `src/styles/theme.css` | UPDATE | 新增 `.editor-help__*` 样式，复用 `.warnings-popup__*` 命名风格 |
| `tests/unit/store/editorStore.test.ts` | UPDATE | `placeWall` / `placeErase` / `placePickup` 测试断言同步 |
| `tests/component/editor/EditorViewport.test.tsx` | UPDATE | wall toggle → wall set；新增 erase 分支 |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | UPDATE | `addEnemyNode` 默认坐标断言 |
| `tests/component/editor/EditorHelpDrawer.test.tsx` | CREATE | cheat-sheet 抽屉测试 |
| `tests/component/editor/EditorLeftDrawer.test.tsx` | UPDATE | 工具按钮 label 断言（拾取 → 道具）+ 新增 erase 按钮 |
| `tests/e2e/editor.spec.ts` | UPDATE | `carveLShape` helper 适配 wall set-to-1 行为 |

### 新增模块
- `src/ui/editor/EditorHelpDrawer.tsx`：基于 `createPortal` + backdrop + ESC 关闭的抽屉组件

### 边界检查
- 引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import ✓
- `EditorTool` 联合扩展不影响 runtime（运行时 gameStore 不引用此类型）
- 新组件 `EditorHelpDrawer` 遵循 React 18 + Zustand 订阅约定（仅订阅 `useT`）

## 7. UI / UX 变更

### 屏幕 / 组件改动
- **EditorLeftDrawer**：工具顺序保持；在 'wall' 后插入 'erase'（label "通道"，shortcut `B`，icon ⌫）
- **EditorTopBar**：hint 文案变短（如 `墙体 · 在格子上点击放置墙体`），不再带"右键拖动平移"片段
- **EditorStatusBar**："拾取 N" chip → "道具 N"
- **EditorPropertiesPanel**："拾取物" Card → "道具" Card（仅 label）
- **EditorViewport**：顶部右侧新增 `?` 圆形按钮；点击展开 `EditorHelpDrawer`
- **新增 EditorHelpDrawer**：
  - 抽屉从 viewport 顶边下滑，宽度等于 viewport，最大高度 ≤ 60vh
  - 章节 anchor 导航 + 平滑滚动
  - 4 章节：① 工具总览表；② 快捷键表；③ 常用流程（新建关 → 摆墙 → 加敌人 → 保存）；④ 验收清单

### 交互流程
1. 用户首次进入编辑器，看到 viewport 顶部右侧的 `?` 按钮
2. 点击 `?` → 抽屉从顶边下滑（200ms 缓动）
3. 抽屉内 4 章节铺开：工具总览表 / 快捷键表 / 流程步骤 / 验收清单
4. 点击 backdrop / 按 ESC / 再次点 `?` → 抽屉收起
5. 抽屉状态局部（`EditorHelpDrawer` 自有 useState），不影响 undo/redo / dirty

## 8. 错误处理

### 新增错误码
- `editor.lastError.pickupOnWall`: "拾取物只能放在地面上（请先用通道工具凿出地面再放拾取）"（zh）/ "Pickups can only be placed on floor cells — use the Erase tool first"（en）
- `editor.lastError.eraseOnStart`: "起点不能被擦除"
- `editor.lastError.eraseOnExit`: "终点不能被擦除"

### 兜底行为
- `placeWall` OOB / 在 start/exit → silent reject + lastErrorKey（沿用现有 wallOnStart/wallOnExit 通道）
- `placeErase` OOB / 在 start/exit → silent reject + lastErrorKey（新增 eraseOnStart/eraseOnExit）
- `placePickup` 在墙 → silent reject + lastErrorKey（新增 pickupOnWall）
- `addEnemyNode` 默认坐标 OOB 或与末节点重合 → no-op（不弹错误，UI 上保持按钮可点，但点击无效果——沿用现有 silent reject 风格）

## 9. 测试策略

### 单元测试（vitest）
- `editorStore.test.ts`:
  - 改 `placeWall`：默认全墙下点击 → 仍是墙；墙→墙 no-op；路→墙 设墙
  - 新增 `placeErase` 测试：路→墙；墙→路；起点/终点保护；OOB no-op
  - 改 `placePickup`：在墙格 set lastErrorKey (`pickupOnWall`)
- 不动 `editorHistory.test.ts`（pure module 不变）

### 组件测试（RTL）
- `EditorViewport.test.tsx`:
  - 改 wall 工具：点击墙 → 仍是墙；点击路 → 变墙（不再是 toggle）
  - 新增 erase 工具：点击墙 → 变路；点击路 → 仍是路；start/exit 保护
- `EditorPropertiesPanel.test.tsx`:
  - 改 `addEnemyNode`：path 末节点右侧无墙时 → 自动延伸一格
  - 改 `addEnemyNode`：path 末节点 +1 OOB → no-op（path 长度不变）
- `EditorLeftDrawer.test.tsx`:
  - 改 label 断言："拾取" → "道具"
  - 新增 erase 按钮存在性 + 快捷键 'B'
- `EditorHelpDrawer.test.tsx`（新增）:
  - 默认不渲染（open=false）
  - open=true 时渲染 4 章节
  - 按 ESC 触发 onClose
  - 点击 backdrop 触发 onClose

### E2E 测试（Playwright）
- `editor.spec.ts`:
  - `carveLShape` helper 适配：以前依赖 toggle，现在改用 erase 工具或 reverse-the-walls
  - 新增用例：点 `?` → drawer 展开 → 看到 4 章节 → ESC 收起
  - 新增用例：wall 工具下点全墙初始格子 → 仍是墙（不再变路）

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `placeWall` 行为变更破坏现有测试 | 高 | 同步更新 `EditorViewport.test.tsx`、`editorStore.test.ts`、`editor.spec.ts` 三套断言 |
| 现有 E2E `carveLShape` helper 依赖 toggle | 高 | 改为 `erase` 工具调用 |
| `addEnemyNode` 新默认坐标算法可能让 spawn cell 重复 | 中 | 取末节点 +1 格 + OOB / 重合双重 guard |
| 新增 `erase` 工具快捷键冲突 | 低 | `B`（brush），与现有 V/W/S/E/P/M/H 不冲突 |
| 帮助手册 i18n key parity | 低 | 跑 `tests/unit/i18n/keysParity.test.ts` 自动校验 |
| E2E 文字断言受 toolbar hint 改动影响 | 中 | grep e2e spec 中工具 hint 选择器后再改 |
| cheat-sheet drawer 遮挡 viewport 顶边 | 中 | 抽屉最大高度 60vh + 仅在 open 时渲染，关闭后完全无副作用 |

## 11. 完成清单（参考 `_template/dod.md`）

### 11.1 功能验收
- [ ] FR-1 ~ FR-6 全部实现
- [ ] 用户能从 UI 端到端走通：① 切墙体工具 → 点格子变墙；② 切通道工具 → 点格子变路；③ 点 `?` → 抽屉展开 → 看到完整手册
- [ ] 边界情况：起点/终点保护、OOB 保护、silent reject 反馈均覆盖

### 11.2 引擎 / 架构边界
- [ ] 引擎层不新增对 `react` / `store/` 的 import
- [ ] `EditorTool` 联合扩展不影响 runtime gameStore

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%（`src/**`）
- [ ] 新增的 `placeErase` action 必有对应单测
- [ ] 涉及 UI 改动必有 RTL 组件测试
- [ ] 涉及端到端流程改动（cheat-sheet）必有 Playwright E2E
- [ ] `npm run typecheck` 与 `npm run build` 通过

### 11.4 文档
- [ ] `docs/increments/p2-9-editor-ux-fix-and-help/spec.md` 已写入
- [ ] `docs/increments/p2-9-editor-ux-fix-and-help/plan.md` 所有 checkbox 已勾
- [ ] `docs/roadmap.md` 添加 P2-9 项（in-progress → done）

### 11.5 持久化与兼容
- [ ] 不破坏现有 `localStorage` schema
- [ ] 不修改任何 seed 编码（保留 best record 兼容）

### 11.6 安全与健壮性
- [ ] 用户输入校验到位（OOB / 重合 / start-exit 互斥）
- [ ] 错误处理走 `lastErrorKey` + `t()` 翻译通道
- [ ] 无 console.log / debugger 残留

## 12. 参考
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
- 相关 F-tag：
  - `F-2026-06-15-C-1`（placeStart/placeExit 互斥保护）
  - `F-2026-06-15-M-4.5`（Esc 全局 handler）
  - `F-2026-06-15-H-3.5`（updateSize 清空 selection）
  - `F-2026-06-15-M-4.4`（removeEnemyNode 边界）
  - `F-project-review-2026-06-13-A-HIGH-2`（saveLevel 解耦）
