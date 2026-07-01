# 3D 迷宫（maze3D）

浏览器中运行的第一人称 3D 迷宫游戏：手写关卡 + 算法生成关卡 + 浏览器内关卡编辑器，支持竞速、生存、敌人巡逻等多种胜利模式。
URL 是关卡状态的唯一真源，刷新 / 分享 / 后退 都会回放同一关卡配置。

引擎层用 Three.js 写成的纯 TypeScript 模块驱动；UI 是 React 18 + Zustand，二者通过 `useGameStore` 订阅解耦。
测试套件用 Vitest + Testing Library + happy-dom（单元 / 组件）+ Playwright（端到端）。

---

## 1. 技术栈

| 类别 | 选型 |
|---|---|
| 构建工具 | Vite 5 |
| UI 框架 | React 18 + TypeScript 5 |
| 路由 | react-router-dom 6 |
| 3D 渲染 | Three.js 0.169 |
| 状态管理 | Zustand 4 |
| 单元 / 组件测试 | Vitest + Testing Library + happy-dom |
| 端到端测试 | Playwright |
| 国际化 | 自研轻量 i18n（`src/i18n/`，零依赖） |

环境要求：**Node 18+**。

---

## 2. 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

构建 / 测试：

```bash
npm run build        # tsc -b 类型检查 + Vite 生产构建到 dist/
npm run preview      # 本地预览生产产物
npm run typecheck    # 仅 tsc -b --noEmit
npm test             # 单元 + 组件测试
npm run test:watch   # Vitest watch 模式
npm run test:e2e     # Playwright 端到端（自动启动 dev server）
npm run test:e2e:install  # 安装 Playwright 浏览器
```

跑单个 Vitest 测试（按文件或名称）：

```bash
npx vitest run tests/unit/rules.test.ts
npx vitest run -t "specific describe/it name"
```

跑单个 Playwright spec：

```bash
npx playwright test tests/e2e/survive.spec.ts
npx playwright test --grep "specific title"
```

---

## 3. 路由

应用入口是 `BrowserRouter`，路由如下（`src/ui/App.tsx`）：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | MenuPage | 主菜单 |
| `/levels` | LevelsPage | 关卡选择 |
| `/settings` | SettingsPage | 偏好设置 |
| `/editor` | EditorPage | 浏览器内关卡编辑器 |
| `/game` | GamePage | 进入游戏，查询串携带关卡身份 |
| `*` | 重定向 | 任意未匹配路径回到 `/` |

`/game` 的查询串由 `src/utils/gameUrl.ts` 编解码，是关卡身份的规范来源：

| 查询键 | 取值 | 含义 |
|---|---|---|
| `seed` | `algo-v1-<algorithm>-<size>-<hex16>` | 程序生成关卡；种子自描述（算法 + 尺寸 + 16 位 hex） |
| `id` | `teaching-001` / `custom-…` / `builtin-…` | 手写关卡或编辑器导出的关卡 |
| `mode` | `reach-exit` / `time-trial` / `survive` | 胜利模式 |
| `survive` | `30` / `60` / `90` / `120` | survive 模式倒计时秒数 |
| `enemies` | `0`–`N` | 巡逻敌人数量 |
| `progressive` | `true` / `false` | 渐进式敌人刷新 |

> URL 是规范的关卡身份，刷新 / 分享 URL / 浏览器后退都回到同一配置；F9 重试也通过 URL 重新触发同一配置。

---

## 4. 游戏控制

| 键位 | 作用 |
|---|---|
| **W / A / S / D** 或 **方向键** | 移动 |
| **鼠标** | 视角（点击画布锁定指针） |
| **P** | 暂停 / 继续 |
| **1** / **2** | 使用 1 号 / 2 号库存槽的物品（空槽无效果） |
| **F9** | 重玩当前关卡（保留 URL 中的模式设置） |
| **ESC** | 释放鼠标指针 |

---

## 5. 关卡

### 5.1 手写关卡

`public/levels/*.json`：

| 文件 | 用途 |
|---|---|
| `level-small.json` | 入门尺寸，手写教学关 |
| `level-tiny.json` | 最小尺寸，便于 E2E 调试 |
| `level-tiny-pickups.json` | 包含拾取物品的最小关卡 |
| `level-tiny-enemy.json` | 包含单个敌人（id `test-enemy`）的最小关卡，供 E2E 玩家-敌人碰撞用 |

新增手写关卡：把 JSON 放进 `public/levels/level-X.json`，刷新页面会出现在"固定关卡"列表。

### 5.2 程序生成关卡

`AlgorithmMazeProvider` 调度四种迷宫生成算法：

- `recursive-backtracker`（递归回溯）
- `kruskal`（Kruskal）
- `prim`（随机 Prim）
- `hunt-and-kill`（Hunt-and-Kill）

提供 3 档尺寸（15×15 / 30×30 / 50×50）+ 16 位十六进制种子。种子格式
`algo-v1-<algorithm>-<size>-<hex>` 自包含算法、版本、尺寸和熵，跨设备复现完全相同的迷宫。

### 5.3 编辑器关卡

`/editor` 提供浏览器内关卡编辑器：

- 工具栏（顶部）：墙体 / 地面 / 门 / 旗 / 起点 / 拾取 / 敌人 / 平移 / 橡皮
- 左侧面板：关卡列表 + 文件夹管理 + 元信息编辑
- 中部视口：实时迷宫预览，鼠标拖拽放置 / 拖动平移
- 右侧属性面板：当前选中对象的属性（敌人路径节点等）
- 状态栏：保存 / 导出 JSON / 导入 JSON / 撤销 / 重做 / 脏数据提示
- 帮助抽屉：快捷键速查表
- 教程手册：6 章分节阅读模式，引导用户学习编辑器各项功能（TopBar 📖 按钮打开）

`EnemySpawn` 描述敌人出生坐标 + 路径节点（`path: {x,z}[]`，≥ 2 节点），
编辑器输出 JSON 与手写关卡共用同一 `MazeData` schema。

---

## 6. 拾取物品与库存

关卡可放置三种拾取物品：

| 类型 | 效果 |
|---|---|
| `time` | 恢复倒计时（按 `rules.timeOnPickup` 累加秒数） |
| `health` | 恢复生命值（不超过 `rules.maxHealth`） |
| `key` | 进入库存（2 个槽位；库存满时拾取失败，物品保留在原位） |

库存槽位通过数字键 `1` / `2` 触发使用。当前没有消耗 `key` 的机关，使用仅触发 UI 闪烁；该契约为后续扩展（敌人 / 生存模式下的锁 / 门）预留。

---

## 7. 胜利模式

`MazeData.rules.victory` 与 `StartLevelOptions.mode` 共同决定胜利条件：

| 模式 | 含义 | 计时 |
|---|---|---|
| `reach-exit` | 抵达出口格子即胜利 | 沿用关卡自身的 `initialTime` |
| `time-trial` | 180 秒内抵达出口，否则 game-over | 强制 180 秒预算 |
| `survive` | 30 / 60 / 90 / 120 秒存活，倒计时跑完即胜利 | 30 / 60 / 90 / 120 秒预算（LevelSelect 可选） |

`mode=enemies` / `progressive=true` 叠加在以上模式上：巡逻敌人按数量 / 渐进调度刷新。

最佳成绩按 `levelId` 保存到 `localStorage`（`maze3d.levels.v1`），程序生成关卡的成绩附自描述 `Seed`，
可随时通过 URL 重新打开同一迷宫。

---

## 8. 设置

`/settings` 提供：

- **暗色 / 亮色主题**（持久化到 `settingsStore`）
- **语言** `language`：在「中文 / English」之间切换；切换后整个游戏所有 UI 立即重新渲染（关卡名、菜单、HUD、暂停 / 通关 / 失败遮罩、设置面板、编辑器等）
- **敌人追击强度** `enemyAggression`：影响敌人 `chase` 状态的反应速度
- **鼠标灵敏度 / FOV**（视版本而定）

所有偏好持久化到 `localStorage` 并经过 `sanitizeSettings` 显式校验，校验失败丢弃而非吞错。

---

## 9. 项目架构

```
src/
├── engine/                       # 纯 TypeScript 写的 Three.js 引擎，不引用 React
│   ├── Camera.ts                 #   相机与视角封装
│   ├── Collision.ts              #   玩家与墙体的碰撞检测
│   ├── Game.ts                   #   主循环、Tick 调度、scene refs
│   ├── InputManager.ts           #   键盘 / 鼠标输入
│   ├── Loop.ts                   #   requestAnimationFrame 循环
│   ├── Renderer.ts               #   Three.js 渲染器
│   └── Scene.ts                  #   场景搭建（墙、地面、出口、拾取）
├── entities/
│   ├── Player.ts                 #   玩家位置 / 朝向 / 半径
│   ├── Pickup.ts                 #   拾取物品的视觉与碰撞表示
│   └── Enemy.ts                  #   巡逻敌人（patrol / dwell / chase 状态机 + FOV）
├── game/
│   ├── GameState.ts              #   状态机：menu / playing / paused / game-over / win
│   └── Rules.ts                  #   纯函数规则：跨过出口、捡起物品、使用物品、伤害 / 存活 / 渐进 spawn
├── maze/
│   ├── types.ts                  #   CellType / PickupType / VictoryType / Seed / MazeData / ExportEnvelope
│   ├── JsonMazeProvider.ts       #   从 public/levels/*.json 加载
│   ├── AlgorithmMazeProvider.ts  #   程序生成
│   ├── EditorMazeProvider.ts     #   编辑器导出的关卡（经 localStorage）
│   ├── builtInLevels.ts          #   静态 import public/levels JSON
│   ├── generators/               #   4 个纯函数生成器 + 公共辅助
│   │   ├── recursiveBacktracker.ts
│   │   ├── kruskal.ts
│   │   ├── prim.ts
│   │   ├── huntAndKill.ts
│   │   ├── _isReachable.ts       #   DFS 验证 start ↔ exit 连通
│   │   └── _expandThickWall.ts   #   物理墙厚扩展
│   ├── enemySpawner.ts           #   程序生成时注入敌人
│   ├── importExport.ts           #   ExportEnvelope (SCHEMA_VERSION = 1) + CUSTOM_LEVEL_PREFIX
│   └── reachability.ts           #   DFS 验证 start↔exit 连通
├── store/
│   ├── gameStore.ts              #   运行时状态（屏幕、计时、生命、库存等）
│   ├── levelStore.ts             #   最佳成绩 + 自定义关卡 + 文件夹管理（持久化）
│   ├── settingsStore.ts          #   用户偏好（暗色模式 / 语言 / 敌人追击速度，持久化）
│   ├── editorStore.ts            #   编辑器状态
│   ├── editorHistory.ts          #   编辑器撤销 / 重做
│   ├── tutorialStore.ts          #   教程状态
│   ├── persist.ts                #   localStorage 读写 + 校验
│   └── migrations.ts             #   数据迁移
├── ui/
│   ├── App.tsx                   #   BrowserRouter + Routes 装配
│   ├── MainMenu.tsx              #   主菜单（含 3D 背景场景）
│   ├── LevelSelect.tsx           #   关卡选择（手写 / 程序 / 编辑器三类入口）
│   ├── Settings.tsx              #   偏好设置
│   ├── GameCanvas.tsx            #   桥接 React ↔ 引擎（创建 Game，装配 GameBridge）
│   ├── HUD.tsx                   #   状态条（健康 / 时间 / 库存 / 敌人计数 / 受伤屏闪 / 小地图）
│   ├── PauseOverlay.tsx          #   暂停遮罩
│   ├── GameOverOverlay.tsx       #   失败遮罩
│   ├── WinOverlay.tsx            #   通关遮罩
│   ├── useConfirm.ts             #   自定义 Dialog hook
│   ├── components/               #   可复用 UI 组件
│   │   ├── Button.tsx
│   │   ├── Dialog.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Minimap.tsx
│   │   ├── HealthBar.tsx
│   │   ├── InventoryBar.tsx
│   │   ├── Timer.tsx
│   │   ├── Crosshair.tsx
│   │   ├── EnemyCounter.tsx
│   │   ├── TutorialBanner.tsx
│   │   ├── ControlHints.tsx
│   │   └── InvulnerableFlash.tsx
│   └── editor/                   #   浏览器内关卡编辑器
│       ├── EditorPage.tsx        #     编辑器页面装配
│       ├── EditorTopBar.tsx      #     工具栏
│       ├── EditorToolbar.tsx     #     工具栏（墙体 / 地面 / 门 / 旗 / 起点 / 拾取 / 敌人 / 平移 / 橡皮）
│       ├── EditorLeftPanel.tsx   #     左侧面板（关卡列表 + 文件夹）
│       ├── EditorPropertiesPanel.tsx  # 右侧属性面板
│       ├── EditorStatusBar.tsx   #     状态栏（保存 / 导入 / 撤销 / 脏数据）
│       ├── EditorViewport.tsx    #     中部视口
│       ├── EditorHelpDrawer.tsx  #     帮助抽屉（快捷键速查）
│       ├── EditorTutorialManual.tsx #  教程手册（6 章分节阅读）
│       └── editorValidation.ts   #     关卡校验
├── i18n/                         #   自研轻量 i18n（零依赖）
│   ├── types.ts                  #     类型定义
│   ├── index.ts                  #     getT / useT / 资源加载
│   └── resources/
│       ├── zh.ts                 #     中文资源
│       └── en.ts                 #     英文资源
├── utils/
│   ├── seed.ts                   #   FNV-1a 哈希 + mulberry32 PRNG + 种子编解码
│   ├── gameUrl.ts                #   /game URL ⇄ 关卡身份 + 选项 解析 / 构造
│   ├── getDisplayName.ts         #   关卡显示名（支持 i18n）
│   ├── id.ts                     #   ID 生成
│   ├── errors.ts                 #   错误处理
│   └── time.ts                   #   时间工具
├── hooks/                        #   自定义 React hooks
│   └── useAutoSave.ts            #   编辑器自动保存
└── styles/                       #   全局样式（含主题令牌）
    ├── reset.css
    └── theme.css                 #   [data-theme="dark"] 主题变量
```

### 9.1 关键设计原则

- **引擎 / UI 隔离**：`src/engine/` 不允许 `import` 任何 React 模块；UI 通过 `useGameStore` 订阅运行时状态。
- **生成器纯函数**：`src/maze/generators/*` 接受 `(size, prng)`，输出 `walls: CellType[][]`，不依赖 React / Zustand，便于单测。
- **种子自描述**：`algo-v1-{algorithm}-{size}-{hex}` 把算法、版本、尺寸、16 位熵打包到一个字符串里，可以原样回放到 `AlgorithmMazeProvider.load()` 复现完全相同的迷宫。
- **URL 是规范**：`/game` 的查询串是关卡身份的唯一来源；`gameUrl.ts` 在边界处显式校验 `isMazeSize` / `isVictoryType` / `normalizeSurviveSeconds`，校验失败回退到默认。
- **校验在边界**：所有从 `localStorage` 或 URL 读出的数据都会经过 `isBestRecord` / `isValidSeed` 等显式校验函数，校验失败时丢弃而不是静默吞错。
- **编辑器输出与手写关卡同构**：编辑器导出同样使用 `MazeData` schema，外层包 `ExportEnvelope { schemaVersion: 1, level: MazeData }`。

---

## 10. 国际化（i18n）

自研零依赖的轻量 i18n 方案（`src/i18n/`）：

- `getT(locale)` — 纯函数翻译器，返回指定语言的翻译函数
- `useT()` — 绑定到 `settingsStore.language` 的 React hook，语言切换会重渲染所有消费者
- 占位符使用 `{name}` 语法
- 缺失 key → `console.warn` + 原样返回 key 字符串
- 未知 locale → warn + 回退到 `DEFAULT_LOCALE`（`zh`）

新增翻译写在 `src/i18n/resources/{zh,en}.ts`。关卡可带可选的 `i18n.en` 显示名；
面向用户显示时用 `getDisplayName(maze, locale)`，缺失时回退到 `maze.name`。

---

## 11. 路线图

Phase 2 增量按序推进，已完成：

| 阶段 | 标题 | 状态 |
|---|---|---|
| P2-2 | 暗色模式 + 拾取物品系统 | ✅ 已完成（14/14） |
| P2-3 | 程序生成关卡 + 竞速模式 | ✅ 已完成（14/14） |
| P2-4a | 敌人 + 生存模式（survive） | ✅ 已完成（16/16） |
| P2-4b | 浏览器内关卡编辑器 | ✅ 已完成（20/20） |
| P2-5 | UI 改版 + 存活模式重平衡 | ✅ 已完成（16/16） |
| P2-6 | LevelSelect 级联重构 | ✅ 已完成（10/10） |
| P2-7 | 自定义 Dialog 系统 | ✅ 已完成（8/8） |
| P2-8 | 第二语言支持（English） | ✅ 已完成（37 files / 889 tests） |
| P2-9 | 编辑器 UX 修复 + 使用手册 | ✅ 已完成 |
| P2-10 | 代码评审 11 项修复 | ✅ 已完成（11/11） |
| P2-11 | 教学关卡重设计 | ✅ 已完成（16/16） |
| P2-13 | 编辑器文件夹系统 + 左侧栏重构 | ✅ 已完成 |
| P2-14 | 代码评审 batch 1 修复 | ✅ 已完成（12/33） |
| P2-15 | 代码评审 batch 2 修复 | ✅ 已完成（24/24） |
| P2-16 | 羊皮纸地图（三态 `minimapMode` + M 键全屏 modal + 走过才显现 + 50% 概率生成水渍/火烧/撕裂损伤） | ✅ 已完成 |

候选池（待用户决策）：音频管线、移动端 / 触摸支持、额外 pickup 子类型。

详细路线图：`docs/roadmap.md`。
每个增量有两阶段产物（设计 / 计划），位于 `docs/increments/p2-N-<slug>/`。

完整设计文档：

- `docs/mvp/design.md` — Phase 1 主设计
- `docs/mvp/plan.md` — Phase 1 完整实施计划
- `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- `docs/superpowers/plans/2026-06-05-maze3d-first-person-game.md`

---

## 12. 测试

项目保持 70%+ 测试覆盖率（阈值：行 70% / 函数 65% / 分支 65% / 语句 70%）。

```bash
npm test                # 单元 + 组件（Vitest）
npm run test:e2e        # 端到端（Playwright，自动启动 dev server）
```

覆盖率阈值（`vitest.config.ts` 设置，作用域为 `src/**`）：行 70% / 函数 65% / 分支 65% / 语句 70%。
v8 provider 仅度量 `src/**` — E2E 由 Playwright 运行，刻意排除在 vitest 覆盖率作用域外。
另有少量文件被额外排除在阈值外（`main.tsx`、`App.tsx`、`engine/{Camera,Renderer,Loop}.ts`、`game/GameState.ts`、`vite-env.d.ts`、`playwright.config.ts`）。

测试目录结构：

```
tests/
├── setup.ts              # localStorage polyfill + happy-dom 配置
├── unit/                 # 单元测试
│   ├── rules.test.ts     #   规则函数
│   ├── maze/             #   迷宫生成器
│   ├── store/            #   Zustand store
│   ├── utils/            #   工具函数
│   ├── i18n/             #   国际化
│   ├── engine/           #   引擎模块
│   ├── entities/         #   实体
│   └── hooks/            #   自定义 hooks
├── component/            # 组件测试（Testing Library + happy-dom）
│   ├── editor/           #   编辑器子组件
│   ├── overlays.test.tsx #   遮罩组件
│   ├── hud.test.tsx      #   HUD 组件
│   └── ...               #   其他 UI 组件
└── e2e/                  # Playwright 端到端（仅 chromium、1 worker、retries=0）
    ├── play-through.spec.ts
    ├── editor.spec.ts
    ├── enemies.spec.ts
    ├── survive.spec.ts
    └── ...               #   15 个 e2e spec 文件
```

---

## 13. 部署

通过 GitHub Actions 自动部署到 **GitHub Pages**（https://shaoyahu.github.io/maze3D/）。

工作流定义在 `.github/workflows/deploy.yml`，触发条件：

- push 到 `main` 分支（自动部署）
- 手动触发（`Actions` 标签页 → `Deploy to GitHub Pages` → `Run workflow`）

### 一次性配置

在 GitHub 仓库页面 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（不是 "Deploy from a branch"）。这是新版 `actions/deploy-pages@v4` 部署方式的前置条件 — 工作流会构建 + 上传 artifact，GitHub Pages 直接发布该 artifact，不再需要 `gh-pages` 分支。

### 关键细节

- **Vite `base`**：`vite.config.ts` 设 `base: './'`（相对路径）。dev 直接访问 `http://localhost:5173/` 即可；prod 部署到 `https://shaoyahu.github.io/maze3D/` 时，相对路径会从当前 URL 自动解析到该子路径下的资源。
- **SPA 404 兜底**：工作流在 `npm run build` 之后追加一步 `cp dist/index.html dist/404.html`。项目用 `BrowserRouter` 且 URL 是关卡身份规范来源（`/game?seed=…`）；用户分享 / 刷新 / 后退到任意深路径时，GitHub Pages 没有对应 HTML，会回退到 404.html — 把它做成 index.html 的副本，SPA 启动后由 React Router 接管。
- **权限**：工作流显式声明 `permissions: contents: read / pages: write / id-token: write`，符合 least-privilege 原则。
- **Node 版本**：固定 `node-version: 20`，与项目 `package.json` 兼容（Node 18+ 即可，但 CI 锁 20 以求稳定）。
- **依赖安装**：用 `npm ci` 而非 `npm install`，配合 `package-lock.json` 在 CI 中更可靠。

### 故障排查

- **部署后页面 404 / 资源 404** → 确认 GitHub Pages Source 是 "GitHub Actions"；清空浏览器缓存再访问（`shaoyahu.github.io/maze3D/`，不要漏掉尾斜杠）。
- **`/game?seed=…` 链接打开后看到 404 页而非游戏** → 检查 `Actions` 日志确认 `Add SPA fallback (404.html)` 这一步执行成功。
- **工作流没有自动跑** → Settings → Actions → General → Workflow permissions 选 "Read and write permissions"。

---

## 14. 贡献

- 一次只做一个增量（见 `docs/roadmap.md`）
- 任务完成后立即勾选 + 更新路线图「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## 15. 许可证

MIT License — 详见 [LICENSE](./LICENSE)。
