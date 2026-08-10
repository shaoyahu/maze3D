# 3D 迷宫（maze3D）

浏览器中运行的第一人称 **3D 体素迷宫 + 多层 2D 迷宫** 游戏。

- **2D 模式**：经典顶视迷宫 + 多层 1 层迷宫堆叠，梯子 / 洞 / 阶梯在不同层之间穿梭
- **3D 模式**：体素立方体迷宫（5³ ~ 15³），自由六方向移动（上下 + 前后左右），WASD + Space/C 控制
- **15 种 2D 算法** + **2 种 3D 算法**（Recursive Backtracker / Prim）程序生成
- **浏览器内关卡编辑器**，支持手写 / 程序 / 编辑器三类关卡
- **reach-exit / time-trial / survive** 三种胜利模式 + 巡逻敌人
- **URL 是关卡状态的唯一真源** —— 刷新 / 分享 / 后退都回放同一关卡配置

引擎层是纯 TypeScript 写的 Three.js 模块；UI 是 React 18 + Zustand，两层完全解耦（`src/engine/` 不引任何 React）。
测试套件：Vitest + Testing Library + happy-dom（单元 / 组件）+ Playwright（端到端）。

在线 demo：https://shaoyahu.github.io/maze3D/

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
| 端到端测试 | Playwright（chromium） |
| 国际化 | 自研轻量 i18n（`src/i18n/`，零依赖） |

环境要求：**Node 18+**（CI 锁 Node 20）。

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
npm test             # 单元 + 组件测试（Vitest）
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

应用入口是 `BrowserRouter`（`src/ui/App.tsx`）：

| 路径 | 页面 |
|---|---|
| `/` | 主菜单（带 3D 背景场景） |
| `/levels` | 关卡选择（手写 / 程序 / 编辑器） |
| `/settings` | 偏好设置 |
| `/editor` | 浏览器内关卡编辑器 |
| `/game` | 进入游戏，查询串携带关卡身份 |
| `*` | 重定向到 `/` |

`/game` 的查询串由 `src/utils/gameUrl.ts` 编解码，是关卡身份的规范来源：

| 查询键 | 取值 | 含义 |
|---|---|---|
| `seed` | `algo-v1-…` / `algo-v2-…` / `algo-v3-…` | 程序生成关卡；种子自描述（算法 + 版本 + 尺寸 + 层数 + 16 位 hex） |
| `id` | `teaching-001` / `custom-…` / `builtin-…` | 手写关卡或编辑器导出 |
| `mode` | `reach-exit` / `time-trial` / `survive` | 胜利模式 |
| `survive` | `30` / `60` / `90` / `120` | survive 模式倒计时秒数 |
| `enemies` | `0`–`N` | 巡逻敌人数量 |
| `progressive` | `0` / `1` | 渐进式敌人刷新开关 |
| `progressiveMax` | `1`–`20` | 渐进式敌人上限 |

**Seed 格式版本**（按调用方 dispatch 到不同 codec）：
- `algo-v1-<algorithm>-<size>-<hex16>` —— 单层 2D 关卡（P2-3 引入，jamisbuck 15 算法都走 v1）
- `algo-v2-<algorithm>-<size>-<levels>-<hex16>` —— **多层 2D 关卡**（P3-1 引入；中间多一层数槽）
- `algo-v3-<3d-algorithm>-<cubeSize>-<hex16>` —— **3D 体素关卡**（P4 引入；算法名带 `3d-` 前缀）

> 刷新 / 分享 URL / 浏览器后退都回到同一配置；F9 重试也通过 URL 重新触发同一配置。

---

## 4. 游戏控制

### 4.1 2D 模式（多层 1 层迷宫堆叠）

| 键位 | 作用 |
|---|---|
| **W / A / S / D** 或 **方向键** | 移动 |
| **Space** | 站在梯子上时爬升一层（ladder up） |
| **C** | 站在梯子上时下降一层（ladder down） |
| **M** | 打开 / 关闭羊皮纸地图 |
| **P** | 暂停 / 继续 |
| **1** / **2** | 使用库存槽 1 / 2 的物品 |
| **F9** | 重玩当前关卡（保留 URL 配置） |
| **ESC** | 释放鼠标指针 |

### 4.2 3D 模式（体素立方体）

| 键位 | 作用 |
|---|---|
| **W / A / S / D** | 水平四向移动（x / z 轴） |
| **Space** | 向上 +1 格（y 轴） |
| **C** | 向下 -1 格（y 轴） |
| **鼠标** | 视角（点击画布锁定指针） |
| **P** / **F9** / **ESC** | 同 2D |

### 4.3 通用

| 键位 | 作用 |
|---|---|
| **M** | 羊皮纸地图（2D 模式） |
| **1** / **2** | 库存物品（2D 模式） |

---

## 5. 关卡体系

### 5.1 2D 模式：多层 1 层迷宫堆叠

P3-1 起：单个 2D 关卡可由 N 个 1 层迷宫（`levelCount` 1..6）堆叠而成，层间通过显式 transition tile 连接：

| transition kind | 触发方式 | 动画 | 用途 |
|---|---|---|---|
| `stair-up` | walk-onto | 0.5s 上升 | 顺向上楼 |
| `stair-down` | walk-onto | 0.5s 下降 | 顺向下楼 |
| `hole-down` | walk-onto | 0.5s 红色警告 + 0.4s 自由落体 | 掉洞 |
| `hole-up` | walk-onto | 0.4s 跳起 | 跳板上去 |
| `ladder` | 站定 + Space / C | 0.5s 爬升 / 下降 | 显式控制方向 |

每个 transition 在 `MazeData.transitions: VerticalTransition[]` 中编码 `{id, level, x, z, kind, toLevel, toX?, toZ?}`。生成器默认给每对相邻层放 1 个 `stair-up`；编辑器可放任意 kind。

### 5.2 3D 模式：体素立方体迷宫

P4a 起：3D 关卡是一个 `walls3D: CellType[][][]` 的体素立方体：

- 尺寸：`visualSize` ∈ {5, 7, 9, 11, 13, 15}（P4b-CellSize 从 {5,7,9} 扩到 6 档）
- 算法：3D Recursive Backtracker（P4a）+ 3D Prim（P4b-Prim）
- 移动模型：六方向 cell-based（WASD + Space/C），每个 cell 1.5×1.5×1.5 m，**没有上下墙的概念**（每个 cell 都能上下走，区别于 2D ladder 那种"只在特定 tile 才能上下"）
- 玩家 P4b-Lerp 平滑 tween：0.1s 线性 cell-to-cell，6 帧 60fps sweet spot
- 3D 墙渲染 P4b-Instanced：从 N 个 mesh 改成 1 个 `THREE.InstancedMesh`（1687 → 1 draw call for visualSize=15）

### 5.3 程序生成关卡

**2D 算法（15 种，与 jamisbuck.org/mazes 1:1 对齐）**：

| 批次 | 算法 |
|---|---|
| P2-3 | recursive-backtracker / kruskal / prim / hunt-and-kill |
| P2-19 | eller / sidewinder / binary-tree / growing-tree |
| P2-20 | parallel-backtracker / recursive-division / aldous-broder / wilsons |
| P2-21 | houston（AB + Wilson's 混合）/ growing-binary-tree / blobby-recursive-division |

提供 3 档尺寸（15×15 / 30×30 / 50×50）+ 16 位 hex 种子。LevelSelect 算法下拉 15 项全收录。

**3D 算法（2 种）**：
- `3d-recursive-backtracker`（P4a MVP）
- `3d-prim`（P4b-Prim，跟 2D Prim 同款 Multiplicative 跨界踩过的坑已绕开：logically-indexed `maxIdx = visualSize*visualSize`）

3D 提供 6 档尺寸（5³ / 7³ / 9³ / 11³ / 13³ / 15³，P4b-CellSize）。

### 5.4 手写关卡

`public/levels/*.json`：

| 文件 | 用途 |
|---|---|
| `level-small.json` | 教学手写关卡 |
| `level-tiny.json` | 最小尺寸关卡，供 E2E 调试 |
| `level-tiny-pickups.json` | 最小尺寸 + 包含拾取物品 |
| `level-tiny-enemy.json` | 最小尺寸 + 单敌人（id `test-enemy`），供玩家-敌人 E2E 用 |

新增手写关卡：把 `level-X.json` 放进此目录，关卡列表会自动收录。

### 5.5 编辑器关卡

`/editor` 提供浏览器内关卡编辑器：

- 工具栏：墙体 / 地面 / 门 / 旗 / 起点 / 拾取 / 敌人 / 平移 / 橡皮
- 左侧面板：关卡列表 + 文件夹管理 + 元信息编辑
- 中部视口：实时迷宫预览，鼠标拖拽放置 / 拖动平移
- 右侧属性面板：当前选中对象的属性（敌人路径节点等）
- 状态栏：保存 / 导出 JSON / 导入 JSON / 撤销 / 重做 / 脏数据提示
- 帮助抽屉：快捷键速查表
- 教程手册：6 章分节阅读模式，引导用户学习编辑器各项功能（TopBar 📖 按钮打开）

`EnemySpawn` 描述敌人出生坐标 + 路径节点（`path: {x,z}[]`，≥ 2 节点），编辑器输出 JSON 与手写关卡共用同一 `MazeData` schema。

---

## 6. 拾取物品与库存

2D 模式可放置三种拾取物品：

| 类型 | 效果 |
|---|---|
| `time` | 恢复倒计时（按 `rules.timeOnPickup` 累加秒数） |
| `health` | 恢复生命值（不超过 `rules.maxHealth`） |
| `key` | 进入库存（2 个槽位；库存满时拾取失败，物品保留在原位） |

库存槽位通过数字键 `1` / `2` 触发使用。

3D 模式暂无拾取系统（`walls3D` 路径下 `pickups` 数组为空）。

---

## 7. 胜利模式

`MazeData.rules.victory` 与 `StartLevelOptions.mode` 共同决定胜利条件：

| 模式 | 含义 | 计时 |
|---|---|---|
| `reach-exit` | 抵达出口格子即胜利 | 沿用关卡自身的 `initialTime` |
| `time-trial` | 180 秒内抵达出口，否则 game-over | 强制 180 秒预算 |
| `survive` | 30 / 60 / 90 / 120 秒存活，倒计时跑完即胜利 | LevelSelect 可选 30/60/90/120 |

`enemies=0` / `progressive=1` 叠加在以上模式上：巡逻敌人按数量 / 渐进调度刷新（`progressiveMax=1..20` 是同时在场敌人数上限）。

最佳成绩按 `levelId` 保存到 `localStorage`（`maze3d.levels.v1`），程序生成关卡的成绩附自描述 `Seed`，可随时通过 URL 重新打开同一迷宫。

---

## 8. 设置

`/settings` 提供：

- **暗色 / 亮色主题**（持久化到 `settingsStore`）
- **语言** `language`：在「中文 / English」之间切换；切换后整个游戏所有 UI 立即重新渲染（关卡名、菜单、HUD、暂停 / 通关 / 失败遮罩、设置面板、编辑器等）
- **敌人追击强度** `enemyAggression`：影响敌人 `chase` 状态的反应速度
- **鼠标灵敏度 / FOV**

所有偏好持久化到 `localStorage` 并经过 `sanitizeSettings` 显式校验，校验失败丢弃而非吞错。

---

## 9. HUD / Minimap / 状态显示

### 9.1 HUD（2D 模式）

- **状态条**：健康 / 时间 / 库存 / 敌人计数 / 当前层（多层关卡时显示 `L1` / `L2` / …）
- **受伤屏闪**：P3-3 0.5s 红色 vignette overlay（与受击瞬间同步；用 `Date.now()/1000` 防止 backgrounded tab rAF 冻结）
- **掉落警告**：P3-2 0.5s 红色 ring + 0.4s 自由落体（hole-down 专属；其他 transition 跳过警告）
- **小地图**：2D top-down minimap（P3-1b 引入，2D 多层时按当前层渲染）+ 全景模式 3 strip 堆叠（多层时同时看 y+1 / current / y-1 邻层）
- **羊皮纸地图**：M 键全屏 modal（2D 模式，p2-16 三态：top-right 自动 / parchment 走过才显现 / hidden）
- **敌人数**：survive 模式 HUD 实时显示
- **教程 banner**：教学关卡 6 步引导

### 9.2 HUD（3D 模式）

- **3D 状态条**：健康 / 时间 / 库存 / 当前 y-layer chip（`L1` ~ `L15`）
- **3D 小地图**：3D top-down minimap（顶层 + 玩家位置 + 出口标记）
- **过场动画**：0.1s cell-to-cell tween，3D 6 邻居

### 9.3 过场 / 状态机

| 屏幕 | 来源 |
|---|---|
| `menu` | 主菜单 |
| `playing` | 进入游戏 |
| `paused` | 按 P / 切窗口失焦 |
| `game-over` | 时间到 / 生命归零 / 被敌人抓 |
| `win` | 胜利条件触发 |

---

## 10. 项目架构

```
src/
├── engine/                       # 纯 TypeScript 写的 Three.js 引擎，不引用 React
│   ├── Camera.ts                 #   相机与视角封装
│   ├── Collision.ts              #   玩家与墙体的碰撞检测
│   ├── Game.ts                   #   主循环、Tick 调度、scene refs、2D/3D 分发
│   ├── InputManager.ts           #   键盘 / 鼠标输入 (2D move + 3D 6-neighbor + ladder 键位)
│   ├── Loop.ts                   #   requestAnimationFrame 循环
│   ├── Renderer.ts               #   Three.js 渲染器
│   └── Scene.ts                  #   场景搭建 (2D walls/3D InstancedMesh/transition mesh)
├── entities/
│   ├── Player.ts                 #   玩家位置 / 朝向 / 半径 (2D + 3D 双模式)
│   ├── Pickup.ts                 #   拾取物品的视觉与碰撞表示
│   └── Enemy.ts                  #   巡逻敌人 (patrol / dwell / chase 状态机 + FOV)
├── game/
│   ├── GameState.ts              #   状态机：menu / playing / paused / game-over / win
│   └── Rules.ts                  #   纯函数规则 (含渐进 spawn `shouldProgressSpawn`)
├── maze/
│   ├── types.ts                  #   CellType / PickupType / Seed / MazeData / SpawnSchedule
│   ├── JsonMazeProvider.ts       #   从 public/levels/*.json 加载
│   ├── AlgorithmMazeProvider.ts  #   程序生成 (15 个 2D + 2 个 3D 算法 + 多层 + 3D 分发)
│   ├── EditorMazeProvider.ts     #   编辑器导出的关卡 (经 localStorage)
│   ├── builtInLevels.ts          #   静态 import public/levels JSON
│   ├── generators/               #   纯函数生成器
│   │   ├── recursiveBacktracker.ts
│   │   ├── kruskal.ts
│   │   ├── prim.ts
│   │   ├── huntAndKill.ts
│   │   ├── eller.ts              #   P2-19
│   │   ├── sidewinder.ts
│   │   ├── binaryTree.ts
│   │   ├── growingTree.ts
│   │   ├── parallelBacktracker.ts  #   P2-20
│   │   ├── recursiveDivision.ts
│   │   ├── aldousBroder.ts
│   │   ├── wilsons.ts
│   │   ├── houston.ts            #   P2-21
│   │   ├── growingBinaryTree.ts
│   │   ├── blobbyRecursiveDivision.ts
│   │   ├── recursiveBacktracker3D.ts  #   P4a (3D 递归回溯)
│   │   ├── prim3D.ts             #   P4b-Prim
│   │   ├── _isReachable.ts       #   DFS 验证 start ↔ exit 连通
│   │   └── _expandThickWall.ts   #   物理墙厚扩展
│   ├── enemySpawner.ts           #   程序生成时注入敌人 (含 schedule.max 上限)
│   ├── importExport.ts           #   ExportEnvelope (SCHEMA_VERSION = 1) + CUSTOM_LEVEL_PREFIX
│   ├── reachability.ts           #   DFS 验证 start↔exit 连通
│   └── ParchmentState.ts         #   2D 羊皮纸地图的 visited cells / damage regions
├── store/
│   ├── gameStore.ts              #   运行时状态 (屏幕、计时、生命、库存、spawnSchedule)
│   ├── levelStore.ts             #   最佳成绩 + 自定义关卡 + 文件夹管理 (持久化)
│   ├── settingsStore.ts          #   用户偏好 (持久化)
│   ├── editorStore.ts            #   编辑器状态
│   ├── editorHistory.ts          #   编辑器撤销 / 重做
│   ├── tutorialStore.ts          #   教程状态
│   ├── persist.ts                #   localStorage 读写 + 校验
│   └── migrations.ts             #   数据迁移
├── ui/
│   ├── App.tsx                   #   BrowserRouter + Routes 装配
│   ├── MainMenu.tsx              #   主菜单 (含 3D 背景场景)
│   ├── LevelSelect.tsx           #   关卡选择 (手写 / 程序 / 编辑器 + 15 算法 + 6 尺寸)
│   ├── Settings.tsx              #   偏好设置
│   ├── GameCanvas.tsx            #   桥接 React ↔ 引擎
│   ├── HUD.tsx                   #   状态条 + LevelIndicator (2D/3D dispatch)
│   ├── PauseOverlay.tsx          #   暂停遮罩
│   ├── GameOverOverlay.tsx       #   失败遮罩
│   ├── WinOverlay.tsx            #   通关遮罩
│   ├── useConfirm.ts             #   自定义 Dialog hook
│   ├── components/               #   可复用 UI 组件
│   │   ├── Button.tsx
│   │   ├── Dialog.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Minimap.tsx           #   2D top-down + 3D panorama (3 strip 堆叠)
│   │   ├── HealthBar.tsx
│   │   ├── InventoryBar.tsx
│   │   ├── Timer.tsx
│   │   ├── Crosshair.tsx
│   │   ├── EnemyCounter.tsx
│   │   ├── TutorialBanner.tsx
│   │   ├── ControlHints.tsx
│   │   ├── InvulnerableFlash.tsx
│   │   ├── WarningFlashOverlay.tsx #   P3-3 受伤屏闪
│   │   └── ParchmentMap.tsx
│   └── editor/                   #   浏览器内关卡编辑器
│       ├── EditorPage.tsx
│       ├── EditorTopBar.tsx
│       ├── EditorToolbar.tsx
│       ├── EditorLeftPanel.tsx
│       ├── EditorPropertiesPanel.tsx
│       ├── EditorStatusBar.tsx
│       ├── EditorViewport.tsx
│       ├── EditorHelpDrawer.tsx
│       ├── EditorTutorialManual.tsx
│       └── editorValidation.ts
├── i18n/                         #   自研轻量 i18n (零依赖)
│   ├── types.ts
│   ├── index.ts
│   └── resources/
│       ├── zh.ts
│       └── en.ts
├── utils/
│   ├── seed.ts                   #   FNV-1a 哈希 + mulberry32 PRNG + 3 codec (v1/v2/v3)
│   ├── gameUrl.ts                #   /game URL ⇄ 关卡身份 + 选项 解析 / 构造
│   ├── getDisplayName.ts         #   关卡显示名 (支持 i18n)
│   ├── id.ts                     #   ID 生成
│   ├── errors.ts                 #   错误处理
│   └── time.ts                   #   时间工具
├── hooks/                        #   自定义 React hooks
│   └── useAutoSave.ts            #   编辑器自动保存
└── styles/                       #   全局样式 (含主题令牌)
    ├── reset.css
    └── theme.css                 #   [data-theme="dark"] 主题变量
```

### 10.1 关键设计原则

- **引擎 / UI 隔离**：`src/engine/` 不允许 `import` 任何 React 模块；UI 通过 `useGameStore` 订阅运行时状态。
- **生成器纯函数**：`src/maze/generators/*` 接受 `(size, prng)`，输出 `walls: CellType[][]`，不依赖 React / Zustand，便于单测。
- **种子自描述**：`algo-v{N}-{algorithm}-{size}[-{levels}]-{hex}` 把算法、版本、尺寸、层数、16 位熵打包到一个字符串里，可以原样回放到 `AlgorithmMazeProvider.load()` 复现完全相同的迷宫。
- **2D / 3D 互斥 dispatch**：3D 路径通过 `maze.walls3D !== undefined` 检测；2D 路径用 `walls + transitions`；同一个 `Game` 实例不会同时跑两套渲染。
- **URL 是规范**：`/game` 的查询串是关卡身份的唯一来源；`gameUrl.ts` 在边界处显式校验 `isMazeSize` / `isVictoryType` / `normalizeSurviveSeconds`，校验失败回退到默认。
- **校验在边界**：所有从 `localStorage` 或 URL 读出的数据都会经过 `isBestRecord` / `isValidSeed` 等显式校验函数，校验失败时丢弃而不是静默吞错。
- **编辑器输出与手写关卡同构**：编辑器导出同样使用 `MazeData` schema，外层包 `ExportEnvelope { schemaVersion: 1, level: MazeData }`。

---

## 11. 国际化（i18n）

自研零依赖的轻量 i18n 方案（`src/i18n/`）：

- `getT(locale)` — 纯函数翻译器，返回指定语言的翻译函数
- `useT()` — 绑定到 `settingsStore.language` 的 React hook，语言切换会重渲染所有消费者
- 占位符使用 `{name}` 语法
- 缺失 key → `console.warn` + 原样返回 key 字符串
- 未知 locale → warn + 回退到 `DEFAULT_LOCALE`（`zh`）

新增翻译写在 `src/i18n/resources/{zh,en}.ts`。关卡可带可选的 `i18n.en` 显示名；
面向用户显示时用 `getDisplayName(maze, locale)`，缺失时回退到 `maze.name`。

---

## 12. 路线图

### Phase 1 — MVP ✅

10 个任务全部完成：项目脚手架 → 类型与第一个关卡 JSON → 引擎（Renderer / Camera / Scene / Loop）→ 输入与玩家 → 拾取与规则 → HUD → 主菜单 / 关卡选择 / 暂停 / 通关 / 失败 → 持久化 → 测试 → README。

### Phase 2 — 15 算法 + UI 改版 + 编辑器 + 教学 ✅

| 阶段 | 标题 | 状态 |
|---|---|---|
| P2-2 | 暗色模式 + 拾取物品系统 | ✅ |
| P2-3 | 程序生成关卡 + 竞速模式（4 算法） | ✅ |
| P2-4a | 敌人 + 生存模式（survive） | ✅ |
| P2-4b | 浏览器内关卡编辑器 | ✅ |
| P2-5 | UI 改版 + 存活模式重平衡 | ✅ |
| P2-6 | LevelSelect 级联重构 | ✅ |
| P2-7 | 自定义 Dialog 系统 | ✅ |
| P2-8 | 第二语言支持（English） | ✅ |
| P2-9 | 编辑器 UX 修复 + 使用手册 | ✅ |
| P2-10 | 代码评审 11 项修复 | ✅ |
| P2-11 | 教学关卡重设计 | ✅ |
| P2-13 | 编辑器文件夹系统 + 左侧栏重构 | ✅ |
| P2-14 | 代码评审 batch 1 修复 | ✅ |
| P2-15 | 代码评审 batch 2 修复 | ✅ |
| P2-16 | 羊皮纸地图（三态 minimapMode + M 键 modal） | ✅ |
| P2-17 | 编辑器教程手册（6 章分节阅读） | ✅ |
| P2-18 | 陷阱 + 门机关 | ✅ |
| P2-19 | +4 算法（Eller / Sidewinder / Binary Tree / Growing Tree） | ✅ |
| P2-20 | +4 算法（Parallel Backtracker / Recursive Division / Aldous-Broder / Wilson's） | ✅ |
| P2-21 | +3 算法（Houston / Growing Binary Tree / Blobby RD）—— 15 算法收尾 | ✅ |

### Phase 3 — 多层 2D 迷宫 ✅

| 阶段 | 标题 | 状态 |
|---|---|---|
| P3-1 | 多层 2D 迷宫（1..6 层堆叠 + ladder / hole / stair 互连） | ✅ |
| P3-1 fix | progressiveMax 完整链路（UI→URL→runtime） + 4 audit silent bug 修复 | ✅ |
| P3-1 fix | random tab 暴露 levelCount + algorithm selector | ✅ |
| P3-1d | 多层 transition 引擎 5 kind 全打通 + ladder 显式键位 | ✅ |
| P3-2 | 掉落警告（hole-down 0.5s 红 ring + 0.4s 自由落体） | ✅ |
| P3-3 | HUD 0.5s 红色 vignette overlay | ✅ |

### Phase 4 — 3D 体素迷宫 ✅

| 阶段 | 标题 | 状态 |
|---|---|---|
| P4a | 3D 体素迷宫 MVP（Recursive Backtracker，5/7/9 立方体） | ✅ |
| P4b-Prim | 3D Prim 第二算法 | ✅ |
| P4b-CellSize | 3D 多 cell size（11/13/15 立方体） | ✅ |
| P4b-Lerp | 3D Player 0.1s cell-to-cell tween | ✅ |
| P4b-Minimap | 3D top-down minimap | ✅ |
| P4b-HudLayer | HUD LevelIndicator 2D/3D dispatch | ✅ |
| P4b-Panorama | 3D 全景 minimap（3 y-layer 堆叠） | ✅ |
| P4b-Instanced | 3D 墙 InstancedMesh（1687 → 1 draw call） | ✅ |

### 候选池（待用户决策）

- 3D 敌人 AI（在 3D 体素上 BFS chase + 3D 球体渲染）
- 3D 编辑器（多层 raycasting + 工具面板 + undo/redo + JSON 导入导出）
- 3D 教程（教学 JSON + 高亮渲染）
- HUD chip total "L5/15"（多层时显示「当前层 / 总层数」）
- per-instance color（3D InstancedMesh damage flash）
- 音频管线 / 移动端触摸支持 / 额外 pickup 子类型

详细路线图：`docs/roadmap.md`。
每个增量有两阶段产物（设计 / 计划），位于 `docs/increments/p{N}-{slug}/`。

完整设计文档：

- `docs/mvp/design.md` — Phase 1 主设计
- `docs/mvp/plan.md` — Phase 1 完整实施计划

---

## 13. 测试

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
│   ├── overlays.test.tsx
│   ├── hud.test.tsx
│   └── ...
└── e2e/                  # Playwright 端到端（仅 chromium、1 worker、retries=0）
    ├── play-through.spec.ts
    ├── editor.spec.ts
    ├── enemies.spec.ts
    ├── survive.spec.ts
    └── ...
```

---

## 14. 部署

通过 GitHub Actions 自动部署到 **GitHub Pages**（https://shaoyahu.github.io/maze3D/）。

工作流定义在 `.github/workflows/deploy.yml`，触发条件：

- push 到 `main` 分支（自动部署）
- 手动触发（`Actions` 标签页 → `Deploy to GitHub Pages` → `Run workflow`）

### 一次性配置

在 GitHub 仓库页面 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（不是 "Deploy from a branch"）。这是新版 `actions/deploy-pages@v4` 部署方式的前置条件 —— 工作流会构建 + 上传 artifact，GitHub Pages 直接发布该 artifact，不再需要 `gh-pages` 分支。

### 关键细节

- **Vite `base`**：`vite.config.ts` 设 `base: './'`（相对路径）。dev 直接访问 `http://localhost:5173/` 即可；prod 部署到 `https://shaoyahu.github.io/maze3D/` 时，相对路径会从当前 URL 自动解析到该子路径下的资源。
- **SPA 404 兜底**：工作流在 `npm run build` 之后追加一步 `cp dist/index.html dist/404.html`。项目用 `BrowserRouter` 且 URL 是关卡身份规范来源（`/game?seed=…`）；用户分享 / 刷新 / 后退到任意深路径时，GitHub Pages 没有对应 HTML，会回退到 404.html —— 把它做成 index.html 的副本，SPA 启动后由 React Router 接管。
- **权限**：工作流显式声明 `permissions: contents: read / pages: write / id-token: write`，符合 least-privilege 原则。
- **Node 版本**：固定 `node-version: 20`，与项目 `package.json` 兼容（Node 18+ 即可，但 CI 锁 20 以求稳定）。
- **依赖安装**：用 `npm ci` 而非 `npm install`，配合 `package-lock.json` 在 CI 中更可靠。

### 故障排查

- **部署后页面 404 / 资源 404** → 确认 GitHub Pages Source 是 "GitHub Actions"；清空浏览器缓存再访问（`shaoyahu.github.io/maze3D/`，不要漏掉尾斜杠）。
- **`/game?seed=…` 链接打开后看到 404 页而非游戏** → 检查 `Actions` 日志确认 `Add SPA fallback (404.html)` 这一步执行成功。
- **工作流没有自动跑** → Settings → Actions → General → Workflow permissions 选 "Read and write permissions"。

---

## 15. 贡献

- 一次只做一个增量（见 `docs/roadmap.md`）
- 任务完成后立即勾选 + 更新路线图「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## 16. 许可证

MIT License —— 详见 [LICENSE](./LICENSE)。
