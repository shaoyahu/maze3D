# P2-4a — 敌人 + survive mode + 敌人侵略度（Code Review）

**Slug**: enemies-editor
**评审范围**: git range `e0dfc8f..9577ded`（P2-4a 全部 13 个任务，43 文件 / +2322 −189）
**评审时间**: 2026-06-09
**评审强度**: xhigh（5+4 角度 × 8 候选 — **仅 Phase 1，未做 1-vote 验证与 gap sweep**）
**状态**: 9 finder 角度已收齐，去重后 ~32 条候选；本文按严重度排序列出 15 条最严重项

> ⚠️ **本轮仅完成 Phase 1（候选发现），未做 Phase 2 验证与 Phase 3 gap sweep。** 每条 finding 标注"来源角度"用于回溯，正式修复前需做 1-vote 验证。

---

## 1. 评审方法

P2-4a 是项目迄今最大的单个增量（+2322 / −189），新引入整个 `Enemy` 实体层、survive mode、time-trial、enemy aggression 设置、敌人计数 HUD、受伤屏闪等特性，覆盖 maze / engine / entities / store / rules / settings / UI 七个层。适合 xhigh recall 模式评审。

**9 个独立 finder 角度**:
- A: 逐行 diff 扫描（line-by-line） — 由角度 A 输出
- B: 删除行为审计（removed-behavior auditor） — 由角度 B 输出
- C: 跨文件追踪（cross-file tracer） — 由角度 C 输出
- D: 语言/框架陷阱（TS + React + Three.js + Zustand） — 由角度 D 输出
- E: 包装/代理正确性（wrapper/proxy） — 由角度 E 输出
- F: 复用检查（reuse） — 由角度 F 输出
- G: 简化检查（simplification） — 由角度 G 输出
- H: 效率检查（efficiency） — 由角度 H 输出
- I: 高度检查（altitude，是否在合适抽象层） — 由角度 I 输出

每角度独立返回 ≤8 候选。本文件为去重 + 严重度排序后的结果。

---

## 2. 严重度排序的发现清单

按"对最终用户可见性 × 修复成本"加权排序。**所有条目当前为 Phase 1 候选状态**，正式修复前需走 1-vote 验证流程。

---

### F1 · 致命（5/9 角度独立命中） · 候选
**整个敌人/伤害管线在运行时未接入引擎主循环 — P2-4a 几乎所有用户可见行为失效**
- 来源: A · B · C · E · I
- 文件: `src/engine/Game.ts`（`update()`）+ `src/engine/Collision.ts`（`playerVsEnemy` 导出未调用）+ `src/entities/Enemy.ts`（Enemy 类仅在自身单测导入）+ `src/store/gameStore.ts`（`damage` action 无生产调用方）
- 问题描述:
  - `Enemy` 类（带完整 patrol/dwell/chase 状态机 + FOV 侦测 + 移动）在 `Game.ts` 中**没有任何 `new Enemy(...)`**；`Enemy` 在整个 `src/` 中只被自己的 `Enemy.test.ts` 引用。
  - `Collision.playerVsEnemy` 圆 vs 圆碰撞函数被导出，但 `Game.update()` 永远不会调用。
  - `gameStore.damage(n)` action 存在，但 grep 整个 `src/` 无任何生产调用方。
  - `GameBridge` 接口包含 `onTick / onPickupCollected / onReachExit / onUseItem`，**没有 `onEnemyContact` 槽位** — 即便未来在 Game.ts 里写碰撞逻辑，也没有挂载点把伤害回写 store。
  - 敌人胶囊 mesh 在 `Scene.ts` 中正确注册并可见（基于 `MazeData.enemies`）。
- 触发场景: 玩家加载 `level-tiny-enemy.json` → 看到敌人胶囊 → 走向它 → 期望心数减 1 → 实际心数不变，胶囊冻结不动，敌人既不巡逻也不追击。
- 测试影响: `tests/e2e/enemies.spec.ts` 期望"玩家走入敌人在 3s 内出现空心 ♡"会失败（`damage()` 永远不被调用）。但单测 `Enemy.test.ts` / `collision.test.ts` / `gameStore.test.ts` 全部在隔离层通过 — 形成"全绿但生产空跑"的假象。
- 建议: 在 `Game.update(dt)` 中:
  1. 实例化或读取 `Enemy` 列表（建议 store 或 sceneRefs 持有）
  2. 对每个 enemy 调用 `enemy.update(dt, { playerPosition })`
  3. 调用 `playerVsEnemy(player.pos, enemy.pos)` → 命中则通过新增的 `bridge.onEnemyContact(n)` 把伤害写入 store
  4. 同步 enemy 胶囊 mesh 的 `position.x/z` 到 Three.js 场景

---

### F2 · 严重（2/9 角度） · 候选
**用户"渐进生成"复选框是装饰 — tick 硬编码 `enabled: true`**
- 来源: A · B
- 文件: `src/store/gameStore.ts`（`tick()` 中 `shouldProgressSpawn` 调用）+ `src/ui/LevelSelect.tsx`（checkbox 写入 `spawnSchedule.enabled`）
- 问题描述: `LevelSelect` 提供"渐进生成"复选框，写入 `spawnSchedule.enabled`。但 `tick()` 内调用 `shouldProgressSpawn` 时**字面量写死 `enabled: true`**，完全忽略 store 字段。用户在非 survive 模式（reach-exit）勾掉复选框、开始关卡后，敌人仍按 intervalSec / pickup 节奏持续生成。
- 触发场景: 用户偏好关卡稳定（关闭渐进），但每 15s 仍然有敌人刷出。
- 建议: 把 `enabled: s.spawnSchedule.enabled` 写入 `shouldProgressSpawn` 入参。

---

### F3 · 严重（1/9 角度） · 候选
**Survive 模式 `<Timer>` 永远停在 initialTime — 不倒数**
- 来源: B
- 文件: `src/ui/HUD.tsx`（`<Timer seconds={timeRemaining} />` 无条件渲染）+ `src/store/gameStore.ts`（`tick()` 在 survive 分支只增 `elapsedTime`，不减 `timeRemaining`）
- 问题描述: 旧实现里 `tick()` 每帧减 `timeRemaining`；survive 分支重构后，survive 模式只累计 `elapsedTime` 走自己的 win 判定（`elapsedTime >= surviveSeconds`），但 `<Timer>` 仍读 `timeRemaining`。结果：survive 关卡整局停在 `0:30`（initialTime），玩家无任何倒计时反馈，HUD 失去意义。
- 触发场景: 玩家选 survive 模式（initialTime=30, surviveSeconds=90）→ 90s 内 Timer 不动。
- 建议: 决策二选一 — (a) survive 模式让 Timer 显示 `surviveSeconds - elapsedTime`；(b) survive 模式根本隐藏倒计时（survive 是"坚持多久"语义，不是"剩余多少"）。如果选 (a)，Timer 组件接收 `seconds` 改为可来自 `elapsedTime/surviveSeconds` 派生。

---

### F4 · 严重（1/9 角度） · 候选
**0.5s 无敌窗口内的二次受伤 — 视觉反馈丢失**
- 来源: D
- 文件: `src/ui/components/HealthBar.tsx`（`flashing` 类名计算）+ `src/store/gameStore.ts`（`damage` action）+ `src/game/Rules.ts`（`applyDamage` 返回 `damaged:false`）
- 问题描述: 0.5s 无敌窗口内玩家撞第二个敌人 → `applyDamage` 返回 `damaged:false` → store 状态未变 → React 不重渲染 HealthBar → CSS `health-bar-flash` 动画不重启 → 第二次受伤视觉反馈缺失。
- 触发场景: 玩家穿过两个紧密排列的敌人（间隔 < 0.5s）。
- 建议: 在 store 层加一个"受伤事件"单调递增计数器（`hitCount` 或 `lastHitAt`），`damage()` 无条件递增；HealthBar 订阅计数器而非 invulnerableUntil/elapsedTime 比较值。

---

### F5 · 严重（1/9 角度） · 候选
**无敌窗口可能因浏览器后台 rAF 节流而永久卡住**
- 来源: D
- 文件: `src/store/gameStore.ts`（`damage()` 用 `s.elapsedTime` 当无敌时钟）
- 问题描述: `damage()` 以 `s.elapsedTime` 比较 `invulnerableUntil` 来判定是否处于无敌。`elapsedTime` 只在 `tick()` 中推进；如果浏览器把标签页后台时的 rAF 节流到 1Hz，`elapsedTime` 冻结在受伤时刻 → 玩家回到前台后 `invulnerableUntil > elapsedTime` 长期为真 → 后续命中 `damage()` 报告 `damaged:false` → 玩家被卡在无敌状态。
- 触发场景: 玩家受伤后切到别的标签页浏览 30s 再回来。
- 建议: 用 wall-clock 时间（`Date.now()`）记无敌截止时间戳，或在 `tick` 之外用 `setInterval` 持续推进 `elapsedTime`。

---

### F6 · 严重（2/9 角度） · 候选
**`enemyChaseMultiplier(aggression)` 与 `getCurrentEnemyAggression()` 是死链 — 值从不被消费**
- 来源: E · I
- 文件: `src/maze/types.ts`（`enemyChaseMultiplier` 函数）+ `src/engine/Game.ts`（`getCurrentEnemyAggression` 方法 + `startLevel`）+ `src/ui/GameCanvas.tsx`（bridge 注册）
- 问题描述: 用户在 Settings 选 "hard" → `settingsStore.enemyAggression = 'hard'` → `getCurrentEnemyAggression()` 在 bridge 接入 Game.ts 后能正确读出 → 但 `startLevel` 调 `injectEnemySpawns(maze, options?.enemyCount)` **没把 `chaseMultiplier` 传下去**，且没有任何 `new Enemy()` 会接收这个值。结果：用户在 Settings 切难度，运行时敌人追击速度恒定（实际上恒为 0，因为 Enemy 类没实例化 — 见 F1）。
- 触发场景: 任意 survive 关卡切换敌人侵略度。
- 建议: `injectEnemySpawns` / `Enemy` 构造 / `Game.update` 全链路把 `chaseMultiplier` 串起来。

---

### F7 · 严重（1/9 角度） · 候选
**`enemySpawner` 注入孤立格子时生成自环 path，敌人永久 dwell 在出生格**
- 来源: D
- 文件: `src/maze/enemySpawner.ts`（`findWalkableNeighbor` 返回 null 时的 fallback）
- 问题描述: `path` 构造对 `neighbor?.x ?? c.x, neighbor?.z ?? c.z` 使用了 `??`；当 hand-crafted 关卡把敌人放在无 4-邻接 walkable 邻居的格子里，path 变成 `[{x,z}, {x,z}]` — 长度为 2 但两点重合的退化 path。`Enemy` 的 `moveToward` 对零距离返回 `true`，触发 dwell，敌人永驻出生格。
- 触发场景: 未来 hand-crafted 关卡里出现"孤岛"格子上的敌人。
- 建议: 在 `injectEnemySpawns` 显式拒绝 `path.length < 2` 或邻居缺失的 spawn（在 `Enemy` 构造里 throw 已有 `isValidEnemyPath` 检查，但 spawner 端应该先验证再注入）。

---

### F8 · 严重（1/9 角度） · 候选
**`LevelSelect.randomHexSeed` 回落 `Math.random()` 破坏 deterministic-seed 契约**
- 来源: F
- 文件: `src/ui/LevelSelect.tsx`（`randomHexSeed` 函数 fallback）
- 问题描述: 项目所有关卡生成走 `seed.ts` 的 fnv1a 派生 + 编码 seed，遵循"同 seed → 同关卡"契约。但 LevelSelect 在生成随机 seed 时直接用 `Math.random()` 拿 hex 数字，绕过了 seeded RNG。`crypto` 不可用时落到非确定性路径。
- 触发场景: 任何 `crypto` 不可用且玩家点"随机种子"按钮的环境（旧浏览器/隐私模式）。
- 建议: 复用 `src/utils/seed.ts` 的 `mulberry32` / `fnv1a` 派生 8 hex 字符。

---

### F9 · 中（1/9 角度） · 候选
**`<EnemyCounter>` 读"调度器计数"而非"场景实有敌人数" — 数字与现实脱节**
- 来源: E
- 文件: `src/ui/components/EnemyCounter.tsx` + `src/store/gameStore.ts`（`progressiveEnemyCount`）
- 问题描述: 计数器订阅 `progressiveEnemyCount`，这个字段是 `shouldProgressSpawn` 触发的"已生成事件数"。但 P2-4a 范围内没有任何代码在 sceneRefs 中追加新敌人 mesh（progressive spawn 在 store 累加数字，场景层不增 mesh）。叠加 F1 整体未接入，HUD 显示的"敌人 X/10"既不反映初始数量，也不反映生成进度。
- 触发场景: 任何 survive 关卡开启 progressive spawn，HUD 数字递增但场景里敌人没变多。
- 建议: 计数器订阅源改为"当前 sceneRefs.enemies.length"或 store 中"已实例化敌人列表的长度"。

---

### F10 · 中（1/9 角度） · 候选
**`<InvulnerableFlash>` 订阅 `elapsedTime` 全程，但运行时永远 `active=false`**
- 来源: D · E
- 文件: `src/ui/components/InvulnerableFlash.tsx` + `src/store/gameStore.ts`（`invulnerableUntil` 字段）
- 问题描述: 组件订阅 `invulnerableUntil` + `elapsedTime` 比较 `active`。由于 F1 的 `damage()` 无人调用，`invulnerableUntil` 永远为 0 → `active` 永远 false → 组件永远返回 null。每秒 60 次无意义重渲染。
- 触发场景: 任意受伤场景（实际从未发生）。
- 建议: 修复 F1 后此问题消失；或临时改用 hitCount 事件订阅。

---

### F11 · 中（2/9 角度） · 候选
**敌人命中半径/高度常量在 Scene.ts 与 Enemy.ts 各写一份 — hitbox 与 mesh 漂移风险**
- 来源: F · G
- 文件: `src/engine/Scene.ts`（本地 `ENEMY_RADIUS=0.35` / `ENEMY_HEIGHT=1.6`）+ `src/entities/Enemy.ts`（同值常量导出但实际未消费）
- 问题描述: 两份相同字面量；调大 Enemy.ts 命中半径 0.4 而 Scene.ts 留 0.35 → 视觉胶囊比碰撞体小一圈，玩家视觉上碰到胶囊却没受伤。
- 建议: 在 `entities/Enemy.ts` 单一来源导出 `ENEMY_RADIUS` / `ENEMY_HEIGHT`，Scene.ts 引用；或把渲染 / 碰撞常量合并到 `maze/types.ts` 已有 enemy schema 旁。

---

### F12 · 中（1/9 角度） · 候选
**`nextSpawnAt` 与 `lastSpawnAt` 字段冗余，靠 `- intervalSec` / `+ intervalSec` 算术保持同步**
- 来源: G
- 文件: `src/store/gameStore.ts`（`tick` 中 `lastSpawnAt: s.nextSpawnAt - s.spawnSchedule.intervalSec` + 写回 `nextSpawnAt: get().elapsedTime + s.spawnSchedule.intervalSec`）
- 问题描述: 两个字段表达同一时间点的两种表达，依赖"读出 A，减常量，写回 B"的 off-by-one 易错算术链。`shouldProgressSpawn` 应该只看 lastSpawnAt。
- 触发场景: 任何对 `spawnSchedule.intervalSec` 的 mid-level 动态修改（当前未实现，但类型允许）。
- 建议: store 只保留 `lastSpawnAt`，`nextSpawnAt` 改为 `lastSpawnAt + intervalSec` 的派生值（在 selector 或 `shouldProgressSpawn` 入参处计算）。

---

### F13 · 中（1/9 角度） · 候选
**GameState 根级承载多个模式专属字段 — survive / progressive spawn 状态污染 reach-exit**
- 来源: I
- 文件: `src/store/gameStore.ts`（`currentSurviveSeconds` / `invulnerableUntil` / `spawnSchedule` / `progressiveEnemyCount` / `nextSpawnAt` / `lastPickupCountForSpawn`）
- 问题描述: 6 个字段里只有 `invulnerableUntil` 是真正模式无关的；其余都是 survive / progressive spawn 专属。reach-exit 关卡全程携带 5 个恒为默认值的字段，未来加 scoreAttack 模式会继续横向膨胀。
- 建议: 子对象化 — `survive: { target, elapsed }` + `spawn: { schedule, count, nextAt, lastPickupCount }` + `combat: { invulnerableUntil }`。

---

### F14 · 中（1/9 角度） · 候选
**tick 内 `shouldProgressSpawn` 在 `progressiveEnemyCount >= ENEMY_COUNT_MAX` 时仍写 `nextSpawnAt` — 虚假状态写入**
- 来源: C
- 文件: `src/store/gameStore.ts`（`tick()` 触发器分支）
- 问题描述: 触发器短路返回后，store 仍把 `nextSpawnAt` 推后一格 interval。这是"防止下一个 tick 立刻再触发"的安全逻辑，但写法上读起来像 bug，未来重构可能被误删。
- 建议: 抽个 helper `applySpawnTrigger(state, trigger)` 把"是否触发"和"是否推进 nextSpawnAt"集中决策。

---

### F15 · 中（1/9 角度） · 候选
**`LevelSelect` useEffect 直接读 `localStorage`，绕过 `store/persist.ts` 的 `isStorageAvailable` 保护**
- 来源: D · F
- 文件: `src/ui/LevelSelect.tsx`（`useEffect` 中 `localStorage.getItem(LAST_SEED_KEY)`）+ `src/store/persist.ts`（`loadJSON` / `saveJSON` 已带 isStorageAvailable guard）
- 问题描述: 整个项目的 localStorage 访问都走 `loadJSON` / `saveJSON` 助手，新加的 LevelSelect seed 回填是唯一裸调 `localStorage.getItem` 的地方。Safari 隐私模式 / 禁用 storage 时抛 ReferenceError，组件挂载失败。
- 建议: 用 `loadJSON(LAST_SEED_KEY, null)` 替代直接 `getItem`。

---

## 3. 其他已记录但未列入前 15 的候选（按修复优先级排队）

| 候选 | 来源角度 | 备注 |
|---|---|---|
| `tick()` 60Hz set 触发 HUD 全员 60Hz 重渲染（Timer/HealthBar/InvulnerableFlash/EnemyCounter/InventoryBar） | H | 性能问题，依赖 F4/F10 重构联动 |
| `Enemy.canSeePlayer` 每帧每敌 `Math.acos` + `Math.sqrt` | H | 用 `dot >= cosHalfFov` + `distSq` 比较替换 |
| `Scene.ts` createWallTexture/FloorTexture/CloudTexture 每次 `buildScene` 重建 canvas + 上传 GPU | H | 提到模块作用域一次创建 |
| `Scene.ts` `createPickupMaterial` 每 pickup 一份，~30 拾取 × 30 关 = GPU 重复 program | H | 3 类型各 memoize 一份 |
| `Scene.ts` `disposeScene` 不 `scene.remove(child)` 旧 mesh 引用，JS heap 线性增长 | E · H | 重启 / 切关时 |
| `Scene.ts` enemyGeom/enemyMat 在 enemies=[] 时也分配，不挂 mesh → 泄漏 | C | 小型 GPU 泄漏 |
| `Scene.ts` 闭包捕获的 `darkMode` build-time flag 让 `setDarkMode` else 分支死循环 | E | 旧坑，P2-4a 未修但有绕过 |
| `GameOverOverlay` 的 `isSurvive` 判定依赖 `currentMode`，`reset()` 不重置 `currentMode` → 上次 survive 退出后下次 GameOver 仍显示 survive 文案 | A | 修 `reset()` 加 `currentMode: undefined` |
| `GameOverOverlay` 三元 `{isSurvive ? '坚持失败' : '时间到！'}` 不带 default 分支 — 未来新增 mode 会复用 '时间到！' | B | 加 exhaustive `Record<Mode, string>` |
| `JsonMazeProvider.parseEnemies` 不验证 spawn cell 是否 walkable | C | 敌人浮在墙上 |
| `JsonMazeProvider` 三段近一致的 `typeof ee.X === 'number' && Number.isFinite(ee.X)` 守卫 | G | 抽 `copyOptionalNumber` helper |
| `LevelSelect` mode/surviveSeconds 两组 radio 重复 10 行 JSX 块 | G | 抽 `<RadioGroup>` 组件 |
| `LevelSelect` `Number(e.target.value)` 无 NaN guard | D | 空字符串 / 'NaN' 落库 |
| `tick()` survive / 非 survive 分支都计算 `const newElapsed = s.elapsedTime + dt` | G | 提到分支前 |
| `Rules.ts` 二次 re-export `ENEMY_COUNT_MAX, clampEnemyCount`（types.ts 已 export） | F | 两份 import 路径，tree-shaking 不掉 |
| `SettingsStore.sanitizeSettings` 对 `enemyAggression` 容错改 'medium'（旧严格规则被放宽） | A · B | 单字段 silent coerce |
| `enemySpawner.findWalkableNeighbor` 固定 4 方向顺序 + `path` 排序，所有敌人首步方向一致 | E | 视觉上机械同步 |
| `tickChase` 到达玩家后 `heading` 不更新，patrol 恢复时方向错误 | A | 在 moveToward 成功路径更新 heading |
| `Enemy.canSeePlayer` 的 `dot >= 1` 早返回实际不可达 | G | 删掉 |
| `Enemy.ts` `isValidEnemyPath` 导出但仅测试用 | G | 删 |
| `types.ts` `isValidSurviveSeconds` 导出但仅 `normalizeSurviveSeconds` 用 | G | 内联后删 |
| `EnemyPos` interface 与 `PlayerPos` 同形不同名 | F | 共享 `CirclePos` |
| `EnemyPlayerRef` shape 与 Game.ts 内联 `{x,z}` 重复 | F | 共享类型 |
| `InvulnerableFlash` 暂停期间 `elapsedTime` 冻结，复位时 0.5s 动画从中段跳到起点 | A | CSS 动画时间用 wall-clock 而非 elapsedTime 比较 |
| `pickup()` 同步增 `pickupCount.collected`，spawn 触发仅在 `tick()` 内 | C | 当前无 bug，只是优先级微妙 |
| `Game.startLevel` `{...maze, enemies}` 浅拷贝，未来若 `maze.enemies` 被 in-place mutate 仍会跨关泄漏 | B | 用 deep clone 或契约文档化 |

---

## 4. 修复优先级建议

**P0 — 阻塞 ship（修复前不应发布）**:
- F1: 接入 Enemy / playerVsEnemy / damage 整条管线（最高优先级）
- F2: 渐进生成复选框实际生效
- F3: Survive 模式 Timer 语义对齐

**P1 — 用户可感知的视觉/功能 bug**:
- F4: 二次受伤视觉反馈
- F5: 后台标签页无敌窗口卡死
- F6: enemyChaseMultiplier 全链路接通
- F7: enemySpawner 自环 path 防御
- F8: randomHexSeed 走 seeded RNG
- F9: EnemyCounter 数据源
- F10: InvulnerableFlash 订阅策略

**P2 — 设计/契约 smell，可在后续增量顺手清理**:
- F11 ~ F15 + 第 3 节其他项

---

## 5. 未完成项（需后续轮次补做）

- **Phase 2**: 对每条候选做 1-vote 验证（CONFIRMED / PLAUSIBLE / REFUTED）
- **Phase 3**: gap sweep — 持验证列表的 fresh reviewer 找尚未列入的缺陷
- **最终输出**: 验证后保留的 ≤15 条按严重度排序的 JSON 数组

本轮因用户指示跳过 Phase 2/3，本文件仅记录 Phase 1 候选。
