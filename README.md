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

---

## 3. 路由

应用入口是 `BrowserRouter`，路由如下（`src/App.tsx`）：

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | MenuPage | 主菜单 |
| `/levels` | LevelsPage | 关卡选择 |
| `/settings` | SettingsPage | 偏好设置 |
| `/editor` | EditorRoutePage | 浏览器内关卡编辑器 |
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
- 左侧抽屉：关卡元信息（标题、规则、胜利模式）
- 中部视口：实时迷宫预览，鼠标拖拽放置 / 拖动平移
- 右侧属性面板：当前选中对象的属性（敌人路径节点等）
- 状态栏：保存 / 导出 JSON / 导入 JSON / 撤销 / 重做 / 脏数据提示

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
- **HUD 数值精度 / 控件偏好**（视版本而定）

所有偏好持久化到 `localStorage` 并经过 `sanitizeSettings` 显式校验，校验失败丢弃而非吞错。

`maze3d.settings.v1` schema 含 5 个字段：`pointerSensitivity / fov / darkMode / enemyAggression / language`。
新增的 `language: 'zh' | 'en'` 默认 `'zh'`，旧 record 无该字段时 lenient 回退（forward-compat）。

---

## 9. 项目架构

```
src/
├── engine/                       # 纯 TypeScript 写的 Three.js 引擎，不引用 React
│   ├── Camera.ts                 #   相机与视角封装
│   ├── Collision.ts              #   玩家与墙体的碰撞检测
│   ├── Game.ts                   #   主循环、Tick 调度
│   ├── InputManager.ts           #   键盘 / 鼠标输入
│   ├── Loop.ts                   #   requestAnimationFrame 循环
│   ├── Renderer.ts               #   Three.js 渲染器
│   └── Scene.ts                  #   场景搭建（墙、地面、出口、拾取）
├── entities/
│   ├── Player.ts                 #   玩家位置 / 朝向 / 半径（PLAYER_RADIUS）
│   ├── Pickup.ts                 #   拾取物品的视觉与碰撞表示
│   └── Enemy.ts                  #   巡逻敌人（patrol / dwell / chase 状态机 + FOV）
├── game/
│   ├── GameState.ts              #   状态机：menu / playing / paused / game-over / win
│   └── Rules.ts                  #   纯函数规则：跨过出口、捡起物品、使用物品、伤害 / 存活 / 渐进 spawn
├── maze/
│   ├── types.ts                  #   CellType / PickupType / VictoryType / Seed 等
│   ├── JsonMazeProvider.ts       #   从 public/levels/*.json 加载
│   ├── AlgorithmMazeProvider.ts  #   程序生成
│   └── generators/               #   4 个纯函数生成器 + 公共辅助
│       ├── recursiveBacktracker.ts
│       ├── kruskal.ts
│       ├── prim.ts
│       ├── huntAndKill.ts
│       ├── _isReachable.ts       #   DFS 验证 start ↔ exit 连通
│       └── _expandThickWall.ts   #   物理墙厚扩展
├── store/
│   ├── gameStore.ts              #   运行时状态（屏幕、计时、生命、库存等）
│   ├── levelStore.ts             #   最佳成绩（持久化）
│   ├── settingsStore.ts          #   用户偏好（暗色模式 / 敌人追击速度 enemyAggression，持久化）
│   └── persist.ts                #   localStorage 读写 + 校验
├── ui/
│   ├── App.tsx                   #   BrowserRouter + Routes 装配
│   ├── MainMenu.tsx              #   主菜单（含 3D 背景场景）
│   ├── LevelSelect.tsx           #   关卡选择（手写 / 程序 / 编辑器三类入口）
│   ├── Settings.tsx              #   偏好设置
│   ├── GameCanvas.tsx            #   装配 Three.js 画布
│   ├── HUD.tsx                   #   状态条（健康 / 时间 / 库存 / 敌人计数 / 受伤屏闪 / 小地图）
│   ├── overlays/                 #   Pause / GameOver / Win 三个遮罩
│   └── editor/                   #   浏览器内关卡编辑器
│       ├── EditorPage.tsx        #     编辑器页面装配
│       ├── EditorTopBar.tsx      #     工具栏（墙体 / 地面 / 门 / 旗 / 起点 / 拾取 / 敌人 / 平移 / 橡皮）
│       ├── EditorLeftDrawer.tsx  #     左侧抽屉（关卡元信息）
│       ├── EditorStatusBar.tsx   #     状态栏（保存 / 导入 / 撤销 / 脏数据）
│       ├── EditorPropertiesPanel.tsx  # 右侧属性面板
│       ├── EditorViewport.tsx    #     中部视口
│       └── editorValidation.ts   #     关卡校验
├── utils/
│   ├── seed.ts                   #   FNV-1a 哈希 + mulberry32 PRNG + 种子编解码
│   └── gameUrl.ts                #   /game URL ⇄ 关卡身份 + 选项 解析 / 构造
├── hooks/                        #   自定义 React hooks
└── styles/                       #   全局样式（含主题令牌）
```

### 9.1 关键设计原则

- **引擎 / UI 隔离**：`src/engine/` 不允许 `import` 任何 React 模块；UI 通过 `useGameStore` 订阅运行时状态。
- **生成器纯函数**：`src/maze/generators/*` 接受 `(size, prng)`，输出 `walls: CellType[][]`，不依赖 React / Zustand，便于单测。
- **种子自描述**：`algo-v1-{algorithm}-{size}-{hex}` 把算法、版本、尺寸、16 位熵打包到一个字符串里，可以原样回放到 `AlgorithmMazeProvider.load()` 复现完全相同的迷宫。
- **URL 是规范**：`/game` 的查询串是关卡身份的唯一来源；`gameUrl.ts` 在边界处显式校验 `isMazeSize` / `isVictoryType` / `normalizeSurviveSeconds`，校验失败回退到默认。
- **校验在边界**：所有从 `localStorage` 或 URL 读出的数据都会经过 `isBestRecord` / `isValidSeed` 等显式校验函数，校验失败时丢弃而不是静默吞错。

---

## 10. 路线图

Phase 2 增量按序推进，已完成：

| 阶段 | 标题 | 状态 |
|---|---|---|
| P2-1 | MVP（手写关卡 + 第一人称 + 通关） | ✅ 已完成 |
| P2-2 | 暗色模式 + 拾取物品系统 | ✅ 已完成 |
| P2-3 | 程序生成关卡 + 竞速模式 | ✅ 已完成（14/14） |
| P2-4a | 敌人 + 生存模式（survive） | ✅ 已完成（16/16） |
| P2-4b | 浏览器内关卡编辑器 | ✅ 已完成（20/20） |
| P2-5 | UI 改版 + 存活模式重平衡 | ✅ 已完成（16/16） |
| P2-6 | LevelSelect 级联重构 | ✅ 已完成（10/10） |
| P2-7 | 自定义 Dialog 系统 | ✅ 已完成（8/8） |
| P2-8 | 第二语言支持（English） (自研零依赖 i18n：`src/i18n/{types,index}.ts` + `resources/{zh,en}.ts` 270 keys + `getT/locale/useT`；`settingsStore.language` 持久化；Settings 页 `locale-zh/en` 切换控件；4 个内置关卡 JSON 加 `i18n.en` + `getDisplayName` helper；13 个 UI 组件全量迁移) | ✅ 已完成（37 files / 5 commits / 889 tests） |

候选池（待用户决策）：音频管线、移动端 / 触摸支持、额外 pickup 子类型。

详细路线图：`docs/roadmap.md`。
每个增量有两阶段产物（设计 / 计划 / 评审），位于 `docs/increments/p2-N-<slug>/`。

完整设计文档：

- `docs/mvp/design.md` — Phase 1 主设计
- `docs/mvp/plan.md` — Phase 1 完整实施计划
- `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- `docs/superpowers/plans/2026-06-05-maze3d-first-person-game.md`

---

## 11. 测试

项目保持 80%+ 测试覆盖率。

```bash
npm test                # 单元 + 组件（Vitest）
npm run test:e2e        # 端到端（Playwright，自动启动 dev server）
```

测试目录结构：

- `tests/unit/` — 单元测试（utils、maze 生成器、store、Rules、`gameUrl`）
- `tests/component/` — 组件测试（菜单、HUD、关卡选择、编辑器面板 / 状态栏 / 视口）
- `tests/e2e/` — Playwright 端到端（关卡选择、生成、暂停、胜利、失败）

---

## 12. 部署

通过 GitHub Actions 自动部署到 **GitHub Pages**(https://shaoyahu.github.io/maze3D/)。

工作流定义在 `.github/workflows/deploy.yml`,触发条件:

- push 到 `main` 分支(自动部署)
- 手动触发(`Actions` 标签页 → `Deploy to GitHub Pages` → `Run workflow`)

### 一次性配置

在 GitHub 仓库页面 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**(不是 "Deploy from a branch")。这是新版 `actions/deploy-pages@v4` 部署方式的前置条件 —— 工作流会构建 + 上传 artifact,GitHub Pages 直接发布该 artifact,不再需要 `gh-pages` 分支。

### 关键细节

- **Vite `base`**:`vite.config.ts` 已设 `base: '/maze3D/'`,与仓库名一致,资产路径才能正确解析。
- **SPA 404 兜底**:工作流在 `npm run build` 之后追加一步 `cp dist/index.html dist/404.html`。项目用 `BrowserRouter` 且 URL 是关卡身份规范来源(`/game?seed=…`);用户分享 / 刷新 / 后退到任意深路径时,GitHub Pages 没有对应 HTML,会回退到 404.html —— 把它做成 index.html 的副本,SPA 启动后由 React Router 接管,`useSearchParams` 仍能读到原本 URL 上的关卡查询串。
- **权限**:工作流显式声明 `permissions: contents: read / pages: write / id-token: write`,符合 least-privilege 原则。
- **Node 版本**:固定 `node-version: 20`,与项目 `package.json` 兼容(Node 18+ 即可,但 CI 锁 20 以求稳定)。
- **依赖安装**:用 `npm ci` 而非 `npm install`,配合 `package-lock.json` 在 CI 中更可靠。

### 故障排查

- **部署后页面 404 / 资源 404** → 确认 GitHub Pages Source 是 "GitHub Actions";清空浏览器缓存再访问(`shaoyahu.github.io/maze3D/`,不要漏掉尾斜杠)。
- **`/game?seed=…` 链接打开后看到 404 页而非游戏** → 检查 `Actions` 日志确认 `Add SPA fallback (404.html)` 这一步执行成功。
- **工作流没有自动跑** → Settings → Actions → General → Workflow permissions 选 "Read and write permissions"(若选了 "Read repository contents and packages permissions" 也能跑,但日志调试会受限)。

---

## 13. 贡献

- 一次只做一个增量（见 `docs/roadmap.md`）
- 任务完成后立即勾选 + 更新路线图「已完成」「下一个任务」「最后更新」+ commit + 等用户确认
- 不跳着做、不批量做、不主动开下一个任务

---

## 14. 许可证

本仓库当前未声明开源许可证，使用前请与作者确认。