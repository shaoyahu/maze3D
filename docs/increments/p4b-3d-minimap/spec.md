# P4b: 3D top-down minimap (3D Minimap)

**Slug**: p4b-3d-minimap
**状态**: done (P4b-Minimap ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4b 候选 (3D minimap)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**依赖**: P4b-Lerp (3D Player tween) ✅ ship
**复杂度**: M (半天-1 天, 1 session ship)

---

## 1. 概述

P4a 的 3D 体素迷宫右上角放的是 P2-era 通用 2D minimap 组件,渲染的是 2D `maze.walls` 网格 (3D 关卡里 `walls = []` 所以啥都不画),只显示一个静态空背景和"绿点"view-cone。玩家在 15³ 立方体里走动时完全没有任何空间提示 — 不知道自己在哪一层,不知道出口在哪,不知道走过哪些格。

**P4b-Minimap 把 minimap 升级为 3D-aware**:
- 3D 关卡渲染当前 y-layer 的 2D 顶视图 (`walls3D[yCell][z][x]`)
- 玩家 y 变化时自动切换到新 y-layer
- 显示 y-level 标签 (L1/L15)
- 出口标记只在出口位于当前 y-layer 时显示,否则在玩家位置旁显示方向提示
- visited cells 按 y-layer 记录 (复用 P3-1 `recordVisit` 机制,level = yCell)

跟 2D minimap 复用 95% 代码 — 只是 `maze.walls` 替换为 `maze.walls3D[yCell]`,并加 y-level 跟踪。原有的 2D minimap 路径完全不动 (P2-21 教学关、P3-1 堆叠层、P3-2 hole-down 都不受影响)。

P4a/P4b-Lerp 锁的 contracts 不动。P4b-Minimap 只动 `src/engine/Game.ts` (加 `getPlayerY` accessor + `tick3DTween` 加 `recordVisit`)+ `src/ui/components/Minimap.tsx` (3D dispatch)。

**P3-1 锁的 `currentLevel` 不复用为 y-cell** — `currentLevel` 语义是 2D 垂直层 (used by per-layer wall cache, exit check on different layer),3D y-cell 是完全独立的维度 (used by 3D walls projection)。强行复用让代码语义混乱。P4b-Minimap 用 `getPlayerY()` 单独取 y,跟 `getPlayerPosition()` 同一组 accessor。

## 2. 决策表 (P4b-Minimap)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 3D minimap 渲染什么? | **当前 y-layer 2D 顶视图** — `walls3D[yCell][z][x]` 投影到 minimap。跟 2D minimap 100% 同构,只是数据源换成 3D 数组的 y-slice |
| Q2 | 3D 全景 minimap (15×15 三层堆叠) 还是单层顶视图? | **单层顶视图** — 3D 全景需要 orthographic projection,SVG 实现复杂且对 120×120 容器太密;单层 + y-level 标签已经能让玩家定位。3D 全景是 P4c+ 候选 (跟 P4c+ InstancedMesh / octree culling 一起做) |
| Q3 | y-cell 怎么取? | **`Math.floor(player.position.y / cellSize)`** — 跟 2D 路径的 `Math.floor(player.position.x / cs)` 同方法,语义一致。tween 中间态 (y 不在格中心) 用 floor 不会瞬移 — 跨越格边界时 floor 自然翻下一格 |
| Q4 | y-level 跟踪机制? | **复用 10Hz polling** — `useTickRef` 已经每 100ms 抓一次 player pos,加 `y` 到 `PlayerSnapshot` + 加 y delta 到 `snapshotsEqual` 早出条件即可。tween 完成时 y 翻格,下次 poll 触发 minimap 重渲染 |
| Q5 | visited cells 3D 怎么记? | **复用 P3-1 `recordVisit(parchment, level, x, z)`** — 在 `tick3DTween` 完成时调一次,`level = Math.floor(y / cs)`。数据 shape 完全相同 (`Map<level, Set<"x,z">>`),2D 跟 3D 互斥 (一个 maze 不会同时有 walls 和 walls3D) |
| Q6 | y-level 标签怎么显示? | **minimap 容器右上角小文字 "L{n}/{total}"** — 15px 等宽字体,`var(--accent)` 色。跟 HUD `LevelIndicator` chip 风格一致 (单字符 L + 数字),但 HUD 的 chip 留给 P4b+ (那个 scope 要改 LevelIndicator 内部 dispatch 2D/3D) |
| Q7 | 出口不在当前 y-layer 时怎么显示? | **玩家位置旁方向提示** — 出口 y > 当前 y 显示 "↑ exit",出口 y < 当前 y 显示 "↓ exit",出口 y === 当前 y 在 minimap 中心正常标记。P3-1 2D 不会发生 (出口永远在当前 layer) |
| Q8 | minimap 容器大小? | **120×120 保持** — 跟 P2-3 锁的尺寸一致。3D 关卡 visualSize=15 时每个 cell 8px,visualSize=5 时 24px (略大但仍可读) |
| Q9 | minimap 颜色 palette? | **复用 2D palette** — `COLOR_WALL` / `COLOR_PATH` / `COLOR_EXIT` / `COLOR_VISITED` 全部沿用。3D 跟 2D 视觉一致,玩家无需重新学习 |
| Q10 | 性能影响? | **单层顶视图的 rect 数 ≤ visualSize²** — visualSize=15 = 225 rect,visualSize=5 = 25 rect。跟 2D 50×50 minimap (2500 rect) 比小一个数量级。`StaticMaze` 已 memo,player y 翻格触发 minimap 重渲染即可 |
| Q11 | `getPlayerY` 跟 `getPlayerPosition` 关系? | **新加独立 accessor** — 跟 `getPlayerPosition()` 平行 API,返回 `this.player?.position.y ?? 0`。`getPlayerPosition` 仍只返 `{x, z}` (2D minimap 消费者期望这个 shape),3D minimap 单独调 `getPlayerY` |
| Q12 | `recordVisit` 在 3D path 调时机? | **tween 完成时** — 跟 2D path `recordVisit` 在 cell-mismatch check 之后的时机一致。3D 玩家每完成一次 cell hop 调一次,把新 (x, z) cell 加入当前 y-layer 的 visited set |
| Q13 | `recordVisit` 在 2D path 兼容性? | **完全不动** — 2D path 仍调 `recordVisit(parchment, playerLevel, cellX, cellZ)`,P3-1 行为不变 |
| Q14 | 方向提示位置? | **玩家 arrow 下方 1.5 cell** — minimap SVG `<text>` 元素,跟 arrow 一起 transform。视觉上紧贴玩家位置,不影响 y-layer 顶视图 |
| Q15 | test 兼容性? | **既有 2D minimap test 不动** — P2-16/P3-1 的 visited/per-layer test 仍跑得通。P4b-Minimap 新加 3D test 覆盖: y-cell 切换 / off-layer exit 提示 / 3D recordVisit 跟 2D 互斥 |

## 3. 数据流 (P4b-Minimap)

```
启动 3D 关卡
  ↓
minimap mount,is3D = maze.walls3D !== undefined
  ↓
useTickRef 每 100ms poll:
  pos = game.getPlayerPosition() → {x, z}
  y   = game.getPlayerY() → number
  yaw = game.getPlayerYaw()
  fov = game.getCameraFov()
  ↓
  yCell = Math.floor(y / cellSize)
  early-out: x/z/yaw/fov/y 全部没变 → skip setTick
  ↓
  否则 setTick → minimap 重渲染
  ↓
  StaticMaze3D: 渲染 walls3D[yCell] 的 (z, x) 二维数组
  ExitIndicator3D: 
    - 出口 y === yCell → 在 (exitX, exitZ) 画 COLOR_EXIT rect
    - 出口 y > yCell → 玩家 arrow 下方画 "↑ exit"
    - 出口 y < yCell → 玩家 arrow 下方画 "↓ exit"
  VisitedCells: 渲染 visitedMap.get(yCell) 的 (x, z) rect 集合
  YLevelLabel: 容器右上角 "L{n}/{total}"
  PlayerArrow + ViewCone: 跟 2D 一样,position 算 (x/cs, z/cs)
```

tween 完成时:
```
tick3DTween 完成 (u >= 1):
  ↓
  recordVisit(parchment, yCell, endCell.x, endCell.z)
  - 跟 2D 路径 recordVisit(parchment, playerLevel, cellX, cellZ) 同接口
  - parchment.visitedCells.get(yCell) 加一个 "x,z" key
  - 引用相等时返回原 state (无重渲染)
  ↓
  exit3D check (P4b-Lerp 已加):
  ↓
  onReachExit() + pauseLoop()
```

## 4. UI / HUD 影响

- **Minimap 容器右上角小文字 "L1/15"** — 跟现有 minimap 同位置,不占额外空间
- **Player arrow 下方方向提示** — 出口在别的 y-layer 时显示
- **HUD `LevelIndicator` chip 不动** — 仍显示 2D layer (3D 模式下永远是 0 → "L1")。修 chip 是 P4b+ 单独 scope (要 dispatch 2D/3D)
- 玩家按键、移动、出血、暂停等交互完全不变

## 5. 失败模式

- **y 跨格时 minimap 闪**: tween 中 y 跨格边界 (e.g. y 从 1.99 → 2.01),`Math.floor(y/cs)` 翻下一格,minimap 重渲染。10Hz poll 抓一次后稳定下来,玩家视觉上感受不到。极端情况 (60Hz 大 y delta) 也不影响正确性
- **`getPlayerY` 在 player 没创建时**: 返回 0 跟 `getPlayerPosition` 返 null 一致;消费者做 null check
- **3D 关卡 `walls3D` 缺失** (手写 3D JSON 漏字段): 不可能 — `AlgorithmMazeProvider.load3D` 必填,`JsonMazeProvider` 验证器拒绝
- **visited cells 跟 2D 互斥**: 2D 跟 3D maze 互斥 (一个 maze 不会同时有 walls 和 walls3D),`parchment.visitedCells` map 在一个关卡生命周期内只被一种逻辑写,不会冲突
- **minimap container overflow**: 出口方向提示文字 "↑ exit" 长度 6 字符,在 120×120 容器内,玩家 arrow 下方 1.5 cell ≈ 12px 位置,SVG 文字基线 0.5 字号,完全在容器内

## 6. 性能

- 3D minimap 重渲染触发:player y 翻格 (e.g. visualSize=15 时 ≤ 15 次/min,频繁 walk 触发 1-2 次/sec)
- 单次重渲染: ≤ 225 rect (walls) + ≤ 225 rect (visited) + 1 polygon (cone) + 1 polygon (arrow) + 1 text (y label) = 跟 2D 50×50 minimap 同数量级,远低于 60fps budget
- 10Hz poll 的 early-out 加 y delta 后仍 work:player 静止时 poll 抓 5 个字段全等 → skip setTick → 不触发 React 重渲染

## 7. 兼容性 / 锁的 contracts

- P2-3 锁的 2D minimap container 120×120 + palette 颜色 + 玩家 arrow + view cone 不动
- P2-16 锁的 `parchment.visitedCells` shape (`Map<level, Set<"x,z">>`) 不动,3D 复用同 shape
- P3-1 锁的 `currentLevel` 语义 (2D layer index) 不动,3D y-cell 走独立 `getPlayerY` accessor
- P3-1 锁的 minimap auto-switch layer (per-layer visited cells) 不动,3D 复用同机制
- P4a 锁的 8 个 contracts 不动
- P4b-Prim sibling 算法不动
- P4b-CellSize 6 档 size 不动
- P4b-Lerp `MOVE_3D_TWEEN_SEC` / `active3DTween` 字段不动
- P4b-Minimap 不动 HUD `LevelIndicator` (3D 仍显示 "L1",P4b+ scope)

## 8. DoD (Definition of Done)

- [ ] `Game.getPlayerY()` accessor (跟 `getPlayerPosition` 平行)
- [ ] `tick3DTween` 完成时调 `recordVisit(parchment, yCell, endCell.x, endCell.z)`
- [ ] `PlayerSnapshot` 加 `y` 字段
- [ ] `snapshotsEqual` 加 y delta 早出条件
- [ ] `Minimap` 内部 is3D dispatch (`maze.walls3D !== undefined`)
- [ ] 3D path 渲染 `walls3D[yCell]` (新增 `StaticMaze3D` 组件,跟 2D `StaticMaze` 同结构)
- [ ] 3D path 出口指示 dispatch:同层 → COLOR_EXIT rect;off-layer → "↑/↓ exit" 文字
- [ ] 3D path visited cells 用 `visitedMap.get(yCell)` (跟 2D `currentLevel` 同形)
- [ ] 3D path "L{n}/{total}" 标签 (右上角)
- [ ] 5+ 新 unit test (is3D dispatch / y-cell 切换 / off-layer exit / recordVisit 互斥 / 出口同层显示)
- [ ] typecheck 0 / 113+ pass / build OK
- [ ] Browser E2E: dev server + navigate 3D cube + 验证 y-layer 切换 + 出口 off-layer 提示
- [ ] CLAUDE.md 加 P4b-Minimap 段
- [ ] roadmap P4b-Minimap 行 + 活跃锚点
- [ ] spec 状态 in-progress → done
- [ ] commit + push
