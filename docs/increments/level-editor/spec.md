# 关卡编辑器 — 设计文档（Spec）

**Slug**: level-editor
**状态**: draft
**日期**: 2026-06-10
**对应路线图项**: P2-4b
**依赖**: 无（独立；复用 P2-4a 已 ship 的 `MazeData.enemies` / `Pickup` 字段）
**复杂度**: Large（3–5 天）
**注意**: 原 P2-4（X-Large，敌人 + 编辑器）拆分为 P2-4a（已 ship）和 P2-4b（本文件）。本 spec 不包含敌人 / survive mode 逻辑。

## 1. 概述

在已有 `JsonMazeProvider` / `AlgorithmMazeProvider` 之上，新增**关卡编辑器**：

(a) **本地创作**：玩家在浏览器里以 top-down 2D 视角放置墙 / 起点 / 终点 / pickup / enemy（含巡逻路径）/ rules，得到一个可玩的自定义关卡；保存到 localStorage 的 `customLevels`。
(b) **分享**：把当前关卡以 `{ schemaVersion: 1, level: MazeData }` 的 JSON 包装导出为 `.maze3d.json`；同样可以从文件导入别人的关卡进入编辑器。

编辑器与游戏运行时**完全解耦**：编辑器只用 HTML/CSS/SVG 渲染 2D 网格与对象，不用 Three.js；保存后的 `MazeData` 走 `EditorMazeProvider` → `gameStore.startLevel`，与现有算法关卡共用 `JsonMazeProvider.validateMaze` 作为唯一结构校验入口。

## 2. 目标 / 非目标

### 目标

- 新增 `src/ui/editor/EditorPage.tsx`：编辑器顶层页（路由 `/editor`）
- 新增 `src/store/editorStore.ts`：编辑器状态机（level / tool / selection / camera / history / dirty）
- 新增 `src/store/editorHistory.ts`：snapshot-based Undo/Redo 栈（HISTORY_LIMIT=50）
- 新增 `src/maze/EditorMazeProvider.ts`：合并 `customLevels` + `JsonMazeProvider`，让游戏可加载自定义关卡
- 新增 `src/maze/importExport.ts`：`ExportEnvelope` 序列化 / 解析 / schemaVersion 校验 / Blob 下载 / File 读取
- 新增 `src/ui/editor/editorValidation.ts`：warn-only 设计校验（出口不可达 / 无 pickup / enemy path < 2）
- 新增 `src/utils/id.ts`：`generateId()` = `crypto.randomUUID()`（编辑器内为 pickup / enemy 分配唯一标识）
- `Pickup` 接口加 `id: string` 字段（敌人已有 `EnemySpawn.id`，保持对齐）
- `levelStore` 加 `customLevels: Record<string, MazeData>`（localStorage key `maze3d.customLevels.v1`，与 `bestByLevel` 隔离）
- `LevelSelect.tsx` 加 "我的关卡" 分组（从 `customLevels` 列出）
- `MainMenu.tsx` 加 "关卡编辑器" 按钮（路由到 `/editor`）
- 关卡 ID 命名空间：自定义关卡强制 `id` 以 `custom-` 前缀，避免与 builtin / procedural seed 撞名

### 非目标

- 编辑器内实时试玩（玩家选了 save → exit → 从 LevelSelect 进入游戏 流程；不在编辑器内嵌 Play 模式）
- 编辑器内实时多人协同
- 编辑器撤销栈持久化（关闭浏览器即丢弃）
- 编辑器内嵌算法生成（v1 编辑器只编辑固定布局；算法关卡仍由 LevelSelect 走 AlgorithmMazeProvider）
- 缩略图 / 截图导出
- 多语言关卡名（v1 自由文本，UI 不约束字符集）

## 3. 用户故事

- 作为想造关的玩家，我想把墙点掉 / 点回来，看到网格立即变化
- 作为关卡设计者，我想放一个敌人，指定它走 A→B→C 的巡逻路径，回放时敌人就按这个走
- 作为关卡设计者，我想给拾取物选 time/health/key 并填 +10 / +1 数值
- 作为粗心的玩家，我希望我误删了一面墙可以 Ctrl+Z 撤销
- 作为创作者，我想把做好的关卡导出为文件发给别人，别人可以直接导入
- 作为玩家，我想在 LevelSelect 看到我保存过的所有自定义关卡，挑一个进去玩
- 作为玩家，我做了一半去吃饭，回来发现我没保存也还有最后一次自动保存的草稿

## 4. 功能需求

### 编辑器主流程（FR-1 ~ FR-6）

- FR-1：`MainMenu.tsx` 增加 "关卡编辑器" 按钮 → 路由到 `/editor`
- FR-2：`EditorPage.tsx` 顶层布局：顶部 56px 工具栏 + 中部 viewport flex-1 + 右侧 320px 属性面板 + 底部 32px 状态栏
- FR-3：`EditorToolbar.tsx` 工具：select / wall / start / exit / pickup / enemy / pan 七种工具按钮（互斥 active 态）
- FR-4：编辑器顶部右侧输入框显示并可编辑 `level.name`（自由文本，不影响 `level.id`）
- FR-5：`EditorToolbar.tsx` 按钮：New / Save / Save & Exit / Export / Import
- FR-6：`Ctrl+Z` / `Ctrl+Shift+Z` 全局快捷键触发 undo / redo（与浏览器默认快捷键一致；不影响表单 input 内文本编辑）

### Viewport（FR-7 ~ FR-12）

- FR-7：`EditorViewport.tsx` 是 HTML/CSS Grid 容器，列数 = `level.size.width`，行数 = `level.size.depth`，每格用 `data-x` / `data-z` 标识
- FR-8：鼠标滚轮缩放 viewport（zoom 范围 0.5–3.0），右键拖拽 pan（用 transform: translate）
- FR-9：cellSize 由 viewport 宽度反算（让网格始终铺满可用区域），墙 / 起点 / 终点 / pickup / enemy 用绝对定位子元素绘制
- FR-10：pickup 颜色由 `PickupType` 映射（与 `entities/Pickup.ts` PICKUP_COLORS 一致：time=金黄 / health=红 / key=蓝）
- FR-11：enemy 显示本体圆 + path 节点 + 节点间虚线连线
- FR-12：选中态对象描边 `outline: 2px solid var(--accent)`，但不阻挡下层点击事件

### 工具行为（FR-13 ~ FR-19）

- FR-13：wall 工具：点击格子切 `walls[z][x] = 0/1`；拖拽连续切换
- FR-14：start 工具：点击格子设置 `level.start = {x, z}`（与现有 JsonMazeProvider 校验一致：必须在界内且不在墙上）
- FR-15：exit 工具：同 start，但目标是 `level.exit`
- FR-16：pickup 工具：点击格子放置新 pickup（生成 `id`，type 默认 `time`，value 默认 `10`，立即清空 selection 让用户进属性面板设置）
- FR-17：enemy 工具：点击格子放置 enemy 起点 + 临时 2 节点 path（同 cell + 右邻 cell），用户进属性面板编辑 path 节点
- FR-18：select 工具：点击对象 → 选中（pickup/enemy/wall cell 三种 selection 类型）；点击空白 → 清空 selection
- FR-19：pan 工具：左键拖拽 = pan viewport（其他工具不受 pan 工具影响）

### 属性面板（FR-20 ~ FR-23）

- FR-20：selection 为 null：右栏显示关卡元数据表单（name / size / rules 字段）
- FR-21：selection 为 pickup：右栏显示 type select（time/health/key） + value number input + Delete 按钮
- FR-22：selection 为 enemy：右栏显示只读 spawn position + path 节点列表（增 / 删 / 改 xz 坐标输入） + dwell / fovRange / fovAngleDeg 数值 input + Delete 按钮
- FR-23：selection 为 wall cell：右栏仅显示 Delete 按钮（"删墙"= 设为 0）

### Undo/Redo（FR-24 ~ FR-28）

- FR-24：snapshot-based：每条 history entry = `{ level: MazeData, selection: Selection | null }`，深拷贝（`structuredClone`）
- FR-25：HISTORY_LIMIT = 50；新动作丢弃最早的 past（不丢弃 current）
- FR-26：push 触发点：单击放置 / 单击删除 / 拖拽结束（mouseup）/ 属性面板 input blur 提交（防抖 300ms）
- FR-27：工具切换 / 相机平移 / 选中变化 → **不推栈**
- FR-28：redo 栈在任意新动作后清空（标准 redo 行为）

### 保存（FR-29 ~ FR-33）

- FR-29：Save 按钮：跑 `validateDesign`（warn-only）+ 跑 `validateMaze`（兜底）→ 写 `useLevelStore.customLevels[level.id]` → 写 localStorage → `dirty = false`
- FR-30：Save & Exit 按钮：先 Save，成功后路由回 `/`（MainMenu）
- FR-31：自动保存：编辑器内任何 place/move/delete 后 2s 防抖，写 localStorage 临时草稿 key `maze3d.editorDraft.v1`，不污染 `customLevels`
- FR-32：dirty 指示：StatusBar 显示 "● 未保存" / "已保存于 HH:MM:SS"；标题栏前缀 `* ` 当 dirty
- FR-33：退出编辑器时若 dirty → 弹原生 `confirm()` 让用户选"保存"/"不保存"/"取消"

### 导入 / 导出（FR-34 ~ FR-37）

- FR-34：导出：构造 `{ schemaVersion: 1, level: MazeData }` → JSON.stringify → Blob 下载为 `${sanitize(name)}.maze3d.json`
- FR-35：导入：`<input type="file" accept=".json,.maze3d.json">` → 读 text → `parseImport`：JSON.parse → schemaVersion === 1 校验 → `level` 存在 → `validateMaze`（复用 JsonMazeProvider）
- FR-36：导入失败：弹错误 toast，编辑器状态不变
- FR-37：导入成功：填充 editor state，**重置 id** 为新生成的 `custom-<uuid>`（防止与本地已有关卡撞名），但保留 `name`（除非用户改名）

### 关卡 ID 命名空间（FR-38 ~ FR-39）

- FR-38：编辑器生成的新关卡 id 强制 `custom-<uuid>`（v4）；不允许用户手动改 id
- FR-39：`EditorMazeProvider.load(id)` 先查 `customLevels`，再 fallback 到 `JsonMazeProvider`（内置关卡）

### LevelSelect 集成（FR-40 ~ FR-41）

- FR-40：`LevelSelect.tsx` 加 "我的关卡" 分组（仅当 `customLevels` 非空时显示），列出每个自定义关卡的 name + size + 缩略图占位（v1 仅文字 + 大小）
- FR-41：点自定义关卡 → 直接 `gameStore.startLevel(level, options?)`（options 用默认，不带 seed/enemyCount 等），与内置关卡走同一 `EditorMazeProvider`

## 5. 数据 / 类型变更

### 新增 / 修改类型（`src/maze/types.ts`）

```ts
// Pickup 加 id
export interface Pickup {
  id: string;       // NEW: 编辑器分配，crypto.randomUUID()
  x: number;
  z: number;
  type: PickupType;
  value: number;
}

// Editor 工具类型
export type EditorTool =
  | 'select' | 'wall' | 'start' | 'exit'
  | 'pickup' | 'enemy' | 'pan';

// 导出包装
export const SCHEMA_VERSION = 1 as const;
export interface ExportEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;  // 唯一允许 1
  level: MazeData;
}

// ID 命名空间
export const CUSTOM_LEVEL_PREFIX = 'custom-';
```

### `useEditorStore` 形状（`src/store/editorStore.ts`）

```ts
interface EditorState {
  level: MazeData;                     // 当前编辑中的 MazeData
  tool: EditorTool;                    // 当前激活工具
  selection: Selection | null;         // {kind:'pickup'|'enemy'|'wall', id?, x?, z?}
  camera: { x: number; y: number; zoom: number };  // viewport 平移 + 缩放
  history: { past: Snapshot[]; future: Snapshot[] };  // Undo/Redo
  dirty: boolean;                      // 自上次 Save 以来是否有未保存修改

  // actions（详见 plan）
  setTool, newLevel, loadLevel, saveLevel,
  placeWall, placeStart, placeExit, placePickup, placeEnemy,
  moveEnemyNode, addEnemyNode, removeEnemyNode,
  updatePickup, updateRule, updateName, updateSize,
  select, clearSelection, deleteSelected,
  undo, redo,
  exportJson, importJson, saveDraft, loadDraft,
}

type Selection =
  | { kind: 'pickup'; id: string }
  | { kind: 'enemy'; id: string }
  | { kind: 'wall'; x: number; z: number };

type Snapshot = {
  level: MazeData;                     // 深拷贝
  selection: Selection | null;
};
```

### `useLevelStore` 新增（`src/store/levelStore.ts`）

```ts
interface LevelStore {
  bestByLevel: Record<string, BestRecord>;     // 已有
  customLevels: Record<string, MazeData>;      // NEW
  // 已有：record / getBest / peekIsBetter
  // NEW:saveCustom / getCustom / deleteCustom / listCustom
}
```

localStorage key：`maze3d.customLevels.v1`（与 `maze3d.levels.v1` 隔离）

### `EditorMazeProvider`（`src/maze/EditorMazeProvider.ts`）

```ts
export class EditorMazeProvider implements MazeProvider {
  constructor(
    private custom: Record<string, MazeData>,
    private fallback: JsonMazeProvider,
  ) {}
  async load(id: string): Promise<MazeData> {
    if (this.custom[id]) return this.custom[id];
    return this.fallback.load(id);  // 透传给内置
  }
  async list(): Promise<string[]> {
    return [...Object.keys(this.custom), ...await this.fallback.list()];
  }
}
```

## 6. 引擎 / 架构影响

### 受影响文件

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `Pickup.id` + `EditorTool` + `ExportEnvelope` + `SCHEMA_VERSION` + `CUSTOM_LEVEL_PREFIX` |
| `src/maze/JsonMazeProvider.ts` | UPDATE | `validateMaze` 导出供编辑器复用（不破坏现有调用方） |
| `src/maze/EditorMazeProvider.ts` | CREATE | custom + builtin 合并 |
| `src/maze/importExport.ts` | CREATE | `exportLevel` / `parseImport` / `downloadAsJsonFile` / `readJsonFile` |
| `src/store/levelStore.ts` | UPDATE | +`customLevels` + `saveCustom/getCustom/deleteCustom/listCustom` + 持久化 |
| `src/store/editorStore.ts` | CREATE | 完整编辑器状态机 |
| `src/store/editorHistory.ts` | CREATE | snapshot 栈 + push/undo/redo 纯函数 |
| `src/ui/editor/EditorPage.tsx` | CREATE | 顶层页 + 键盘快捷键 |
| `src/ui/editor/EditorToolbar.tsx` | CREATE | 工具 / Save / Export / Import / Undo/Redo |
| `src/ui/editor/EditorViewport.tsx` | CREATE | HTML/CSS 2D 网格 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | CREATE | 右栏属性表单 |
| `src/ui/editor/EditorStatusBar.tsx` | CREATE | 警告 / dirty / schemaVersion |
| `src/ui/editor/editorValidation.ts` | CREATE | warn-only 设计校验 |
| `src/ui/LevelSelect.tsx` | UPDATE | +"我的关卡" 分组 |
| `src/ui/MainMenu.tsx` | UPDATE | +"关卡编辑器" 按钮 |
| `src/utils/id.ts` | CREATE | `generateId()` = `crypto.randomUUID()` |
| `src/App.tsx` | UPDATE | +`/editor` 路由 + 切换 MazeProvider 实现 |
| `tests/unit/store/editorHistory.test.ts` | CREATE | push/undo/redo/HISTORY_LIMIT |
| `tests/unit/maze/importExport.test.ts` | CREATE | roundtrip / schemaVersion reject / 缺 level reject |
| `tests/unit/ui/editor/editorValidation.test.ts` | CREATE | 可达性 / 空 pickup / enemy path < 2 |
| `tests/unit/maze/EditorMazeProvider.test.ts` | CREATE | custom 优先 / fallback / list 合并 |
| `tests/unit/store/levelStore.customLevels.test.ts` | CREATE | 持久化 / sanitize |
| `tests/unit/store/editorStore.test.ts` | CREATE | 所有 action |
| `tests/component/editor/EditorPage.test.tsx` | CREATE | 工具切换 / 放置 / Undo |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | CREATE | pickup / enemy / wall 表单 |
| `tests/component/editor/EditorViewport.test.tsx` | CREATE | 渲染 / 点击 / 拖拽 |
| `tests/component/levelSelect.custom.test.tsx` | CREATE | "我的关卡" 分组渲染 |
| `tests/e2e/editor.spec.ts` | CREATE | 完整建关 → Save → 退出 → LevelSelect 进入 → 通关 |

### 边界检查

- `src/store/editorStore.ts` 与 `useGameStore` / `useEngineGame` 无相互 import（编辑器状态与游戏运行时完全隔离）
- `src/ui/editor/*` 不 import Three.js（编辑器纯 HTML/CSS）
- `EditorMazeProvider` 不修改 `JsonMazeProvider.validateMaze`（只复用其导出函数）
- `useEditorStore` 不感知 Three.js / WebGL（与 engine 边界严格）

## 7. UI / UX 变更

### 屏幕 / 组件改动

- `MainMenu.tsx`：第二屏加 "关卡编辑器" 按钮（与"开始游戏"平级）
- `LevelSelect.tsx`：底部 "我的关卡" 分组（仅非空时显示），列每条 `name + size + 删除按钮`
- `EditorPage.tsx` 布局：
  - 顶部 `EditorToolbar`（56px）：7 工具按钮 + Undo/Redo + New/Save/Save & Exit + Export/Import + name input
  - 中部 `EditorViewport`（flex-1）：HTML/CSS 网格
  - 右栏 `EditorPropertiesPanel`（320px）：选中对象属性表单
  - 底部 `EditorStatusBar`（32px）：警告数 / dirty 状态 / schemaVersion
- `EditorViewport` 渲染规则：
  - 墙：`background: #888`（dim 主题下用 var(--wall)）
  - 起点：绿色三角 `▲`
  - 终点：绿色双环
  - pickup：色块 + 类型文字缩写（T/H/K）
  - enemy：红色圆 + path 节点（小圆点） + 节点间虚线

### 交互流程（创建并保存一个 15×15 关卡）

1. 玩家 MainMenu 点 "关卡编辑器" → 路由到 `/editor`
2. `editorStore.newLevel()` → 创建空 15×15 MazeData（id=`custom-<uuid>`, name="新关卡", walls=全 1, start/exit 在对角，0 pickups，0 enemies）
3. 玩家选 wall 工具 → 点格子切墙 → 立刻看到变化
4. 玩家选 start 工具 → 点格子 → 起点移动
5. 玩家选 pickup 工具 → 点格子 → 放置新 pickup → 属性面板打开 → 选 type=time，填 value=30
6. 玩家选 enemy 工具 → 点格子 → 放置 enemy（含默认 2 节点 path） → 属性面板打开 → 加 path 节点、调整坐标
7. 玩家点 Save → 写 `customLevels[custom-<uuid>]` → dirty=false
8. 玩家点 Save & Exit → 路由回 MainMenu
9. 玩家 MainMenu → 开始游戏 → LevelSelect 看见 "我的关卡" 分组有该关 → 进入 → 通关流程跑通

## 8. 错误处理

### 新增错误类型

- `ImportError`：导入失败（schemaVersion 不匹配 / 缺 level / validateMaze throw）
- `EditorValidationError`：save 时结构性兜底（理论上不应触发，因为 editor place 已阻止）

### 兜底行为

- 导入失败 → 弹原生 alert 提示，编辑器状态不变
- 拖拽 enemy path 节点到界外 → 节点坐标 clamp 到 [0, width/depth-1]
- Save 时 `validateMaze` throw → 弹错误 toast，**不保存**
- localStorage 写入失败（quota 满）→ 自动保存静默失败，console.error，主 Save 流程弹错误
- 草稿恢复：进入编辑器时检查 `maze3d.editorDraft.v1` 存在 → 弹原生 confirm："发现上次未保存的草稿，是否恢复？"

## 9. 测试策略

### 单元测试

- `editorHistory.test.ts`：
  - push 后 past 长度 +1，future 清空
  - undo 还原 level + selection，past 长度 -1，future 长度 +1
  - redo 还原 undo 的内容
  - 多次 push 超 HISTORY_LIMIT → past 截断到上限
  - undo 后再 push → future 清空
- `importExport.test.ts`：
  - exportLevel + parseImport roundtrip 字段一致
  - schemaVersion !== 1 → ImportError
  - 缺 level 字段 → ImportError
  - validateMaze 抛错 → ImportError 包裹
- `editorValidation.test.ts`：
  - exit 不可达 → warning
  - 0 pickup → warning
  - enemy path < 2 → warning
- `EditorMazeProvider.test.ts`：
  - custom[id] 存在 → 返回 custom
  - custom 不存在 → fallback 到 JsonMazeProvider
  - list() 合并 custom + builtin，custom 在前
- `levelStore.customLevels.test.ts`：
  - saveCustom → localStorage 写入
  - 读 localStorage 缺失字段 → sanitize 丢弃
  - deleteCustom → 从 localStorage 移除
- `editorStore.test.ts`：
  - 所有 action（placeWall/placeStart/...）的 happy path + dirty 标志
  - undo / redo 与 history 同步
  - 工具切换不推栈

### 组件测试

- `EditorPage.test.tsx`：工具切换高亮 / Save 按钮 disabled（？） / Undo 快捷键
- `EditorViewport.test.tsx`：墙切换 / pickup 放置 / enemy 放置
- `EditorPropertiesPanel.test.tsx`：pickup 表单修改触发 action / Delete 触发 deleteSelected
- `levelSelect.custom.test.tsx`：customLevels 为空时不显示分组 / 非空时显示

### E2E（`tests/e2e/editor.spec.ts`）

1. 进入编辑器 → 创建 15×15 关 → 放墙 + 起点 + 终点 + 1 pickup + 1 enemy（3 节点 path）
2. 命名 "测试关卡" → Save → 退出编辑器
3. LevelSelect → "我的关卡" 分组看见 "测试关卡" → 进入游戏 → 通关
4. 导出 → 文件下载 → 删除 localStorage → 导入 → 编辑器状态完全一致
5. 导入 schemaVersion=2 的文件 → 错误提示，编辑器状态不变

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 编辑器 + 自动保存 localStorage 配额耗尽 | 低 | 自动保存只存当前编辑的 MazeData（不存 history），典型几 KB |
| Undo/Redo 深拷贝 performance | 低 | 50 快照 × 几 KB = 几百 KB，廉价 |
| HTML/CSS Grid 大尺寸（50×50）渲染慢 | 中 | 用 `display: grid` + 子元素绝对定位 + `will-change: transform`；不行再切 canvas |
| 用户拖拽 enemy path 节点过墙 | 中 | 编辑器不阻止（path 节点允许穿墙，运行时 enemy 行为由 path 自行处理；FR-22 提供坐标但不做碰撞检查）|
| 导入的关卡 id 与本地已有关卡撞名 | 中 | FR-37：导入时强制重置 id 为新 custom-<uuid> |
| save 时 dirty 标志竞争（快速双击 Save） | 低 | Save action 内部检查 dirty 后置 false，期间 reject 重复调用 |
| 老浏览器无 `structuredClone` | 低 | 浏览器目标 ≥ Chrome 90，已有 structuredClone |

## 11. 完成清单

### 11.1 功能验收

- [ ] FR-1 ~ FR-41 全部实现
- [ ] 编辑器可创建 → 保存 → 退出 → 从 LevelSelect 进入 → 通关
- [ ] 导出 / 导入 roundtrip 字段一致
- [ ] Undo/Redo 覆盖所有 place/move/delete/update 操作

### 11.2 引擎 / 架构边界

- [ ] `src/store/editorStore.ts` 不 import react-three-fiber / Three.js
- [ ] `src/ui/editor/*` 不 import Three.js
- [ ] `EditorMazeProvider` 不修改 `JsonMazeProvider.validateMaze` 行为
- [ ] 编辑器状态与游戏运行时状态完全隔离

### 11.3 测试

- [ ] 单元测试覆盖率 ≥ 80%
- [ ] E2E 全绿（含导出 / 导入 roundtrip）
- [ ] `npm run typecheck` + `npm run build` 通过

### 11.4 文档

- [ ] `docs/increments/level-editor/spec.md`（本文件）已写入
- [ ] `docs/increments/level-editor/plan.md` 待写
- [ ] README.md "Future increments" 段 P2-4b 完成时移走
- [ ] `docs/increments/_template/roadmap.md` P2-4b 行 → done；文档目录从 `enemies-editor/` 改为 `level-editor/`

### 11.5 持久化与兼容

- [ ] `customLevels` 用独立 localStorage key（不污染 `bestByLevel`）
- [ ] `Pickup.id` 字段缺省自动生成（编辑器必填；从 JsonMazeProvider 加载时若 id 缺失自动补 UUID）
- [ ] 旧 best records 不破坏（key 隔离）

### 11.6 安全与健壮性

- [ ] 导入 schemaVersion 严格校验（≠1 直接拒）
- [ ] save 时跑 `validateMaze` 兜底
- [ ] 自动保存失败不污染 `customLevels`
- [ ] 退出 dirty 时 confirm 不绕过
- [ ] 无 console.log 残留

## 12. 参考

- P2-4a spec: `docs/increments/enemies-editor/spec.md`（`MazeData.enemies` / `EnemySpawn` / path 节点结构基线）
- 主 spec: `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §5（引擎边界）§7（数据模型）
- DoD 模板: `docs/increments/_template/dod.md`
- 路线图: `docs/increments/_template/roadmap.md`
- roadmap §12 P2-4b 当前简介：`独立。EditorMazeProvider 实现完整 MazeProvider 接口；levelStore.customLevels: Record<id, json>；3D viewport 用独立 Scene 实例。` — 本 spec 把 3D viewport 改为 HTML/CSS 2D viewport（与 §3 决策对齐）