# 巡逻敌人 + survive mode — 实施计划（Plan）

**Spec**: `docs/increments/enemies-editor/spec.md`
**Roadmap**: `docs/increments/_template/roadmap.md` § P2-4a (16 行)
**复杂度**: Large
**日期**: 2026-06-09

> 步骤使用 `- []` 语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。
>
> **范围声明**：本 plan 是 P2-4a 专用（敌人+survive+UI），不包含原 X-Large P2-4 的关卡编辑器（推迟到 P2-4b）。承接 P2-3 deferred 5 项（FR-18~FR-20）全部纳入本 plan。

## 文件改动总览
| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `EnemyState` / `EnemySpawn` / `SpawnSchedule` / `EnemyAggression` / `StartLevelOptions` 扩展 / `MazeData.enemies` |
| `src/entities/Enemy.ts` | CREATE | 敌人实体 + 状态机 patrol/dwell/chase |
| `src/engine/Collision.ts` | UPDATE | `playerVsEnemy` 圆形 vs 胶囊 AABB |
| `src/maze/JsonMazeProvider.ts` | UPDATE | 解析 `enemies` 字段（缺省 `[]`） |
| `src/engine/Scene.ts` | UPDATE | 注册敌人 mesh + dispose |
| `src/engine/Game.ts` | UPDATE | `startLevel` 接受 options + 注入 EnemySpawn |
| `src/game/Rules.ts` | UPDATE | `damage` + 0.5s 无敌 + 视野侦测 + survive timer + 渐进 spawn 调度 |
| `src/store/gameStore.ts` | UPDATE | `elapsedTime` + survive win + 渐进 spawn 调度器 + invulnerable 字段 |
| `src/store/settingsStore.ts` | UPDATE | `enemyAggression` 持久化 |
| `src/ui/LevelSelect.tsx` | UPDATE | 4 控件（mode/surviveSeconds/enemyCount/progressive toggle）+ seed localStorage 回填 |
| `src/ui/Settings.tsx` | UPDATE | `enemyAggression` radio |
| `src/ui/components/EnemyCounter.tsx` | CREATE | 敌人计数 HUD |
| `src/ui/components/InvulnerableFlash.tsx` | CREATE | 受伤 0.5s 屏闪 |
| `src/ui/components/HealthBar.tsx` | UPDATE | 受伤时闪红 |
| `src/ui/WinOverlay.tsx` | UPDATE | time-trial 用时显示 + "新纪录！" |
| `src/ui/GameOverOverlay.tsx` | UPDATE | survive 坚持时间 + 击中数 |
| `src/App.tsx` | UPDATE | 接 P2-4a options 透传（surviveSeconds/enemyCount/spawnSchedule） |
| `tests/unit/maze/types.test.ts` | CREATE | 类型校验（enemyCount 0-10 / surviveSeconds 30/60/90/120 / path ≥2 节点） |
| `tests/unit/entities/Enemy.test.ts` | CREATE | 状态机 ≥6 case |
| `tests/unit/engine/Collision.test.ts` | CREATE/EXTEND | `playerVsEnemy` 距离边界 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | EXTEND | `enemies` 字段解析 + 缺省 + path fallback |
| `tests/unit/game/Rules.test.ts` | EXTEND | damage + invulnerable + 视野 + survive timer + 渐进 spawn |
| `tests/unit/store/gameStore.test.ts` | EXTEND | elapsedTime + 渐进 spawn + survive win + invulnerable |
| `tests/unit/store/settingsStore.test.ts` | EXTEND | `enemyAggression` 持久化 |
| `tests/component/LevelSelect.test.tsx` | EXTEND | 4 控件 + seed localStorage 回填（合法 / 非法） |
| `tests/component/hud.test.tsx` | EXTEND | EnemyCounter + InvulnerableFlash + HealthBar 闪红 |
| `tests/component/overlays.test.tsx` | EXTEND | WinOverlay time-trial + GameOverOverlay survive |
| `tests/e2e/enemies.spec.ts` | CREATE | 碰敌人 → damage → game-over |
| `tests/e2e/survive.spec.ts` | CREATE | survive 30s → win |
| `tests/e2e/time-trial.spec.ts` | CREATE | 180s 超时 → game-over（fake-timer）；WinOverlay 用时显示 |
| `tests/e2e/pause-resume.spec.ts` | EXTEND | survive mode 暂停 case（elapsedTime 冻结） |
| `README.md` | UPDATE | 移除 P2-4a |

## 任务清单

### Task1: types 扩展
- [x] **Action**：`src/maze/types.ts`：
  - 新增 `EnemyState = 'patrol' | 'dwell' | 'chase'`
  - 新增 `EnemySpawn`（id / x / z / path / dwellTime? / fovRange? / fovAngleDeg?）
  - 新增 `SpawnSchedule`（intervalSec=15 / onPickup=true / enabled=true）
  - 新增 `EnemyAggression = 'easy' | 'medium' | 'hard'`
  - 扩展 `StartLevelOptions`：`enemyCount?`（默认 3） / `spawnSchedule?` / `surviveSeconds?`（30/60/90/120，默认 90）
  - 扩展 `MazeData.enemies: EnemySpawn[]`（缺省 `[]`）
- [x] **Mirror**：`VictoryType` 加 `'survive'`（如尚未包含）— 已在 P2-3 引入，本次无变更。
- [x] **Validate**：`npm run typecheck` 通过；`tests/unit/maze/types.test.ts` 覆盖 enemyCount 范围 / surviveSeconds 枚举 / enemies path ≥2 节点。

### Task2: Enemy.ts 实体 + 状态机
- [x] **Action**：`src/entities/Enemy.ts` 纯类（不 import react/store），字段：
  - `id, position, path, currentIndex, dwellTime, fovRange, fovAngleDeg, speed, chaseMultiplier, state, alertTimer`
  - 方法 `update(dt, player)`：状态机切换 + 沿 path 推进
- [x] **状态机**：
  - `patrol`（沿 path 推进至下一节点） → `dwell`（节点停留 `dwellTime` 秒） → `patrol`（下一节点，循环）
  - `patrol` → `chase`（玩家进入 FOV）→ `chase`（追击 0.5s "alert" 防抖）→ `patrol`（玩家脱离）
- [x] **Validate**：`tests/unit/entities/Enemy.test.ts` 覆盖 ≥6 case（实际 13 case）：
  - patrol→dwell→patrol 循环 + 节点循环回 0
  - patrol→chase 触发（玩家进入 FOV / 背后不入 FOV）
  - chase→patrol 脱离 + 0.5s 防抖期间不退出 + 防抖中重新入 FOV 重置
  - FOV 边界：轴心（true）/ FOV/2 角度（true）/ > FOV/2（false）/ > range（false）
  - dwellTime = 0 不停留
  - path < 2 节点构造抛错

### Task3: Collision.playerVsEnemy
- [x] **Action**：`src/engine/Collision.ts` 新增 `playerVsEnemy(playerPos, playerRadius, enemy)`：圆形 vs 胶囊 AABB（敌人 = 高度 1.6m / 半径 0.35m）。返回 boolean。
- [x] **Validate**：`tests/unit/collision.test.ts` 覆盖（追加 4 case）：
  - 距离 = 半径（相切，false）
  - 距离 < 半径（true）
  - 距离 > 半径（false）
  - 跨节点 enemy 沿朝向位移后判定

### Task4: JsonMazeProvider 解析 enemies
- [x] **Action**：`JsonMazeProvider` 解析 `enemies` 字段（缺省 `[]`）；`path.length < 2` → fallback 该 enemy 排除 + console.warn。
- [x] **Validate**：`tests/unit/mazeProvider.test.ts` 追加 3 case：
  - 含 enemies 字段正常解析（含可选 dwellTime）
  - 缺省 `enemies` → `[]`
  - path 1 节点 fallback 排除 + warn spy 验证

### Task5: Scene 注册敌人 mesh
- [x] **Action**：`Scene.ts` 接收 `MazeData.enemies`，为每个 enemy 创建 `CapsuleGeometry(0.35, 1.6)` 胶囊 mesh（深灰偏红 `#553333`），加入 scene；`dispose()` 释放所有 enemy mesh。
- [x] **Validate**：`tests/unit/scene.test.ts` 追加 3 case（现有 8 + 3 = 11）：
  - 含 enemies 的 maze → CapsuleGeometry 锚定在 cell center、y=0.8（贴地）
  - 0 enemies → `enemies === []`
  - disposeScene 释放 enemy mesh + 清空数组

### Task6: Game.startLevel 注入 EnemySpawn
- [x] **Action**：`engine/Game.ts` 的 `startLevel(maze, options?)`：
  - 接收 `enemyCount` + `spawnSchedule` + `surviveSeconds` + `mode='survive'`
  - `enemyCount` 强制 0-10 范围（用 clampEnemyCount）
  - 根据 `enemyCount` + 迷宫布局（避开 start/exit 周围 1 格 + 路径候选点）生成 EnemySpawn 注入 `maze.enemies`
  - 暴露 `getCurrentSurviveSeconds()` / `getCurrentEnemyAggression()` 给 GameBridge
- [x] **Validate**：`tests/unit/maze/enemySpawner.test.ts` 新建 + 9 case 覆盖：
  - enemyCount=0 → 不注入
  - enemyCount=3 → 3 个 EnemySpawn
  - enemyCount=11 → 截断到 10
  - 注入位置不与 start/exit 重叠（Chebyshev 距离 1）
  - 不放在 wall 单元 / 默认值 / NaN 回退
  - 注入逻辑提取到 `src/maze/enemySpawner.ts`（纯函数，不依赖 engine）
- [x] **附**：settingsStore 加 `enemyAggression` 字段（默认 `'medium'`，与 Task9 共享持久化槽位；Task9 会补全 UI radio + 三档对应 1.2/1.5/1.8 倍率映射）

### Task7: Rules.damage + 视野 + survive timer
- [x] **Action**：`Rules.ts`：
  - `applyDamage` 纯函数（health = max(0, health - n)，invulnerable 期内不应用）+ `ENEMY_INVULNERABLE_SECONDS=0.5`
  - `shouldSurviveWin(elapsed, surviveSeconds)`
  - `shouldProgressSpawn`（time 触发 + pickup 触发 + 上限截断）
  - `gameStore` 集成：`damage` 用 `applyDamage`；`tick` 处理 survive 胜利条件 + 渐进 spawn；新增 `invulnerableUntil` / `currentSurviveSeconds` / `spawnSchedule` / `progressiveEnemyCount` / `nextSpawnAt` / `lastPickupCountForSpawn` 字段
- [x] **Validate**：`tests/unit/rules.test.ts` 追加 12 case + `tests/unit/gameStore.test.ts` 追加 7 case：
  - applyDamage 累加到 0 / invulnerable 0.5s 期内不触发 / 边界条件
  - shouldSurviveWin 阈值
  - shouldProgressSpawn time / pickup / cap / onPickup=false / disabled
  - survive 30s 触发 win
  - progressive 15s 触发 + pickup 触发 + cap 10
  - 视野触发 chase（覆盖在 Enemy.test.ts，Task2 完成）

### Task8: gameStore 扩展
- [x] **Action**：`gameStore.ts`：与 Task7 一并完成（Rules 纯函数 + store 状态耦合，分两次提交会反复来回）。
  - 已有 `damage(n)`（P2-2 框架）→ 强化为 `applyDamage` 包装，加 `invulnerableUntil: number` 字段
  - 已有 `tick(dt)` → survive mode 加 `currentSurviveSeconds` 字段 + win 条件；time-trial 走 timeRemaining（P2-3 已有）
  - 渐进 spawn 调度器状态：`nextSpawnAt: number` + `lastPickupCountForSpawn` 累计
  - mode 切换时（reach-exit/time-trial/survive）正确初始化对应计时器
- [x] **Validate**：`tests/unit/gameStore.test.ts` 追加 7 case（invulnerable / survive 30s win / survive 忽略 timeRemaining / progressive 15s / pickup / cap 10 / enemyCount 来自 options）— 已在 Task7 commit 中包含。

### Task9: settingsStore.enemyAggression
- [x] **Action**：`settingsStore.ts` 新增 `enemyAggression: EnemyAggression`，默认 `'medium'`，持久化到 localStorage（Task6 已加字段 + 校验，Task9 加倍率映射 + 完整测试）。
  - `types.ts` 加 `ENEMY_CHASE_MULTIPLIER_EASY/MEDIUM/HARD` + `enemyChaseMultiplier(aggression)` 纯函数
- [x] **Validate**：
  - `tests/unit/settingsStore.test.ts` 追加 enemyAggression 默认 / 持久化往返 / 拒绝非法值
  - `tests/unit/maze/types.test.ts` 追加 `enemyChaseMultiplier` 三档对应 1.2/1.5/1.8

### Task10: LevelSelect 4 控件 + Settings radio + seed 持久化
- [x] **Action**：
  - `LevelSelect.tsx` 4 控件（共享给两个 procedural 入口，hand-crafted 关卡仍忽略）：
    - mode radio（reach-exit / time-trial / survive，默认 time-trial）
    - survive seconds radio（30/60/90/120，mode=survive 时显示，默认 90）
    - enemy count slider（0-10，默认 3）
    - progressive spawn toggle（默认 on）
  - "指定种子关卡" 输入框 localStorage 持久化（key=`maze3d.lastSeed`），刷新后回填；非法 seed 不写（保留旧值）
  - `Settings.tsx` 新增 `enemyAggression` radio（简单 1.2x / 中等 1.5x / 困难 1.8x）
- [x] **Validate**：
  - `tests/component/menus.test.tsx` 追加 7 case（4 控件渲染 / survive 联动 / options 透传 / 合法 seed 写 localStorage / 非法 seed 不写 / 合法 seed 回填 / 非法 seed 忽略）
  - `tests/component/settings.test.tsx` 追加 3 case（默认 medium / 切换 hard/easy 触发 store / 非默认值回显）

### Task11: HUD + Overlays
- [ ] **Action**：
  - `EnemyCounter.tsx` 新建：HUD 角落显示 "敌人 X/Y"（current / max）
  - `InvulnerableFlash.tsx` 新建：受伤 0.5s 全屏红色蒙层（与 `invulnerableUntil` 同步）
  - `HealthBar.tsx` 受伤时闪红 + 渐隐
  - `WinOverlay.tsx` time-trial 显示用时（mm:ss）+ "新纪录！"（如有）
  - `GameOverOverlay.tsx` survive 显示坚持时间 + 击中数
- [ ] **Validate**：`tests/component/hud.test.tsx` 覆盖：
  - EnemyCounter 渲染
  - InvulnerableFlash 时机（mock `invulnerableUntil` 时间）
  - HealthBar 闪红 class 切换
  - `tests/component/overlays.test.tsx` 覆盖：
  - WinOverlay time-trial 文案（含 mm:ss）
  - GameOverOverlay survive 文案（含坚持时间 + 击中数）

### Task12: E2E
- [ ] **Action**：
  - `enemies.spec.ts`：碰敌人 → damage → health 减 1 → 屏闪 → 0.5s 后可再次受伤
  - `survive.spec.ts`：survive 30s → win overlay（fake-timer 注入）
  - `time-trial.spec.ts`：180s 超时 → game-over（fake-timer）；WinOverlay 显示用时
  - `pause-resume.spec.ts` 扩展：survive mode 暂停时 elapsedTime 冻结
- [ ] **Validate**：`npm run test:e2e` 全绿。

### Task13: 文档同步
- [ ] **Action**：
  - README.md "Future increments" 段 P2-4a 完成时移走
  - roadmap.md P2-4a 行 → done；进度 16/16
  - spec.md §11 完成清单全部勾选
  - plan.md "执行日志" 段填写实际 ship 状态
- [ ] **Validate**：grep 验证：
  - `AlgorithmMazeProvider` / `EnemySpawn` / `enemyAggression` / `survive` 在 README 出现
  - roadmap.md P2-4a 16/16 ✅
  - spec.md §11 全部 `[x]`

## 验证

```bash
npm run typecheck
npm run test         # 期望 ≥290/290（260 P2-2/P2-3 baseline + 30+ 新增）
npm run build
npm run test:e2e
# 验证引擎层边界（不变）
grep -rE "(react|store)" src/entities/Enemy.ts && echo "FAIL" || echo "OK"
grep -rE "(react|store)" src/maze/AlgorithmMazeProvider.ts && echo "FAIL" || echo "OK"
```

## 风险
| 风险 | 可能性 | 缓解 |
|---|---|---|
| 敌人 + 玩家碰撞 N² 性能 | 低 | N≤10，每帧 O(N) |
| 视野侦测帧间抖动 | 中 | 0.5s alert 防抖 |
| 渐进 spawn 触发器漏发 | 中 | setInterval + pickup 监听双路 |
| survive 30s E2E 等真实时间 | 中 | fake-timer 注入 |
| 敌人 / 玩家位置同步 | 低 | 统一 `engine.update(dt)` 单源 |
| 关卡 JSON 缺 enemies 字段 | 中 | 兼容 default [] |
| enemyCount 0-10 / surviveSeconds 30/60/90/120 范围外输入 | 中 | engine.startLevel 强制截断 |

## 验收
- [ ] 所有 Task 勾选完成（13/13）
- [ ] 验证命令全部通过（`npm run typecheck` ✅ / `npm test` ≥290/290 ✅ / `npm run build` ✅ / `npm run test:e2e` ✅）
- [ ] spec §11 完成清单全部勾选
- [ ] README.md / roadmap.md / spec.md / plan.md 同步
- [ ] 任何 mode（reach-exit / time-trial / survive）都能叠加敌人
- [ ] survive mode 30/60/90/120s 都触发 win
- [ ] 渐进 spawn：每 15s + 每 pickup → +1 enemy（上限 10）
- [ ] 承接 P2-3 deferred 5 项全部 ship（FR-18 / FR-19 / FR-20 + GameOverOverlay survive 击中数 + time-trial 超时 E2E）

## 执行日志（实施时填写）

### 实施日期
待填写

### 实际改动文件
（实施后与上方对照）

### 遇到的偏差
（spec 中计划 ...，实际做了 ...，原因 ...）

### 备注
