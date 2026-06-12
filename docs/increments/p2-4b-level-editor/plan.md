# 关卡编辑器 — 实施计划（Plan）

**Spec**: `docs/increments/level-editor/spec.md`
**Roadmap**: `docs/increments/_template/roadmap.md` § P2-4b
**复杂度**: Large（3–5 天）
**日期**: 2026-06-10

> 步骤使用 `- []` 语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。
>
> **范围声明**：本 plan 是 P2-4b 专用（关卡编辑器），不包含 P2-4a 的敌人 / survive 逻辑。编辑器与 game 运行时严格隔离：`useEditorStore` 不 import Three.js；`src/ui/editor/*` 不 import Three.js；`EditorMazeProvider` 复用 `JsonMazeProvider.validateMaze` 作为唯一结构校验入口。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `Pickup.id` + `EditorTool` + `ExportEnvelope` + `SCHEMA_VERSION` + `CUSTOM_LEVEL_PREFIX` |
| `src/utils/id.ts` | CREATE | `generateId()` = `crypto.randomUUID()` |
| `src/store/editorHistory.ts` | CREATE | snapshot 栈 + push/undo/redo 纯函数 |
| `src/maze/importExport.ts` | CREATE | envelope 序列化 / 解析 / Blob 下载 / File 读取 |
| `src/maze/JsonMazeProvider.ts` | UPDATE | `validateMaze` 导出供编辑器复用（行为不变） |
| `src/store/levelStore.ts` | UPDATE | +`customLevels` + `saveCustom/getCustom/deleteCustom/listCustom` + 持久化 |
| `src/maze/EditorMazeProvider.ts` | CREATE | custom + builtin 合并 |
| `src/store/editorStore.ts` | CREATE | 完整编辑器状态机（Zustand）|
| `src/ui/editor/editorValidation.ts` | CREATE | warn-only 设计校验 |
| `src/ui/editor/EditorViewport.tsx` | CREATE | HTML/CSS Grid 2D viewport |
| `src/ui/editor/EditorPropertiesPanel.tsx` | CREATE | 右栏属性表单 |
| `src/ui/editor/EditorToolbar.tsx` | CREATE | 工具 / Save / Export / Import / Undo/Redo |
| `src/ui/editor/EditorStatusBar.tsx` | CREATE | 警告 / dirty / schemaVersion |
| `src/ui/editor/EditorPage.tsx` | CREATE | 顶层页 + 键盘快捷键 + 路由 |
| `src/ui/MainMenu.tsx` | UPDATE | +"关卡编辑器" 按钮 |
| `src/ui/LevelSelect.tsx` | UPDATE | +"我的关卡" 分组 |
| `src/App.tsx` | UPDATE | +`/editor` 路由 + 切换 MazeProvider 实现 |
| `tests/unit/store/editorHistory.test.ts` | CREATE | push/undo/redo/HISTORY_LIMIT/future 清空 |
| `tests/unit/maze/importExport.test.ts` | CREATE | roundtrip / schemaVersion reject / 缺 level / validateMaze wrap |
| `tests/unit/maze/EditorMazeProvider.test.ts` | CREATE | custom 优先 / fallback / list 合并 |
| `tests/unit/store/levelStore.customLevels.test.ts` | CREATE | 持久化 / sanitize / deleteCustom |
| `tests/unit/store/editorStore.test.ts` | CREATE | 所有 action + dirty + history 同步 |
| `tests/unit/ui/editor/editorValidation.test.ts` | CREATE | 可达性 / 空 pickup / enemy path<2 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | EXTEND | Pickup.id 缺省补 UUID；旧 JSON 兼容 |
| `tests/component/editor/EditorViewport.test.tsx` | CREATE | 渲染 / 点击 / 拖拽 / 选中态 |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | CREATE | pickup / enemy / wall 表单 |
| `tests/component/editor/EditorToolbar.test.tsx` | CREATE | 工具切换 / Save / Export |
| `tests/component/editor/EditorPage.test.tsx` | CREATE | 键盘快捷键 / 路由 / 退出 confirm |
| `tests/component/levelSelect.custom.test.tsx` | CREATE | "我的关卡" 分组渲染 |
| `tests/e2e/editor.spec.ts` | CREATE | 建关 → Save → 退出 → LevelSelect 进入 → 通关 |
| `README.md` | UPDATE | 移除 P2-4b（完成后） |
| `docs/increments/_template/roadmap.md` | UPDATE | P2-4b 行 → done（完成后） |

---

## 任务清单

### Task 1: types.ts 扩展

- [ ] **Action**：`src/maze/types.ts`：
  - `Pickup` 加 `id: string`（编辑器分配，构造时 `crypto.randomUUID()`，从 `JsonMazeProvider` 加载时若缺省自动补 UUID）
  - 新增 `EditorTool = 'select' | 'wall' | 'start' | 'exit' | 'pickup' | 'enemy' | 'pan'`
  - 新增 `SCHEMA_VERSION = 1 as const` + `ExportEnvelope { schemaVersion, level: MazeData }`
  - 新增 `CUSTOM_LEVEL_PREFIX = 'custom-'`
- [ ] **Validate**：`npm run typecheck` 通过；`tests/unit/maze/JsonMazeProvider.test.ts` 追加 Pickup.id 缺省补 UUID 的 case（旧 JSON 兼容）。

### Task 2: utils/id.ts

- [ ] **Action**：`src/utils/id.ts`：
  - 导出 `generateId(): string` = `typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : \`fallback-${Date.now()}-${Math.random()}\``
- [ ] **Validate**：`npm run typecheck` 通过；轻量单测：连续两次调用结果不同。

### Task 3: editorHistory.ts

- [ ] **Action**：`src/store/editorHistory.ts`：
  - `HISTORY_LIMIT = 50` 常量
  - `Snapshot = { level: MazeData, selection: Selection | null }`（`structuredClone` 隔离）
  - `pushHistory(state, nextLevel, nextSelection): EditorState` 纯函数（past +1、future 清空、past 截断到 HISTORY_LIMIT-1）
  - `undo(state): EditorState`：从 past 弹一项，存到 future
  - `redo(state): EditorState`：从 future 弹一项，存到 past
  - 空栈时 `undo/redo` 返回原 state
- [ ] **Validate**：`tests/unit/store/editorHistory.test.ts` 覆盖：
  - push → past.length=1、future 清空
  - undo → past-1、future+1、level 还原
  - redo 恢复 undo
  - 50 次 push 超限 → past 截断到 50
  - undo 后再 push → future 清空

### Task 4: importExport.ts

- [ ] **Action**：`src/maze/importExport.ts`：
  - `exportLevel(level: MazeData): string` 返回 JSON.stringify({ schemaVersion: 1, level }, null, 2)
  - `class ImportError extends Error`
  - `parseImport(raw: string): { level: MazeData, nameToPreserve: string }`：JSON.parse → schemaVersion === 1 → level 存在 → `validateMaze(level, level.id)`（复用 JsonMazeProvider）
  - `downloadAsJsonFile(filename: string, content: string)`：Blob + a.click + revokeObjectURL
  - `readJsonFile(file: File): Promise<string>`：file.text() + 后缀白名单（`.json` / `.maze3d.json`）
  - `sanitizeFilename(name: string): string`：`[^\w-]` → `_`
- [ ] **Validate**：`tests/unit/maze/importExport.test.ts` 覆盖：
  - exportLevel + parseImport roundtrip 字段一致
  - schemaVersion=2 → ImportError
  - 缺 level 字段 → ImportError
  - level 缺 size → validateMaze 抛 → ImportError 包裹
  - 文件名 sanitize 正确（中文 / 空格 → 下划线）

### Task 5: JsonMazeProvider 导出 validateMaze

- [ ] **Action**：`src/maze/JsonMazeProvider.ts`：
  - 把 `validateMaze` 从内部函数改为 `export function validateMaze(raw: unknown, id: string): MazeData`
  - 所有现有调用方（`JsonMazeProvider.load` 内）继续工作（不破坏 API）
  - 解析 Pickup 时若 id 缺省：`p.id = generateId()`（向后兼容 P2-4a 之前的 JSON 关卡）
- [ ] **Validate**：`npm run typecheck` + 现有 `tests/unit/maze/JsonMazeProvider.test.ts` 全绿；追加 Pickup 无 id 字段自动补的 case。

### Task 6: levelStore.customLevels

- [ ] **Action**：`src/store/levelStore.ts`：
  - 新增 `customLevels: Record<string, MazeData>`（localStorage key `maze3d.customLevels.v1`）
  - 新增 actions：`saveCustom(level)` / `getCustom(id)` / `deleteCustom(id)` / `listCustom()`
  - `saveCustom` 流程：先 `validateMaze`（结构兜底）；sanitize Map（缺字段丢弃）；写 localStorage；set state
  - 初始化时从 localStorage 读 + sanitize
- [ ] **Validate**：`tests/unit/store/levelStore.customLevels.test.ts` 覆盖：
  - saveCustom → localStorage 写入 + state 更新
  - 读 localStorage 缺字段 → sanitize 丢弃 + console.warn
  - deleteCustom → 从 localStorage 移除
  - listCustom → 返回所有 id
  - saveCustom 结构错误（start 在墙上）→ 抛错 + 不写

### Task 7: EditorMazeProvider

- [ ] **Action**：`src/maze/EditorMazeProvider.ts`：
  - `class EditorMazeProvider implements MazeProvider`
  - 构造：`constructor(private custom: Record<string, MazeData>, private fallback: JsonMazeProvider)`
  - `load(id)`：custom 优先；缺则 fallback
  - `list()`：`[...Object.keys(custom), ...await fallback.list()]`
- [ ] **Validate**：`tests/unit/maze/EditorMazeProvider.test.ts` 覆盖：
  - custom[id] 存在 → 返回 custom 版本
  - custom 不存在 → fallback 到 JsonMazeProvider
  - list() 合并，custom 在前
  - custom 含无效 MazeData（结构错误）→ fallback 仍可用（custom 不污染 fallback）

### Task 8: useEditorStore（核心）

- [ ] **Action**：`src/store/editorStore.ts`：
  - `interface Selection = { kind: 'pickup'; id } | { kind: 'enemy'; id } | { kind: 'wall'; x, z }`
  - `interface EditorState { level, tool, selection, camera, history, dirty, ...actions }`
  - **actions**（TDD 逐个写）：
    - `newLevel(width, depth)`：创建空 MazeData（id=`custom-${generateId()}`，name="新关卡"，walls=全 1，start=(0,0)，exit=(width-1, depth-1)，0 pickups，0 enemies，rules={initialTime:60, maxHealth:3, victory:'reach-exit', timeOnPickup:10}）；重置 history、dirty
    - `loadLevel(maze)`：替换 level；重置 history、dirty
    - `saveLevel()`：调 `useLevelStore.getState().saveCustom(level)`；dirty=false；push history 不必要（保存是 IO 不影响数据）
    - `setTool(tool)`：仅 setTool（不推栈）
    - `placeWall(x, z)`：toggle walls[z][x]；pushHistory
    - `placeStart(x, z)` / `placeExit(x, z)`：set start/exit（坐标合法性校验：在界内且非墙）；pushHistory
    - `placePickup(x, z)`：push 新 pickup（id=generateId(), type='time', value=10）；clearSelection；pushHistory
    - `placeEnemy(x, z, width)`：push 新 enemy（id=generateId(), path=[(x,z), (min(x+1, width-1), z)]）；pushHistory
    - `updatePickup(id, patch)` / `updateEnemy(id, patch)` / `updateRule(patch)` / `updateName(name)` / `updateSize(width, depth)`：相应更新；input blur 防抖 300ms 后 pushHistory
    - `moveEnemyNode(enemyId, nodeIndex, x, z)`：clamp [0, width/depth-1]；pushHistory
    - `addEnemyNode(enemyId, x, z)`：插入到 path 末尾；pushHistory
    - `removeEnemyNode(enemyId, nodeIndex)`：保留 ≥2 节点（拒绝删到 <2）；pushHistory
    - `select(sel)` / `clearSelection()`（不推栈）
    - `deleteSelected()`：按 selection.kind 删除；pushHistory
    - `undo()` / `redo()`：调 `editorHistory` 纯函数
    - `saveDraft()` / `loadDraft()`：写 / 读 `maze3d.editorDraft.v1`
    - `importJson(raw)` / `exportJson()`：调 importExport
    - `setCamera(patch)`：仅 setCamera（不推栈）
- [ ] **Validate**：`tests/unit/store/editorStore.test.ts` 覆盖（≥25 case）：
  - newLevel 默认值 / loadLevel 替换 / saveLevel 调底层 + dirty
  - 所有 place action 的 happy path + 边界（placeStart 在墙上拒绝）
  - placePickup 自动生成 id；两次 place id 不同
  - placeEnemy 默认 2 节点 path（width=1 时右邻 clamp）
  - updatePickup/enemy/rule/name/size 的 patch 行为
  - moveEnemyNode clamp；addEnemyNode 末尾插入；removeEnemyNode 拒绝 <2
  - deleteSelected 三种 selection 类型分别测
  - undo / redo 与 history 同步；push 后 future 清空
  - 工具切换 / 相机 / selection 不推栈
  - importJson 重置 id 为 custom-<uuid>；保留 name

### Task 9: editorValidation.ts

- [ ] **Action**：`src/ui/editor/editorValidation.ts`：
  - `interface ValidationIssue { severity: 'error' | 'warning'; message: string; where?: string }`
  - `validateDesign(level: MazeData): ValidationIssue[]`：
    - exit 不可达（BFS 用 `maze/generators/_isReachable.ts`）→ warning
    - 0 pickup → warning
    - 任何 enemy path < 2 → warning（理论上 editor 已阻止；兜底）
    - start/exit 在墙 → error（兜底）
- [ ] **Validate**：`tests/unit/ui/editor/editorValidation.test.ts` 覆盖：
  - exit 不可达 → warning
  - 0 pickup → warning
  - enemy path < 2 → warning
  - start 在墙 → error
  - 干净关卡 → []

### Task 10: EditorViewport

- [ ] **Action**：`src/ui/editor/EditorViewport.tsx`：
  - `display: grid` 容器，列数 = level.size.width，行数 = level.size.depth
  - 每格渲染：墙 → 灰底；起点 → 绿三角；终点 → 绿双环；空 → 透明
  - 绝对定位子元素：pickup（CSS 颜色 by type）/ enemy（红圆 + path 节点 + 虚线连线）
  - 鼠标滚轮 → camera.zoom；右键拖拽 → camera.x/y
  - 点击事件：onCellClick(x, z) → 用 store.tool 派发到对应 place action
  - select 工具：点击对象 → store.select(...)，点击空白 → clearSelection
  - 选中态：outline 2px solid var(--accent)
- [ ] **Validate**：`tests/component/editor/EditorViewport.test.tsx` 覆盖：
  - 渲染指定 width×depth 网格
  - 墙 / 起点 / 终点 / pickup / enemy 各自正确显示
  - 点击空格 → placeWall（mock store）
  - 滚轮 → camera.zoom 改变
  - 选中对象有 outline class

### Task 11: EditorPropertiesPanel

- [ ] **Action**：`src/ui/editor/EditorPropertiesPanel.tsx`：
  - 订阅 `useEditorStore(s => s.selection)` 和 `(s => s.level)`
  - `selection === null`：关卡元数据表单（name input / size inputs / rules inputs：initialTime / maxHealth / victory radio / timeOnPickup）
  - `selection.kind === 'pickup'`：type select / value input / Delete
  - `selection.kind === 'enemy'`：spawn position readonly / path 节点列表（每行 xz inputs + 删除按钮 + 末尾 Add 按钮）/ dwell / fovRange / fovAngleDeg inputs / Delete
  - `selection.kind === 'wall'`：仅 Delete
  - input onBlur 防抖 300ms 调 update*；Delete 调 deleteSelected
- [ ] **Validate**：`tests/component/editor/EditorPropertiesPanel.test.tsx` 覆盖：
  - selection=null → 元数据表单
  - selection=pickup → type/value 显示 + Delete
  - selection=enemy → path 节点列表 + Add/Delete 节点
  - selection=wall → 仅 Delete
  - Delete 按钮触发 deleteSelected

### Task 12: EditorToolbar

- [ ] **Action**：`src/ui/editor/EditorToolbar.tsx`：
  - 7 工具按钮（互斥 active 态，调 setTool）
  - Undo/Redo 按钮（disabled 当 past/future 为空）
  - New 按钮（confirm 后 newLevel(15, 15)）
  - Save 按钮（调 saveLevel，显示成功 toast）
  - Save & Exit 按钮（saveLevel + navigate('/')）
  - Export 按钮（调 exportJson → downloadAsJsonFile）
  - Import 按钮（隐藏 `<input type="file">`，change 时 readJsonFile → importJson）
  - name input（受控，onBlur → updateName）
- [ ] **Validate**：`tests/component/editor/EditorToolbar.test.tsx` 覆盖：
  - 7 工具按钮渲染，active 态切换
  - Undo 按钮在 past 为空时 disabled
  - Export 调 downloadAsJsonFile（mock）
  - Import 文件选择触发 importJson

### Task 13: EditorStatusBar

- [ ] **Action**：`src/ui/editor/EditorStatusBar.tsx`：
  - 显示 dirty 状态："● 未保存" / "已保存于 HH:MM:SS"
  - 显示警告数：`validateDesign(level).filter(severity='warning').length`
  - 显示 schemaVersion：`SCHEMA_VERSION 1`
  - 显示缩略统计：walls 数 / pickups 数 / enemies 数
- [ ] **Validate**：snapshot 测试基本渲染 + dirty 状态切换。

### Task 14: EditorPage（组合）

- [ ] **Action**：`src/ui/editor/EditorPage.tsx`：
  - 布局：顶部 EditorToolbar / 中部 EditorViewport（flex-1）/ 右栏 EditorPropertiesPanel（320px）/ 底部 EditorStatusBar
  - 挂载时：检查 `maze3d.editorDraft.v1`；存在 → confirm "发现未保存草稿，是否恢复？"
  - 全局键盘：`Ctrl+Z` / `Cmd+Z` → undo；`Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` → redo（焦点不在 input 时）
  - 退出处理：路由变化时若 dirty → `confirm('未保存。是否保存？')`；是 → saveLevel；否 → 删草稿；取消 → 阻止路由
  - 自动保存：useEffect 监听 level 变化 → 2s 防抖 → saveDraft
- [ ] **Validate**：`tests/component/editor/EditorPage.test.tsx` 覆盖：
  - 渲染四个子组件
  - Ctrl+Z 触发 undo
  - 退出 dirty 时 confirm 弹窗
  - 草稿恢复 confirm

### Task 15: MainMenu 加按钮

- [ ] **Action**：`src/ui/MainMenu.tsx`：
  - 在"开始游戏"按钮旁加 "关卡编辑器" 按钮 → `navigate('/editor')`
- [ ] **Validate**：`tests/component/mainMenu.test.tsx` 扩展：按钮存在 + 点击触发 navigate（mock router）。

### Task 16: LevelSelect "我的关卡" 分组

- [ ] **Action**：`src/ui/LevelSelect.tsx`：
  - 订阅 `useLevelStore(s => s.customLevels)`
  - 在底部加 "我的关卡" 分组（仅 `Object.keys(customLevels).length > 0` 时显示）
  - 每条：name + size + Delete 按钮（confirm 后 deleteCustom）
  - 点击关卡 → 直接 `gameStore.startLevel(level)`，options 默认
  - App.tsx：把 `useGameStore` 的 provider 替换为 `EditorMazeProvider(customLevels, JsonMazeProvider)`
- [ ] **Validate**：`tests/component/levelSelect.custom.test.tsx` 覆盖：
  - customLevels 为空时不显示分组
  - customLevels 非空时显示分组 + 每条 name/size/Delete
  - Delete 按钮触发 deleteCustom

### Task 17: App.tsx 路由 + provider 切换

- [ ] **Action**：`src/App.tsx`：
  - 加 `/editor` 路由 → `<EditorPage />`
  - 在 Router 顶层用 `useLevelStore` 构造 `EditorMazeProvider`，传给 `GameCanvas`
  - 现有路由保持不变
- [ ] **Validate**：`npm run typecheck` + `npm run build` 通过；现有 E2E 全绿（`enemies.spec.ts` / `survive.spec.ts` / `time-trial.spec.ts` / `pause-resume.spec.ts`）。

### Task 18: E2E editor.spec.ts

- [ ] **Action**：`tests/e2e/editor.spec.ts`：
  1. MainMenu → 点 "关卡编辑器" → 路由 `/editor`
  2. 创建 15×15 关 → 放墙（清中间一片）→ 起点 (1,1) → 终点 (13,13) → 1 pickup (type=time, value=30) → 1 enemy（3 节点 path）
  3. 命名 "测试关卡" → Save → 退出
  4. MainMenu → 开始游戏 → LevelSelect 看见 "测试关卡" → 进入 → 通关（走到 (13,13) 即可，简化验证：玩家坐标 ≈ exit 坐标）
  5. Export → 下载文件 → 删除 localStorage → 刷新 → Import 同文件 → 编辑器 state 一致
  6. Import schemaVersion=2 文件 → 错误 toast / alert
- [ ] **Validate**：E2E 全绿；CI 不退化。

### Task 19: 文档同步

- [ ] **Action**：
  - `README.md`：移除 "Future increments" 段的 P2-4b 行
  - `docs/increments/_template/roadmap.md`：P2-4b 行 → done (2026-06-10)
  - 顶部"活跃增量"更新为下一个待办（或 "P2-N/A：等待用户决策"）
- [ ] **Validate**：`git grep "P2-4b"` 仅命中历史 commit，不在文档里。

---

## 任务依赖关系

- Task 1, 2, 5 互相独立，可并行
- Task 3 依赖 Task 1（Snapshot.level 用 MazeData 类型）
- Task 4 依赖 Task 1（ExportEnvelope 类型）+ Task 5（validateMaze 导出）
- Task 6 依赖 Task 5（saveCustom 走 validateMaze）
- Task 7 依赖 Task 5 + Task 6
- Task 8 依赖 Task 1, 2, 3, 4, 6
- Task 9 依赖 Task 1
- Task 10-13 依赖 Task 8
- Task 14 依赖 Task 10-13
- Task 15-17 依赖 Task 14 + Task 7
- Task 18 依赖 Task 17
- Task 19 最后

## 执行顺序建议

1. Task 1, 2, 5（并行 / 同一 session）
2. Task 3, 4
3. Task 6, 7
4. Task 8（核心，独立 session）
5. Task 9（与 8 并行）
6. Task 10, 11, 12, 13（按顺序）
7. Task 14
8. Task 15, 16, 17
9. Task 18
10. Task 19

## 预估

| 阶段 | 任务数 | 预估工时 |
|---|---|---|
| 数据基础 | Task 1-5 | 0.5 天 |
| Store 层 | Task 6-8 | 1 天 |
| UI 组件 | Task 9-14 | 1.5 天 |
| 集成 | Task 15-17 | 0.5 天 |
| E2E + 文档 | Task 18-19 | 0.5 天 |
| **合计** | **19** | **4 天** |