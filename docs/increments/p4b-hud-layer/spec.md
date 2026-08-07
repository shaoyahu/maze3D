# P4b: HUD LevelIndicator 2D/3D dispatch (P4b-HudLayer)

**Slug**: p4b-hud-layer
**状态**: done (P4b-HudLayer ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4+ 候选 (HUD LevelIndicator dispatch 2D/3D)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**依赖**: P4b-Lerp (3D Player tween) ✅ ship
**依赖**: P4b-Minimap (3D top-down minimap) ✅ ship
**复杂度**: S (1-2 hour ship)

---

## 1. 概述

P4a 落地了 3D 体素迷宫但 HUD `LevelIndicator` chip 永远显示 "L1" — 因为 3D 玩家不走 P3-1 `activeTransition` 路径,`player.currentLevel` 永远是 0,chip 就成了 "L1" (1-indexed display)。玩家在 visualSize=15 的 3D cube 里爬到 layer 8,chip 还显示 "L1",完全错位。

**P4b-HudLayer 修这个 bug**: 在 3D 路径里把 y-cell 推到 `player.currentLevel` store field,让 HUD chip 显示 "L8/15" 跟 minimap 的 "L8/15" 标签一致。

设计思路 (S 复杂度收尾):

- 复用 P3-1 `bridge.onLevelChange(level)` callback 推 y-cell
  - 2D 路径: `tickActiveTransition` 完成时推 vertical layer (P3-1 行为)
  - 3D 路径: `tick3DTween` 完成时推 y-cell (新加)
- 同一个 callback 同时服务 2D 跟 3D — 因为 2D 跟 3D 路径在 `update()` 顶部 short-circuit 互斥,callback 永远不会在同一 session 里收到两种值
- HUD chip 不动 (P3-1 已经有 `useGameStore.player.currentLevel` → `L{currentLevel + 1}` 的 display 逻辑)
- 2D minimap 不动 (用 `currentLevel` 渲染 P3-1 stacked layers)
- 3D minimap 不动 (用 `getPlayerY()` 算 yCell,忽略 `currentLevel`)
- `startLevel` 3D path 也推一次 (跟 P3-1 一致:level start 时 push 一次,transition 完成时再 push)

复用 vs 新加 bridge callback 的决策: P3-1 的 `onLevelChange` 语义就是 "current visible layer index",2D 跟 3D 都符合这个语义 (2D 是 vertical layer 0..N-1,3D 是 y-cell 0..visualSize-1),复用最干净。新加 `onYCellChange` 会让 bridge API 变胖,而且 P3-1 跟 3D 永远不并发。

## 2. 决策表 (P4b-HudLayer)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 复用 `bridge.onLevelChange` 还是新加 `onYCellChange`? | **复用** — `onLevelChange` 语义 = "current visible layer index",2D 跟 3D 都符合 |
| Q2 | 3D 推 y-cell 时机? | **tween 完成时** — 跟 2D `tickActiveTransition` 完成时推 vertical layer 一致。tween 中间态 y 不稳定,floor 算 yCell 可能跨格,完成时再算稳定 |
| Q3 | `startLevel` 3D path 是否也推一次? | **是** — 跟 P3-1 一致,level start 时 push 一次,避免 chip 在 level 加载第一帧显示 "L1" 而不是正确的初始 y-cell |
| Q4 | HUD chip display 改不改? | **不改** — `L{currentLevel + 1}` 的 1-indexed display 已经正确,只要 store value 对了 chip 自动对 |
| Q5 | 3D minimap 跟 minimap-y-level 标签需要同步吗? | **不需要新代码** — 3D minimap 用 `getPlayerY()` 算 yCell,跟 store `currentLevel` 独立。两边都从同一个 engine state (`player.position.y`) 派生,自然同步 |
| Q6 | 2D 行为受影响吗? | **完全不受影响** — 2D path 走 `tickActiveTransition` 推 `playerLevel`,3D path 走 `tick3DTween` 推 yCell,两路径在 `update()` 顶部 short-circuit 互斥 |
| Q7 | `this.playerLevel` 3D 路径要存 yCell 吗? | **不要** — `this.playerLevel` 字段是 2D vertical layer index,3D 不该污染它。3D 通过 `bridge.onLevelChange(yCell)` 单独推,engine 内部用 `player.position.y / cs` 算 yCell (跟 minimap 一致) |
| Q8 | 玩家静止时 chip 闪吗? | **不会** — tween 完成时才推,静止时 `active3DTween = null`,不会有 push。`setCurrentLevel` store setter 还做了 no-op guard (值不变不触发 React 重渲染) |
| Q9 | HUD chip 视觉变化? | 3D 模式 chip 文字从 "L1" 变成 "L{n}/L{total}" 还是只 "L{n}"? | **只 "L{n}"** — 跟 P3-1 一致 (单层模式不显示 total)。visualSize=15 时玩家看到 "L1" 到 "L15"。P4b+ scope 可以加 total 后缀,不在本 scope |
| Q10 | 出口 check / exit3D 受影响吗? | **不受影响** — 出口 check 走 `maze.exit3D` (3D 路径) 跟 `maze.exit.level` (2D 路径),跟 `currentLevel` 完全独立 |
| Q11 | 多 `recordVisit` 受影响吗? | **不受影响** — `recordVisit(parchment, level, x, z)` 内部 level 字段在 2D 跟 3D 路径都已经用对了 (2D 用 `this.playerLevel`,3D 用 yCell) |
| Q12 | test 兼容性? | 既有 2D test 全部不动 (currentLevel 走 P3-1 路径不变)。新加 3D test 覆盖: tick3DTween 完成时推 yCell / startLevel 3D path 推初始 yCell / HUD chip 渲染正确 (集成 test) |

## 3. 数据流 (P4b-HudLayer)

```
启动 3D 关卡 (visualSize=15)
  ↓
startLevel(maze):
  - this.playerLevel = 0 (P3-1 字段,3D 不用)
  - bridge.onLevelChange?.(injectedMaze.start3D.y)  ← 新加
  - 初始 yCell = 0 (start3D = {x:1, y:0, z:1}),store 收到
  - HUD chip 显示 "L1",minimap 显示 "L1/15"
  ↓
玩家按 Space (y+)
  ↓
tick3DMovement 启动 active3DTween
  ↓
0.1s tween 完成
  ↓
tick3DTween:
  - recordVisit(parchment, yCell, endCell.x, endCell.z)  ← P4b-Minimap 已有
  - endPos.y 现在 = 3,cs = 2 → yCell = 1
  - this.bridge.onLevelChange?.(yCell)  ← 新加 (1)
  ↓
GameCanvas 的 bridge.onLevelChange 处理器:
  - useGameStore.getState().setCurrentLevel(1)  ← P3-1 已有
  - store: player.currentLevel = 1
  ↓
HUD LevelIndicator:
  - 订阅 s.player.currentLevel
  - 重渲染,显示 "L2"  (1-indexed: 1+1=2)
  ↓
3D minimap (P4b-Minimap 已有):
  - 用 getPlayerY() 算 yCell = 1
  - 标签更新 "L2/15"
```

(1) tick3DTween 完成时跟 P3-1 tickActiveTransition 完成时对称。两个路径的 yCell 推 y 都是 fire-and-forget,store setter 的 no-op guard 防止 React 重复渲染。

## 4. UI / HUD 影响

- HUD `LevelIndicator` chip: 3D 模式从 "L1" (永远) 变成 "L1" → "L2" → ... → "L15" (跟玩家实际 y-cell 同步)
- 1-indexed display 跟 P3-1 一致 (L{n} = layer {n-1})
- 2D 模式 chip 行为完全不变
- 3D minimap 标签 (P4b-Minimap) 同步更新 (独立派生,自动同步)
- 玩家无感,只是 chip 不再永远是 "L1"

## 5. 失败模式

- **tween 跨格时 chip 闪**: y 跨格边界时 `Math.floor(y / cs)` 翻下一格,store 收到新 yCell,HUD 重渲染。视觉上玩家看到 chip 跳一格 (e.g. "L3" → "L4")。这是正确行为,不是 bug
- **`setCurrentLevel` 重复 push**: store setter 内部有 no-op guard (`s.player?.currentLevel === level ? s : ...`),值不变不触发 React 重渲染
- **2D 跟 3D 同时推**: 不可能发生 — 2D 跟 3D 路径在 `update()` 顶部 `walls3D !== undefined` 检查互斥,`bridge.onLevelChange` 永远不会在同一 session 收到两种值
- **手写 3D JSON 漏 `start3D`**: 不会发生,`JsonMazeProvider` 验证器要求 3D 关卡必须填 `start3D`
- **3D 关卡 `start3D.y` 越界**: 不可能,`AlgorithmMazeProvider.load3D` 选 start/exit 时已经 BFS reachability 验证

## 6. 性能

- `setCurrentLevel` store setter 内部 no-op guard,只有 y-cell 实际变化时触发 React 重渲染
- 玩家快速 walk (Space 连续按) 时,每次 tween 完成都推一次 yCell,setter 触发 HUD chip 重渲染 (小组件,单次 render < 1ms)
- 玩家静止时 tween 不启动,不推 yCell,不重渲染
- 跟 P3-1 transition 触发 onLevelChange 性能完全对称

## 7. 兼容性 / 锁的 contracts

- P3-1 锁的 `bridge.onLevelChange(level)` 签名 + 语义 (current visible layer) 不动
- P3-1 锁的 `useGameStore.setCurrentLevel` 行为不变
- P3-1 锁的 HUD `LevelIndicator` chip 渲染逻辑 (1-indexed display) 不动
- P4a 锁的 8 个 contracts 不动
- P4b-Lerp 锁的 `tick3DTween` 完成路径 (recordVisit / exit check / snap) 不动,只加一行 `onLevelChange` push
- P4b-Minimap 锁的 y-level 标签 + off-layer exit hint 不动,3D minimap 用 `getPlayerY()` 独立派生
- 2D 行为完全不变 (P3-1 路径 push `playerLevel`,3D 路径 push yCell,互斥)

## 8. DoD (Definition of Done)

- [ ] `tick3DTween` 完成时 `bridge.onLevelChange?.(yCell)` 推送
- [ ] `startLevel` 3D path 初始 `bridge.onLevelChange?.(start3D.y)` 推送
- [ ] 2D 路径完全不动 (既有 P3-1 行为)
- [ ] 3+ 新 unit test: tick3DTween push / startLevel 3D push / store setter 互斥 no-op
- [ ] 1 integration test: HUD chip 渲染正确 y-cell (可选,如果 testing-library 集成可行)
- [ ] typecheck 0 / 1738+ pass / build OK
- [ ] Browser E2E: dev server + 3D cube + 按 Space 验证 chip 变化
- [ ] CLAUDE.md 加 P4b-HudLayer 段
- [ ] roadmap P4b-HudLayer 行 + 活跃锚点
- [ ] spec 状态 in-progress → done
- [ ] commit + push
