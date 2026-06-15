# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 会话规则

- **回复语言**:用中文回复用户。
- **提交控制**:每次修改完代码后**不自动提交**;`git commit` / `git push` / `git merge` 等操作只能由用户执行。完成代码改动后,等用户明确指示再提交。
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

覆盖率阈值(`vitest.config.ts` 设置,作用域为 `src/**`):行 80% / 函数 75% / 分支 75% / 语句 80%。v8 provider 仅度量 `src/**` —— E2E 由 Playwright 运行,刻意排除在 vitest 覆盖率作用域外。另有少量文件被额外排除在阈值外(`main.tsx`、`App.tsx`、`engine/{Game,Camera,Renderer,Loop}.ts`、`ui/GameCanvas.tsx`、`maze/types.ts`、`game/GameState.ts`、`vite-env.d.ts`、`playwright.config.ts`)。

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

### i18n(P2-8)

自研零依赖的 i18n,不是 i18next。`getT(locale)` 是纯函数翻译器;`useT()` 是绑定到 `settingsStore.language` 的 React hook,语言切换会重渲染所有消费者。占位符使用 `{name}` 语法。缺失 key → `console.warn` + 原样返回 key 字符串。未知 locale → warn + 回退到 `DEFAULT_LOCALE`。新增翻译写在 `src/i18n/resources/{zh,en}.ts`。关卡可带可选的 `i18n.en` 显示名;面向用户显示时用 `getDisplayName(maze, locale)`,缺失时回退到 `maze.name`。

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

## 内置关卡 JSON(`public/levels/`)

| 文件 | 用途 |
|---|---|
| `level-small.json` | 教学手写关卡 |
| `level-tiny.json` | 最小尺寸关卡,供 E2E 调试 |
| `level-tiny-pickups.json` | 最小尺寸 + 包含拾取物品 |
| `level-tiny-enemy.json` | 最小尺寸 + 单敌人(id `test-enemy`),供玩家-敌人 E2E 用 |

新增手写关卡:把 `level-X.json` 放进此目录,关卡列表会自动收录。
