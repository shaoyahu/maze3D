# P4 refactor-fp2d — 3D 模式 = 第一人称视角渲染 2D 多层迷宫

**Slug**: p4-refactor-fp2d
**状态**: draft → in-review → approved → done
**日期**: 2026-08-11
**对应路线图项**: P4 refactor（推翻 P4a + 7 P4b）
**依赖**: 2D 多层（P3-1 + P3-1d）已 ship
**复杂度**: X-Large

## 1. 概述

**问题**：P4a + 7 P4b 的"3D 体素"实现是误解用户意图。

- ❌ 旧 P4：6 方向自由移动（任意 cell 都能上下），3D 算法生成 5³~15³ 体素立方体，3D RB / 3D Prim
- ✅ 新设计：**3D 模式 = 用第一人称视角渲染同一个 2D 多层迷宫**

**新核心契约**：
- 角色在**单一平面**上前后左右走（x / z 轴）
- **不能**按 Space/C 自由升空 / 下降
- 层与层之间切换**只能**通过 transition tile（stair / ladder / hole）
- 视觉：first-person 3D（3D 墙 mesh + 多层 floor/ceiling + 3D 敌人球体）
- gameplay 几何：完全复用 2D 多层

**关键洞察**：数据模型 `walls: CellType[][]` + `levelCount` + `transitions: VerticalTransition[]` **已经是对的**（P3-1 阶段就锁了）。3D 模式不需要新数据结构，只需要**第一人称视角渲染 + 2D 移动模型**。

## 2. 目标 / 非目标

### 目标
- 3D 模式用第一人称相机渲染 2D 多层迷宫（墙是 3D mesh，floor/ceiling 多层堆叠）
- 移动：WASD（x/z）+ transition 触发上下层（stair / ladder / hole）
- 敌人：2D BFS chase（已有 `Enemy.ts`），3D 模式下渲染为 3D 球体
- HUD：保留现有 2D HUD 样式（health / time / layer chip），加 first-person 视角下的 crosshair
- 路由：`/game?seed=algo-v2-...&mode=...&view=fp3d` 进 3D 模式（新增 `view` query 区分）
- 算法：完全复用 2D 15 算法（3D 算法全部作废）
- 拾取：完全复用 2D 拾取系统

### 非目标
- 自由 6 方向移动（任何 cell 上下）—— **不实现**
- 3D 体素生成（5³~15³ 立方体）—— **不实现**
- 3D 算法（3D RB / 3D Prim）—— **不实现**
- 3D 编辑器 —— 不在本 scope
- 2D 模式行为 —— 完全不动
- 拾取在 3D 模式下的视觉调整 —— 沿用 2D 行为

## 3. 用户故事
- 作为玩家，我想要在 3D 视角下玩 2D 多层迷宫，视觉冲击力强但操作直觉
- 作为玩家，我想要在 3D 模式下能爬楼梯 / 用梯子 / 掉洞切换层
- 作为玩家，我期待 3D 模式跟 2D 模式共享同一关卡生成（同一个 seed URL 既能切 2D 也能切 3D）
- 作为玩家，我不希望 3D 模式有"自由飞"的作弊感

## 4. 功能需求

### FR-1: 数据结构
- `MazeData` 移除 `walls3D?: CellType[][][]`
- `MazeData` 移除 `start3D?: {x, y, z}` 和 `exit3D?: {x, y, z}`
- `MazeData.start` 已含 `level?: number`，足够
- `MazeData` 保留 `levelCount: number`（多层）—— 3D 模式沿用
- Seed format：**废弃 `algo-v3-`**，3D 模式用 `algo-v2-` + 新增 `view=fp3d` query

### FR-2: 路由 / LevelSelect
- `LevelSelect` 新增 "View: 2D Top-down / 3D First-person" 切换（默认 2D）
- 路由：`/game?seed=algo-v2-...&view=fp3d` 进 3D 模式
- `view=fp3d` 进 first-person；`view=2d` 或缺省进 top-down
- 编辑器：保持 2D 编辑器（3D 编辑器不在 scope），输出关卡可在 2 种 view 下玩

### FR-3: 渲染
- 新增 `buildSceneFP3D(maze)` 替代 `buildScene3D`
  - 3D wall mesh：每层渲染 `walls[z][x]` 为 3D 墙体
  - Floor / ceiling：每层 1 个 plane 在 y = level * FLOOR_HEIGHT
  - 3D 拾取 mesh：每层渲染 2D `pickups`
  - 3D 出口 mesh：3D plane 标记 + emissive material
- 墙 mesh 用 InstancedMesh（P4b-Instanced 资产可复用）
- 灯光：first-person 室内照明（directional + ambient + per-room point light）
- 相机：first-person perspective，y = `playerY + EYE_HEIGHT`

### FR-4: 移动
- 复用 2D 移动（WASD 走 x/z）
- transition 触发：完全复用 P3-1d 5-kind 引擎
- 移除 `tick3DMovement`（6 邻居 cell-based）
- 移除 `tick3DTween`（0.1s 平滑）
- 新增 `tickFP3DMovement`（2D 移动 + transition detection）

### FR-5: 敌人
- 复用 2D 敌人状态机（patrol / dwell / chase）
- 2D BFS chase：复用 `maze.reachability.ts` 或类似
- 3D 渲染：`InstancedMesh` 球体（红 = chase，黄 = dwell，绿 = patrol）
- 碰撞：与 2D enemy 同一套，3D 模式沿用
- 多人 / 多敌人：复用 2D 注入机制

### FR-6: HUD
- 2D HUD 沿用：health bar / time / 库存 / 敌人计数
- `LevelIndicator` 沿用：显示 `L1` / `L2` / ... / `L{current}/{total}`
- 新增 first-person 专属：crosshair（屏幕中央准星）
- 受伤屏闪、掉落警告 ring：沿用 P3-2 / P3-3

### FR-7: 路径 / 相机
- 相机高度：`playerY + EYE_HEIGHT` (1.6m)
- 视角 yaw / pitch：复用 2D 的 mouse-look（InputManager 已有）
- 走路不抖：camera position 与 player position 同步 lerp

## 5. 数据 / 类型变更

### 修改 / 删除
- `src/maze/types.ts`:
  - `MazeData` 删 `walls3D?` / `start3D?` / `exit3D?`
  - 删 `VALID_3D_SIZES` / `VALID_3D_ALGORITHMS`
  - 删 `SeedV3` interface
- `src/utils/seed.ts`:
  - 删 `encodeSeedV3` / 删 `SEED_RE_V3` 分支
  - `decodeSeed` 删 v3 分支
- `src/utils/gameUrl.ts`:
  - 删 v3 分支
  - 新增 `VIEW_QUERY` (`'view'`)，取值 `'2d'` / `'fp3d'`
- `src/engine/Game.ts`:
  - 删 `tick3DMovement` / `tick3DTween` / `tick3D*` 整段
  - 删 `walls3D !== undefined` 分支
  - 删 `currentSpawnSchedule` 字段（2D 路径用 store 端）
  - 删 3D 算法 / 3D 加载相关代码
- `src/engine/Scene.ts`:
  - 删 `buildScene3D` 整段
  - 删 3D 算法 8 个 generator
  - 新增 `buildSceneFP3D`
- `src/maze/AlgorithmMazeProvider.ts`:
  - 删 `load3D` / 删 v3 派发
- `src/store/gameStore.ts`:
  - 删 3D 路径相关逻辑
  - 删 v3 seed 处理
- `src/ui/LevelSelect.tsx`:
  - 新增 "View: 2D / 3D" 切换
  - URL 加 `view` query
- `src/ui/HUD.tsx`:
  - 新增 first-person crosshair
  - `LevelIndicator` 沿用
- `src/ui/components/Minimap.tsx`:
  - 3D 路径简化为 first-person minimap（小地图显示当前层 + 邻层）

### 新增
- `src/engine/Scene.ts`: `buildScene(maze, darkMode, view)` 第三参数(`view?: ViewMode = '2d'`)。**没有**独立 `buildSceneFP3D` — 3D 模式复用 2D 的 mesh tree,唯一 view-specific 差异是 `view === 'fp3d'` 时 `playerMarker.visible = false` (第一人称看不到脚下)。理由:3D 模式 contract = first-person 视角 + 同一份 2D 多层数据(spec §1 核心契约),独立 `buildSceneFP3D` 会强制 mesh tree 重复 + dispose path 分叉,违背核心 contract。
- `src/engine/Game.ts`: `viewMode: ViewMode` 字段 + `new Game(bridge, viewMode: ViewMode)` 第二参数 + `applyLook` gate 在 `viewMode === 'fp3d'`。**没有**独立 `tickFP3DMovement` — 物理 tick(WASD `getMove()` + transition detection + ladder `getLadderRequest()`)完全复用 2D 路径,3D 模式额外只多调一次 `applyLook` 改 camera yaw/pitch。
- `src/entities/Player.ts`: **没有**独立 `createPlayerFP3D` overload — 单一 `createPlayer(startCell, cellSize, _mode?: never)` 签名,2D / fp3d 共享。`y` 由 `level * FLOOR_HEIGHT` 决定。
- `src/ui/GameCanvas.tsx`: `view?: ViewMode = '2d'` props + `new Game(bridge, view)` + `<Crosshair />` gate 在 `view === 'fp3d'`。**P4 refactor-fp2d review Bug #1 fix**: Effect 1 deps array 加 `view`,否则切 view 但 maze.id 不变时 Game 实例不重建(view 静默失效)。
- `src/ui/LevelSelect.tsx`: status-bar segmented control (`<button data-testid="view-option-2d">` / `view-option-fp3d`),view state 不持久化(每次进 /levels 默认 `2d`,back-compat 干净)。
- `src/utils/gameUrl.ts`: `VIEW_QUERY = 'view'`,`readView` / `isViewMode` / `VIEW_VALUES` / `ParsedGameUrl.view` 字段(同 `id` 同级,不在 `StartLevelOptions`)。
- `src/App.tsx`: `activeView: ViewMode` state + 老 v3 URL 友好 fall back(**Bug #2 fix**:`parsed.error === 'bad-seed' && seed?.startsWith('algo-v3-')` → `console.warn` + `navigate('/levels', { replace: true })`,严格限定 v3 prefix)。

## 6. 引擎 / 架构影响

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/engine/Game.ts` | 巨大简化 | 删 3D voxel 路径，2D + transition 复用 |
| `src/engine/Scene.ts` | 改 | `buildScene3D` 删除 + `buildScene(maze, darkMode, view)` 加 view 参数（不建独立 `buildSceneFP3D`,view-specific 差异只 1 行 `playerMarker.visible = false`） |
| `src/engine/InputManager.ts` | 改 | 3D 模式 WASD 走 x/z 即可（Space/C 仅 ladder） |
| `src/maze/AlgorithmMazeProvider.ts` | 删 | 删 `load3D` 整段 |
| `src/maze/types.ts` | 删 | 删 3D-specific 字段 + 3D 算法白名单 |
| `src/utils/seed.ts` | 删 | 删 v3 codec |
| `src/utils/gameUrl.ts` | 改 | 删 v3，新增 `view=2d/fp3d` |
| `src/store/gameStore.ts` | 改 | 删 3D 派发 |
| `src/ui/LevelSelect.tsx` | 加 | view 切换 |
| `src/ui/HUD.tsx` | 加 | first-person crosshair |
| `src/ui/GameCanvas.tsx` | 改 | dispatch `view` |

### 边界检查
- 引擎层不新增 react / store / import（沿用现有约定）
- 新增的 `buildSceneFP3D` 仍要 dispose 所有 mesh
- 2D 模式全链路：JSON provider / AlgorithmMazeProvider / Game / Scene / HUD / store —— 完全不动

## 7. UI / UX 变更
- LevelSelect 新增 "View" 切换（2 个选项）
- 3D 模式新增 first-person crosshair（屏幕中央小准星）
- 3D 模式没 minimap 全图（用 2D 风格简版小图，只显示当前层）
- 受伤屏闪 / 掉落警告 沿用

## 8. 错误处理
- view=fp3d 但 seed=algo-v1-...（单层）→ 仍可玩，2D 多层契约的子集
- view=invalid → 默认 2D
- 老 v3 seed URL → 解码失败，fall back to default level

## 9. 测试策略

### 单元测试
- `tests/unit/utils/seed.test.ts`: 删 v3 测试
- `tests/unit/utils/gameUrl.test.ts`: 新增 view query round-trip
- `tests/unit/engine/Game.fp3d.test.ts` (NEW): first-person 3D 移动 + transition
- `tests/unit/engine/Scene.fp3d.test.ts` (NEW): buildSceneFP3D 渲染输出

### 组件测试
- `tests/component/LevelSelect.view.test.tsx` (NEW): view 切换 UI
- `tests/component/HUD.crosshair.test.tsx` (NEW): crosshair 显示

### E2E
- 复用 P3-1 E2E fixture：跑 v2 URL + view=fp3d
- 新增 E2E case：first-person 模式 walk + transition 完成

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 2D 模式回归（重构改了 Game.ts 公共路径） | 中 | 2D 模式所有既有 test 必须继续 pass；Game.update 顶部 2D 路径代码不动 |
| 老 v3 seed URL 用户书签失效 | 中 | 友好 fall back + console.warn；v3 链接重定向到 2D view 提示用户 |
| 3D 渲染性能（多层 + 大量墙） | 中 | 复用 P4b-Instanced（InstancedMesh 1 draw call） |
| 3D enemy 状态机 + 2D enemy 状态机分叉 | 低 | 同一套 Enemy.ts，渲染层只是包成 3D 球体 |
| View 切换 UX 复杂 | 中 | 简单 segmented control（2D / 3D 两个按钮） |

## 11. 完成清单

### 11.1 功能验收
- [ ] `algo-v2-...&view=fp3d` URL 进 first-person 3D 模式
- [ ] 3D 模式：WASD 走 x/z，按 Space/C 仅在 ladder tile 上下
- [ ] 3D 模式：stair / ladder / hole 5 kind 全部 trigger transition
- [ ] 3D 模式：敌人 BFS chase 渲染为 3D 球体
- [ ] 3D 模式：HUD 显示 layer chip + crosshair
- [ ] 2D 模式：所有既有 test 通过，行为不变
- [ ] 老 v3 URL：友好 fall back 到 2D

### 11.2 引擎 / 架构边界
- [ ] 引擎层不新增 react / store / import
- [ ] 2D 模式 Game / Scene / store 公共路径不动
- [ ] 新增 3D mesh 进 dispose 路径

### 11.3 测试
- [ ] 新增 ≥ 6 个 test（Game.fp3d / Scene.fp3d / LevelSelect.view / HUD.crosshair）
- [ ] 删 v3 相关 test（seed.test / gameUrl.test / provider.test）
- [ ] 既有 1783 tests 全 pass

### 11.4 文档
- [ ] spec.md / plan.md 写入
- [ ] CLAUDE.md 加 "P4 refactor-fp2d — locked contracts" 段
- [ ] README 更新 3D 模式描述
- [ ] roadmap.md 标注 P4 refactor 状态

## 12. 参考
- 用户反馈：3D 路径应 = 第一人称视角渲染 2D 多层
- 现有 2D 多层：P3-1 / P3-1d / P3-2 / P3-3
- 现有 3D voxel（待删除）：P4a / P4b-*
- 拾取：2D P2-2 + P2-18
- 敌人：2D P2-4a `Enemy.ts`
