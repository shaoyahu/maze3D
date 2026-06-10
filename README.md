# 3D 迷宫（maze3d）

一款基于浏览器第一人称视角的 3D 迷宫游戏。使用 Vite + React 18 + TypeScript + Three.js 构建，引擎层与 UI 层解耦，状态由 Zustand 统一管理。

## 技术栈

| 类别 | 选型 |
|---|---|
| 构建工具 | Vite 5 |
| UI 框架 | React 18 + TypeScript 5 |
| 3D 渲染 | Three.js 0.169 |
| 状态管理 | Zustand 4 |
| 单元 / 组件测试 | Vitest + Testing Library + happy-dom |
| 端到端测试 | Playwright |

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

环境要求：Node 18+。

## 常用脚本

| 脚本 | 作用 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器（带 HMR 热更新） |
| `npm run build` | TypeScript 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 本地预览生产构建产物 |
| `npm test` | 运行 Vitest 单元与组件测试（含覆盖率报告） |
| `npm run test:watch` | Vitest watch 模式 |
| `npm run test:e2e` | Playwright 端到端测试（自动启动 dev server） |
| `npm run test:e2e:install` | 安装 Playwright 浏览器 |
| `npm run typecheck` | 仅运行 `tsc -b --noEmit` 类型检查 |

## 游戏控制

- **W / A / S / D** 或 **方向键** — 移动
- **鼠标** — 视角（点击画布锁定指针）
- **P** — 暂停 / 继续
- **1 / 2** — 使用 1 号 / 2 号库存槽的物品（空槽无效果）
- **ESC** — 释放鼠标指针

## 关卡系统

关卡选择页提供两类入口：**固定关卡**（手写 JSON）和**程序生成关卡**。

### 固定关卡

1. 将新的关卡 JSON 放入 `public/levels/level-X.json`，参考 `level-small.json` 了解字段。
2. 刷新页面，新关卡会出现在"固定关卡"列表下。
3. 若需在端到端测试中复现路径，遵循 `level-tiny.json` 的格式约定（最小可玩 + 确定可走通）。

内置固定关卡：

- `level-small` — 入门尺寸
- `level-tiny` — 最小尺寸，便于 E2E 调试
- `level-tiny-pickups` — 包含拾取物品的最小关卡
- `level-tiny-enemy` — 包含单个敌人（id `test-enemy`）的最小关卡，供 E2E 玩家-敌人碰撞用

### 程序生成关卡（P2-3）

关卡选择页另外暴露两个程序生成入口：

- **随机关卡** — 三档尺寸卡片（15×15 / 30×30 / 50×50），每次点击都会用 64 位随机种子生成全新迷宫，并启动 180 秒的竞速模式。
- **指定种子关卡** — 输入任意 16 位小写十六进制种子后点击"开始"，可复现同一迷宫（默认 30×30 竞速模式）。

关卡 JSON / 程序生成结果都符合 `MazeData`（`src/maze/types.ts`），核心字段：`size / start / exit / walls / pickups / enemies[] / rules`。`EnemySpawn` 描述巡逻敌人的出生坐标 + 路径节点（`path: {x,z}[]`，≥ 2 节点），由 `JsonMazeProvider` 解析；程序生成时由 `Game.startLevel` 调用 `injectEnemySpawns` 注入到 `maze.enemies`。

两个入口都通过 `AlgorithmMazeProvider` 调度，分发到以下四种迷宫生成算法：

- `recursive-backtracker`（递归回溯）
- `kruskal`（Kruskal）
- `prim`（随机 Prim）
- `hunt-and-kill`（Hunt-and-Kill）

种子是**自包含**的：编码格式 `algo-v1-<algorithm>-<size>-<hex>` 完整描述了迷宫的全部身份信息，因此同一个种子在任何设备上都可复现完全相同的迷宫。

## 拾取物品与库存

关卡地图中可放置三种拾取物品：

| 类型 | 效果 |
|---|---|
| `time` | 恢复倒计时（按 `rules.timeOnPickup` 累加秒数） |
| `health` | 恢复生命值（不超过 `rules.maxHealth`） |
| `key` | 进入库存（2 个槽位，库存满时拾取失败，物品保留在原位） |

库存槽位通过数字键 `1` / `2` 触发使用。当前没有"锁格"或"门"等可消耗 `key` 的机关，使用仅触发 UI 闪烁；该契约为敌人 / 生存模式下的扩展预留。

## 胜利模式

`MazeData.rules.victory` 与 `StartLevelOptions.mode` 共同决定当前关卡的胜利条件：

| 模式 | 含义 | 计时 |
|---|---|---|
| `reach-exit` | 抵达出口格子即胜利 | 沿用关卡自身的 `initialTime` |
| `time-trial` | 180 秒内抵达出口，否则 game-over | 强制 180 秒预算 |
| `survive` | 30/60/90/120 秒存活，倒计时跑完即胜利 | 30/60/90/120 秒预算（LevelSelect 可选） |

最佳成绩按 `levelId` 分别保存到 `localStorage`（`maze3d.levels.v1`），程序生成关卡的成绩会附上自描述 `Seed`，可随时重新打开同一迷宫。

## 项目架构

```
src/
├── engine/        # 纯 TypeScript 写的 Three.js 引擎，不引用 React
│   ├── Camera.ts          # 相机与视角封装
│   ├── Collision.ts       # 玩家与墙体的碰撞检测
│   ├── Game.ts            # 主循环、Tick 调度
│   ├── InputManager.ts    # 键盘 / 鼠标输入
│   ├── Loop.ts            # requestAnimationFrame 循环
│   ├── Renderer.ts        # Three.js 渲染器
│   └── Scene.ts           # 场景搭建（墙、地面、出口、拾取）
├── entities/
│   ├── Player.ts          # 玩家位置 / 朝向 / 半径（PLAYER_RADIUS）
│   ├── Pickup.ts          # 拾取物品的视觉与碰撞表示
│   └── Enemy.ts           # 巡逻敌人（patrol / dwell / chase 状态机 + FOV）
├── game/
│   ├── GameState.ts       # 状态机：idle / playing / paused / game-over / win
│   └── Rules.ts           # 纯函数规则：跨过出口、捡起物品、使用物品、伤害 / 存活 / 渐进 spawn
├── maze/
│   ├── types.ts           # CellType / PickupType / VictoryType / Seed 等
│   ├── JsonMazeProvider.ts        # 从 public/levels/*.json 加载
│   ├── AlgorithmMazeProvider.ts   # 程序生成（P2-3）
│   └── generators/                # 4 个纯函数生成器 + 公共辅助
│       ├── recursiveBacktracker.ts
│       ├── kruskal.ts
│       ├── prim.ts
│       ├── huntAndKill.ts
│       ├── _isReachable.ts        # DFS 验证 start ↔ exit 连通
│       └── _expandThickWall.ts    # 物理墙厚扩展
├── store/
│   ├── gameStore.ts       # 运行时状态（屏幕、计时、生命、库存等）
│   ├── levelStore.ts      # 最佳成绩（持久化）
│   ├── settingsStore.ts   # 用户偏好（暗色模式 / 敌人追击速度 enemyAggression，持久化）
│   └── persist.ts         # localStorage 读写 + 校验
├── ui/                    # 纯 React 视图层
│   ├── App / MainMenu / LevelSelect / Settings
│   ├── GameCanvas         # 装配 Three.js 画布
│   ├── HUD                # 状态条（HUD = 健康 / 时间 / 库存 / 敌人计数 / 受伤屏闪 / 小地图）
│   └── overlays/          # Pause / GameOver / Win 三个遮罩
├── utils/
│   └── seed.ts            # FNV-1a 哈希 + mulberry32 PRNG + 种子编解码
└── styles/                # 全局样式
```

### 关键设计原则

- **引擎 / UI 隔离**：`src/engine/` 不允许 `import` 任何 React 模块；UI 通过 `useGameStore` 订阅运行时状态。
- **生成器纯函数**：`src/maze/generators/*` 接受 `(size, prng)`，输出 `walls: CellType[][]`，不依赖 React / Zustand，便于单测。
- **种子自描述**：`algo-v1-{algorithm}-{size}-{mazeSeed}` 把算法、版本、尺寸、64 位熵打包到一个字符串里，可以原样回放到 `AlgorithmMazeProvider.load()` 复现完全相同的迷宫。
- **校验在边界**：所有从 `localStorage` 或 URL 读出的数据都会经过 `isBestRecord` / `isValidSeed` 等显式校验函数，校验失败时丢弃而不是静默吞错。

## 路线图

项目按 Phase 2 增量推进，已完成 / 进行中 / 计划中：

| 阶段 | 标题 | 状态 |
|---|---|---|
| P2-1 | MVP（手写关卡 + 第一人称 + 通关） | ✅ 已完成 |
| P2-2 | 暗色模式 + 拾取物品系统 | ✅ 已完成 |
| P2-3 | 程序生成关卡 + 竞速模式 | ✅ 已完成（14/14） |
| P2-4a | 敌人 + 生存模式（survive） | ✅ 已完成（13/13） |
| P2-4b | 浏览器内关卡编辑器 | ✅ 已完成（20/20） |

增量文档位于 `docs/increments/`，每个增量都包含 `spec.md`（设计）、`plan.md`（任务分解）、`review.md`（事后复盘，仅完成的增量有）。

完整设计文档：

- `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- `docs/superpowers/plans/2026-06-05-maze3d-first-person-game.md`

## 测试

项目保持 80%+ 测试覆盖率（Vitest + happy-dom + Testing Library）。端到端关键流程（关卡选择、生成、暂停、胜利、失败）由 Playwright 覆盖。

```bash
npm test                 # 单元 + 组件
npm run test:e2e         # 端到端（自动启动 dev server）
```

测试目录结构：

- `tests/unit/` — 单元测试（utils、maze 生成器、store、Rules）
- `tests/component/` — 组件测试（菜单、HUD、关卡选择）
- `tests/e2e/` — Playwright 端到端

## 许可证

本仓库当前未声明开源许可证，使用前请与作者确认。
