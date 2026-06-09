# 程序生成关卡 + 新游戏模式 — 设计文档（Spec）

**Slug**: procedural-modes
**状态**: done (2026-06-09, 14/14)
**日期**: 2026-06-09
**对应路线图项**: P2-3
**依赖**: —
**复杂度**: Large

## 1. 概述

两个相互配合的扩展：

(a) 实现 `AlgorithmMazeProvider`，4 种迷宫算法（Recursive Backtracker / Kruskal / Prim / Hunt-and-Kill）× 3 种尺寸（15×15、30×30、50×50）；
(b) 保留 `reach-exit` 模式，新增 `time-trial` 模式（180s 内通关，否则 game-over）。

两者组合让游戏从"固定关卡 → 通关"扩展为"任意尺寸 × 算法 × 模式"。

## 2. 目标 / 非目标

### 目标
- 新增 `src/maze/AlgorithmMazeProvider.ts` + `src/maze/generators/{recursiveBacktracker,kruskal,prim,huntAndKill}.ts`
- 4 算法：Recursive Backtracker / Kruskal / Prim / Hunt-and-Kill
- 3 尺寸：15×15、30×30、50×50
- 2 模式：reach-exit（默认）/ time-trial（180s 内通关）
- Seed 自包含：算法 + 版本 + 尺寸 + 64-bit mazeSeed → ID 形如 `algo-v1-{algo}-{size}-{hex}`
- LevelSelect 两入口：随机关卡（自动生成 seed）/ 指定种子关卡（用户输入 seed）
- 同 seed 同算法 → 同一 `MazeData`（确定性）
- localStorage 缓存 `seed → {algorithm, mazeSeed}` 元数据
- `BestRecord` 加 `seed?: string` 字段，兼容旧数据

### 非目标
- 单元自动布局（迷宫完全程序生成）
- 服务器端 seed 共享
- 编辑器
- survive 模式（推迟到 P2-4a）

## 3. 用户故事
- 作为休闲玩家，我想要无限关卡，以便不会玩腻
- 作为竞技玩家，我想要 seed 可复现的关卡，以便挑战他人成绩
- 作为速通玩家，我想要 time-trial 模式，以便专注通关速度
- 作为好奇玩家，我想要 4 种不同算法，看不同迷宫结构

## 4. 功能需求
- FR-1：4 种迷宫生成器（纯函数，输入 `{size, prng}`，输出 `walls: CellType[][]`）
- FR-2：所有算法保证 start ↔ exit 至少一条路径（DFS 单测验证）
- FR-3：所有算法同 seed → 同 walls（确定性单测）
- FR-4：50×50 尺寸 <500ms（性能单测）
- FR-5：`AlgorithmMazeProvider.generate({algorithm, size, mazeSeed, mode})` 返回 `MazeData`
- FR-6：Seed 编码 `algo-v1-{algo}-{size}-{hex}`，解码校验
- FR-7：`gameStore.startLevel(maze, options?)` 接受 options
- FR-8：time-trial 模式 timeRemaining=180s，到 0 → game-over
- FR-9：reach-exit 模式维持现有逻辑
- FR-10：`LevelSelect` 两入口（随机关卡 / 指定种子关卡）+ 3 尺寸 UI
- FR-11：`levelStore.BestRecord` 加 `seed?: string` 字段，向后兼容

## 5. 数据 / 类型变更

### 新增 / 修改的类型
- `src/maze/types.ts`：
  - `Algorithm = 'recursive-backtracker' | 'kruskal' | 'prim' | 'hunt-and-kill'`
  - `MazeSize = 15 | 30 | 50`
  - `Seed = { algorithm: Algorithm; size: MazeSize; mazeSeed: string /* 16 hex */ }`
  - `StartLevelOptions = { seed?: Seed; mode?: VictoryType }`
- `src/store/levelStore.ts`：
  - `BestRecord.seed?: string`
- `src/store/gameStore.ts`：
  - `startLevel(maze, options?: StartLevelOptions)`
- `src/game/Rules.ts`：
  - `time-trial`: initialTime=180s, timeOnPickup 同 reach-exit

### 边界检查
- 4 个生成器都是纯函数，输入 `(size, prng)` → 输出 `walls`
- 生成器不依赖 React / Zustand
- 生成器输出经 DFS 验证 start ↔ exit 可达

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动 | 说明 |
|---|---|---|
| `src/utils/seed.ts` | CREATE | encodeSeed / decodeSeed / fnv1a / mulberry32 |
| `src/maze/types.ts` | UPDATE | Algorithm / Seed / StartLevelOptions |
| `src/maze/generators/recursiveBacktracker.ts` | CREATE | 递归回溯 |
| `src/maze/generators/kruskal.ts` | CREATE | Kruskal |
| `src/maze/generators/prim.ts` | CREATE | Prim（随机版） |
| `src/maze/generators/huntAndKill.ts` | CREATE | Hunt-and-Kill |
| `src/maze/AlgorithmMazeProvider.ts` | CREATE | 4 算法调度 + 性能 |
| `src/store/levelStore.ts` | UPDATE | BestRecord.seed |
| `src/store/gameStore.ts` | UPDATE | startLevel options + time-trial 计时 |
| `src/engine/Game.ts` | UPDATE | startLevel 接受 options |
| `src/ui/LevelSelect.tsx` | UPDATE | 两入口 + 3 尺寸 UI |
| `src/App.tsx` | UPDATE | 接 procedural provider |
| `tests/unit/utils/seed.test.ts` | CREATE | seed 单测 |
| `tests/unit/maze/generators/*.test.ts` | CREATE | 4 算法单测 |
| `tests/unit/maze/AlgorithmMazeProvider.test.ts` | CREATE | provider 单测 |
| `tests/unit/levelStore.test.ts` | EXTEND | seed 字段持久化 |
| `tests/unit/gameStore.test.ts` | EXTEND | startLevel options + time-trial |
| `tests/e2e/procedural.spec.ts` | CREATE | 程序生成端到端 |

### 边界检查
- `AlgorithmMazeProvider` 不 import react/store
- 4 个生成器是纯函数
- 生成器不 import 任何 src/ 模块（除 types.ts）

## 7. UI / UX 变更

### 屏幕 / 组件改动
- `LevelSelect.tsx`：新增两个入口卡片
  - 随机关卡：3 尺寸卡片（15/30/50），点击 → 随机 seed → startLevel
  - 指定种子关卡：seed 输入框 + 算法下拉 + 尺寸下拉 + 开始按钮

### 交互流程（随机关卡 time-trial）
1. 玩家在 LevelSelect 选 "随机关卡" → 选 30×30
2. App 调 `AlgorithmMazeProvider.generate({ algorithm: 'recursive-backtracker', size: 30, mazeSeed: random64bit, mode: 'time-trial' })`
3. 进入游戏，倒计时 180s
4. 通关 → WinOverlay 显示用时 + "新纪录！"（如有）
5. 超时 → GameOverOverlay

## 8. 错误处理

### 新增错误码
- `InvalidSeedError`：seed 解析失败 → fallback 到 small JSON
- `UnsupportedAlgorithmError`：未知算法 → fallback

### 兜底行为
- 算法超时（>2s）→ 退回 small JSON
- size <5×5 → 强制最小尺寸
- seed 解析失败 → 重新生成

## 9. 测试策略

### 单元测试
- `utils/seed.test.ts`：
  - encodeSeed/decodeSeed 互逆
  - FNV-1a 已知输入 → 已知输出
  - mulberry32 同 seed → 同输出
- `maze/generators/{4算法}.test.ts`：
  - 同 size + 同 prng state → 同 walls
  - 不同 seed → 不同 walls（统计）
  - 输出经 DFS 验证可达
  - 50×50 <500ms
- `maze/AlgorithmMazeProvider.test.ts`：
  - generate 4 算法返回 valid MazeData
  - 50×50 <500ms
- `levelStore.test.ts`：seed 字段持久化兼容
- `gameStore.test.ts`：startLevel options + time-trial 计时

### E2E 测试
- `procedural.spec.ts`：选随机关卡 → 进入 → 通关 → win
- （time-trial 超时 E2E 跳过；性能不可靠）

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 算法大尺寸性能 | 中 | 单元测 50×50 <500ms；如失败改 iterative |
| seed 碰撞（不同 seed 同 maze） | 低 | 64-bit seed + mulberry32 |
| 生成器输出一致性 | 中 | 4 算法单测覆盖 |
| BestRecord schema 升级破坏旧数据 | 低 | seed 可选字段 |

## 11. 完成清单

### 11.1 功能验收
- [x] FR-1 到 FR-11 全部实现
- [x] 4 算法 × 3 尺寸 端到端可走通
- [x] time-trial 模式 180s 倒计时正确

### 11.2 引擎 / 架构边界
- [x] `AlgorithmMazeProvider` 不 import react/store
- [x] 4 个生成器不 import src/ 模块
- [x] 生成器是纯函数

### 11.3 测试
- [x] 单测覆盖率 ≥80%
- [x] 4 算法同 seed 确定性测试通过
- [x] 50×50 <500ms 性能测试通过
- [x] E2E: procedural.spec.ts 通过
- [x] `npm run typecheck` 与 `npm run build` 通过

### 11.4 文档
- [x] spec.md（本文档）已写入
- [x] plan.md 待写
- [x] README.md "Future increments" 中 P2-3 完成时移走
- [x] roadmap.md P2-3 行 → done

### 11.5 持久化与兼容
- [x] `levelStore.best` schema 兼容（缺 seed 为 undefined）
- [x] 无新增 settingsStore 字段
- [ ] 浏览器刷新后 seed 输入框保留最近一次（**deferred → P2-4a**）

### 11.6 安全与健壮性
- [x] seed 输入校验（HEX_RE = /^[0-9a-f]{16}$/）
- [x] 算法失败有兜底（`App.tsx` catch → `loadError` 状态）
- [x] 无 console.log 残留

## 12. 参考
- 算法参考：Recursive Backtracker, Kruskal, Prim, Hunt-and-Kill (Wikipedia: Maze generation algorithm)
- DoD 模板：`docs/increments/_template/dod.md`
- 路线图：`docs/increments/_template/roadmap.md`
