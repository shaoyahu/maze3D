# C 域评审 — Entities / Game Rules (post-P2-13, 2026-06-17)

**Slug**: 2026-06-17-C-entities-rules-post-p2-13
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
**前置评审**: [2026-06-17-C-entities-rules(P2-11)](./2026-06-17-C-entities-rules.md)(C 域 12 条 baseline)
**评审方式**: 子代理直接评审(C 域只返回 JSON,本文件由主代理汇总)

---

## §0 范围 & 方法

- **范围**:`src/entities/{Player,Enemy,Pickup}.ts` + `src/game/Rules.ts` + `src/maze/{reachability,enemySpawner,JsonMazeProvider,types}.ts` + `src/store/gameStore.ts` + `src/ui/{WinOverlay,GameOverOverlay,PauseOverlay}.tsx` + i18n resources + `tests/unit/{maze,entities}/**`
- **P2-13 改动清单**(本域相关):
  - `src/ui/WinOverlay.tsx` (+8) — victory 标签键修复
  - P2-11 → P2-13 期间 4 个修复 commit: `74cf371` / `b7707fd` / `2296ef2` / `284d0c1`
- **重点**:核验上轮 12 条 finding 修复状态 + 评审 P2-13 WinOverlay 修复完整性 + 评审 284d0c1 新增测试覆盖深度

---

## §1 总览

| 严重度 | 本次 | 上次(P2-11) | 备注 |
|---|---|---|---|
| CRITICAL | 0 | 0 | — |
| HIGH | 2 | 3 | C-H-1 升级(部分覆盖)+ C-H-2 升级(部分修) |
| MEDIUM | 2 | 5 | C-M-1 shouldSurviveWin finite guard(继承)+ C-M-3 enemySpawner retry 缺单测 |
| LOW | 3 | 4 | C-M-2 GameOverOverlay + HUD 一致性 + C-M-3 pickup.value + C-L-1 chaseSpeed |
| **总计** | **7** | **12** | 净减 5 |

**P2-11 → P2-13 关键修复**:
- C-H-1(上轮):reachability 单测 `284d0c1` 加 6 case 全过,但仍缺空 grid / 非方形 grid 显式断言
- C-H-2(上轮):Enemy path 验证部分修 — validator 层加 duplicate consecutive node 拒绝,但 constructor 层 path[0] 到 spawn 距离仍未做
- C-H-3(上轮):enemySpawner retry 修复 `b7707fd` 在 gameStore + Game 两侧加 handCraftedEnemies filter,修复到位;**测试未补**

---

## §2 上轮 finding 修复状态核验

| ID | 范围 | 修复状态 | 验证 |
|---|---|---|---|
| **F-2026-06-17-C-H-1** | `reachability._isReachable` 无单测 | ⚠ **部分修** | `tests/unit/maze/reachability.test.ts` (`284d0c1` +59 行) 6 case:2x2 全墙 / 3x3 直通 / start==exit / 5x5 厚墙包裹 / start 在墙内 / exit 在墙外。**仍缺**:`walls=[]` / `walls=[[]]` 显式断言 + 非方形 grid(visited 越界 bug 完全没碰) |
| **F-2026-06-17-C-H-2** | `Enemy` constructor 不验证 path 重复节点 / 零距离段 | ⚠ **部分修** | `JsonMazeProvider.ts:344-374` validator 层加 duplicate consecutive node 校验 + path 长度 20 上限 + < 2 nodes console.warn 排除;**Enemy constructor 仍无运行时守卫** |
| **F-2026-06-17-C-H-3** | `enemySpawner.injectEnemySpawns` retry 路径重复叠加 | ⚠ **修复但无单测** | `b7707fd` 在 gameStore:170-179 + Game:282-285 两处加 handCraftedCount filter 防 gen-* 累积;**enemySpawner.test.ts 仍未补 retry 路径测试** |
| **F-2026-06-17-C-M-1** | enemy-enemy 互推(密集 progressive 10 enemy 穿模) | ⚠ **未修(接受 P6 优先级)** | Enemy.update 签名未变,纯视觉;未修合理 |
| **F-2026-06-17-C-M-2** | `createPlayer` 强制 cell 中心与手写 JSON 隐式耦合 | ⚠ **部分修(测试钉契约)** | `Player.test.ts:16-37` 钉住 cell 中心契约 ✓;跨文件注释未加 |
| **F-2026-06-17-C-M-3** | `shouldSurviveWin` 无 finite guard | ❌ **未修** | `Rules.ts:99-101` 仍裸 `return elapsedTime >= surviveSeconds`;P2-13 / P2-11 期间无相关 commit |
| **F-2026-06-17-C-M-4** | `canSeePlayer` 无 wall occlusion | ⚠ **未修(设计决策)** | `Enemy.ts:114-127` 仍只检查 distance + angle;spec 未明确 |
| **F-2026-06-17-C-M-5** | `Enemy.chaseMultiplier` 字段冗余 | ❌ **未修(死代码)** | `Enemy.ts:36` 仍 readonly,`tickChase` 用 `chaseSpeed` |
| **F-2026-06-17-C-L-1** | CAMERA_EULER 测试 | ✅ **已修** | `Player.test.ts:74-115` 覆盖 degenerate fov / 极端 yaw 鲁棒性 + YXZ Euler 形状 |
| **F-2026-06-17-C-L-2** | headingToward fallback 注释 | ❌ **未修** | 纯文档,优先级低 |
| **F-2026-06-17-C-L-3** | onUseItem 强制 cast | ❌ **未修** | 纯风格 |
| **F-2026-06-17-C-L-4** | Scene dispose dedup 契约注释 | ❌ **未修** | 本域范围外(B 域负责) |

---

## §3 本轮新 finding

### C-H-1(HIGH)| `tests/unit/maze/reachability.test.ts:14-58` + `src/maze/reachability.ts:11-13` | reachability 单测 6 case 仍缺 '空 grid' 与 '非方形 grid' 显式断言
- **影响**: 测试文件 6 case 全是 size≥2 的方形 grid。reachability.ts:11-12 写 `if (depth === 0 || width === 0) return false` 但**没有测试钉契约**。非方形 grid 时 BFS visited[k] 用 z*width+x 索引会越界写 — latent bug 完全没测试碰。
- **修复**:
  1. reachability.test.ts 加 3 case: walls=[] / walls=[[]] / walls=[[0,0,0],[0,0]] (非方形)
  2. 非方形 case 当前实现会越界,需先在 reachability.ts 显式 throw 或 expect.toThrow,regression 才能被钉
- **F-tag**: `F-2026-06-17-C-H-1`

### C-H-2(HIGH)| `src/entities/Enemy.ts:51-79` + `src/maze/JsonMazeProvider.ts:344-358` | Enemy constructor 仍未校验 path[0] 到 position 距离 < cellSize/2
- **影响**: 原 H-2 报告列了 3 项修复建议:(a) 校验 path 任意两相邻节点距离 > 0;(b) 校验 path[0] 到 position 距离 < cellSize/2;(c) validateDesign 升级 warning。`284d0c1` 与 `b7707fd` + 早期 commits **只** 在 JsonMazeProvider.parseEnemies 实现了 (a) 的部分(duplicate consecutive node 拒绝),path[0] 到 spawn 的距离校验 (b) 与 (c) 未做。Enemy constructor (Enemy.ts:51-79) 信任外部 spawn,未加任何运行时守卫。
- **修复**:
  ```ts
  // Enemy constructor 末尾
  if (Math.hypot(this.position.x - this.path[0].x, this.position.z - this.path[0].z) > cellSize) {
    throw new Error(`Enemy ${id}: path[0] too far from spawn`);
  }
  ```
  + Enemy.test.ts 配 1 case
- **F-tag**: `F-2026-06-17-C-H-2`

### C-M-1(MEDIUM)| `src/game/Rules.ts:99-101` + `src/store/gameStore.ts:309` | shouldSurviveWin 仍无 finite guard,与 P2-13 `lastWinKind='caught-by-enemy'` 副作用叠加可能让 survive 模式沉默胜利
- **影响**: `currentSurviveSeconds + bonus`(time pickup 路径)若 pickup value 是 corrupt state 进来的 -Infinity,`currentSurviveSeconds = +Infinity` → `elapsedTime >= +Infinity` 永 false → 不胜利;`currentSurviveSeconds = -1`(持久化迁移漏字段)→ `elapsedTime(0) >= -1` true → **第一帧立即胜利**。
- **修复**:
  ```ts
  export function shouldSurviveWin(elapsedTime, surviveSeconds) {
    if (!Number.isFinite(elapsedTime) || !Number.isFinite(surviveSeconds)) return false;
    if (surviveSeconds <= 0) return false;
    return elapsedTime >= surviveSeconds;
  }
  ```
  + Rules.test.ts 加 3 case: NaN / -Infinity / -1 → false
- **F-tag**: `F-2026-06-17-C-M-1`

### C-M-3(MEDIUM)| `src/store/gameStore.ts:170-179` + `src/engine/Game.ts:282-285` + `tests/unit/maze/enemySpawner.test.ts` | enemySpawner retry 修复有 fix 无 test
- **影响**: `b7707fd` 在 gameStore + Game 两侧加 handCraftedEnemies filter 防 gen-* 累积,注释写得很清楚。**但** enemySpawner.test.ts 全文件没有 retry 路径测试,只有单次 injectEnemySpawns 调用。原 H-3 报告明确写'需要新增 enemySpawner.test.ts 的 retry 路径测试'。这条要求**未** 落实。
- **修复**:
  ```ts
  it('second call returns different gen-* ids that overwrite the first batch when caller dedups by id prefix', ...);
  it('caller-merge helper dedups by id prefix when retrying', ...);
  ```
- **F-tag**: `F-2026-06-17-C-H-3`

### C-M-2(LOW)| `src/ui/GameOverOverlay.tsx:16` + `src/ui/HUD.tsx` | P2-13 WinOverlay victory 标签键修复在 Overlays 域内一致,但 GameOverOverlay + HUD 仍走非 i18n 字符串
- **影响**: P2-13 (ad94abe) 修了 WinOverlay 把 'overlays.win.timeUsed' + replace 的 fragile fallback 拆为独立 label-only key。同时 EditorPropertiesPanel + LevelSelect 都用 `Record<VictoryType, string>` 强制覆盖 4 个枚举值。但 `GameOverOverlay.tsx:16` 仍走 mode-conditional ternary,`HUD.tsx` 状态条经 grep 未发现 i18n 调用。
- **修复**: GameOverOverlay 的 title 改成 `Record<VictoryType, string>`,与 WinOverlay 同步;HUD 状态条若使用硬编码字符需做一次 grep 排查
- **F-tag**: `F-2026-06-17-C-M-2`

### C-M-3(LOW)| `tests/unit/maze/levels.test.ts:108-139` + `src/maze/JsonMazeProvider.ts:155-191` | levels.test.ts P2-11 字段断言覆盖 5 字段,但 pickup.value 隐式契约未钉
- **影响**: 284d0c1 加了 P2-11 字段断言 5 个,都是基于 rawObj 上有就 expect data 上也有。但 JsonMazeProvider.normalizePickups 在 158 行 requireNumber pickup.value,160 行检查 pvalue > 0,**没有** 钉'value 必须是有理数'。
- **修复**: levels.test.ts 加 `expect(data.pickups.every(p => Number.isInteger(p.x) && Number.isInteger(p.z))).toBe(true)` 与 `value > 0` 断言,与 walls/start/exit 的 cellSize 契约对称
- **F-tag**: `F-2026-06-17-C-M-3`

### C-L-1(LOW)| `tests/unit/entities/Enemy.test.ts` + `src/entities/Enemy.ts:64-65` | Enemy.test.ts 仍未断言 chaseSpeed === playerSpeed * chaseMultiplier
- **影响**: chaseMultiplier 字段(Enemy.ts:36)仍是 readonly 死代码,没被 tickChase 读。
- **修复**: Enemy.test.ts 顶部 describe 加 `it('chaseSpeed equals playerSpeed * chaseMultiplier')`;或直接删 chaseMultiplier 字段 + 修测试
- **F-tag**: `F-2026-06-17-C-L-1`

---

## §4 P2-13 WinOverlay victory 标签键修复评估

- **commit**: `ad94abe`(P2-13)
- **change**: WinOverlay.tsx +8 / -3 行,把 `t('overlays.win.timeUsed', {time:''}).replace(/[\s\d:]+$/, '').trim() || '用时'` 拆为独立 label-only key `t('overlays.win.timeLabel')` / `t('overlays.win.pickupsLabel')` / `t('overlays.win.bestLabel')`
- **victory keys coverage**:
  - reach-exit: `t('overlays.win.title')` + `t('overlays.win.subtitle')` — 已存在(zh/en:68-69, 55-56)
  - caught-by-enemy: `t('overlays.win.caught.title')` + `t('overlays.win.caught.subtitle')` — 已存在(zh/en:85-86, 72-73)
  - time-trial: 走 `t('overlays.win.title')` 与 caught-by-enemy 的二选一,**没有独立的 time-trial 文案分支**(WinOverlay 第 32 行 `isCaughtByEnemy = winKind === 'caught-by-enemy'`,非 caught-by-enemy 一律走 default '通关!')
  - survive: 同上,没有独立 survive 胜利文案(走 GameOverOverlay 'survived' 路径,见 GameOverOverlay.tsx:20)
- **HUD consistency**: HUD.tsx 经 grep 全文未发现 `t('overlays.win.*')` 调用,状态条文本可能是硬编码数字 / CSS 文本。GameOverOverlay.tsx:16 走 ternary (`isSurvive ? titleSurvive : titleTimeTrial`),与 WinOverlay 的 `Record<VictoryType, string>` 模式不一致。
- **evaluation**: P2-13 修复解决了 WinOverlay 域内的 fragile label 拼装问题,但 (a) 没把 key 模式推广到 GameOverOverlay / HUD;(b) WinOverlay 的 victory 文案分支只覆盖 reach-exit + caught-by-enemy 两种,没考虑 time-trial / survive 直接走 WinOverlay 的场景(spec 边缘 case);(c) EditorPropertiesPanel 的 victory label 已升级 Record 模式,WinOverlay 的 label 仍是 hardcoded ternary。这三处不完全一致。

---

## §5 `284d0c1` 测试覆盖评估

### `tests/unit/maze/reachability.test.ts`(59 行)
- **intended_scope**: 钉住 isReachable 的 BFS 边界条件,5 个 case 目标:空 grid / 厚墙扩展后连通 / start 在墙内 / exit 在墙外 / start==exit
- **actual_coverage**:
  - 2x2 全墙 false ✓ (line 14-17)
  - 3x3 直通 true ✓ (line 19-22)
  - start==exit true ✓ (line 24-27)
  - 5x5 厚墙包裹 true ✓ (line 29-41)
  - start 在墙内 false ✓ (line 43-50)
  - exit 在墙外 false ✓ (line 52-58)
- **gaps**:
  - 空 grid (walls=[] / walls=[[]]) 未覆盖
  - 非方形 grid (walls=[[0,0,0],[0,0]]) 未覆盖,且 reachability.ts:11-12 当前实现会越界
  - 出度 0 isolated cell 未覆盖
  - 端到端 expandThickWall + isReachable 在 15/30/50 size 下输出连通未补
- **verdict**: H-1 报告的 5 项中,2 项 (厚墙 / start 在墙内) 严格覆盖,2 项 (空 / 非方形) 未覆盖,1 项 (端到端 expandThickWall) 未补。覆盖深度不足。

### `tests/unit/entities/Player.test.ts`(126 行)
- **intended_scope**: Player 之前完全无单测,补 7 case
- **actual_coverage**:
  - createPlayer 默认值 + cell center ✓ (line 16-27)
  - cellSize 缩放 ✓ (line 29-37)
  - yaw 360 度环绕 ✓ (line 41-61)
  - pitch 钳位 ✓ (line 63-71)
  - updatePlayerCamera 在 fov 0 / NaN / 极端 yaw 不 throw ✓ (line 75-98)
  - YXZ Euler x/y/z 形状 ✓ (line 100-115)
  - PLAYER_RADIUS === 0.2 ✓ (line 118-126)
- **verdict**: 覆盖度好,达到 Player 单测的 baseline。Gaps 主要是增强型断言,不影响测试可执行性。

### `tests/unit/maze/levels.test.ts` P2-11 字段断言
- **intended_scope**: P2-11 validator 吞字段的 regression 防御
- **actual_coverage**:
  - i18n 在 rawObj 上有 → data.i18n defined ✓ (line 118-120)
  - tutorialSteps 是 array → data.tutorialSteps defined + array ✓ (line 121-124)
  - hideMinimap 是 boolean → data.hideMinimap 严格相等 ✓ (line 125-127)
  - rules.enemyAggression 是 union → data.rules.enemyAggression 严格相等 ✓ (line 128-134)
  - rules.requireAllPickups === true → data.rules.requireAllPickups === true ✓ (line 135-137)
- **verdict**: P2-11 5 字段 coverage 严格。F-2026-06-17-F-CRITICAL-1(原 description: '加字段必须改 validator')的 regression 防御到位。

---

## §6 跨切关注

1. **P2-13 修复了 WinOverlay 域内的 fragile label 拼装**,但 victory key 模式未推广到 GameOverOverlay + HUD,留下不一致。建议下一轮增量统一为 `Record<VictoryType, string>` 模式。
2. **Enemy.chaseMultiplier 字段**在 P2-11~P2-13 期间没被任何 commit 删除或加测试,持续死代码。
3. **reachability.ts:11-12 的 visited 越界 bug** 在非方形 grid 下存在,isReachable 自身的 test 覆盖率仍是 health claim 级别的 — generator 测试 4 个都假设方格 + 算法正确,任何 reachability 越界 bug 会让 4 个 generator 测试同时塌方而无人发现。

---

## §7 Files Reviewed

| 文件 | finding 数 |
|---|---|
| `src/entities/Player.ts` | 0(单测已加) |
| `src/entities/Enemy.ts` | 2 (C-H-2, C-L-1) |
| `src/entities/Pickup.ts` | 0 |
| `src/game/Rules.ts` | 1 (C-M-1) |
| `src/maze/reachability.ts` | 1 (C-H-1 越界 bug) |
| `src/maze/enemySpawner.ts` | 1 (C-M-3 retry 缺单测) |
| `src/maze/JsonMazeProvider.ts` | 0(上轮 C-1 修复到位) |
| `src/store/gameStore.ts` | 0(C-H-3 fix 已落地,只缺单测) |
| `src/ui/WinOverlay.tsx` | 1 (C-M-2 GameOverOverlay 不一致) |
| `src/ui/GameOverOverlay.tsx` | 1 (C-M-2) |
| `src/ui/HUD.tsx` | 0(本评审未确认) |
| `src/i18n/resources/{zh,en}.ts` | 0(WinOverlay 修复完整) |
| `tests/unit/maze/reachability.test.ts` | 1 (C-H-1 缺空 / 非方形) |
| `tests/unit/entities/Player.test.ts` | 0(覆盖好) |
| `tests/unit/maze/levels.test.ts` | 1 (C-M-3 pickup.value 缺契约) |
| `tests/unit/entities/Enemy.test.ts` | 1 (C-L-1 chaseSpeed 缺契约) |
| `tests/unit/maze/enemySpawner.test.ts` | 1 (C-M-3 retry 缺单测) |
| **总计** | **7 (0/2/2/3)** |
