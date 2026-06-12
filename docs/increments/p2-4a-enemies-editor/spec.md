# 巡逻敌人 + survive mode — 设计文档（Spec）

**Slug**: enemies-editor
**状态**: draft (P2-4a 范围重写中；2026-06-09)
**日期**: 2026-06-09
**对应路线图项**: P2-4a
**依赖**: P2-3（程序生成 + 新 mode 提供选项基座；survive 框架在 P2-3 已 ship）
**复杂度**: Large
**注意**: 原 P2-4（X-Large，含关卡编辑器）拆分为 P2-4a（本文件）与 P2-4b（独立增量）。本 spec 不包含编辑器。

## 1. 概述

在 P2-3 算法关卡 + 新 mode 之上引入**敌人**实体与 **survive mode**：

(a) **巡逻敌人**：3D 场景里出现巡逻型敌人，玩家进入敌人视野后敌人从巡逻转入追击；被敌人接触 → `damage(1)` → 0.5s 无敌；
(b) **survive mode**：在 P2-3 ship 的 mode 框架上叠加 "存活 N 秒"胜利条件。

两者结合可与 reach-exit / time-trial **正交叠加**：任何 mode 都可带敌人。survive mode 默认带敌人，但允许关卡内零敌人（仅计时）。

## 2. 目标 / 非目标

### 目标
- 新增 `src/entities/Enemy.ts`：敌人实体 + 状态机（`patrol` / `dwell` / `chase`）
- 敌人沿 `path: {x,z}[]` 节点循环移动，到节点后等 `dwellTime=1s` 再继续
- 视野侦测：FOV 60° + range 3（格子）；玩家进入 → 切 `chase`；离开 → 回到 `patrol`
- 追击速度 = 玩家速度 × `enemyAggression`（easy=1.2 / medium=1.5 / hard=1.8，默认 medium）
- 巡逻速度 = 玩家速度 × 0.6
- 玩家-敌人接触 → `damage(1)` → 0.5s 无敌期；health=0 → `game-over`
- 渐进出现（默认开启，可在 LevelSelect 关闭）：每 15s 或每收集 1 个 pickup → +1 enemy，上限 10
- 任何 mode（reach-exit / time-trial / survive）都可叠加敌人
- survive mode：内置 `elapsedTime` 计时器；`elapsedTime ≥ N` → `win`；默认 N=90s，LevelSelect 可选 30/60/90/120
- `MazeData` 扩展 `enemies: EnemySpawn[]`，JsonMazeProvider + AlgorithmMazeProvider 都解析
- settingsStore 新增 `enemyAggression: 'easy' | 'medium' | 'hard'`
- HUD 增 EnemyCounter 与 InvulnerableFlash；HealthBar 受伤时闪红

### 非目标
- 多种敌人类型（仅一种 "巡逻者"）
- 敌人 A* 寻路（沿预定义 path 节点移动）
- 敌人远程攻击 / 投掷物
- 编辑器（推迟到 P2-4b）
- 多人 / 联机
- 敌人音效 / 视觉警告提示
- enemy spawn 在 maze 生成时的算法内置（v1：玩家进入后从关卡外部注入）

## 3. 用户故事

- 作为动作玩家，我想要敌人增加挑战，让我不能只是跑酷通关
- 作为生存玩家，我想要 "存活 N 秒" 模式，让我专注躲藏
- 作为新手玩家，我想要简单档敌人追击速度，让我有时间反应
- 作为硬核玩家，我想要关卡里最多 10 个敌人同时出现
- 作为设计者，我想要在 reach-exit / time-trial / survive 任一 mode 都能加敌人，让关卡设计更多样

## 4. 功能需求

### 敌人系统（FR-1 ~ FR-9）
- FR-1：新增 `Enemy.ts` 实体，包含 `position, path, currentIndex, dwellTime, state, fovRange, fovAngleDeg, speed, chaseMultiplier`
- FR-2：`Scene.ts` 注册敌人 mesh，胶囊体（高 1.6m，半径 0.35m），深灰偏红
- FR-3：`Engine.update()` 每帧：状态机切换（patrol ↔ chase） + 沿 path 推进 / 离开 path 时返回最近点
- FR-4：`Collision.playerVsEnemy`：圆形 vs 胶囊 AABB 检测
- FR-5：`Rules.damage(n)` action；health=0 → state=`game-over`；同敌人 0.5s 多次命中合并
- FR-6：`MazeData.enemies: EnemySpawn[]`；JsonMazeProvider 与 AlgorithmMazeProvider 都解析
- FR-7：视野侦测：敌人位置 → 玩家位置向量；与敌人朝向夹角 ≤ FOV/2 且距离 ≤ range → 玩家可见
- FR-8：dwellTime = 1s（节点停留）
- FR-9：巡逻速度 = 玩家速度 × 0.6；追击速度 = 玩家速度 × `chaseMultiplier`

### survive mode（FR-10 ~ FR-12）
- FR-10：`VictoryType` 加 `'survive'`；`StartLevelOptions.surviveSeconds?: 30|60|90|120`，默认 90
- FR-11：`gameStore` 加 `elapsedTime` 计时器（time-trial 已用 timeRemaining；survive 用 elapsedTime 复用 gameStore.tick）
- FR-12：survive 胜利：`elapsedTime ≥ surviveSeconds` → state=`win`

### 渐进出现 + UI（FR-13 ~ FR-17）
- FR-13：LevelSelect 4 个 entry 控件（"随机关卡" / "指定种子关卡"，含 reach-exit / time-trial / survive 三 mode 任选）：
  - mode radio（reach-exit / time-trial / survive）
  - survive seconds radio（30/60/90/120）
  - enemy count slider（0–10，默认 3）
  - progressive spawn toggle（默认 on）
- FR-14：渐进出现触发：每 15s 间隔 OR 每收集 1 个 pickup → enemyCount++ 直到上限
- FR-15：HUD 增 `EnemyCounter`（"敌人 3/10"）+ `InvulnerableFlash`（受伤 0.5s 屏闪红）
- FR-16：HealthBar 受伤时闪红（与 InvulnerableFlash 同步）
- FR-17：Settings.tsx 增 `enemyAggression` radio（简单/中等/困难）

### 承接 P2-3 deferred 5 项（FR-18 ~ FR-20）
- FR-18：WinOverlay 在 time-trial 模式下显示用时（mm:ss 格式）+ "新纪录！"（如有）；GameOverOverlay 在 survive 模式下显示坚持时间 + 击中数
- FR-19：tests/e2e/pause-resume.spec.ts 扩展 survive mode 暂停 case（暂停时 elapsedTime 冻结）
- FR-20：LevelSelect "指定种子关卡" 输入框 localStorage 持久化最近一次合法 seed（key=`maze3d.lastSeed`），刷新后回填；非法 seed 不写

## 5. 数据 / 类型变更

### 新增 / 修改类型（`src/maze/types.ts`）

```ts
export type EnemyState = 'patrol' | 'dwell' | 'chase';

export interface EnemySpawn {
  id: string;
  x: number; z: number;
  path: Array<{ x: number; z: number }>;
  dwellTime?: number;     // 默认 1.0
  fovRange?: number;      // 默认 3
  fovAngleDeg?: number;   // 默认 60
}

export interface SpawnSchedule {
  intervalSec: number;    // 默认 15
  onPickup: boolean;      // 默认 true
  enabled: boolean;       // 默认 true（LevelSelect 可关）
}

export type EnemyAggression = 'easy' | 'medium' | 'hard';

export interface StartLevelOptions {
  // ... P2-3 已 ship：seed?, mode?, time-trial options
  enemyCount?: number;        // 默认 3
  spawnSchedule?: SpawnSchedule;
  surviveSeconds?: 30 | 60 | 90 | 120;  // mode='survive' 时使用
}

// MazeData 扩展
export interface MazeData {
  // ...existing fields
  enemies: EnemySpawn[]; // NEW, default []
}
```

### Store 字段
- `settingsStore` 新增 `enemyAggression: EnemyAggression`（默认 `'medium'`），持久化
- `gameStore`：
  - 已有 `damage(n)` action（P2-2 ship 框架）；本增量加 invulnerable 计时字段
  - 已有 `tick(dt)`；survive mode 用 `elapsedTime` 而非 `timeRemaining`

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | EnemySpawn / EnemyState / SpawnSchedule / StartLevelOptions 扩展 / MazeData.enemies |
| `src/maze/JsonMazeProvider.ts` | UPDATE | 解析 `enemies`（default []） |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `MazeData.enemies: []`（算法层不感知敌人；注入在 engine 层做） |
| `src/entities/Enemy.ts` | CREATE | 敌人实体 + 状态机 |
| `src/engine/Scene.ts` | UPDATE | 注册敌人 mesh + dispose |
| `src/engine/Collision.ts` | UPDATE | playerVsEnemy 碰撞 |
| `src/engine/Game.ts` | UPDATE | startLevel 透传 enemyCount / spawnSchedule / surviveSeconds / mode='survive' |
| `src/game/Rules.ts` | UPDATE | damage action + 0.5s 无敌 + 视野侦测 + survive timer |
| `src/store/gameStore.ts` | UPDATE | elapsedTime 字段 + survive win 条件 + 渐进 spawn 调度 |
| `src/store/settingsStore.ts` | UPDATE | enemyAggression 字段 + 持久化 |
| `src/ui/LevelSelect.tsx` | UPDATE | 4 个 entry 控件（mode / surviveSeconds / enemyCount / progressive toggle） |
| `src/ui/components/EnemyCounter.tsx` | CREATE | 敌人计数 HUD |
| `src/ui/components/InvulnerableFlash.tsx` | CREATE | 受伤 0.5s 屏闪 |
| `src/ui/components/HealthBar.tsx` | UPDATE | 受伤时闪红 |
| `src/ui/Settings.tsx` | UPDATE | enemyAggression radio |
| `src/App.tsx` | UPDATE | 接 P2-4a options 透传 |
| `tests/unit/entities/Enemy.test.ts` | CREATE | 状态机单测 |
| `tests/unit/engine/collision.test.ts` | EXTEND | playerVsEnemy |
| `tests/unit/game/rules.test.ts` | EXTEND | damage + 视野侦测 + survive |
| `tests/unit/store/gameStore.test.ts` | EXTEND | survive mode + 渐进 spawn |
| `tests/unit/store/settingsStore.test.ts` | EXTEND | enemyAggression 持久化 |
| `tests/component/levelSelect.test.tsx` | EXTEND | 4 控件行为 |
| `tests/component/hud.test.tsx` | EXTEND | EnemyCounter + InvulnerableFlash |
| `tests/e2e/enemies.spec.ts` | CREATE | 碰敌人 → damage → game-over |
| `tests/e2e/survive.spec.ts` | CREATE | survive 30s → win |
| `tests/e2e/time-trial.spec.ts` | CREATE | 180s 超时 → game-over（fake-timer）；WinOverlay 显示用时（FR-18） |
| `tests/e2e/pause-resume.spec.ts` | EXTEND | 加 survive mode 暂停 case（elapsedTime 冻结；FR-19） |

### 边界检查
- `Enemy.ts` 不 import react/store（纯实体）
- `Engine/Game.ts` 仍走 `GameBridge` 回调（P2-2 Q3 严格边界）
- 算法 provider 不感知敌人语义（只接受 enemyCount 数值）
- 视野 / 状态机 / 碰撞都在 engine 层；store 只接事件

## 7. UI / UX 变更

### 屏幕 / 组件改动
- `LevelSelect.tsx`：每个 procedural 入口下方加 4 控件（mode / surviveSeconds / enemyCount slider / progressive toggle）
- `Settings.tsx`：新增 "敌人追击速度" radio（简单 1.2x / 中等 1.5x / 困难 1.8x）
- `EnemyCounter.tsx`：HUD 角落，"敌人 X/Y"
- `InvulnerableFlash.tsx`：受伤时全屏红色蒙层 0.5s
- `HealthBar.tsx`：受伤瞬间闪红 + 渐隐

### 交互流程（survive 30s 流程）
1. 玩家 LevelSelect 选 "随机关卡" → 30×30 + mode=survive + surviveSeconds=30 + enemyCount=3
2. App 调 `AlgorithmMazeProvider.generate({ algorithm: 'recursive-backtracker', size: 30, mazeSeed: random64bit, mode: 'survive' })` → 返回 MazeData（`enemies: []`，由 engine 层注入）
3. `Game.startLevel(maze, { enemyCount: 3, mode: 'survive', surviveSeconds: 30 })` → engine 根据 enemyCount + 迷宫布局注入 EnemySpawn 到 maze.enemies
4. gameStore.elapsedTime 0s 起步；3 个敌人在 patrolling
5. 玩家被碰 → damage → invulnerable 0.5s → elapsedTime 继续
6. 30s 到 → state=`win` → WinOverlay 显示 "存活成功！"（FR-18）

## 8. 错误处理

### 新增错误码
- `EnemyPathError`：path < 2 节点 → 关卡加载失败（fallback 空 enemies）
- `InvalidEnemyCountError`：count > 10 → 强制 10；< 0 → 强制 0
- `InvalidSurviveSecondsError`：非 30/60/90/120 → 强制 90

### 兜底行为
- 敌人 path 单点 → 原地 dwell 循环
- 玩家 invincible 时再次被碰 → 无 damage
- 渐进 spawn 调度器异常（已到上限）→ 不再 +1
- 关卡 JSON 缺 enemies 字段 → 视为空数组（向后兼容 P2-2 旧关卡）

## 9. 测试策略

### 单元测试
- `Enemy.test.ts`：状态机（patrol→dwell→patrol；patrol→chase；chase→patrol）
- `Collision.test.ts`：playerVsEnemy 边界（距离 = 半径 / 半径 + ε / 跨节点）
- `rules.test.ts`：damage 累加 + invulnerable 时间窗 + 视野侦测 + survive timer
- `gameStore.test.ts`：survive mode elapsedTime + win 触发 + 渐进 spawn 调度
- `settingsStore.test.ts`：enemyAggression 持久化
- `JsonMazeProvider.test.ts`：enemies 字段解析 + 缺省值

### 组件测试
- `levelSelect.test.tsx`：4 控件显示 + 状态切换
- `hud.test.tsx`：EnemyCounter 渲染 / InvulnerableFlash 时机

### E2E
- `enemies.spec.ts`：碰敌人 → damage → health 减 1 → 屏闪 → 0.5s 后可再次受伤
- `survive.spec.ts`：survive 30s → win overlay

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 敌人 + 玩家碰撞 N² 性能 | 低 | N≤10，每帧 O(N) 足够 |
| 视野侦测帧间抖动 | 中 | 进入→chase 后保持 0.5s "alert" 防抖 |
| 渐进 spawn 触发器漏发 | 中 | 用 setInterval + pickup 监听两条路，互不干扰 |
| survive 30s E2E 等真实时间 | 中 | 用 fake-timer 注入 |
| 敌人 / 玩家位置同步（render 帧 vs 物理帧） | 低 | 统一 `engine.update(dt)` 单源 |
| 关卡 JSON 缺 enemies 字段 | 中 | 兼容 default [] |

## 11. 完成清单

### 11.1 功能验收
- [x] FR-1 ~ FR-20 全部实现（含 P2-3 deferred 3 项补入）
- [x] 任何 mode 都能叠加敌人
- [x] survive mode 30/60/90/120s 都触发 win
- [x] 渐进 spawn：每 15s + 每 pickup → +1 enemy（上限 10）

### 11.2 引擎 / 架构边界
- [x] `Enemy.ts` 不 import react/store
- [x] 引擎仍走 GameBridge 回调
- [x] 算法 provider 仅接收 enemyCount 数值
- [x] 视野 / 状态机 / 碰撞在 engine 层

### 11.3 测试
- [x] 单测覆盖率 ≥80%
- [x] Enemy 状态机 ≥6 case（实际 13 case）
- [x] survive E2E 用 fake-timer（page.clock fastForward）
- [x] `npm run typecheck` + `npm run build` 通过

### 11.4 文档
- [x] spec.md（本文件）已写入
- [x] plan.md 待写（13 任务已 ship）
- [x] README.md "Future increments" 段 P2-4a 完成时移走
- [x] roadmap.md P2-4a 行 → done

### 11.5 持久化与兼容
- [x] `settingsStore.enemyAggression` 持久化
- [x] `MazeData.enemies` 字段缺省 `[]`，兼容旧 JSON
- [x] 旧 best records 不破坏

### 11.6 安全与健壮性
- [x] enemyCount 0–10 范围校验
- [x] surviveSeconds 仅 30/60/90/120
- [x] enemies path < 2 节点 fallback
- [x] 无 console.log 残留

## 12. 参考

- P2-3 spec: `docs/increments/procedural-modes/spec.md`（survive 框架 + StartLevelOptions 基座）
- P2-3 deferred 5 项（plan.md §"Deferred → P2-4a"）：HUD 用时显示 / survive 计数 / fake-timer E2E / survive 暂停测试 / seed 输入持久化 → 全部归入本增量
- 设计 spec: `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §5（引擎边界）§7（数据模型）
- DoD 模板: `docs/increments/_template/dod.md`
- 路线图: `docs/increments/_template/roadmap.md`
