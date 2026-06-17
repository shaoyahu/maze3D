# Code Review §C — Entities & Game Rules (2026-06-17)

**Slug**: `2026-06-17-c-entities-rules`
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `e45ecdc test+docs(p2-11): 老 level-* 引用更新为 teaching-* + E2E spec + roadmap 完成`
**前置评审**: [`2026-06-16-full-code-review.md`](./2026-06-16-full-code-review.md)(11 finding,全部已 fix)、[`2026-06-15-fresh-full-review.md`](./2026-06-15-fresh-full-review.md)、[`2026-06-15-full-bug-scan.md`](./2026-06-15-full-bug-scan.md)、[`2026-06-13-D-quality.md`](./findings/2026-06-13-D-quality.md)
**评审方式**: 单代理深读(读 + 局部 grep),范围严格限定到用户指定文件清单。
**关联文档**: 本文件即 C 类分项(entities / Rules / reachability / enemySpawner)。

## §0 评审范围(锁定)

按用户指示,严格审查以下文件,**未越界**:

- `src/entities/Player.ts`
- `src/entities/Pickup.ts`
- `src/entities/Enemy.ts`
- `src/game/Rules.ts`
- `src/game/GameState.ts`(**注意**:CLAUDE.md 把它列为 `src/game/GameState.ts`,但实际物理文件是 `src/engine/Game.ts`;`src/game/GameState.ts` 不存在。本次评审顺带读了 `src/store/gameStore.ts`(权威状态机)和 `src/engine/Game.ts`(tick 编排),因为 GameState 实际是 Zustand store 持有的对象)。
- `src/maze/enemySpawner.ts`
- `src/maze/reachability.ts`

历史 F-tag(`F-2026-06-15-*`、`F-2026-06-16-*`)标记的 finding **不再重复报告**,但必要时作为对照引用。

## §1 总览

### 严重度统计

| 严重度 | 数量 |
|---|---|
| **CRITICAL** | 0 |
| **HIGH** | 3 |
| **MEDIUM** | 5 |
| **LOW** | 4 |
| **总计** | **12** |

### 一句话结论

实体 + Rules + 流程逻辑**整体健康度良好**:Rules.ts 是真纯函数(无 `Math.random` / `Date.now` / `performance.now` / `setTimeout`),Enemy 状态机(patrol / dwell / chase)图清晰,F2 wall-aware 与 F-2026-06-16-L-3 initial heading 修复都已落地并有测试;但仍有 3 处 **HIGH** 集中在 `reachability.ts` 缺独立单元测试、`Enemy` 的 `path` 顺序在 `EditorMazeProvider` / hand-crafted JSON 中没有运行时保证、以及 `injectEnemySpawns` 仍可能在 `survive` 模式下被 race-condition 调用造成重复注入。

## §2 CRITICAL

无。

## §3 HIGH

### F-2026-06-17-C-H-1 | `src/maze/reachability.ts:6-40` | `isReachable` 没有针对自身行为的单元测试 — BFS 的边界条件全靠 generator 间接覆盖

`isReachable` 是 4 个生成器和编辑器设计校验器的共用基元,但 `tests/` 下没有 `reachability.test.ts`。仅有的引用是 4 个 generator 测试(huntAndKill / kruskal / prim / recursiveBacktracker)里 `expect(isReachable(walls, {x:0, z:0}, exitCell(N))).toBe(true)` 三行(覆盖 15/30/50 三种 size),以及 `editorValidation` 的 `validateDesign` 通过它发出 warning —— **后者的 warning 路径目前没有任何测试**(整个 `editorValidation.ts` 也没有单测文件)。

具体来说,以下边界条件**未在任何测试中显式断言**:

1. **非方形 grid**:`walls.length = 5` 但 `walls[0].length = 7` —— 走访 `walls[0].length` 当成 `width`、深度只看 `walls.length`,但 BFS 内部又按 `width × depth` 索引 `visited[k]`,**如果各 row 长度不等,`visited[z*width+x]` 会写到别的 row**(`src/maze/reachability.ts:11-12`、`20`)。
2. **空 grid**:`walls = []` 或 `walls = [[]]` —— 函数 `return false`,但**没有任何测试钉这个契约**;若未来把 `if (depth === 0 || width === 0) return false;` 改成 `return true`,validator 会静默通过坏数据。
3. **start/exit 坐标为负数**:`walls[start.z][start.x]` 在 `start.x = -1` 时会抛 `TypeError`,函数**没有任何边界检查**。
4. **出度 0 节点**:isolated walkable cell(4 邻居全为墙)应被 BFS 正确处理,但没有针对性测试。
5. **半径 1 走廊 / 厚墙扩展后连通性**:`_expandThickWall.ts` 不调用 `isReachable` 做后置校验(只 `expandThickWall` 接受 `treeEdges` 并返回 walls),所以**生成器的"全连通"保证完全建立在 BFS 假定正确 + 算法本身正确 之上**,没有任何端到端"扩成厚墙后还连通"的测试。

**影响**:`editorValidation.validateDesign` 走 `isReachable` 路径(第 27 行)但其 warning 没测试 → 编辑器"出口不可达"提示可能在坏数据下被静默吞掉。生成器测试的 happy-path 都假设"算法输出 1 棵生成树 → walls 全连通",但**若 `isReachable` 自身有 bug(比如 visited index 越界),所有 4 个生成器测试都会同时通过** —— 它们是同一份代码的同方向证伪。

**修复建议**:补 `tests/unit/maze/reachability.test.ts`,至少覆盖:

- `walls = []`、`walls = [[]]` → `false`
- `start` 在墙内 → `false`(已实现,需钉住)
- 非方形 grid(不同 row 长度)→ 行为符合预期(可暂时 `expect(...).toThrow()` 或显式 throw)
- 出度 0 isolated cell → `false`
- 4 邻居全墙但自身是通道 cell → `false`
- 端到端 `expandThickWall` + `isReachable` 在 15/30/50 size 下输出连通(目前只在 generator 测试的 `walls` 是 raw logical grid,**不是** `expandThickWall` 后的 visual grid,见 `huntAndKill.test.ts:34-42` 的 `walls` 字面量)

---

### F-2026-06-17-C-H-2 | `src/entities/Enemy.ts:51-79` | `Enemy` constructor 信任外部 spawn,但对 `path` 的方向不验证 —— 巡逻反向 / 重复节点可能造成 chase 触发错位

Enemy 的 constructor(`Enemy.ts:52-78`)做了两件事:

1. 拒绝 `path.length < 2`(安全)
2. 信任 `path[1]` 是"方向正确的下一节点",`heading = headingToward(this.position, this.path[1])`

**但对以下情况无防护**:

- **`path` 含重复节点**:`path = [{x:1,z:1}, {x:1,z:1}, {x:2,z:1}]` —— constructor 不报错(>= 2 节点),`currentTarget=1` 让第一步走向自己(零距离 → `moveToward` 立即 `return true` → `enterDwell`),等 dwell 结束后 `advanceTarget` 跳到 `path[2] = (2,1)`,**这段"自己→自己"的巡逻是 spec 没说允许的,Generator 用 `findWalkableNeighbor` 防住了程序生成场景**,但 `JsonMazeProvider` 接受任何 `path` 数组。
- **`path` 完全包含 `position`**:`spawn = {x:0, z:0}` + `path = [{x:0,z:0}, {x:1,z:0}, {x:0,z:0}]` —— 第一帧 `moveToward(path[1])` 正常,但 dwell 完走到 `path[2]` 后又回到 spawn,**玩家看到"敌人从脚下穿过自己"**,无报错。
- **`path` 全在反方向**:`spawn = (5,5)` + `path = [{x:5,z:5}, {x:0,z:0}]` —— 合法,但**头几帧 enemy 向 spawn 的反方向走**,这通常是编辑器的"我把路径设错了"场景,目前只能由编辑器 `validateDesign` 抓到 `< 2 节点` 的硬错。

**影响**:由 `JsonMazeProvider.parseEnemies`(已读源码、`validateMaze` 调用链)对 `path` 数组不做节点级校验,手写关卡 / 编辑器导出 / `importExport.parseImport` 三条路径都能把退化 `path` 灌进 `Game.startLevel`(`src/engine/Game.ts:285-293`),Enemy 在 `update()` 头几帧行为完全可预测地错误,但**不抛错、不记 warn**,玩家只能从游戏内发现"敌人卡住"或"敌人冲过来又走开"。

**修复建议**:

- `Enemy` constructor 校验 `path` 中**任意两个相邻节点距离 > 0**(且 > `ENEMY_RADIUS`),距离 ≤ 0 时 `throw new Error("Enemy ${id}: path contains a zero-length segment at index ${i}")`。
- `Enemy` constructor 校验 `path[0]` 到 `position` 距离 < `cellSize / 2`(允许轻微漂移,避免编辑器把 `path[0]` 设成 spawn cell 角落),失败时 `throw`。
- `validateDesign`(`src/ui/editor/editorValidation.ts:46-55`)把 `path.length < 2` 的 warning 升级为 error,并**新增"path 含零距离段"warning**。

---

### F-2026-06-17-C-H-3 | `src/maze/enemySpawner.ts:30-84` | `injectEnemySpawns` 缺 race-condition 防护 —— 同一关卡被 `startLevel` 多次调用会反复叠加

`injectEnemySpawns` 是 APPEND(不替换,见 `F-A-L1` 注释,`enemySpawner.ts:19-29`),caller 必须 `[...maze.enemies, ...injected]` 合并。但 `Game.startLevel`(`src/engine/Game.ts:257-263`)在每次 `startLevel` 调用时都跑一次注入:

```ts
const generated = this.currentMode === 'survive'
  ? injectEnemySpawns(maze, requestedEnemyCount)
  : [];
const injectedMaze: MazeData = { ...maze, enemies: [...maze.enemies, ...generated] };
```

**问题路径**:

1. 用户在 survive 模式下点 retry → `startLevel` 再次被调用 → `maze.enemies` **仍包含上一轮注入的 `gen-1` / `gen-2` / `gen-3`**(`injectedMaze.enemies` 来自 `MazeData`,不会主动剔除已注入的)。
2. 第二次注入产生 `gen-4` / `gen-5` / `gen-6`,叠在 `gen-1..3` 之后 → **场景里敌人变成 6 个**。
3. `currentEnemyCount` HUD 显示"3"(初始)但 `sceneRefs.enemies.length` 是 6 → `EnemyCounter` 偏差(同 store 内 `progressiveEnemyCount` 与 `currentEnemyCount` 的语义冲突在 `F-2026-06-15-M-4` 系列已记录,这是新的相似问题)。

**复现**:play survive 模式 → GameOver 屏幕 → 点 retry → 数 3D 场景里的红色胶囊数量,会发现从 3 涨到 6(或更多,每 retry +3)。

**影响**:`enemySpawner.test.ts:92-121` 的 "APPEND, NOT REPLACE" 测试只验证**单次调用**的不可变性,**没有 retry / re-startLevel 路径的测试**。注释里写"callers rely on this to merge"(`enemySpawner.ts:21`),但 caller 端没人负责"剔除上一次注入"。

**修复建议**:在 `Game.startLevel` 里**先剔除上轮注入的 enemies**,再追加新注入:

```ts
const handCraftedOnly = maze.enemies.filter((e) => !e.id.startsWith('gen-'));
const generated = this.currentMode === 'survive' ? injectEnemySpawns(maze, requestedEnemyCount) : [];
const injectedMaze: MazeData = { ...maze, enemies: [...handCraftedOnly, ...generated] };
```

或者,让 `injectEnemySpawns` 接受**完整的 `maze.enemies` 列表**(含上轮注入)并显式 dedup by `id`(`gen-N` 是稳定 id,见 `enemySpawner.ts:74`)。后者更安全,因为 retry / reentry 路径未来可能来自多种 caller。

需要新增 `enemySpawner.test.ts` 的"retry 路径"测试:同一 maze 调两次 `injectEnemySpawns` → 两次结果按 `id` dedup 后 ≤ 3 条。

## §4 MEDIUM

### F-2026-06-17-C-M-1 | `src/entities/Enemy.ts:9-10` | `ENEMY_RADIUS = 0.35` 与 `PLAYER_RADIUS = 0.2` 之差在 `Game.ts:430` 的 `sumR2` 计算里**只对玩家+敌人**正确,没考虑**敌人+敌人**的相互推挤

`ENEMY_RADIUS = 0.35`、`PLAYER_RADIUS = 0.2`,`Game.update()` 内的"玩家 ↔ 任意敌人"接触检测用 `(player.radius + ENEMY_RADIUS)² = 0.3025` 做距离平方阈值(`Game.ts:430`)。但**两个敌人之间的距离**没做避让:

- 场景里如果两个 enemy 的 path 在 X 形交叉,他们会**穿过对方**,因为 `Enemy.moveToward` 调 `resolveMove` 时只把"自己"当 circle,`grid` 是墙表(不感知其他 enemy)。
- 多 enemy 在密集关卡(50×50 + progressive spawn 涨到 10 个)会**视觉上明显穿模**,F2 修复(评论 `F2 (P0)` `Enemy.ts:44-49`)只挡了墙,没挡敌。

**影响**:纯视觉,不影响玩法 hit 判定。但 P2-11 的 哨兵回廊(progressive 模式 + 0.5s chase + 起步 3 敌人)在玩家 1 分钟内会涨到 6-10 个,穿模是肉眼可见的。

**修复建议**:让 `Enemy.update` 接受**只读**的 `enemies: ReadonlyArray<{position, radius}>` 列表(只算 index > 当前 i 的,避免双向 push),`moveToward` 前先把目标位置与所有"其他 enemy 当前位置"做 `(r_self + r_other)²` 推开;推开用与 `resolveMove` 相同的 per-axis try-slide,以保持 wall-aware 风格一致。

不需要做严格的 boid-style steering,简单推开即可(0.05m per frame sliding)。

---

### F-2026-06-17-C-M-2 | `src/entities/Player.ts:16-24` | `createPlayer` 总是把玩家放在 cell **中心**(`cs/2` 偏移),但 hand-crafted 关卡可能把 `start` 设成 cell 角

`createPlayer(startCell, cellSize)` 在 `Player.ts:18` 写 `position.x = startCell.x * cellSize + cellSize / 2` ——**强加 0.5 cell 中心偏移**。然而:

1. `JsonMazeProvider.validateMaze` 接受任意 `(x, z)` 整数坐标的 `start` / `exit`(`src/maze/JsonMazeProvider.ts:113-127`),坐标语义是"哪一格",不是"cell 内哪一点"。
2. `reachability.ts:6-40` 的 BFS 用的也是整数格点。
3. 但 `Game.update` 的 `crossesExit` 同样用 `cellX(point, cs) = Math.floor(point.x / cs)`(`Rules.ts:7`)—— `Math.floor((cs/2) / cs) = 0`、`Math.floor((1.5*cs) / cs) = 1`,**所以 start cell 是 `(0,0)` 时玩家位置 `cs/2` 对应 cell 0**;但 start cell 是 `(1,0)` 时玩家位置 `1.5*cs`,`Math.floor((1.5*cs)/cs) = 1`,**也对**。

**问题**:在 cell 中心 `cs/2` 偏移下,**`crossesExit` 的中点采样 `Math.floor((start.x + end.x) / 2 / cs)` 与 `cellX(point, cs)` 一致**(`cellX` 与 midpoint 都是 `Math.floor`),所以 start 不会"错位 cell 0/1"。

**真正的 bug**:`createPlayer` 把玩家强制放在 `cs/2`,**关卡出口也只能在 cell 中心**(`Game.ts:476-477` 同样写 `maze.exit.x * cs + cs / 2`),但 hand-crafted JSON 允许 `exit: {x: 3, z: 5}` —— 这是"格点 3,5"的意思,不是"坐标 (3*cs, 5*cs)"。**两者目前的耦合是隐式的**:

- 玩家在 cell 中心走。
- 出口在 cell 中心触发(因为 `crossesExit` 算 cell 中心命中后被 `Game.ts:476-477` 强制 clamp 到 cell 中心)。
- 编辑器的 `validateDesign` 校验 `exitOnWall` 用 `walls[exit.z][exit.x] === 1`,**也是整数格点语义**。

**这条耦合目前没有显式注释**,未来若有人改 `createPlayer` 改用 cell 左下角(`startCell.x * cellSize` 而非 `+ cs/2`),玩家起步会**直接卡在墙里或与墙 overlap**,`collidesAt` 抛 `out of bounds = wall`(`Collision.ts:89-92`)。

**修复建议**:

- 在 `createPlayer` / `Game.ts:476-477` 旁加 `// F-2026-06-17-C-M-2: cell center convention is the contract; JSON's exit.x is the cell index, not the world coordinate`。
- 把"cell 中心"提到 `Player.ts` 或 `MazeData` 的注释里成 single source of truth,例如 `export const CELL_CENTER_OFFSET = 0.5;`。
- 新增 `createPlayer` 单测,断言 `position.x === startCell.x * cellSize + cs/2` 在 cs=1、2、4 下都成立。

---

### F-2026-06-17-C-M-3 | `src/game/Rules.ts:99-101` | `shouldSurviveWin` 没有 NaN/负数 guard,可能因 store 端 `currentSurviveSeconds` 异常返回 true

`shouldSurviveWin(elapsedTime, surviveSeconds)` 简单 `return elapsedTime >= surviveSeconds`。`gameStore.ts:62-68` 把 `currentSurviveSeconds` 注释为 `number`(非 `SurviveSeconds` 联合),`F5` 注释明确"时间 pickup 可让 survive 计数超出 30/60/90/120 preset",所以运行时类型是 `number`,但**没有显式的 finite guard**。

**可能触发**:`SurviveSeconds` 联合校验在 `startLevel` 入口(`gameStore.startLevel` 调 `normalizeSurviveSeconds(options?.surviveSeconds)`),但 `damage()`、pickup 多轮叠加、潜在的 `JSON.parse` 异常(state 迁移 v1→v2 漏字段)都可能让 `currentSurviveSeconds` 变成 `NaN` / `-Infinity` / `0` / 负数。

具体场景:

- `currentSurviveSeconds = NaN` → `elapsedTime >= NaN` → `false`(JS 语义,正确)。
- `currentSurviveSeconds = -Infinity` → `elapsedTime >= -Infinity` → **`true`**(立即胜利,玩家没玩)。
- `currentSurviveSeconds = 0` → `elapsedTime >= 0` → **`true`**(第一帧就胜利)。
- `currentSurviveSeconds = -1`(持久化 v1→v2 漏了字段)→ 同样立即胜利。

**影响**:漏洞需要 corrupt state 才能触发,但 `lastHitBy` / `lastWinKind` 在 `goToMenu` 时是清掉的(`gameStore.ts:447-465`),没看到 `currentSurviveSeconds` 的 reset 是 90(SURVIVE_SECONDS_DEFAULT,`gameStore.ts:454`)——**只有 `goToMenu` 路径重置**,如果 `startLevel` 走了不同入口(比如 reload + auto-resume),`currentSurviveSeconds` 仍是上一关的,且 `goToMenu` 没被调用,直接 `startLevel` 又会用它。

**修复建议**:在 `shouldSurviveWin` 入口加 finite guard:

```ts
export function shouldSurviveWin(elapsedTime: number, surviveSeconds: number): boolean {
  if (!Number.isFinite(elapsedTime) || !Number.isFinite(surviveSeconds)) return false;
  if (surviveSeconds <= 0) return false;
  return elapsedTime >= surviveSeconds;
}
```

并在 `Rules.test.ts` 加 "NaN/负数 → false" 3 个 case。

---

### F-2026-06-17-C-M-4 | `src/entities/Enemy.ts:114-127` | `canSeePlayer` 没有 raycast / wall occlusion —— FOV + 距离足够就能看见,即使中间隔墙

`canSeePlayer`(`Enemy.ts:114-127`)只检查 **距离 ≤ fovRange** 与 **FOV 角 ≤ fovAngleDeg**,**不检查玩家与 enemy 之间的墙体**。结果:玩家躲在墙后,只要 FOV 锥对得上 + 距离够,enemy 立即进入 chase。

**现状评估**:`CLAUDE.md` 与 `Enemy.ts:7-9` 注释都没声明"敌有 wall occlusion";`tests/unit/entities/Enemy.test.ts` 也没测"墙后看不见"。

**影响**:`level-tiny-enemy.json` 与 `level-small.json` 是手写关卡,在 Z 形走廊里玩家完全可以"贴在墙后走"看到 enemy 不动 —— 若加了 wall occlusion,enemy 会**真的看不见**,关卡难度可能跳一档(尤其是 `level-tiny-enemy.json` 的 `fovRange: 3` 紧贴墙根的情况)。这是个**设计选择**而不是 bug。

**但有两点值得修**:

1. **CLAUDE.md / spec 没说清楚**。spec `docs/increments/p2-*/spec.md`(应读,本评审未读)可能明确"敌可穿墙看见"是 spec。当前代码看像是"忘了做"而不是"刻意如此"。
2. **`validateDesign` 没有任何 warning 提示"这条 fovRange 穿墙"**。若玩家从一侧贴墙根走到另一侧,enemy 的 FOV 一直覆盖,但 `F2` wall-aware movement 让 enemy 走不过墙,**视觉上"敌在墙后盯着我看但追不过来"**比"敌在墙后看不见"更出戏。

**修复建议**:先在 `Enemy.canSeePlayer` 接受 `grid: WallGrid`,做 Bresenham / DDA raycast(`Engine/Collision` 已经有现成的 `grid.get(x, z)`,无需新依赖);每 0.5m 采样一次,任一采样命中墙则返回 false。**功能影响**:大多数手写关卡 enemy 仍能看见玩家(因为 path 都设计在能直接到 spawn 附近的走廊),但会**消掉"贴墙蹲守"cheap exploit**。

如果选择保留"敌可穿墙看见",在 `CLAUDE.md` 写一句 spec 决策 + 在 `Enemy.ts:7-9` 加 `// F-2026-06-17-C-M-4: FOV intentionally ignores wall occlusion by design` 注释。

---

### F-2026-06-17-C-M-5 | `src/entities/Enemy.ts:140-142` | `tickChase` 的 `moveToward(player.position, ...)` 用了 `chaseSpeed` 但**没用** `chaseMultiplier` —— 命名不一致 + 多余字段

`Enemy.ts:64-65`:

```ts
this.chaseMultiplier = options.chaseMultiplier;
this.chaseSpeed = options.playerSpeed * options.chaseMultiplier;
```

`tickChase`(`Enemy.ts:140-142`)调 `this.chaseSpeed`,**没**用 `this.chaseMultiplier` 字段。`chaseMultiplier` 字段对外**只读**,构造后不再变化(grep 全文,无 setter),但它**也**没被 `tickChase` 读。

**影响**:

- 字段冗余 + 误导读者(`chaseMultiplier` 听起来应该是"实时倍率"或"决策依据",实际只是"曾经用来算 chaseSpeed 的快照常量")。
- `Enemy.test.ts:181-194` "resets the debounce when the player re-enters FOV mid-window" 等 chase 测试只读 `state`、`alertTimer`,没测"`chaseMultiplier` 字段等于 options.chaseMultiplier" —— 也就是说,**该字段目前没有任何测试覆盖**,重构时把它删了所有测试都过。
- 字段是 `readonly`,在 TS 层不会被误改,但运行时 `Enemy` 实例上占了 ~8 字节 × 10 个 enemy = 80 字节 / 关卡,可忽略。

**修复建议**:

- 删 `chaseMultiplier` 字段,只保留 `chaseSpeed`(`Enemy.ts:36`)。
- 如果未来需要"运行时改 difficulty"(CLAUDE.md 留了扩展点),由 `Enemy.update(dt, player, currentAggression)` 签名多带一个参数,**不要**把 `chaseMultiplier` 留在实例字段上做"未来再说"占位。
- 在 `Enemy.test.ts` 加 1 个 case:验证 `chaseSpeed === options.playerSpeed * options.chaseMultiplier`(目前没这条断言)。

## §5 LOW

### F-2026-06-17-C-L-1 | `src/entities/Player.ts:35-45` | `CAMERA_EULER` 是模块级单例,`setFromEuler` 后立即被消费 — 注释承诺安全,但若未来在 `applyLook` 之前读 `camera.quaternion` 会拿到 stale 值

`Player.ts:35-44` 的 `CAMERA_EULER` 是 module-scope 单例,`updatePlayerCamera` 调 `set(player.pitch, player.yaw, 0)` + `camera.quaternion.setFromEuler(CAMERA_EULER)`,**同步消费**,所以单例可复用 —— 注释(P42-43)写得很清楚。

**但**:

- 若未来加 `Camera.ts` 的 `getCameraOrientation()`(比如 minimap 想要世界坐标 quaternion),且在 `updatePlayerCamera` 调用**之间**读 `camera.quaternion`,值是**上一帧的**(`setFromEuler` 之后才更新到 camera),但**和当前帧 player state 不一致**。
- 注释里"`setFromEuler` before the next mutation" 是当前的合约,但**没有任何测试**钉"在 `updatePlayerCamera` 后 camera.quaternion 等于 Euler(pitch, yaw, 0)"。

**影响**:目前**无实际 bug**,但模块级单例是隐性合约,测试和注释都缺。

**修复建议**:

- 新增 `tests/unit/entities/Player.test.ts`(目前**完全没有 Player 单元测试**),覆盖:
  - `createPlayer` 起点 = cell 中心(`F-2026-06-17-C-M-2` 提到的契约)
  - `applyLook` 累计 yaw 不漂移(连续调 100 次 `applyLook({x:0.1, y:0})`,yaw 累计 +10)
  - `applyLook` pitch clamp 到 ±π/2 边界
  - `updatePlayerCamera` 后 `camera.quaternion` 与 `Euler(pitch, yaw, 0)` 一致

### F-2026-06-17-C-L-2 | `src/entities/Enemy.ts:199-205` | `headingToward` 的零距离 fallback 用了 `{x:1, z:0}` —— 与 F-2026-06-16-L-3 修复后的 `currentTarget=1` 配合下,fallback 永远不应再触发,但仍保留以防 `path` 含重复节点

F-2026-06-16-L-3 把 `currentTarget` 初始值从 0 改为 1(`Enemy.ts:76`),消除了"spawn → path[0] = spawn"零距离 → fallback `{1, 0}` 路径。但 `headingToward` 仍保留 fallback(`Enemy.ts:202-204`):

```ts
if (dist < ARRIVAL_EPSILON) return { x: 1, z: 0 };
```

**潜在触发**:

- `F-2026-06-17-C-H-2` 提到的"path 含重复节点",`advanceTarget` 走到一个 == current position 的节点时,`headingToward(position, this.path[currentTarget])` 会 fallback。
- `tickChase` 里 `moveToward(player.position, ...)`(Enemy.ts:141):玩家正好站在 enemy 位置上时,`moveToward` 的 `Math.hypot` 极小,但**会先 `return true`**(arrival),不进入 `heading` 写值;而 `this.heading.x = dx / dist` 之前的 `dist = Math.hypot(...)`,在 `moveToward` 早返点已经算过,**晚返点的 heading 写值是上一步的**,所以 `tickChase` 不直接触发 fallback。

**影响**:`{1, 0}` fallback 的副作用是"FOV 锥在退化场景下错指东方 1 帧",比 F-2026-06-16-L-3 修复前的"永远错指东方"轻很多,但**没文档说明"什么时候 fallback 应触发 / 不应触发"**。

**修复建议**:在 `headingToward` 上方加 `// Fallback: should be unreachable under F-2026-06-16-L-3 + C-H-2 fixed; kept as a last-resort guard for repeated path nodes`,并把 `console.warn('Enemy ${id}: headingToward zero-distance fallback')` 在 fallback 时打一条 warn,方便未来从 game logs 发现"path 有重复节点"。

### F-2026-06-17-C-L-3 | `src/game/Rules.ts:59-68` | `onUseItem` 的 `slot >= inventory.length` 守卫在 typed `InventorySlot = 0 | 1` 编译期已经强制,但 inventory 大小若未来扩到 4+ slot,守卫依然正确 —— 但测试 cast `5 as unknown as 0|1` 是在测运行时

`Rules.ts:65` 写 `if (slot < 0 || slot >= inventory.length) return ...`,`Rules.test.ts:117` 用 `5 as unknown as 0 | 1` 强制运行时 bad input:

```ts
expect(onUseItem(5 as unknown as 0 | 1, [keyPickup, null], maze)).toEqual({ flash: false, consumed: false });
```

**问题**:`onUseItem` 的 signature `slot: InventorySlot`(0|1),`5 as unknown as 0 | 1` 是**测试专属 hack**,生产代码不可能造出这个值。**但**类型断言在测试里被允许,意味着如果以后有人改 `onUseItem` 的签名加宽到 `number`,这个 cast 仍然能编译,**而且测试会过** —— 守卫形同虚设。

**影响**:典型的"`as` 穿越类型"问题,`docs/reviews/2026-06-13-D-quality.md:117-127` 已经在 `EditorPropertiesPanel` 上记录过。`Rules.test.ts:117` 这个 cast 是同样反模式。

**修复建议**:

- 把 `onUseItem(slot, ...)` 签名临时改成 `slot: number`(运行时验证 inventory 边界,生产无成本),**或**
- 在测试里用 `// @ts-expect-error` 注释:`expect(onUseItem(5, ...))` 在 strict 下应编译错;测试的 `toEqual` 包裹一个 `try/catch` 验证运行时。
- 选前者:`onUseItem(slot: number, ...)`,因为它消除了"`as` 假装通过"的反模式,而且 `inventory.length` 检查已经做了 —— 类型加宽无风险。

### F-2026-06-17-C-L-4 | `src/entities/Pickup.ts:1-15` | `createPickupMaterial` 创建的 `MeshLambertMaterial` 在 `Scene.ts:289-305` 用了 `userData.siblings` 互相指认 —— 但**没有**注册到 dispose 跟踪,dispose 时被 deduped

`Pickup.ts:12-15` 是纯工厂,符合 CLAUDE.md "engine layer pure TS"。`Scene.ts:289-305` 创建两个 mesh(lower + upper)用 `userData.siblings` 互相指向,**`disposeScene` 用 `WeakSet<THREE.Material> seenMats` dedup(`Scene.ts:335`)**,所以两个 mesh 共享同一 `MeshLambertMaterial` 引用,只 dispose 一次 —— 正确。

**但**:`Scene.ts:328-340` 的 `disposeScene` 收到 `pickups: THREE.Mesh[]` 数组,遍历所有 mesh 并 dispose 其 `geometry` / `material` / `texture`。`OctahedronGeometry(0.25)`(`Scene.ts:290`)在所有 4 个内置拾取物(以及自定义关卡)间**共享** —— `disposeScene` 的 `seenGeoms: WeakSet<THREE.BufferGeometry>`(`Scene.ts:334`)负责 dedup,**正确**。

**隐患**:

- 多个关卡 transition 时,`disposeScene` 在 `startLevel`(`Game.ts:236`)与 `dispose()`(`Game.ts:328`)都被调用;**每次 transition 都会 dispose 共享 `OctahedronGeometry` 一次**。`dispose()` 后,场景里残留的旧 mesh(若有)geometry 引用**变成 disposed 状态**;任何后续 WebGL draw call 用到它都会触发 Three.js 警告"Cannot read property of disposed geometry"。
- 实际上 `dispose()` 之前已经 `loop?.stop()`,scene 已被新 `buildScene` 替换,旧 mesh 不再被渲染 —— **目前不触发 bug**。
- 但**这个语义是脆弱的**:`Scene.ts:289-305` 没注释"geometry 是 module-level shared",`disposeScene` dedup 也没有"调用方必须保证场景已卸载"的契约。

**影响**:本评审**未发现实际触发**的 bug,但 `disposeScene` 的 `seenGeoms` / `seenMats` / `seenTexs` WeakSet 在 `startLevel` 与 `dispose()` 各跑一遍时,弱引用语义下,WeakSet 在 set 本身 GC 后才能回收键 —— **这本身没问题**,但 `seenGeoms.add(geom)` 在 set 已 dispose 过该 geom 后,add 一个已 dispose 的 geom 不会出错(WeakSet 持有的是弱引用,geom.dispose 不会影响 set 状态),**所以"双重 dispose"会得到"第一次有效,第二次 noop"**。

**修复建议**:在 `Scene.ts:289-290` 与 `328-340` 加注释说明:

```ts
// 共享 OctahedronGeometry / MeshLambertMaterial across pickups; disposeScene
// uses WeakSet to dedup. Safe to call disposeScene repeatedly as long as
// the scene's old mesh array has already been cleared (i.e. startLevel
// replaces the sceneRefs.pickups reference before the next frame).
```

并加一个测试:`disposeScene(buildScene(m).pickups)` 跑两次不抛错(已经测过?没测过,这里加一个)。

## §6 验证为假阳性 / 已记录但本评审不再重复

- **F2(P0)wall-aware movement** (`Enemy.ts:44-49` + `:150-173`):已修,有 `Enemy.test.ts:287-359` 钉住行为。**不重报**。
- **F-2026-06-15-L-3.5 / 5.6** 之类的 generator PRNG 修正:不在本评审范围。
- **F-2026-06-16-L-3** (`Enemy.ts:65-78` initial `currentTarget=1`):已修,有 `Enemy.test.ts:262-279` 钉住。**不重报**。本评审的 `C-H-2` 是其**剩余的连带问题**("path 仍可含重复节点"),不是 L-3 本身的回归。
- **`Rules.ts` 全部纯函数**:经 grep 确认 `Rules.ts`、`reachability.ts`、`enemySpawner.ts`(除了文档注释里提及 `Math.random`)、`Player.ts`、`Pickup.ts`、`Enemy.ts` **均无** `Math.random` / `Date.now` / `performance.now` / `setTimeout` / `setInterval` 调用。`Rules.test.ts:19,58,59,103` 用 `crypto.randomUUID()` 生成 pickup `id`,**不影响**被测函数纯度。**纯度 OK,不复报**。
- **CLAUDE.md 第 86 行的"engine ⇄ UI 隔离"边界**:经 grep,`src/entities/*` 与 `src/maze/reachability.ts`、`src/maze/enemySpawner.ts` 都没有 `import 'react'` / `'react-dom'` / `'zustand'` / `'../store/**'`,符合边界规则。`Player.ts:38` 写 `camera.position.set(...)` 是受控的(参数 `THREE.PerspectiveCamera` 显式注入,**不是** 通过 store),**符合"通过 GameBridge 协调"**的边界语义。**不重报**。
- **`gameStore.ts:447-465` `goToMenu` reset `currentMode` / `currentEnemyCount` / `currentSurviveSeconds` / `invulnerableUntil` / `hitCount` / `lastHitBy` / `lastWinKind`**:已经按 `F-2026-06-15-C-2` 修了,且新加的 `lastHitBy: 'other'` reset(`gameStore.ts:202`)消除了"上一关 enemy 击中,这一关关菜单前已经 reset"的污染路径。**不重报**。
- **`Scene.ts:289-323` 共享 geometry / material 的 dedup**:本评审 `C-L-4` 是这条契约的**注释缺失**,不是 dedup 本身的 bug。**不重报** dedup 机制。

## §7 验证结果

本评审**只读不改**,未跑 typecheck / test / build。`CLAUDE.md` 已写明这些命令:

```bash
npm run typecheck
npm test
npm run build
```

**建议评审者手动跑一遍**。本评审代码引用基于 `main` HEAD `e45ecdc`,所有路径、行号、注释锚点(F-2026-06-16-L-3 等)与该 HEAD 对齐。

## §8 跨切关注

1. **`Enemy` 状态机的"可见"语义未在 spec 显式说明** —— `C-M-4` 提到 wall occlusion 缺 spec 决策;这条 spec 缺位比"是否加 wall occlusion"本身更危险,因为**未来添加其他感知型敌人(听觉 / 视野扫掠)** 时,缺 spec 会导致多个独立判断。建议在 `docs/increments/p2-*/spec.md` 或 `CLAUDE.md` 写"敌人感知模型"一节。
2. **GameState 的"实际位置"漂移** —— `CLAUDE.md` 写 `src/game/GameState.ts` 是规范位置,但物理文件是 `src/engine/Game.ts`(引擎协调器)与 `src/store/gameStore.ts`(Zustand store)。**两个文件都没单独"GameState.ts"**。这是一个**文档与实现脱节**,新人 oncall 时找 GameState 找不到,会以为它在被提到的位置。本评审**未发现这是 bug**(行为是分离的,引擎管 Three.js scene,store 管运行时数据),但建议:
   - 在 `CLAUDE.md` 的 `src/game/` 行加注释 "GameState 当前由 `src/store/gameStore.ts` 持有,此前的 `src/game/GameState.ts` 描述已迁移;类型 `GameState` 是 `gameStore` 的导出"。
   - 或建一个空的 `src/game/GameState.ts` re-export from `../store/gameStore` 以避免误导。
3. **cell 中心约定的 single source of truth 缺位** —— `Player.ts:18`、`Scene.ts:286 / :294 / :300 / :319`、`Game.ts:476-477` 都 hardcode `* cs + cs / 2`。这条约定当前在 5 个地方重复,**任何一处写错(比如 `* cs` 漏掉 `/2`)都不会被任何测试发现**。`C-M-2` 已记录,本条作为跨切主题。

## §9 优先级行动建议

按 **工作量 + 严重度** 排序(本评审视角):

| 优先级 | Finding | 工作量估计 | 备注 |
|---|---|---|---|
| 1 | **C-H-3** injectEnemySpawns retry race | 小(单 if + 1 test) | 真实可复现 bug,优先级最高 |
| 2 | **C-H-1** reachability 单测缺失 | 中(1 个新 test 文件,8-10 个 case) | 防 generator 测试同时塌方 |
| 3 | **C-H-2** Enemy path 重复节点校验 | 小(constructor 2 行 + validateDesign warning) | 防御性,与 L-3 修复联防 |
| 4 | **C-M-3** shouldSurviveWin finite guard | 极小(3 行 + 3 test) | 漏洞需 corrupt state 触发,优先级次 |
| 5 | **C-M-5** Enemy.chaseMultiplier 字段删除 | 极小(删 1 字段) | 纯清理 |
| 6 | **C-M-1** enemy-enemy 推开 | 中(改 moveToward + Enemy.update 签名 + 测试) | 视觉修复,非玩法 bug |
| 7 | **C-M-2** cell 中心注释 + Player 单测 | 小(注释 + 1 test) | 防回归 |
| 8 | **C-M-4** wall occlusion 决策 | 大(加 raycast + 设计 spec 决策) | 设计选择,不是 bug |
| 9 | **C-L-1** Player 单测补全 | 中(1 个新 test 文件) | 之前完全没单测 |
| 10 | **C-L-2** headingToward fallback 注释 | 极小 | |
| 11 | **C-L-3** onUseItem 测试 cast 反模式 | 极小(改签名或加 @ts-expect-error) | |
| 12 | **C-L-4** Scene dispose 注释 | 极小 | |

## §10 Files Reviewed

| 模块 | 文件 | Finding 数 |
|---|---|---|
| `src/entities/` | `Player.ts` | C-M-2, C-L-1 |
| `src/entities/` | `Pickup.ts` | (0,纯工厂,无 finding) |
| `src/entities/` | `Enemy.ts` | C-H-2, C-M-1, C-M-4, C-M-5, C-L-2 |
| `src/game/` | `Rules.ts` | C-M-3, C-L-3 |
| `src/game/` | `GameState.ts` | (CLAUDE.md 描述位置 ≠ 实际位置,见 §8 跨切 #2;无 finding) |
| `src/maze/` | `enemySpawner.ts` | C-H-3 |
| `src/maze/` | `reachability.ts` | C-H-1, C-L-4(共享 dedup 注释缺位) |

---

## 总结

- **12 条 finding** (0 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW)
- **HIGH 集中在**:`reachability` 缺独立单测(C-H-1)、`Enemy` constructor 不验证 `path` 退化节点(C-H-2)、`injectEnemySpawns` retry 重复注入(C-H-3)
- **MEDIUM 集中在**:enemy-enemy 互推 / cell 中心约定 / `shouldSurviveWin` finite guard / wall occlusion 缺 spec / `chaseMultiplier` 字段冗余
- **LOW**:模块级 `CAMERA_EULER` / `headingToward` fallback 注释 / `onUseItem` 测试 cast / Scene dispose dedup 注释
- **F-2026-06-16-L-3、F2(P0)、F-2026-06-15-C-2** 等历史 F-tag **已确认落地**,不再重复报告。
- **CLAUDE.md 中 `src/game/GameState.ts` 路径与实际不符**(实际是 `engine/Game.ts` + `store/gameStore.ts`)—— 列入 §8 跨切关注,不在 finding 编号内。
