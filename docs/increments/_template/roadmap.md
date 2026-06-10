# Phase2增量路线图 + 总任务列表

> 镜像副本：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` 的 §12 Roadmap。两份应保持同步；以 `_template/` 为单一入口维护时同步 spec。

---

## 🚧 当前进行中（跨设备启动锚点）

> **新会话/换设备时，Claude 必须先读本块再做任何事。**

| 字段 | 值 |
|---|---|
| 活跃增量 | **P2-4b**（关卡编辑器；13/20 实施+审查进度） |
| 已完成 | P2-2 14/14 ✅ + P2-3 14/14 ✅ + P2-4a 16/16 ✅ + P2-4b 12/20 实施 ✅ + Task 13 (EditorToolbar) |
| 下一个任务 | **P2-4b Task 13 (EditorToolbar.tsx)** |
| 最后更新 | 2026-06-10 |
| 最近 commit | 见 `git log --oneline -1`（避免追尾，由 Claude 主动查） |

**约束**：
- 一次只做一个任务（见下方「总任务列表」）
- 任务完成后立即勾 `[x]` + 更新本块「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## Phase1 — MVP（✅ 已完成）
1. Project scaffold (Vite + React + TS + deps)
2. `maze/types.ts` + `JsonMazeProvider` + first level JSON
3. Engine: Renderer + Camera + Scene + Loop (gray box + walls only)
4. InputManager + Player + Collision
5. Pickup + Rules + GameState
6. HUD components + store wiring
7. MainMenu + LevelSelect + Pause/GameOver/Win overlays
8. Persistence: levelStore + settingsStore
9. Tests (unit + E2E)
10. README + run instructions

## Phase2 — 增量路线图

|序 |名称 |优先级 | 前置依赖 |复杂度 |文档目录 |状态 |
|---|---|---|---|---|---|---|
| P2-2 | 深色模式 + 新 pickup 视觉 + UseItem 数字键 | P0 | — | Small | `docs/increments/dark-mode-pickups/` | ✅ done (2026-06-08) |
| P2-3 | 算法关卡（4 算法 × 3 尺寸 × time-trial） | P1 | — | Large | `docs/increments/procedural-modes/` | ✅ done (2026-06-08) |
| P2-4a | 巡逻敌人 + survive mode | P2 | P2-3 | Large | `docs/increments/enemies-editor/` | ✅ done (2026-06-09) |
| P2-4b | 关卡编辑器 | P2 | — | Large | `docs/increments/level-editor/` | plan written (2026-06-10) |

> **P2-1 已删除**：原计划"多关卡 JSON（中/大尺寸）"被 P2-3 算法生成取代。MVP 保留 `level-small.json` 作为"教学关"，`level-tiny.json` 留 E2E。
> **P2-4 拆分**：原"敌人 + 编辑器"X-Large 拆成 P2-4a（敌人+survive mode，依赖 P2-3）和 P2-4b（编辑器，独立）。

### 优先级说明
- **P0** = 不依赖其他增量，立即可做
- **P1** = 独立，建议 P0 之后做
- **P2** = 有显式前置依赖

### 复杂度说明
- Small ≤1 天
- Medium 1–3 天
- Large 3–7 天
- X-Large >7 天

### 流程
每个增量有两阶段产物：
1. `docs/increments/<slug>/spec.md` — 设计文档
2. `docs/increments/<slug>/plan.md` — 任务清单

模板见本目录其他文件。

### 候选池
本表仅列入已决定进入规划的增量。其他候选保留：
- 音频（deferred audio pipeline）
- 移动端 / 触摸支持
- 额外的 pickup 子类型

待需求明确后再升级为 P2-N 行。

---

## 总任务列表（执行视图）

> 跨增量任务清单。每个增量内的子任务也列在此。状态用 `[ ]` / `[x]` 跟踪。**一个时间只进行一个任务**，完成后等用户确认。

### P2-2: 深色模式 + 新 pickup 视觉 + UseItem 数字键（Small）

> 范围：补全差异（Q1 决策）。已实现：settingsStore.darkMode 字段、gameStore.inventory、gameStore.damage、gameStore.pickup 处理 time/health/key。本次 ship：darkMode UI 切换、theme.css 暗色变量、Scene.setDarkMode、InputManager 数字键 1/2、gameStore.useItem、Pickup mesh 颜色按 type 分、InventoryBar 高亮。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 重写 P2-2 spec.md（按 Q1/Q3 决策：补全差异 + 严格 engine 边界） | XS | [x] |
| 3 | `theme.css` 新增 `[data-theme="dark"]` 变量集 | XS | [x] |
| 4 | `App.tsx` useEffect 同步 `settingsStore.darkMode → data-theme` | XS | [x] |
| 5 | `Scene.ts` 新增 `setDarkMode(bool)` 方法（Q3 严格：不 import store） | S | [x] |
| 6 | `Settings.tsx` 新增 darkMode toggle 控件 | S | [x] |
| 7 | Q3 严格化：`Game.ts` 去除 store import，改走 `GameBridge` 回调（initial fov/sensitivity/darkMode + isActiveLevel/isPlaying） | S | [x] |
| 8 | `InputManager.ts` 监听 `Digit1`/`Digit2` → 触发 useItem | S | [x] |
| 9 | `gameStore` 新增 `useItem(slot: 0\|1)` action | S | [x] |
| 10 | `Rules.ts` 实现 useItem handler（无锁门 = slot 高亮闪烁） | S | [x] |
| 11 | `Pickup` mesh 按 type 选颜色：time 金黄 / health 红 / key 蓝 | S | [x] |
| 12 | `InventoryBar` 加数字键提示 + slot 高亮激活态 | S | [x] |
| 13 | E2E：`dark-mode.spec.ts` + `pickup-types.spec.ts` | M | [x] |
| 14 | 文档同步：README / roadmap / spec 状态 | XS | [x] |

> 进度：14/14

### P2-3: 算法关卡（Large）

> 范围：4 算法 × 3 尺寸（15×15、30×30、50×50）× 2 mode（time-trial 默认、reach-exit 可切）。Seed 自包含（算法+版本+尺寸+64-bit mazeSeed），localStorage 缓存 `seed → {algorithm, mazeSeed}` 元数据。LevelSelect 两个入口："随机关卡" / "指定种子关卡"。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 重写 P2-3 spec.md（4 算法 × 3 尺寸 × 2 mode） | XS | [x] |
| 3 | `utils/seed.ts` 新增 `encodeSeed` / `decodeSeed` / `fnv1a` / `mulberry32` | S | [x] |
| 4 | `maze/types.ts` 新增 `Algorithm` 枚举 + `Seed` + `StartLevelOptions` | XS | [x] |
| 5 | `maze/generators/recursiveBacktracker.ts` 纯函数 (TDD：尺寸+seed 确定性 + 可达性) | S | [x] |
| 6 | `maze/generators/kruskal.ts` 纯函数 (TDD) | S | [x] |
| 7 | `maze/generators/prim.ts` 纯函数 (TDD) | S | [x] |
| 8 | `maze/generators/huntAndKill.ts` 纯函数 (TDD) | S | [x] |
| 9 | `maze/AlgorithmMazeProvider.ts` 调度 4 算法 + 50×50 <500ms 性能单测 | M | [x] |
| 10 | `levelStore.ts` `BestRecord` 加 `seed?: string` 字段，isBestRecord 兼容 | XS | [x] |
| 11 | `gameStore.startLevel(maze, options?)` + time-trial 模式 180s 计时 (TDD) | M | [x] |
| 12 | `engine/Game.ts` `startLevel(maze, options?)` 接受 options 转发 provider | S | [x] |
| 13 | `ui/LevelSelect.tsx` 两入口 UI（随机关卡 / 指定种子关卡）+ 3 尺寸卡片 | M | [x] |
| 14 | E2E `procedural.spec.ts`（通关+time-trial超时）+ 文档同步 | M | [x] |

> 进度：14/14
> 关键模块走 TDD（任务 3、5–9、11），其它快速完成（任务 2、4、10、12、13、14）。

### P2-4a: 巡逻敌人 + survive mode（Large）

> 范围：敌人系统（实体 + 状态机 patrol/dwell/chase + 视野侦测 FOV 60°/range 3 + 0.5s 无敌）+ survive mode（30/60/90/120s 计时胜利，默认 90s）+ 渐进 spawn（每 15s OR pickup +1 enemy，上限 10，默认 on）+ LevelSelect 4 控件（mode/surviveSeconds/enemyCount slider 0-10 默认 3/progressive toggle）+ Settings enemyAggression（1.2x/1.5x/1.8x 默认 medium）+ 承接 P2-3 deferred 5 项（WinOverlay time-trial 用时 / GameOverOverlay survive 击中数 / pause-resume survive case / time-trial 超时 E2E fake-timer / seed 输入 localStorage 持久化）。Spawn 阶段：算法 provider 输出空 `enemies: []`，由 `engine.startLevel` 注入。巡逻速度 = 玩家速度 × 0.6；追击速度 = 玩家速度 × enemyAggression。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 重写 P2-4a spec.md（敌人+survive；含 P2-3 deferred 5 项 → FR-18~FR-20） | XS | [x] |
| 3 | `maze/types.ts` 扩展（EnemySpawn/EnemyState/SpawnSchedule/EnemyAggression/StartLevelOptions/MazeData.enemies） | XS | [ ] |
| 4 | `entities/Enemy.ts` 纯实体 + 状态机 patrol/dwell/chase (TDD: ≥6 case 状态机) | S | [ ] |
| 5 | `engine/Collision.ts` `playerVsEnemy` 圆形 vs 胶囊 AABB (TDD: 距离 = 半径 / +ε / 跨节点) | S | [ ] |
| 6 | `maze/JsonMazeProvider.ts` 解析 `enemies` 字段（缺省 `[]`） | XS | [ ] |
| 7 | `engine/Scene.ts` 注册敌人 mesh + dispose | S | [ ] |
| 8 | `engine/Game.ts` `startLevel` 注入 EnemySpawn（enemyCount + 迷宫布局） (TDD) | M | [ ] |
| 9 | `game/Rules.ts` `damage` + 0.5s 无敌 + 视野侦测 + survive timer (TDD) | M | [ ] |
| 10 | `store/gameStore.ts` `elapsedTime` + survive win 条件 + 渐进 spawn 调度 (TDD) | M | [ ] |
| 11 | `store/settingsStore.ts` `enemyAggression` 持久化（默认 medium） (TDD) | XS | [ ] |
| 12 | `ui/LevelSelect.tsx` 4 控件（mode/surviveSeconds/enemyCount/progressive toggle）+ seed 输入 localStorage 回填 (FR-20) + `Settings.tsx` enemyAggression radio | M | [ ] |
| 13 | `ui/components/EnemyCounter.tsx` + `InvulnerableFlash.tsx` + `HealthBar` 闪红（FR-15/16） | S | [ ] |
| 14 | `ui/WinOverlay.tsx` time-trial 用时显示 + `GameOverOverlay.tsx` survive 坚持时间 + 击中数（FR-18） | S | [ ] |
| 15 | E2E：`enemies.spec.ts` + `survive.spec.ts` + `time-trial.spec.ts`（fake-timer）+ `pause-resume.spec.ts` 扩展 survive case | M | [ ] |
| 16 | 文档同步：README / roadmap / spec / plan 全部同步至 ship 状态 | XS | [ ] |

> 进度：2/16
> 关键模块走 TDD（任务 4、5、8、9、10、11），其它快速完成（任务 3、6、7、12、13、14、15、16）。

### P2-4b: 关卡编辑器（Large）

> 范围：俯视 2D HTML/CSS viewport（不引 Three.js）+ 7 工具（select/wall/start/exit/pickup/enemy/erase）+ 右侧属性面板 + Undo/Redo（HISTORY_LIMIT=50，snapshot 栈）+ 显式 Save + draft autosave（localStorage）+ 导出/导入 JSON（`{schemaVersion:1, level:MazeData}` 包装）+ 警告但不拦截的 design validation（孤岛/无 start-exit/无 exit）+ `EditorMazeProvider` 合并 custom + builtin（id 前缀 `custom-<uuid>`）+ `levelStore.customLevels: Record<id, json>` + `maze3d.customLevels.v1` / `maze3d.editorDraft.v1` localStorage + `Pickup.id` 新增字段 + MainMenu 入口 + LevelSelect "我的关卡"分组 + 编辑器状态机与游戏运行时隔离（useEditorStore 独立 zustand store，不复用 gameStore）。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | `maze/types.ts` 扩展（`Pickup.id`、`EditorTool` 枚举、`ExportEnvelope`、`SCHEMA_VERSION=1`、`CUSTOM_LEVEL_PREFIX`） | XS | [x] |
| 3 | `utils/id.ts` `generateId()`（`crypto.randomUUID` + 降级 `Date.now()+Math.random`） | XS | [x] |
| 4 | `editor/editorHistory.ts` snapshot 栈（`HISTORY_LIMIT=50`，`push/undo/redo/canUndo/canRedo`，`structuredClone`） | S | [x] |
| 5 | `editor/importExport.ts` `exportLevel()` / `parseImport()`（Blob + File + `{schemaVersion,level}` envelope 校验） | S | [x] |
| 6 | `maze/JsonMazeProvider.ts` 导出 `validateMaze()`（复用现有解析失败检测） | XS | [x] |
| 7 | `store/levelStore.ts` 新增 `customLevels: Record<string, JsonMaze>` + `addCustomLevel/updateCustomLevel/removeCustomLevel/listCustom` + 持久化 `maze3d.customLevels.v1` | S | [x] |
| 8 | `maze/EditorMazeProvider.ts` 合并 custom + `JsonMazeProvider`（custom id 前缀 `custom-<uuid>`，`load` 优先 custom，回退 builtin） | S | [x] |
| 9 | `store/useEditorStore.ts` 核心状态机（TDD ≥25 case：tool/grid/cells/start/exit/pickups/enemies/selection/hover/history/dirty/draft） | L | [x] |
| 10 | `editor/editorValidation.ts` warn-only 检查（孤岛/无 start-exit/无 exit/重名/越界）返回 `ValidationWarning[]` | S | [x] |
| 11 | `ui/editor/EditorViewport.tsx` HTML/CSS Grid 渲染（cell 颜色：墙黑/通路白/start 绿/exit 红/pickup 黄/key 蓝/health 红粉/enemy 橙；hover 高亮；selection outline） | M | [x] |
| 12 | `ui/editor/EditorPropertiesPanel.tsx` 右侧 sidebar（根据 selection.type 渲染字段：gridSize/width/height/start/exit/pickup 子属性/enemy 子属性/路径） | M | [x] |
| 13 | `ui/editor/EditorToolbar.tsx` 7 工具按钮 + Save/Export/Import/Undo/Redo + 标题 dirty 标记（`* 未保存`） | S | [ ] |
| 14 | `ui/editor/EditorStatusBar.tsx` 显示 warning 数 + dirty 状态 + schemaVersion | XS | [ ] |
| 15 | `ui/editor/EditorPage.tsx` 组合 viewport/toolbar/properties/statusBar + 快捷键（B/W/Esc/Cmd-Z/Cmd-Shift-Z/Cmd-S）+ draft autosave debounce 500ms | M | [ ] |
| 16 | `ui/MainMenu.tsx` 新增"关卡编辑器"按钮 → `/editor` | XS | [ ] |
| 17 | `ui/LevelSelect.tsx` 新增"我的关卡"分组（从 `EditorMazeProvider.list` 过滤 custom） + 可选"删除"按钮（带确认） | S | [ ] |
| 18 | `App.tsx` 路由：新增 `/editor` 路径 → `EditorPage`；其余路径沿用 `useGame` 接入；切换 provider 为 `EditorMazeProvider` 注入到 `gameStore` | S | [ ] |
| 19 | E2E：`editor.spec.ts`（进入编辑器 → 画墙 → 放 start/exit → 放 pickup/enemy → Save → 退出 → LevelSelect 看到 → 进入试玩 → 通关） | M | [ ] |
| 20 | 文档同步：README 移除 P2-4b；roadmap P2-4b 行 → done；活跃锚点更新；`git grep P2-4b` 仅命中历史 commit | XS | [ ] |

> 进度：12/20
> 关键模块走 TDD（任务 9 状态机、4 history、5 import/export、10 validation、7 levelStore 持久化），其它快速完成。
> 依赖图：1→2→3→4→5（基础）→6→7→8（provider）→9（state）→10（validation）→11/12/13/14（UI 4 件）→15（组合）→16/17/18（接入）→19（E2E）。

---

## 设计决策记录（Q1–Q15）

| # | 决策 | 选项 |
|---|---|---|
| Q1 | P2-2 范围 | A. 补全差异 |
| Q2 | MazeProvider 接口扩展 | A. `load(id, options?)`，向后兼容 |
| Q3 | Engine/store 边界 | A. 严格不变（DoD §14.2） |
| Q4 | P2-4 拆分 | A. 拆 P2-4a 敌人 + P2-4b 编辑器 |
| Q5 | survive mode 耦合 | A. P2-3 只做 time-trial，survive 推迟到 P2-4a |
| Q6 | 手工 JSON 关卡去留 | A. 删除 P2-1，算法生成统一所有尺寸 |
| Q7 | localStorage 缓存 | B. 缓存 `seed → {algorithm, mazeSeed}` 元数据 |
| Q8 | seed 编码版本 | B. 编码算法版本（`algo-v1-size-hex`） |
| Q9 | "随机关卡" mazeSeed | C. 时间戳 + 32-bit 加密随机 = 64-bit |
| Q10 | LevelSelect 入口 | A. 两个独立按钮 |
| Q11 | 3 种尺寸 UI | D. 卡片=尺寸，算法玩家不感知 |
| Q12 | time-trial 模式呈现 | C. time-trial 默认，可切 reach-exit |
| Q13 | level-small.json 去留 | C. 保留在"固定关卡"组 |
| Q14 | best record 索引 | B. `BestRecord.seed?: string` 字段 |
| Q15 | 执行顺序 | A. P2-2 → P2-3 → P2-4a/b 并行 |
