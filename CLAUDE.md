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
