# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 会话规则

- **回复语言**:用中文回复用户。
- **提交控制**:每次修改完代码后**不自动提交**;`git commit` / `git push` / `git merge` 等操作不能主动执行。完成代码改动后,等用户明确表示可以提交或推送时，再按照指示提交或推送。
- **任务持续性**:会话中无需顾虑 token / 成本花费,不要因为"成本太高"而主动暂停、缩短或放弃任务;按计划把当前任务做完。

## 项目概述

浏览器中运行的第一人称 3D 迷宫游戏。包含手写关卡、算法生成关卡、浏览器内关卡编辑器,支持 reach-exit / time-trial / survive 三种胜利模式以及巡逻敌人。URL 是关卡身份的规范来源:刷新、分享、浏览器后退都会回放同一关卡配置。

引擎层用纯 TypeScript 模块驱动 Three.js;UI 用 React 18 + Zustand。两层完全解耦 —— 引擎不引用任何 React 模块,UI 通过 `useGameStore` 订阅运行时状态。

## 常用命令

```bash
npm install
npm run dev            # Vite dev server,http://localhost:5173
npm run build          # tsc -b 类型检查 + Vite 生产构建到 dist/
npm run preview        # 本地预览生产产物
npm run typecheck      # 仅 tsc -b --noEmit
npm test               # vitest run(单元 + 组件)
npm run test:watch     # vitest watch 模式
npm run test:e2e       # Playwright 端到端(自动启动 dev server)
npm run test:e2e:install  # 一次性:安装 Playwright Chromium
```

跑单个 Vitest 测试(按文件或名称):
```bash
npx vitest run tests/unit/rules.test.ts
npx vitest run -t "specific describe/it name"
```

跑单个 Playwright spec:
```bash
npx playwright test tests/e2e/survive.spec.ts
npx playwright test --grep "specific title"
```

覆盖率阈值(`vitest.config.ts` 设置,作用域为 `src/**`):行 80% / 函数 75% / 分支 75% / 语句 80%。v8 provider 仅度量 `src/**` —— E2E 由 Playwright 运行,刻意排除在 vitest 覆盖率作用域外。另有少量文件被额外排除在阈值外(`main.tsx`、`App.tsx`、`engine/{Game,Camera,Renderer,Loop}.ts`、`ui/GameCanvas.tsx`、`maze/types.ts`、`store/gameStore.ts`、`vite-env.d.ts`、`playwright.config.ts`)。

> 注:旧版 CLAUDE.md 把运行时状态归到 `src/game/GameState.ts`;该文件已被拆分为 `src/engine/Game.ts`(Tick 调度 + Three.js 协调器,无 React 依赖)+ `src/store/gameStore.ts`(Zustand store,UI 订阅)。文档后续若再引用 `game/GameState.ts` 视为历史遗留。

环境要求:**Node 18+**。

## 高层架构

```
src/
  engine/      # 纯 TypeScript 写的 Three.js 模块;不允许 import React
    Game.ts          主循环、Tick 调度、scene refs(禁止 import store)
    Scene.ts         墙、地面、出口、拾取物品的 mesh
    Collision.ts     玩家与墙体的碰撞检测
    Camera/Renderer/Loop/InputManager.ts
  entities/    # Player、Pickup、Enemy(patrol / dwell / chase 状态机)
  game/
    Rules.ts         纯函数规则:crossesExit、onUseItem、applyDamage、…
  maze/
    types.ts         CellType、PickupType、VictoryType、Seed、MazeData、ExportEnvelope,运行时白名单 + is* 类型守卫
    JsonMazeProvider.ts       加载 public/levels/*.json(手写 + 4 个内置)
    AlgorithmMazeProvider.ts  调度 4 个生成器
    EditorMazeProvider.ts     编辑器导出的关卡(经 localStorage)
    builtInLevels.ts          静态 import public/levels JSON
    generators/               4 个纯函数生成器(recursiveBacktracker、kruskal、prim、huntAndKill)+ _isReachable、_expandThickWall
    enemySpawner.ts           程序生成时注入敌人
    importExport.ts           ExportEnvelope(SCHEMA_VERSION = 1)+ CUSTOM_LEVEL_PREFIX
    reachability.ts           DFS 验证 start↔exit 连通
  store/       # Zustand:gameStore(运行时)、levelStore(最佳成绩 + 自定义关卡)、settingsStore(偏好 + 语言)、persist + migrations、editorStore + editorHistory
  ui/          # React 18
    App.tsx               BrowserRouter + 路由 + ConfirmProvider
    MainMenu/LevelSelect/Settings  路由页面
    GameCanvas.tsx        桥接 React ↔ 引擎(创建 Game,装配 GameBridge)
    HUD.tsx               状态条
    overlays/             Pause/GameOver/Win
    editor/               EditorPage、EditorTopBar、EditorLeftDrawer、EditorPropertiesPanel、EditorStatusBar、EditorViewport、editorValidation
    components/           Button、Dialog、Minimap、HealthBar、InventoryBar、Timer、Crosshair、…
    useConfirm.tsx        自定义 Dialog provider(P2-7;替换 window.confirm)
  utils/       # seed.ts(FNV-1a + mulberry32 + algo-v1-… 编码)、gameUrl.ts(URL ⇄ 关卡身份)、id、errors、getDisplayName、time
  hooks/       # useAutoSave.ts
  i18n/        # P2-8:getT(locale)、useT()、resources/{zh,en}.ts、{name} 占位符插值
  styles/      # reset.css + theme.css(含 [data-theme="dark"] 主题令牌)
```

### 边界规则(改动前必读)

- **引擎 ⇄ UI 隔离**:`src/engine/**` 不得 `import` `react`、`react-dom`、`zustand` 或 `../store/**`。引擎通过 `GameBridge` 回调与 UI 通信,`GameCanvas.tsx` 实现这些回调(读取对应的 Zustand store)。`Scene.setDarkMode(bool)` 是引擎侧的主题挂钩。
- **生成器是纯函数**:`src/maze/generators/*` 接受 `(size, prng)`,返回 `walls: CellType[][]` —— 不依赖 React、不依赖 Zustand,单测覆盖。
- **URL 是关卡身份的规范来源**:`/game?...` 由 `utils/gameUrl.ts` 编解码;查询键包括 `seed`(algo-v1-{algorithm}-{size}-{hex16})、`id`(teaching-* / custom-* / builtin-*)、`mode`、`survive`、`enemies`、`progressive`。`parseGameSearchParams` 在非法输入下回退到默认 —— 绝不允许畸形 URL 把游戏搞崩。
- **边界处校验**:`localStorage` 或 URL 读出的任何值都必须经过 `is*` 守卫(参见 `maze/types.ts` 的 `isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` / `isSurviveSeconds`,以及 `persist.ts` 的 `sanitizeSettings`)。校验失败直接丢弃,绝不允许静默强制转换。
- **编辑器输出与手写关卡同构**:编辑器导出同样使用 `MazeData` schema(与 `public/levels/*.json` 一致),外层包 `ExportEnvelope { schemaVersion: 1, level: MazeData }`。自定义关卡 id 前缀 `custom-`(`CUSTOM_LEVEL_PREFIX`)。
- **种子自描述**:`algo-v1-{algorithm}-{size}-{hex}` 把算法、版本、尺寸、熵打包到同一字符串 —— 重命名一个 `Algorithm` 是对既有最佳成绩的破坏性变更。

## Architecture Contracts (do not break without explicit P2-N deprecation)

### `algorithmForMode(mode)` 4-mode default mapping (locked since P2-3, re-confirmed in P2-19/20/21)

| Mode | Default algorithm |
|---|---|
| `reach-exit` | `recursive-backtracker` |
| `time-trial` | `prim` |
| `survive` | `kruskal` |
| `caught-by-enemy` | `recursive-backtracker` |

P2-19/20/21 spec 显式 excluded 改这层 mapping。修改须先回 P2-3 路线图确认 + 写明 deprecation 路径。
Type system 不会挡住"主动改 mapping"(exhaustive switch 仍过), 需 reviewer / spec 守门。

### `ALGORITHM_REGISTRY` 是 15 种算法的 single source of truth (P2-21 引入)

`src/maze/algorithmRegistry.ts` 定义 `ALGORITHM_REGISTRY: readonly AlgorithmEntry[]`(15 项),并派生:
- `ALGORITHM_IDS: readonly Algorithm[]` —— 经 `src/utils/seed.ts` re-export 为 `VALID_ALGORITHMS` 保留历史名字(back-compat,`levelStore.isValidSeed` 仍走这条链)
- `ALGORITHM_BY_ID: Record<Algorithm, AlgorithmEntry>` —— O(1) 派发,`AlgorithmMazeProvider.generateWalls` / `LevelSelect` 全部走这条链

`Algorithm` 联合类型在 `src/maze/types.ts` 是 closed 15 字面量,与 registry 1:1 绑定。**加第 16 个算法必须同时改 4 处**(任一漏改会被 TS 编译失败逼住):
1. `src/maze/algorithmRegistry.ts` 加 entry
2. 扩 `src/maze/types.ts` 的 `Algorithm` 联合字面量
3. 加 i18n label `levels.algorithm.*` 到 `src/i18n/resources/{en,zh}.ts`
4. `tests/unit/maze/algorithmRegistry.test.ts` 自动覆盖(7 case 守 1:1 锁定)

`Record<Algorithm, AlgorithmEntry>` 类型让"加算法漏更新 dispatch"变成 typecheck 错误,无法 silent drift。`ALGORITHM_REGISTRY` 文件 50 行 header doc 详述每字段 rationale。

### i18n(P2-8)

自研零依赖的 i18n,不是 i18next。`getT(locale)` 是纯函数翻译器;`useT()` 是绑定到 `settingsStore.language` 的 React hook,语言切换会重渲染所有消费者。占位符使用 `{name}` 语法。缺失 key → `console.warn` + 原样返回 key 字符串。未知 locale → warn + 回退到 `DEFAULT_LOCALE`。新增翻译写在 `src/i18n/resources/{zh,en}.ts`。关卡可带可选的 `i18n.en` 显示名;面向用户显示时用 `getDisplayName(maze, locale)`,缺失时回退到 `maze.name`。

### Multi-level mazes (P3-1) — locked contracts

**Level count range = 1..6**(`src/maze/types.ts:393`)。`LevelCount = 1 | 2 | 3 | 4 | 5 | 6` 是闭区间 union,`LEVEL_COUNT_VALUES` 是 runtime whitelist 守 `isLevelCount` type guard。任何超过 6 的关卡(程序化或手编)在 `JsonMazeProvider.validateMaze` / `levelStore.isValidSeed` / `algorithmForMode` 路径都会拒收。

**Y-axis math is duplicated in 3 places**(故意 lockstep,见每处 inline 注释):
- `FLOOR_HEIGHT = 2.4` — `Player.ts:20` / `Scene.ts:166` / `Game.ts:214`
- `EYE_HEIGHT = 1.6` — `Player.ts:13` / `Game.ts:798/932`
- 玩家 y 公式:`position.y = currentLevel * FLOOR_HEIGHT`(脚底) / `camera.y = position.y + EYE_HEIGHT`(头高)

任一处改值必须 3 处同步;统一抽常量是 P3-1d 候选,但本增量刻意不抽(避免跨文件 typecheck blast radius)。

**Seed codec 双版本**(`src/utils/seed.ts`):
- `algo-v1-{algorithm}-{size}-{hex}` 既有 — 单层隐式 (`levelCount = undefined → 1`)
- `algo-v2-{algorithm}-{size}-{levels}-{hex}` 新 — 显式 levels 1-6

`Algorithm` 联合 + v2 编码是 URL seed 的一部分;**重命名/删除已有 algorithm 字面量 = breaking change**(影响 localStorage best 记录)。新增算法走 4 处同步路径(见 `ALGORITHM_REGISTRY` 段)。

**`enemySpawner` 跨层分布契约**(P3-1 D5 fix):`injectEnemySpawns(maze, count, options?: { levelCount?: number })`。`levelCount >= 2` 时第 i 个 enemy `level = i % levelCount`(round-robin)。`options` 缺省 / `levelCount <= 1` 时 enemy 不带 `level` 字段(单层 back-compat)。两个 caller 同步传 `{ levelCount: maze.levelCount ?? 1 }`(`engine/Game.ts:649` + `store/gameStore.ts:297`),任一漏改会让多 enemy 在 L0 堆叠。

**Editor 多层 UI**(`src/ui/editor/LevelTabs.tsx`):左侧 panel 底部的 level tab bar + [+]/[−] 按钮。`addLevel` 6 上限 / `removeLevel` 1 下限 都由 store 守门,UI 同步 `disabled` 视觉态。删层弹 confirm(`useConfirm` + `editor.leftPanel.removeLevelTitle/Message`)避免误删带实体的层。

### Hole-down warning flash (P3-2) — locked contracts

**Pre-transition 0.5s warning 仅对 `hole-down` 触发**(`src/engine/Game.ts:WARNING_FLASH_DURATION_SEC = 0.5`)。其他 transition kinds(`stair-up` / `stair-down` / `hole-up` / `ladder`)走旧路径直接 `startActiveTransition`,不经过 warning phase(玩家能看到自己要走的方向,不需要 telegraph)。

**两阶段 pipeline**:`startWarningFlash(t)` → 0.5s `tickWarningFlash(dt)` → 自动调 `startActiveTransition(t)`(同一 `t`)启动 0.4s 落体。`warningFlash` 和 `activeTransition` 是 sequential 状态,**不是 concurrent**——`update()` 顶层先 check warningFlash 再 check activeTransition,两个 short-circuit 都立即 return。

**Input lock 全程**:`startWarningFlash` 调 `input.setPaused(true)`,`startActiveTransition` 也调一次(同一 flag),玩家在 0.5s + 0.4s = 0.9s 全程不能 WASD/跳跃。这是 spec Q3 决策(commit-to-fall 安全行为)。

**Scene ↔ Game 视觉同步**:`SceneRefs.setWarningFlashState(t | null)`(`src/engine/Scene.ts` buildScene 内 closure)是 Scene 暴露给 Game 的唯一 mutator。Game 在 `startWarningFlash` 调 `setWarningFlashState(t)` 显 ring,`tickWarningFlash` 完成时 + `startLevel` 重置时调 `setWarningFlashState(null)` 隐 ring。Closure pattern 与 `setDarkMode` 平行——封装 per-mesh walk,让 Game 不用知道哪个 mesh 索引哪个 transition。

**Self-loop 守卫**:`startWarningFlash` 看到 `t.kind !== 'hole-down'` 自动 re-route 到 `startActiveTransition`(运行时 assert,不是 spec 错误)。spec Q1 锁定 hole-down 唯一,但 caller 走 `update()` 触发路径已经过滤,这里是双保险。

**HUD 屏闪是 P3-3 候选**:本期只做 3D 脚底红色环(spec §12 Q2 "脚底闪红"),HUD 红色 vignette overlay 留 P3-3。3D 视觉是核心提示,玩家低头就能看到;HUD 屏闪是 polish 上 polish。

### HUD warning flash overlay (P3-3) — locked contracts

**WarningFlashOverlay 镜像 P3-2 0.5s 状态机**(`src/ui/components/WarningFlashOverlay.tsx`):HUD 在 `warningFlashUntil > Date.now()/1000` 期间挂载全屏红色 vignette `rgba(255, 30, 30, 0.3)`,`pointerEvents: none`,复用 P2-4a `invulnerable-fade` keyframe (0% opacity 1 → 100% opacity 0, 0.5s linear forwards),**不引入新 CSS**。

**Bridge callback**:`GameBridge.onWarningFlashState?: (active: boolean) => void`(`src/engine/Game.ts:184-189`)。Game.startWarningFlash 调 `true` + tickWarningFlash 完成 + startLevel reset 各调 `false`。GameCanvas.tsx 实现:`active=true` 写 `setWarningFlashUntil(Date.now()/1000 + 0.5)` + `bumpWarningFlashTriggerId()`;`active=false` 写 `setWarningFlashUntil(0)`。

**Wall-clock compare**(同 P2-4a InvulnerableFlash):用 `Date.now()/1000` 不是 `elapsedTime`,这样 backgrounded tab 的 throttled rAF 不能冻结 overlay。F-2026-06-17-B-F-2 注释里详细说明这个 bug 修复。

**Trigger id 重启 CSS animation**:`warningFlashTriggerId` 是 monotonic counter,WarningFlashOverlay 的 `key={triggerId}` 让 React 在新 warning 时重新挂载元素(继承 `data-trigger-id` 属性),CSS animation 重启。F-P3-3-1 注释解释。

**0.5s 锁 WARNING_FLASH_DURATION_SEC**(P3-2 锁定):HUD 屏闪的 0.5s 必须与 Game.startWarningFlash 的 0.5s 对齐(两处都是 spec §12 Q2)。改其中一处必须同步改另一处。bridge 写 `Date.now()/1000 + 0.5` 而非新常量,保留 single source of truth。

**只 hole-down 触发**:HUD 屏闪由 Game.startWarningFlash 驱动(同 P3-2 状态机),其他 transition kinds (stair-up/-down/hole-up/ladder) 走旧路径,既无 3D 环也无 HUD 屏闪。

### 3D voxel mazes (P4) — locked contracts

**MazeData 新增 3D 字段**(`src/maze/types.ts`):`walls3D?: CellType[][][]` (z × y × x 顺序)、`start3D?: { x; y; z }`、`exit3D?: { x; y; z }`。三字段都是**可选**的 — 2D 关卡继续用 `walls: CellType[][]` / `start` / `exit`(P2 / P3-1 contract 完整保留)。`walls3D !== undefined` 是引擎分派 3D vs 2D 路径的唯一信号。`levelCount` 在 3D 路径**故意不设**(3D 体素立方体不是 P3-1 堆叠层概念)。

**3D 数据满足 type 但不读 2D 字段**:`MazeData.walls: CellType[][]` 是必填的(P2 historical contract),3D 关卡用 `walls: []` 满足类型 — 渲染永远走 `walls3D !== undefined` 分支不读 `walls`。同理 `start` / `exit` 在 3D 路径由 `start3D` / `exit3D` 提供,2D 字段 mirror 3D 的 (x, z) at level 0 让 legacy consumer 不需要 special case。

**Algorithm 联合新增 1 字面量**:`'3d-recursive-backtracker'`(`src/maze/types.ts:401`)。3D RB **不通过 ALGORITHM_REGISTRY** — registry 的 `generate` 签名是 `(visualSize, rng) => CellType[][]` (2D),3D RB 是 `CellType[][][]` 不兼容。`AlgorithmMazeProvider.load3D` 自己 dispatch 3D 算法(`algorithm.startsWith('3d-')` 分支,`src/maze/AlgorithmMazeProvider.ts:117`)。

**3D size whitelist 锁 `{5, 7, 9}`**:`recursiveBacktracker3D.ts` 的 `VALID_3D_SIZES` + `isVoxel3DSize` + seed.ts 的 `VALID_3D_SIZES` 三处 lockstep。3D RB 用 thick-wall 编码,odd sizes only(logicalSize = (visualSize + 1) / 2 必须是 integer)。even sizes / 11/13/15 留 P4b。

**Seed codec v3**:`algo-v3-3d-recursive-backtracker-{size}-{hex}`(`src/utils/seed.ts:133`)。`size ∈ {5, 7, 9}`(3D visualSize, **不是** P2 的 15/30/50);3D 算法名带 `3d-` 前缀强制与 2D 名字空间隔离。`encodeSeedV3` / `decodeSeed` v3 分支 + `VALID_3D_ALGORITHMS: ['3d-recursive-backtracker']` 单独白名单。**v3 不带 `levelCount` slot** — 3D 立方体是单个 voxel mass,不是堆叠层。

**3D 数据形状 (z × y × x)**:`walls3D[z][y][x] = 0|1`,visualSize 在三个轴等长,外层 ring 全部 wall(立方体密封)。`generateRecursiveBacktracker3D`(新文件,`src/maze/generators/recursiveBacktracker3D.ts`)用 6 邻居 DFS(±x, ±y, ±z),step 2 cells(thick-wall 编码,跟 2D 1:1 翻译),`isVoxel3DSize` 在最前端拒绝 even / out-of-whitelist sizes。RNG 消耗顺序(start cell pick + 每次 DFS 邻居 pick)是 determinism contract 的一部分,refactor 必须保持。

**3D BFS reachability**:`isReachable3D(walls3D, start, exit)`(`src/maze/reachability.ts:248-310`)。6 邻居 BFS,flat `Uint8Array` visited,head-index FIFO 队列。returns false 当 start/exit 在 wall cell / out-of-bounds / 不连通。P4a 用作 `load3D` 出口可达性 sanity check(spec 实际不强制,但 test 覆盖)。

**3D Scene 渲染**:Scene.ts 早返回分支 `if (maze.walls3D !== undefined) return buildScene3D(maze, darkMode)`(`src/engine/Scene.ts:204-209`)。`buildScene3D` 画 cuboid per wall cell:`BoxGeometry(cs, cs, cs)` at `(x+0.5)*cs, (y+0.5)*cs, (z+0.5)*cs` — 跟 2D cell-center 锁存 invariant 一致。**不画 floor / ceiling**(spec §6 Q6 决策,玩家在 cell 内 3D 自由,flat floor 反而挡 down 视野)。exit 是绿色 emissive box 浮在 exit3D cell 上方 0.3cs;playerMarker 是 horizontal ring on y=startY plane。

**3D 6 邻居移动**:`InputManager.getMove3D()` 返回 `{dx, dy, dz}` one-hot triple: W = dz -1, S = dz +1, A = dx -1, D = dx +1, Space = dy +1, KeyC = dy -1(`src/engine/InputManager.ts:106-128`)。**ArrowUp/ArrowDown 故意不绑 3D dz**(避免 2D 玩家切到 3D 关卡时按键被静默重映射)。

**3D Game tick**:`Game.tick3DMovement(_dt)`(`src/engine/Game.ts:478-602`),`update()` 顶部 short-circuit 当 `currentMaze.walls3D !== undefined`。P4a 简化 = **瞬移**(无 lerp),按下键直接 teleport 一格 cell 中心。Collision = cell-based `walls3D[tz][ty][tx] === 1` 拒绝 / 越界拒绝,不动 `Collision.resolveMove` 2D 路径。Exit check = `tx === exit3D.x && ty === exit3D.y && tz === exit3D.z` 直接调 `bridge.onReachExit()` + `pauseLoop()`。

**P4a 实体省略**:P4a 是数据 + 6 方向移动 MVP,**不做** enemy / pickup / trap / door / parchment / tutorial / 3D lerp 动画 / 3D 多 cell size 11/13/15。`pickups` / `enemies` / `traps` / `doors` / `transitions` 全部 `[]`,`levelCount` 不设。`setWarningFlashState` 是 no-op closure(3D 不用 hole-down warning)。`setDarkMode` 共享 2D palette 切换 API。

**3D vs 2D dispatch key**:`maze.walls3D !== undefined`。所有 3D-specific 代码路径都用这个判断(Scene.buildScene、Game.update、Game.startLevel、JsonMazeProvider 暂未路由 — 3D 必须走 AlgorithmMazeProvider.load3D)。

**为什么 3D 算法不通过 registry**:Registry 的 `AlgorithmEntry.generate: (visualSize, rng) => CellType[][]` 是 2D 强类型,3D 是 `CellType[][][]`。把 registry 改成 union signature 反而增加所有 15 个 2D 算法的复杂度(每次 generate 都要 narrow 分支)。3D 单独 dispatch(`AlgorithmMazeProvider.load3D` 内部直接 `generateRecursiveBacktracker3D(size, prng)`)保留两个形状的隔离,新增 3D 算法时也只改 3D 这条线。

**测试**(`tests/unit/maze/recursiveBacktracker3D.test.ts` 新建 10 case + `tests/unit/utils/seed.test.ts` v3 段 +7 case + `tests/unit/inputManager.test.ts` getMove3D 段 8 case + `tests/unit/maze/algorithmMazeProvider.test.ts` 3D 段 4 case + `tests/unit/engine/Game.3D.test.ts` 新建 5 case):覆盖 determinism / cube shape / 边界 wall / spanning-tree reachability / 6-neighbor input / 3D seed codec round-trip / load3D 形状 / Game 3D 移动 collision / 出口 check。

### 3D Prim (P4b-Prim) — locked contracts

**3D 算法第二成员**:`src/maze/generators/prim3D.ts`(`src/maze/generators/prim3D.ts`)。3D Randomized Prim 是 2D Prim(`prim.ts`)的 1:1 翻译,升 4 邻居到 6 邻居。跟 P4a RB 共享 3D 数据布局 (`[z][y][x]`)、thick-wall 编码、VALID_3D_SIZES、isVoxel3DSize、PRNG 消费顺序。**差异只在外层循环**:RB = stack-based DFS (`stack.pop()` + 邻居 DFS),Prim = frontier-based random pick (`frontier[Math.floor(rng() * length)]` + swap-and-pop)。

**Algorithm 联合新增 1 字面量**:`'3d-prim'`(`src/maze/types.ts:401+`)。跟 P4a `'3d-recursive-backtracker'` 并列,3D 算法集 = {RB, Prim}。3D Prim 不进 ALGORITHM_REGISTRY(签名 `[][][]` 不兼容 2D `[][]`)。

**AlgorithmMazeProvider.load3D 分支**:`else if (algorithm === '3d-prim')` 调 `generatePrim3D(size, prng)`。两个 3D 算法共享 `load3D` 的 start3D / exit3D picker + MazeData 装配路径。

**Seed v3 codec**:`algo-v3-3d-prim-{size}-{hex}`(size ∈ {5, 7, 9})。`VALID_3D_ALGORITHMS` 加 `'3d-prim'`(P4a 已有白名单机制自动接受)。`encodeSeedV3(seed, size)` 不变:调用者传 `algorithm: '3d-prim'`,encoder 自动生成 v3 wire format。

**Determinism 契约**:`generatePrim3D(size, rng)` 的 PRNG 消费顺序是 (1) start cell pick 1 次, (2) 每次 frontier pick 1 次 `Math.floor(rng() * frontier.length)`(无论 pick 是否 no-op)。**refactor 改顺序会破 URL round-trip**。

**P4b-Prim 修过的 2 个真 bug**(开发时自测发现):
1. **start cell 越界**: 最初用 `Math.floor(rng() * logicalSize)`,对 visualSize=5 logicalSize=3 但 `oddIdx(2) = 5` 是 outer ring wall ~33% 时间 start 在墙上。修:用 `maxIdx = (visualSize - 1) / 2` 跟 P4a RB 一致。
2. **parallel `visited` 数组越界**: 最初引入了 `visited: Uint8Array` + `cellKey(x, y, z) = (z * logicalSize + y) * logicalSize + x` 的逻辑 cell 索引。但 pushNeighbors3D 推 candidate 时传的是 VISUAL odd indices,`cellKey(1, 1, 3)` 对 visualSize=5 算 = 31 > 27, 越界写 `visited` 导致 undefined 行为 + OOM 跑飞。修:删除 `visited` 数组 + `cellKey` helper,改用 `walls` 数组本身判断(跟 P4a RB 一样 — `walls[z][y][x] === 0` = carved/visited,`=== 1` = unvisited/wall)。

**为什么 P4b-Prim 用 walls 不用 visited**: P2D Prim 用了 `visited: Uint8Array` 但用 additive index `z * size + x + 1`,不跨轴,所以不会踩 multiplicative 跨界 bug。3D 我一开始 lift 到 `(z * logicalSize + y) * logicalSize + x`(同公式 3D 形式),但因为 cross-axis 乘法 + 1 错位,踩到 bug。改用 `walls` 数组最简单 — P4a RB 就是这样做的,被验证过。

**测试**(`tests/unit/maze/prim3D.test.ts` 新建 11 case + `tests/unit/utils/seed.test.ts` P4b-Prim 段 +1 case + `tests/unit/maze/algorithmMazeProvider.test.ts` P4b-Prim 段 +2 case):覆盖 determinism / cube shape / 边界 wall / 不同 seed / spanning-tree reachability / 3d-prim 跟 3d-recursive-backtracker 产生不同 walls(P4a 跟 P4b-Prim 是 sibling,不是 alias)/ seed v3 codec round-trip / AlgorithmMazeProvider load 形状。

**P4a 跟 P4b-Prim 关系**:sibling 不是 alias — 同样 data layout + 性能 + reachability,但 outer loop 不同(RB = DFS, Prim = frontier)。同 seed 产生不同 walls(`'3d-recursive-backtracker-7-0123456789abcdef' !== '3d-prim-7-0123456789abcdef'` 在 wall pattern 上 byte-不同)。这个 contract 在 `algorithmMazeProvider.test.ts` 的 "3d-prim and 3d-recursive-backtracker produce DIFFERENT walls for the same seed" case pin 住。

### 3D 多 cell size 11/13/15 (P4b-CellSize) — locked contracts

**VALID_3D_SIZES 扩 6 sizes**:`[5, 7, 9, 11, 13, 15]`(`src/maze/generators/recursiveBacktracker3D.ts` + `src/utils/seed.ts` 2 处 lockstep)。P4a 锁 [5,7,9] (smallest three),P4b-CellSize 扩 [11,13,15] (P4a spec §15 预留的 medium sizes)。`isVoxel3DSize` 复用,自动接受新值,无需重写。**两处 whitelist 必须 lockstep** — `decodeSeed` 用 `seed.ts` 那份 runtime check,`generateXxx3D` 用 generator 那份 build-time check;只改一边会破 wire format 跟 generator contract。

**Cell 数量级**:
- 5³ = 125 cells (5×5×5)
- 7³ = 343 cells
- 9³ = 729 cells
- 11³ = 1331 cells
- 13³ = 2197 cells
- 15³ = 3375 cells (P4a spec §15 留的 5s budget 上限)

**3D 性能预算锁**(`tests/unit/maze/cellsize.perf.test.ts` 6 case 实测):

| visualSize | cells | budget | 5/7/9 推算 |
|---|---|---|---|
| 5 | 125 | (50ms, P4a) | 1x baseline |
| 7 | 343 | (200ms, P4a) | 4x cells, 4x time |
| 9 | 729 | (1s, P4a) | 5.8x cells, 5x time |
| **11** | **1331** | **1.5s** | 1.8x 9³ cells, 1.5x 9³ time (P4b) |
| **13** | **2197** | **3s** | 1.65x 11³ cells, 2x 11³ time (P4b) |
| **15** | **3375** | **5s** | 1.54x 13³ cells, 1.67x 13³ time (P4b, capped P4a spec §15) |

P4b 实际跑出来 **4ms 总 (6 个 case)** — 比 budget 宽松 100x+。O(N) 算法形态锁住 perf;15³ 仅 ~1.7k cuboid meshes,1 帧 < 1ms draw call。

**Draw call 警告**:15³ = 1687 cuboid meshes per frame。P4a 注释说"commodity hardware < 1000 draw calls" — 15³ 接近 2x budget,某些 GPU 可能掉帧。**P4c+ 优化候选**:InstancedMesh (一个 draw call per geometry 渲染所有 cuboid) 或 octree culling(只画玩家可见的 cuboid)。

**3D 算法 + 3D size 正交**:3D RB (P4a) 和 3D Prim (P4b-Prim) 都接受 6 sizes (`VALID_3D_SIZES` re-exported from `recursiveBacktracker3D.ts`)。`AlgorithmMazeProvider.load3D` dispatch 走 `algorithm` literal,`size` 是独立参数,3D 算法集 × 3D size 集 = 2 × 6 = 12 种合法 seed。

**Codec lockstep**:`algo-v3-{algorithm}-{size}-{hex}`,size 是字符串部分,codec regex `(\d+)` + runtime whitelist check 共同接受 6 sizes。`isProcedural` 4 处 (App.tsx + gameUrl.ts build/parse) lockstep 已加 v3 prefix (P4a 修过),size 是字符串部分不影响 prefix gate。

**为什么 P4b-CellSize 不需要新 generator**:`generateRecursiveBacktracker3D` 和 `generatePrim3D` 的算法形态 O(N) over `visualSize³` cells — visualSize=15 跟 visualSize=9 一样是同样的算法,只是外层循环跑更多次。Algorithm 形态不动,只动 `VALID_3D_SIZES` 单数组 + 测试 whitelist case 改 6 sizes。

**Perf 算法形态对比**:
- 3D RB = O(N) cells (stack-based DFS, stack.push/pop O(1))
- 3D Prim = O(N) cells (frontier-based random pick, swap-and-pop O(1))
- 3D Kruskal = O(N α(N)) (union-find, ~O(N))
- 3D Aldous-Broder = O(N²) 期望 (随机游走) — P4b 候选,15³ = 3375 cells,O(N²) = 11M ops,**会超 5s budget**
- 3D Wilson's = O(N²) 期望 — 同上
- 3D Cellular Automata = O(N × steps) 迭代 — 取决于 steps,通常 O(N) per step × 5+ steps

P4b-CellSize 锁的 5s budget 只对 O(N) 家族有效。**未来 3D Aldous-Broder / 3D CA 候选需要重新算 budget** (可能需要 17/19/21 缩到 15/13/11 或重设 budget 到 30s)。

**测试**(`tests/unit/maze/cellsize.perf.test.ts` 新建 6 case + 4 个 test file 改 whitelist case):
- `recursiveBacktracker3D.test.ts` whitelist case 改 6 sizes
- `prim3D.test.ts` 同上
- `seed.test.ts` v3 codec round-trip 6 sizes + it.each bad list 改写
- `algorithmMazeProvider.test.ts` 3D load 6 sizes × 2 算法
- `cellsize.perf.test.ts` 6 case (3 sizes × 2 algorithms × 1.5s/3s/5s budget)

### 3D Player 0.1s cell-to-cell tween (P4b-Lerp) — locked contracts

**3D cell 移动从瞬移升级为 0.1s linear lerp**:
- `MOVE_3D_TWEEN_SEC = 0.1` (`src/engine/Game.ts` module-level,export,跟 `STAIR_DURATION_SEC` / `HOLE_DOWN_DURATION_SEC` 同位)
- 按 D → 玩家从当前格中心 0.1s 内滑到目标格中心
- tween 期间 input 内部 gate(只 lock move 键,**mouse-look 仍可用**),不调 `input.setPaused`(Q3 决策)
- cell-based collision 在 tween 启动时判一次,tween 中途不重判(Q4)
- exit check 在 tween 完成时触发,不在 tween 启动时(Q5 — 防止 false positive)
- 完成时 snap 精确到 endPos(float drift 防护),`active3DTween = null`

**`active3DTween` 字段**(跟 P3-1 `activeTransition` 同构,但 3 维全存):
```ts
{ startPos: {x,y,z}, endPos: {x,y,z}, endCell: {x,y,z}, durationSec: 0.1, elapsed: number }
```

**为什么新加 `active3DTween` 不复用 P3-1 `activeTransition`**:
- 3D path 在 `update()` 顶部 short-circuit (`walls3D !== undefined` 在 `activeTransition` 检查之前)
- 3D playerY 是连续值 (0..visualSize*cs),不是 layer index (0..levelCount-1)
- 强行复用 P3-1 playerY/playerLevel 让代码语义混乱
- 新字段跟 P3-1 同构(start+end+elapsed+duration),风格一致

**为什么 0.1s linear (Q1+Q2 决策)**:
- 0.05s 仍然能看出跳(60fps = 16ms,3 帧过渡太短)
- 0.2s 慢得让快速 walk 显得卡
- 0.1s = 6 帧 60fps,体感 sweet spot
- linear 跟 P3-1 vertical transition 一致;ease-out 让快速 walk 黏滞;ease-in-out 跟 6 邻居 cell hop 节奏冲突

**为什么 mouse-look 在 tween 期间仍可用 (Q3 决策)**:
- 0.1s 短 tween,mouse-look 锁定反而显得卡(玩家想看下一格但相机被锁)
- 跟 P3-1 vertical transition 不同:P3-1 是 0.4-0.5s 长时 + 玩家"在楼梯上"不期待自由视角
- 实现:不调 `setPaused`,只在 `tick3DMovement` 顶加 1 行 `if (this.active3DTween) { tick3DTween(dt); return; }`

**cellSize 跟 FLOOR_HEIGHT 不混用 (Q13 决策)**:
- P3-1 用 `FLOOR_HEIGHT = 2.4` 锁 layer 高度
- P4 3D 用 `cellSize` (=2) 锁 cell 宽度
- 两个常量语义不同(layer vs cell),P4b-Lerp 3 维 lerp 走 `cellSize`

**`startLevel` + `dispose` 双 reset**:
- `startLevel` 末尾加 `this.active3DTween = null`(跟 `activeTransition = null` 同 reset 块)
- `dispose` 末尾加 `this.active3DTween = null`(跟 `enemies = []` 同 hygiene 块)
- 重置保证 mid-slide level reset / dispose 不留 stale tween 指向旧关 start3D

**3D path short-circuit 在 update() 顶部**:
- `walls3D !== undefined` 检查在 `warningFlash` / `activeTransition` 之前
- 3D tween 跟 2D vertical transition 物理上永远不并发
- 两个状态机各自独立,不需要 union type

**为什么 6 维 vector 不用 `THREE.Vector3` lerp**:
- `THREE.Vector3.lerp(target, alpha)` 是 instance method,会改 target
- 3 维 lerp 用 `t.startPos.x + (t.endPos.x - t.startPos.x) * u` 3 次标量 lerp,跟 P3-1 `lerp(a, b, t)` 复用同 module-level helper
- 0 GC pressure,跟 P3-1 tickActiveTransition 同量级 perf

**测试**(`tests/unit/engine/Game.3D.tween.test.ts` 新建 7 case + `tests/unit/engine/Game.3D.test.ts` 改 4 case):
- `Game.3D.tween.test.ts` (NEW): mid-tween linear progress / completion snap / wall reject no tween / held-D 连续 tween / mouse-look 仍可用 / startLevel 重置 / dt=0 不前进
- `Game.3D.test.ts` (UPDATE): 4 旧 case 改 tween-aware — `update(0.1)` 跑完 tween + 加 keyup 避免下一帧立即重触发

### 3D top-down minimap (P4b-Minimap) — locked contracts

**3D minimap 渲染当前 y-layer 的 2D 顶视图**:
- `is3D = maze.walls3D !== undefined` dispatch (P4a 锁的 `walls` vs `walls3D` 互斥)
- 3D path 渲染 `walls3D[currentLayer]` (y-slice, `CellType[][]` 同 2D 形状)
- `currentLayer` 在 3D 模式 = `Math.floor(player.position.y / cellSize)`,2D 模式 = `useGameStore.player.currentLevel`
- y 跟踪走 10Hz polling (`useTickRef` 已有 polling),加 `y` 到 `PlayerSnapshot` + `Y_EPSILON = 1/8` 早出条件

**复用 P3-1 `recordVisit` 机制**:
- `tick3DTween` 完成时调 `recordVisit(parchment, yCell, endCell.x, endCell.z)`,`level = yCell`
- 2D 跟 3D 互斥 (一个 maze 不会同时有 walls 跟 walls3D),`parchment.visitedCells` map 共享同 shape
- 2D path `recordVisit(parchment, playerLevel, x, z)` 完全不动 (P3-1 行为不变)

**3D 出口 dispatch**:
- 出口 y === currentLayer → 2D 出口 rect (COLOR_EXIT 填充) — 跟 2D minimap 同形
- 出口 y > currentLayer → 玩家 arrow 下方 "↑ exit" SVG `<text>` 元素
- 出口 y < currentLayer → 玩家 arrow 下方 "↓ exit" SVG `<text>` 元素
- 2D 模式无 off-layer 概念 (出口永远在当前 layer),不渲染 hint

**y-level 标签** (3D only):
- 位置: minimap 容器右上角,absolute-positioned 不影响 SVG viewBox
- 字体: 11px `ui-monospace, SFMono-Regular, Menlo, monospace` + `var(--accent)` 颜色
- 文本: 1-indexed 格式 `L{n}/{total}` (n = currentLayer+1, total = visualSize)
- 跟 HUD `LevelIndicator` chip 风格一致 (单字符 L + 数字),但 chip 留给 P4b+ scope

**`getPlayerY()` accessor** (跟 `getPlayerPosition()` 平行):
- 3D minimap 唯一 y 数据来源
- 2D minimap 永远不读 y (currentLevel 足够)
- `position.y` 是 source of truth,engine 在 `tick3DTween` 跟 `createPlayer` (mode: '3d') 直接更新
- player 未创建时返回 0 跟 `getPlayerYaw` fallback 一致

**`PlayerSnapshot` 加 `y` 字段 + `Y_EPSILON`**:
- `Y_EPSILON = 1/8` 跟 `POS_EPSILON` 同 (1/8 cell),保证 0.1s tween 期间 (y 跨 cell 边界) early-out 不命中 → 触发 minimap 重渲染
- player 静止时 y 不变 → early-out 命中 → 0 重渲染
- 跟 2D path `PlayerSnapshot` shape 兼容 (2D 测试 fixture 传 y=0 不变)

**`StaticMaze` 重构 (2D 跟 3D 复用)**:
- 接受 `walls2D: CellType[][]` + `exitPos: {x,z} | null` + `pickups` props
- 2D minimap 传 `maze.walls` / `maze.exit` / `maze.pickups`
- 3D minimap 传 `walls3D[currentLayer]` / `maze.exit3D` 投影到 (x, z) (同层) / `[]` (P4a 锁 3D 无 pickup)
- 同结构不同数据源 — `React.memo` 跳过静态部分,只换数据

**HUD `LevelIndicator` chip 不动** (P4b+ scope):
- 3D 模式 chip 仍显示 "L1" (因为 `player.currentLevel` 永远是 0)
- 修 chip 要 dispatch 2D/3D 内部逻辑,不在 P4b-Minimap 范围
- 3D y-level 信息已在 minimap 标签 + off-layer hint 表达

**测试**(`tests/component/Minimap.3D.test.tsx` 新建 8 case + `tests/component/minimap.test.tsx` 改 mock 加 `getPlayerY` + `tests/unit/engine/Game.3D.tween.test.ts` 加 2 recordVisit case):
- `Minimap.3D.test.tsx` (NEW, 8 case): data-is-3d="true" / "L1/5" y-level 标签 / y-cell 切换重新投影 / "↑ exit" 上方 hint / "↓ exit" 下方 hint / 同层 exit rect 不显示 hint / visited cells 从 `visitedMap.get(yCell)` 读取 / polling tick y delta 触发重渲染
- `Game.3D.tween.test.ts` (+2 case): 3D recordVisit 写入 `visitedCells.get(yCell)` / 2D 跟 3D recordVisit 互斥 (3D maze 不会触发 2D path)
- `minimap.test.tsx` (UPDATE): mock `gameRef` 加 `getPlayerY()` 返回 0 (2D 测试不读 y,但 minimap 内部在 3D dispatch path 调)

### HUD LevelIndicator 2D/3D dispatch (P4b-HudLayer) — locked contracts

**3D 模式 HUD chip 跟实际 y-cell 同步**:
- 2D 路径: `tickActiveTransition` 完成时 `bridge.onLevelChange?.(this.playerLevel)` 推 vertical layer (P3-1 行为)
- 3D 路径: `tick3DTween` 完成时 `bridge.onLevelChange?.(yCell)` 推 y-cell (P4b-HudLayer 新加)
- 2D 跟 3D 路径在 `update()` 顶部 short-circuit 互斥,`onLevelChange` 永远不会在同一 session 收到两种值

**`startLevel` 3D path 初始 push**:
- 2D: `bridge.onLevelChange?.(this.playerLevel)` (P3-1 D6 back-compat)
- 3D: `if (injectedMaze.start3D) bridge.onLevelChange?.(injectedMaze.start3D.y)` (P4b-HudLayer 新加)
- 互斥 dispatch,2D 不会走 3D 分支,3D 不会走 2D 分支 (start3D 在 2D maze 里是 undefined)

**`onLevelChange` 语义统一为 "current visible layer"**:
- 2D: vertical layer index (0..levelCount-1)
- 3D: y-cell (0..visualSize-1)
- 同一个 bridge callback 服务两种情况,store / HUD 不用 dispatch 2D/3D
- `setCurrentLevel` setter no-op guard 防止重复 push 触发 React 重渲染

**`this.playerLevel` 字段 2D only**:
- 3D 路径不污染 `this.playerLevel` (永远是 0)
- 3D yCell 通过 `bridge.onLevelChange` 单独推,engine 内部用 `player.position.y / cs` 算 (跟 minimap 一致)
- `this.playerLevel` 仍被 2D path 用 (recordVisit / findTransitionAt / enemy contact / crossesExit)

**HUD `LevelIndicator` chip 不动**:
- 已有渲染逻辑 `L{currentLevel + 1}` (1-indexed display) 自动处理任意 0-indexed 整数
- 2D 模式: L1..L6 (P3-1 stacked layers)
- 3D 模式: L1..L15 (P4a visualSize range)
- 1-indexed 跟 minimap 标签 `L{n}/{total}` 数字部分一致

**player 静止时 chip 不闪**:
- tween 完成时才推 yCell
- 静止时 `active3DTween = null`,不推
- `setCurrentLevel` setter no-op guard: 值相等不触发 React 重渲染
- 快速 walk (Space 长按): 连续 tween = 连续 push,setter short-circuit 防止 React churn

**2D 行为完全不变**:
- 2D `startLevel` 走 `this.bridge.onLevelChange?.(this.playerLevel)` 推 vertical layer
- 2D `tickActiveTransition` 完成时推 transition 目标 layer
- P3-1 既有 test 全部不动,新加 3D test 覆盖 3D path push

**测试**(`tests/unit/engine/Game.3D.tween.test.ts` +2 case):
- `tick3DTween` 完成时 fire `onLevelChange(yCell)` (Space press 0→1)
- `startLevel` 3D path fire 初始 `onLevelChange(start3D.y)` (跟 2D path 互斥 dispatch)

### 3D 全景 minimap — 3 y-layer 堆叠 (P4b-Panorama) — locked contracts

**3D minimap 升级为 3 strip 堆叠** (120×120 容器拆 40+40+40):
- **上 strip (40px)**: `walls3D[currentLayer + 1]` — 50% fill-opacity (玩家 y+1 视野)
- **中 strip (40px)**: `walls3D[currentLayer]` — 100% opacity + 玩家 arrow + view cone + visited cells + 出口 rect (玩家当前 y)
- **下 strip (40px)**: `walls3D[currentLayer - 1]` — 50% fill-opacity (玩家 y-1 视野)
- 越界 strip 不渲染 (currentLayer=0 没下层,currentLayer=visualSize-1 没上层,留白)
- 1px 灰横线分隔 (`border-bottom: '1px solid rgba(0,0,0,0.3)'`,最底 strip 跳过)
- 玩家 y 变化 → 3 strip 整体滚动,中间 strip 永远对应当前 y

**3 strip 用 3 个独立 `<svg>` 元素** (不是 1 个 SVG 3 个 group):
- 每个 strip 独立 `viewBox="0 0 w d"`,独立 `preserveAspectRatio="xMidYMid meet"`
- `YStrip` 组件用 `React.memo` 包装,引用相等时跳过 reconciliation
- 3 SVG 元素比 1 SVG 3 group 简单 (每个 strip 独立,无需 group transform 算 offset)
- 1px 分隔线用 CSS `border-bottom` 而不是 SVG stroke (跨 3 SVG 边界,简单)

**当前 y strip 满色 / 相邻 50% opacity**:
- 满色: 中间 strip 是主视图 (玩家位置),强化"现在在哪"
- 50%: 上下相邻是 "context" (知道上面 / 下面有什么),退到背景
- opacity 应用在 `<g style={{ opacity }}>` 包裹 StaticMaze,所有 rect 统一 dim
- 不是"远端更透明"动态渐变 (本 scope 锁 50% 固定,简单可读)

**出口 / visited / arrow 只在当前 y strip**:
- 玩家物理位置在当前 y,arrow / cone / visited 都在当前 y 渲染
- 上下相邻 strip 只画 walls,不画 visited (玩家没走过那里)
- 出口 dispatch 跟 P4b-Minimap 一致 — 同层 rect / off-layer "↑/↓ exit" text (只在当前 strip 渲染)
- off-layer exit hint 方向 (↑/↓) 跟 strip 视觉位置对齐 (上 strip 在屏幕上方)

**`<svg>` 数量 = 3** (3D 模式) vs **1** (2D 模式):
- 2D path 走 P2-3 / P3-1 既有单 SVG 全高路径 (跟既有渲染同形)
- 3D path 走 P4b-Panorama 3 strip 堆叠路径
- 互斥 dispatch (`is3D ? <panorama> : <single-svg>`)

**YStrip 组件 React.memo**:
- props `walls2D` 引用相等时跳过 reconciliation
- 玩家 y 翻格时 (10Hz poll) 3 个 strip 都重渲染,但引用相等的 strip 不 diff
- 50% / 100% opacity 通过 `<g>` 包裹,避免 rect 单独算 opacity

**P4b-Minimap y-level 标签 "L{n}/{total}" 保留**:
- 容器右上角,绝对定位,跟 P4b-Panorama 1 strip 路径同位置
- 当前 y 的 1-indexed display
- 跟 HUD `LevelIndicator` chip (P4b-HudLayer) 数字部分同步

**复用 P4b-Minimap / P4b-HudLayer 锁的 contracts**:
- `getPlayerY()` accessor + `PlayerSnapshot.y` + `Y_EPSILON` 早出 (P4b-Minimap 锁)
- `bridge.onLevelChange(yCell)` 推 y-cell (P4b-HudLayer 锁)
- 出口 dispatch 同层 rect / off-layer "↑/↓ exit" text (P4b-Minimap 锁)
- 2D minimap 走 P4b-Minimap 单层路径,3D minimap 走 P4b-Panorama 3 strip 路径,互斥 dispatch
- 120×120 容器尺寸 (P2-3 锁) 不动
- 1px 灰分隔线 (本 scope 锁)

**性能**:
- 3 strip × ≤ 225 rect (visualSize=15) = ≤ 675 rect 总数
- React.memo 跳过引用相等的 strip
- 10Hz poll 抓 y 触发 minimap 重渲染
- 实测影响 < 1ms / frame

**测试**(`tests/component/Minimap.Panorama.test.tsx` 新建 9 case + 既有 `Minimap.3D.test.tsx` 8 case + 既有 `minimap.test.tsx` 31 case 全部不动):
- `Minimap.Panorama.test.tsx` (NEW, 9 case): 3 strip 渲染 / 越界 strip 隐藏 (currentLayer=0 / =visualSize-1) / 50% vs 100% opacity / 出口 off-layer hint 只在当前 strip / 同层 exit rect 只在当前 strip / y-level 标签保留 / visited cells 只在当前 strip / 3 SVG 元素数
- 既有 `Minimap.3D.test.tsx` (UPDATE): 8 case 改 dispatch (3D 走 P4b-Panorama 路径,断言 3 strip 存在 + 越界正确);既有断言 (data-is-3d / data-level / y-level 标签 / off-layer exit hint) 全部不动
- 既有 `minimap.test.tsx` (UPDATE): 2D 路径完全不动,31 case 全部 pass

## 测试

```
tests/
  setup.ts              # 在 Node 22 上 polyfill localStorage(它会遮蔽 happy-dom)
  unit/                 # utils、maze 生成器、store、Rules、gameUrl、i18n
  component/            # Testing Library + happy-dom(Menu、HUD、LevelSelect、编辑器面板、dialog、…)
    editor/             # 编辑器子组件测试
  e2e/                  # Playwright(仅 chromium、1 worker、retries=0);自动启动 dev server
```

Playwright 配置:`fullyParallel: false`、`workers: 1`、`retries: 0`、`baseURL: http://localhost:5173`;HTML 报告输出到 `playwright-report/`(已 gitignore),失败时与 trace 一起保留。project 只有一个(chromium)。

## 工作流约定(摘自 `docs/roadmap.md`)

- **一次只做一个增量**。完成一项后,在 `docs/roadmap.md` 勾 `[x]`,更新顶部「已完成 / 下一个任务 / 最后更新」锚点,commit,然后**等用户确认**再开始下一项。
- 每个计划中的增量在 `docs/increments/<slug>/` 下有两份产物:`spec.md`(设计)和 `plan.md`(任务清单)。Phase 2 完整路线图在 `docs/roadmap.md`;各增量的设计文档在 `docs/increments/p2-N-*/`。
- 新会话启动时,先读 `docs/roadmap.md` 顶部的「当前进行中」锚点 —— 若有活跃增量,先做完再开新工作。
- 关卡身份写在 URL 里;新代码路径若需要关卡,应从 `parseGameSearchParams` 读取,而不是只从 props 传。

## 代码评审文档规范(`docs/reviews/`)

每次完成 code review 后,把发现以 markdown 形式存到 `docs/reviews/`,遵循以下规范。

### 评审范围(强制)

- **默认范围 = 整个项目**。除非用户在评审请求中**明确指出** review 范围(如 "只 review `src/store/`"、"只看编辑器"),否则必须从项目根目录开始,**从头到尾 review 全量代码**(包括 `src/`、`tests/`、`public/`、`docs/`、配置文件、CI workflow 等),不允许自行缩小范围。
- 明确指出范围时,引用用户原话并锁定到具体文件 / 模块 / 增量 ID,不得擅自外扩。
- 全量评审的产物文件名 slug 建议包含 `full-` 前缀(如 `full-code-review`、`full-bug-scan`、`fresh-full-review`),与局部评审(`local-review`、`editor-review` 等)在目录里自然分层。

### 存储位置 & 命名风格(强制)

- **保存位置固定为 `docs/reviews/`**(主报告在根,分项 finding 在 `docs/reviews/findings/`)。不允许写到仓库其他位置(如 `docs/audit/`、`docs/code-review/`、项目根),也不允许写到仓库外。
- **命名风格必须统一**:严格遵守下方「文件命名」小节的 `YYYY-MM-DD-<slug>.md` 格式 + kebab-case slug 约定。**禁止**自创格式(如 `Review_2026.md`、`projectReview.md`、`2026-06 review.md`、`review-final.md` 等)。
- slug 选词需语义清晰,与已有 review 集合保持一致风格(全量评审带 `full-` 前缀、局部评审带局部范围关键词);新增 slug 前先 `ls docs/reviews/` 确认不与已有命名重复或冲突。
- 同一天多份 review 用不同 slug 区分主题,不得靠后缀 `-v2`/`-final`/`-new` 区分同一份报告的迭代(迭代应通过 git 历史追溯)。
- **目的**:`ls` 默认排序即按日期升序,无需额外索引

### 目录结构

```
docs/reviews/
  YYYY-MM-DD-<slug>.md           # 主评审报告(每份 review 一个文件)
  findings/
    YYYY-MM-DD-<letter>-<topic>.md   # 分项 / 子代理 finding 块
```

- **主报告**放 `docs/reviews/`(总览 + 严重度分类 + Next Steps)
- **分项 findings**放 `docs/reviews/findings/`(按领域字母 A/B/C/D/E 分类,如 `2026-06-13-A-architecture.md`、`2026-06-14-E-comprehensive.md`)
- **不要**在仓库其它位置存评审副本

### 文件顶部元数据(主报告)

```markdown
# Project Review — <短标题> (YYYY-MM-DD)

**Slug**: <文件名去 .md 的部分>
**日期**: YYYY-MM-DD
**评审窗口**: `main` HEAD = `<short-sha> <commit-subject>`
**前置评审**: [`<前一份文件名>`](./<前一份文件名>)(<上次发现数> 条 baseline)
**关联文档**: [`findings/<分项>`](./findings/<分项>) · ...
**评审方式**: <子代理拆分 / 单代理 / 工具组合等>
```

### 严重度分级(统一用四级)

- **CRITICAL** — 数据损坏 / 安全漏洞 / 引擎崩溃
- **HIGH** — 玩法 bug / 类型不安全 / 内存泄漏 / 关键测试塌方
- **MEDIUM** — UX 不一致 / 代码异味 / 较隐蔽的回归风险
- **LOW** — magic number / 风格 / 注释 / 微小性能

### 必备结构

主报告至少包含:

1. **§0 元数据 & 方法** — 评审范围、文件数、子代理拆分方式
2. **§1 总览** — 严重度统计表 + 一句话结论
3. **§2-5 按严重度分组的 finding** — 每条带 `<file>:<line>` 精确锚点 + 影响 + 复现 + 修复
4. **§6 验证为假阳性的子代理报告** — 否定理由(避免重复审查时再被报出)
5. **§7 验证结果** — typecheck / test / build / lint 退出状态
6. **§8 跨切关注** — 跨多 finding 的工程债主题
7. **§9 优先级行动建议** — 按工作量 + 严重度排序
8. **§10 Files Reviewed** — 模块 × 文件数 × finding 数表

### 跨文件引用 & 重命名

- 引用其它 review 用**相对路径**(`./2026-06-14-project-review.md`、`./findings/2026-06-13-A-architecture.md`)
- 重命名一份 review 时:
  1. `mv` 物理文件
  2. `grep -rn` `docs/` 找出所有引用并同步更新
  3. 不要改源码里的 `F-<date>-<...>` tag(那是稳定标识符)

### F-tag 引用(源码注释 → review)

修复 finding 时,在代码注释中留下 `F-YYYY-MM-DD-<severity>-<num>` 格式的 tag,例如:

```ts
// F-2026-06-15-C-2: reset currentMode and currentEnemyCount to their
// initial values so a survive run followed by goToMenu doesn't leak
// 'survive' into the next reach-exit level.
```

- 这样 git blame 能直接定位到原始 review
- F-tag 是**稳定的不可变标识符**,即使 review 文件被重命名也不要改动
- 新增 finding 时给一个连续递增编号(`C-1`/`C-2`/`H-3.1`/`M-4.5` 等),编号风格随 review 自身,但同一份 review 内保持一致

### Slug 与文件名的关系

- 顶部 `**Slug**` 字段是文件名去 `.md` 的部分(或描述性短语)
- **不强制** slug 等于文件名 — 历史评审有些 slug 没带日期(如 `project-review-2026-06-13`),不必回填
- 重命名文件**只改文件名 + 跨文件引用**,slug 字段保持原样(它是文档内部 metadata,不影响导航)

## 内置关卡 JSON(`public/levels/`)

| 文件 | 用途 |
|---|---|
| `level-small.json` | 教学手写关卡 |
| `level-tiny.json` | 最小尺寸关卡,供 E2E 调试 |
| `level-tiny-pickups.json` | 最小尺寸 + 包含拾取物品 |
| `level-tiny-enemy.json` | 最小尺寸 + 单敌人(id `test-enemy`),供玩家-敌人 E2E 用 |

新增手写关卡:把 `level-X.json` 放进此目录,关卡列表会自动收录。
