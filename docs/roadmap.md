# Phase2增量路线图 + 总任务列表

> 镜像副本：`docs/mvp/design.md` 的 §12 Roadmap。两份应保持同步；以 `docs/roadmap.md` 为单一入口维护时同步 mvp 副本。

---

## 🚧 当前进行中（跨设备启动锚点）

> **新会话/换设备时，Claude 必须先读本块再做任何事。**

| 字段 | 值 |
|---|---|
| 活跃增量 | **P2-15 review-fixes-batch-2(24/24 FR done,2026-06-17 session 实施;FR-10 D-M-1 经核实为 premise-void finding — generators 不生成 pickup,留 defensive helper + invariant pin 测试;e2e fixme 保留待 dev server 跑过确认)** |
| 已完成 | P2-2 14/14 ✅ + P2-3 14/14 ✅ + P2-4a 16/16 ✅ + P2-4b 20/20 ✅ + P2-5 16/16 ✅ + P2-6 10/10 ✅ + P2-7 8/8 ✅ + P2-9 ✅ + P2-10 11/11 ✅ + P2-11 16/16 ✅ + P2-13 ✅ + P2-14 ✅ + **P2-15 24/24 ✅ (2026-06-17,session 实施)** |
| 下一个任务 | 等用户决策:手动 commit P2-15 剩余 10 FR 的工作(FR-4/8/9/10/14/15/20/21/22+23/theme.css)→ 或进入 P3 候选(e2e skip 根因修复 / Dropdown a11y 套件 / theme.css 拆分) |
| 最后更新 | 2026-06-17 |
| 最近 commit | 待提交 — P2-15 剩余 10 FR 工作已落地,等待用户 commit(见活跃锚点详情) |

**约束**：
- 一次只做一个任务（见下方「总任务列表」）
- 任务完成后立即勾 `[x]` + 更新本块「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## ⚠️ 已知未跟进的测试 debt（2026-06-15）

> **F-2026-06-15-H-3.7**:e2e 套件有 8 处 `test.skip` / `test.fixme`,主要分两类:
> 1. **page.clock + rAF 不兼容**(6 处,survive / time-trial / pause-resume / enemies):`page.clock.fastForward()` 与程序生成关卡的 `requestAnimationFrame` 时钟交互不一致,导致计时器型断言无法跑。**根因**:engine 需要一个 e2e 测试 hook 让外部能驱动 tick,或把 spec 改成用教学关卡(确定性几何)实时跑。
> 2. **editor.spec 3 处 fixme**(save / delete / export-import roundtrip):被 `carveLShape` helper 的 stale `lastError` 污染 save 结果。**根因**:helper 应保留 exit cell 为 floor。
>
> 这两类都不是 product code 回归 — 是测试基础设施债。修复需要独立增量,不在 "fix all bugs" 范围内。
>
> **2 处 mainMenu.revamp 测试也被 skip**(F-2026-06-15-H-3.6):原测试断言 Three.js scene container,但 home-revamp 把它移除了。skip 是正确的(测试断言不存在的功能)。
>
> 当前 `npm test` 状态(2026-06-17 更新):**993 pass / 1 skip / 0 fail**;e2e skip 状态 **8 处**(`enemies.spec.ts:26,41` / `survive.spec.ts:18` / `editor.spec.ts:48,120` / `pause-resume.spec.ts:39` / `time-trial.spec.ts:12,38`);FR-9 carveLShape root cause 已修,但 fixme 保留待 `npx playwright test` 跑过确认。

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
| P2-4b | 关卡编辑器 | P2 | — | Large | `docs/increments/level-editor/` | ✅ done (2026-06-10) |
| P2-5 | UI 改版 + 存活模式重平衡 (MainMenu 3D + LevelSelect 重设计 + 敌人按模式硬门 + algorithmForMode) | P1 | — | Large | `docs/increments/p2-5-ui-and-rebalance/` | ✅ done (2026-06-11) |
| P2-6 | LevelSelect 级联重构 (主 dropdown 4 关卡源 + 单一「进入游戏」+ 存活模式 4 设置成组 + 关键老 testid 全保留) | P1 | — | Medium | `docs/increments/level-select-cascading-redesign/` | ✅ done (10/10) (2026-06-12) |
| P2-7 | 自定义 Dialog 系统 (替换 5 处 `window.confirm` + E2E `page.once('dialog')`；`<ConfirmProvider>` 主题化；3 选项脏数据退出 + 草稿恢复) | P1 | — | Small | `docs/increments/p2-7-custom-dialog/` | ✅ done (8/8) (2026-06-12) |
| P2-8 | 第二语言支持（English） (自研轻量 i18n：`getT` + `useT` + `settingsStore.language`；中英资源 `src/i18n/resources/{zh,en}.ts`；`/settings` 实时切换；既有 279 行中文测试断言零迁移) | P1 | — | Medium | `docs/increments/p2-8-i18n/` | 🔄 in-progress (draft, 2026-06-15) |
| P2-9 | 编辑器 UX 修复 + 使用手册 (拆分 wall/erase 两工具；修复 addEnemyNode 默认坐标；placePickup 加 lastErrorKey；"拾取"→"道具"重命名；新增 EditorHelpDrawer cheat-sheet 抽屉) | P1 | P2-4b | Small–Medium | `docs/increments/p2-9-editor-ux-fix-and-help/` | ✅ done (2026-06-16) |
| P2-10 | 代码评审 11 项修复 (H1 Stepper clamp 颠倒 · H2 URL progressive 丢失 · H3 路径节点 NaN · M1 updateSize OOB · M2 重复拾取物 · M3 initialTime=0 · M4/M5 穷尽性检查 · L1 lastErrorKey 清理 · L2 ESC 冲突 · L3 敌人朝向) | P1 | P2-9 | Small | `docs/increments/p2-10-review-fixes/` | ✅ done (11/11) (2026-06-16) |
| P2-11 | 教学关卡重设计（4 关重命名 + 教学步骤系统 + 哨兵回廊 回字形迷宫 + caught-by-enemy 胜利类型 + requireAllPickups 门控 + 编辑器 4 个新字段） | P1 | P2-4a, P2-8 | Medium | `docs/increments/p2-11-tutorial-revamp/` | ✅ done (16/16) (2026-06-16) |
| P2-13 | 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复（`levelStore` 文件夹 CRUD + `EditorLeftPanel` 替换 `EditorLeftDrawer` + 新 `Dropdown` 组件 + 教程卡 hero/rows/advanced 三段式 + `WinOverlay` victory 标签键修复 + theme.css 主题变量重排 = 27 文件 +5021/-2470 行） | P1 | P2-4b, P2-8 | Medium | `docs/increments/p2-13-editor-folders/` | ✅ done (2026-06-17, ad94abe) |
| P2-14 | P2-13 review batch 1：12/33 finding 修复（H5 vitest 排除重排 + H4 Segmented useMemo 回归闭合 + H3 EditorLeftPanel 性能 + H1 reachability 边界守卫 + H2 Enemy constructor 守卫 + M3 shouldSurviveWin finite guard + M2 levelStore moveFolder cleanup + M12 Scene.dispose scene.clear + M13 collidesAt cellSize=0 守卫 + M14 Loop magic number + M15 GameCanvas subscribe guard + M2 _expandThickWall size 守卫 = 12 文件 +123/-44 行） | P1 | P2-13 | Small | `docs/increments/p2-14-review-fixes-batch-1/` *(目录占位;产物随 commit `e135e32` 走)* | ✅ done (2026-06-17, e135e32) |
| P2-15 | P2-13 review batch 2：24/24 LOW/MEDIUM finding 收口(FR-4 form React.memo · FR-8 right-click 3 case · FR-9 carveLShape 跳过 exit · FR-10 AlgorithmMazeProvider defensive helper + invariant pin · FR-14 rename 失败 dialog · FR-15 GameOverOverlay Record<VictoryType> · FR-20 renameLevel action · FR-21 victory fallback · FR-22 Dialog --panel→--bg-elevated · FR-23 dropdown outline · 14 个 from prior batch · = 24 FR 全部 done;spec/plan 在 `docs/increments/p2-15-review-fixes-batch-2/`,23 Task / 24 FR;FR-10 D-M-1 经核实为 premise void — generators 不生成 pickup,留 helper + pin 测试覆盖不变量) | P1 | P2-13 | Medium | `docs/increments/p2-15-review-fixes-batch-2/` | ✅ done (2026-06-17,session 实施) |

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
| 13 | `ui/editor/EditorToolbar.tsx` 7 工具按钮 + Save/Export/Import/Undo/Redo + 标题 dirty 标记（`* 未保存`） | S | [x] |
| 14 | `ui/editor/EditorStatusBar.tsx` 显示 warning 数 + dirty 状态 + schemaVersion | XS | [x] |
| 15 | `ui/editor/EditorPage.tsx` 组合 viewport/toolbar/properties/statusBar + 快捷键（B/W/Esc/Cmd-Z/Cmd-Shift-Z/Cmd-S）+ draft autosave debounce 500ms | M | [x] |
| 16 | `ui/MainMenu.tsx` 新增"关卡编辑器"按钮 → `/editor` | XS | [x] |
| 17 | `ui/LevelSelect.tsx` 新增"我的关卡"分组（从 `EditorMazeProvider.list` 过滤 custom） + 可选"删除"按钮（带确认） | S | [x] |
| 18 | `App.tsx` 路由：新增 `/editor` 路径 → `EditorPage`；其余路径沿用 `useGame` 接入；切换 provider 为 `EditorMazeProvider` 注入到 `gameStore` | S | [x] |
| 19 | E2E：`editor.spec.ts`（进入编辑器 → 画墙 → 放 start/exit → 放 pickup/enemy → Save → 退出 → LevelSelect 看到 → 进入试玩 → 通关） | M | [x] |
| 20 | 文档同步：README 移除 P2-4b；roadmap P2-4b 行 → done；活跃锚点更新；`git grep P2-4b` 仅命中历史 commit | XS | [x] |

> 进度：20/20
> 关键模块走 TDD（任务 9 状态机、4 history、5 import/export、10 validation、7 levelStore 持久化），其它快速完成。
> 依赖图：1→2→3→4→5（基础）→6→7→8（provider）→9（state）→10（validation）→11/12/13/14（UI 4 件）→15（组合）→16/17/18（接入）→19（E2E）。

### P2-5: UI 改版 + 存活模式重平衡（Large）

> 范围：MainMenu 挂载 Three.js r127 场景（低多边形迷宫 + 慢转 + reduced-motion 静态帧 + WebGL fallback 路径）+ 半透明 panel (`backdrop-filter: blur(8px)` + `rgba(0,0,0,0.35)`) + hover-lift 按钮 (CSS `transform: translateY(-2px)`) + `Button.hoverLift` 可选 prop + LevelSelect 改两列 grid (`gridTemplateColumns: 'minmax(280px, 360px) 1fr'`,720px 以下塌成 1 列) + mode/survive-seconds/enemy-count/size 全部换原生 `<select>` + progressive / enemy 控件 / survive-seconds 控件按 `mode === 'survive'` 硬门 + seed 输入挪到 进阶 ▾ 折叠 + `algorithmForMode(mode)` 导出（穷尽性 switch + `never`）替代 `PROCEDURAL_ALGORITHM` 常量 (FR-17) + `gameStore.startLevel` 硬关 `requestedEnemyCount = mode === 'survive' ? clamp(...) : 0` (FR-18/20/21) + `Game.startLevel` 把 `injectEnemySpawns` 调用包在 `mode === 'survive'` 条件里 (FR-18/19/21) + `EnemyCounter` 在非 survive 模式返回 `null` (FR-22) + 手工 `MazeData.enemies` 在任何模式都生成（关卡编辑器用户摆的敌人不受硬门影响,FR-21）+ theme.css 注入 `--select-chevron` + select 样式 + `.main-menu-button` hover-lift + 旧 P2-3 seed id（用 `'recursive-backtracker'` 编码的）仍能解出原算法（seed 编码自带算法字段,只影响新生成的随机关卡）。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 重写 P2-5 spec.md（22 个 FR + 3 项用户可见改动合成一份 spec） | XS | [x] |
| 3 | `maze/AlgorithmMazeProvider.ts` 新增 `algorithmForMode(mode: VictoryType): Algorithm` 导出（switch + 穷尽性 `never`）(FR-17) | S | [x] |
| 4 | `tests/unit/maze/algorithmForMode.test.ts` 3 case + 1 穷尽性 case | S | [x] |
| 5 | `ui/LevelSelect.tsx` 删 `PROCEDURAL_ALGORITHM` 常量；`startRandom` / `startSpecified` 改用 `algorithmForMode(mode)` (FR-17) | S | [x] |
| 6 | `store/gameStore.ts` `startLevel` 内 `requestedEnemyCount = mode === 'survive' ? clampEnemyCount(...) : 0` (FR-18/FR-20/FR-21) + `tests/unit/gameStore.rebalance.test.ts` 5 case (3 clamp + 1 hand-crafted + 1 schedule) | S | [x] |
| 7 | `engine/Game.ts` `startLevel` 把 `injectEnemySpawns` 调用包在 `mode === 'survive'` 条件里 (FR-18/FR-19/FR-21) + `tests/unit/engine/game.rebalance.test.ts` spy 回归哨 | S | [x] |
| 8 | `ui/components/EnemyCounter.tsx` 非 survive 模式返回 `null`（订阅 `currentMode + currentEnemyCount` 双字段）(FR-22) + `tests/component/enemyCounter.rebalance.test.tsx` 4 case (2 hide + 2 render) | S | [x] |
| 9 | 阶段 2 整体回归:跑全 `tests/unit` + `tests/component` 套件 (FR-22 兼容性 + FR-21 hand-crafted 契约) | XS | [x] |
| 10 | `styles/theme.css` 新增 `:root --select-chevron`（light + dark）+ `.level-select-select` + `.main-menu-button` hover-lift (FR-1/FR-5/FR-6) | S | [x] |
| 11 | `ui/components/Button.tsx` 新增 `hoverLift?: boolean` 可选 prop (FR-5) | XS | [x] |
| 12 | `ui/LevelSelect.tsx` 改两列 grid + 原生 select + 进阶折叠 + 按模式显隐（mode/survive-seconds/enemy-count/size 全 `<select>`,progressive 与 enemy 控件包在 `mode === 'survive'` 条件里,seed 输入挪到 进阶 ▾）(FR-7..FR-16) | M | [x] |
| 13 | `tests/component/levelSelect.uiRevamp.test.tsx` 9+ case（grid / selects / mode-gated / advanced fold / algorithmForMode 编码） | M | [x] |
| 14 | `ui/MainMenuScene.ts` Three.js r127 场景封装（renderer / camera / scene / rAF 慢转,`prefers-reduced-motion` 时只渲染一帧,`dispose()` 释放所有资源,WebGL 不可用抛错回退到 CSS 渐变）(FR-1/FR-2/FR-3) | M | [x] |
| 15 | `ui/MainMenu.tsx` useEffect 挂载 `MainMenuScene` + 半透明 panel + hover-lift 按钮 + WebGL throw 时回退到 CSS 渐变 (FR-1/FR-4/FR-5) + `tests/component/mainMenu.revamp.test.tsx` 5 case（mount / dispose / fallback / 按钮点击） | M | [x] |
| 16 | E2E `tests/e2e/ui-revamp.spec.ts` 5 case（scene / 2-col / mode-gated / advanced fold / placeholder）+ E2E `tests/e2e/survive-branching.spec.ts` 2 case（survive kruskal + enemy counter 可见 / reach-exit counter 隐藏） + 兼容更新 5 个 E2E spec（survive / time-trial / procedural / pause-resume / persistence 走 select 路径）+ 兼容 `tests/component/hud.test.tsx` opt-in `currentMode: 'survive'` + 修 `public/levels/level-tiny-enemy.json` patrol path 节点 (1,0)→(2,1) 保证巡逻连通 + 写 spec/plan/review 三件套到 `docs/increments/p2-5-ui-and-rebalance/` + 文档同步 | M | [x] |

> 进度：16/16
> 关键模块走 TDD（任务 4 algorithmForMode 穷尽性 switch、6 gameStore clamp 5 case、7 Game.startLevel spy 回归哨、8 EnemyCounter 4 case、13 LevelSelect UI 9+ case、15 MainMenu 5 case、16 E2E 7 case）,其它快速完成（任务 1/2/3/5/9/10/11/12/14）。
> 依赖图：1→2/3（设计）→4（algorithmForMode 单测）→5（LevelSelect 接入）;6→7→8（敌人硬门三端:store / engine / 组件）→9（回归）;10→11（CSS + Button）→12→13（LevelSelect UI + 测试）;14→15（MainMenuScene + MainMenu + 测试）;5/9/13/15→16（E2E + 兼容 + 三件套 + 文档同步）。

### P2-6: LevelSelect 级联重构（Medium）

> 范围：把 LevelSelect 从 4 个并列入口（固定 / 随机 / 指定种子 / 我的）+ 多个 start 按钮，重构为「**主 dropdown 选关卡源 + 级联二级控件 + 单一「进入游戏」按钮**」。存活模式 4 设置（存活秒数 / 敌人数量 / 渐进生成 / 渐进上限）收进同一语义区。4 个预设 chip（30/60/90/120s）点击即同步输入框。**只动 UI 层**：游戏运行时 / `gameStore` / `Game` / 敌人逻辑 / 关卡编辑器一律不改。关键老 testid 全部保留（P2-5 e2e 兼容）。仅在 P2-5 的 `types.ts` 常量集（`ENEMY_COUNT_MIN/MAX/DEFAULT` 同款风格）追加 4 个新常量：`SURVIVE_SECONDS_MIN/MAX` (10/600) + `SPAWN_PROGRESSIVE_MAX_DEFAULT/MIN` (10/1)。`validateSelection()` 抽为纯函数供 start-button `disabled` + onClick 共用。WCAG AA: chip 选中态对比度 ≥ 4.5:1。360 / 480 / 720 / 1280px 4 个断点视觉塌缩回归。

| # | 任务 | 工作量 | 状态 |
|---|---|---|---|
| 1 | 升级 roadmap.md（**本任务**） | XS | [x] |
| 2 | 三件套：写 `spec.md`（22 FR + 3 不变量）+ 已有的 `plan.md` (8 任务 T0–T7 实施卡) + `task-list.md`（why/who/when/acceptance） | XS | [x] |
| 3 | T0 · `src/maze/types.ts` 新增 4 常量：`SURVIVE_SECONDS_MIN=10` / `SURVIVE_SECONDS_MAX=600` / `SPAWN_PROGRESSIVE_MAX_DEFAULT=10` / `SPAWN_PROGRESSIVE_MAX_MIN=1`（数值常量由 T2 case 8 越界 clamp 隐式覆盖） | XS | [x] |
| 4 | T1 · `src/styles/theme.css` 新增 `.survive-chip` + `.survive-chip--active` 样式（150ms 过渡与 `.level-select-select` 节奏一致） | XS | [x] |
| 5 | T2 · 写 `tests/component/levelSelect.uiRevamp.test.tsx` **12 case** (RED)：主 dropdown 4 选项 / sublevel 条件渲染 / seed-input 切换 / mode='survive' 4 设置 / chip 激活 / 越界 clamp+aria-invalid / progressive 取消后 max-input 消失 / start-button 单次触发 onPick / validation 失败 disabled / 关键老 testid 全保留（`level-select-root` / `procedural-controls` / `mode-select` / `size-select` / `enemy-count-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section`） | M | [x] |
| 6 | T3 · `src/ui/LevelSelect.tsx` 重写（GREEN）：引入 `levelSource` state + `sublevelId` state + 提取 `validateSelection()` 纯函数 + 单一 `start-button` (固定右下 + `hoverStyle="lift"`) + chip 用 `<button type="button">` + `progressive-max-input` 仅在 `progressive === true` 渲染 + seed-input 失焦 strip 空白 + 16 hex 验证 + 保留 P2-5 所有老 testid 容器 | M | [x] |
| 7 | T4 · `tests/component/levelSelect.custom.test.tsx` 6 case 适配新路径（主 dropdown=我的 → sublevel dropdown 选 → start） | S | [x] |
| 8 | T5 · 重构清理：抽 `<SurviveSettingsPanel>` 子组件（如 `mode === 'survive'` 分支超长）+ 抽常量 + 删未用 import + `validateSelection()` 纯化（无副作用 / 引用透明） | S | [x] |
| 9 | T6 · 完整回归：`tsc --noEmit` + `vitest run` + `vite build` 三项 0 error 0 warning；单元覆盖率 ≥ 80%（沿用 P2-5 基线） | XS | [x] |
| 10 | T7 · `tests/e2e/level-select-cascading.spec.ts` 新增 1 个 e2e 覆盖主 dropdown 4 切换（防回归）+ 跑 `npx playwright test` 全套，断裂的 e2e 按新路径修复 / 标 `test.skip()` + reason（**禁止**回退 UI） | S | [x] |

> 进度：10/10
> 关键模块走 TDD（任务 5 12 case RED + 任务 6 GREEN + 任务 7 适配 + 任务 9 完整回归 + 任务 10 e2e 扫描），其它快速完成（任务 1/2/3/4/8）。
> 依赖图：1→2（roadmap + 三件套）;3+4（基础并行）→5（RED）→6（GREEN）→7（适配）→8（重构）→9（回归）→10（e2e 扫描）。关键路径 ~6.5h 净工作量 = 1 工作日。
> 工时分解：T0 0.5h + T1 0.5h + T2 2h + T3 3h + T4 1h + T5 1h + T6 0.5h + T7 1h = 9.5h（含缓冲）。

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
