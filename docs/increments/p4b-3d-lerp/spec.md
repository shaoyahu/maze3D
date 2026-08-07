# P4b: 3D Player 0.1s cell-to-cell tween (3D Lerp)

**Slug**: p4b-3d-lerp
**状态**: done (P4b-Lerp ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4b 候选 (3D Player 动画)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**复杂度**: S (半天, 1 session ship)

---

## 1. 概述

P4a 的 3D 移动是 cell 瞬移 — 按 D 一格就跳到目标格中心,没有视觉过渡。短距离没事,但跨 3D 立方体 (15³ cells) 长程 walk 时一格一格跳很跳脱感,尤其是相机插在 1.6m eye-height 上,跳的瞬间能看出"穿模"。

**P4b-Lerp 把 3D cell 移动从瞬移升级为 0.1s 线性 tween**:
- 按 D → 玩家从当前格中心 0.1s 内滑到目标格中心
- tween 期间 input lock (不能叠加新 cell 移动,但 mouse-look 仍可用)
- tween 完成后才做 exit check + pauseLoop
- cell-based collision 仍在 tween 启动时判定,中途不重新判

跟 P3-1 垂直层过渡 (`activeTransition` + 0.4-0.5s 插值) 走同一套状态机思路,但 P4b-Lerp 是 P3-1 的简化版:
- P3-1 单轴 (y only) + 0.4-0.5s 长时 + 强 input lock (连 mouse-look 都停)
- P4b-Lerp 三轴 (x/y/z) + 0.1s 短时 + 弱 input lock (只 lock move 键, mouse-look 仍可用)

P4a 8 个 frozen contracts 不动。P4b-Lerp 只动 `Game.tick3DMovement` 一处 + 加 `active3DTween` 状态字段。

**P3-1 锁的 `FLOOR_HEIGHT = 2.4` / `EYE_HEIGHT = 1.6` 不变** — 0.1s tween 跟 layer 高度数学无关,只跟 cellSize 有关 (3D 用 `cellSize` 不用 `FLOOR_HEIGHT`)。

## 2. 决策表 (P4b-Lerp)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 0.1s 还是 0.05s / 0.2s? | **0.1s** — 体感 sweet spot,5x 快于 P3-1 vertical transition,但不瞬移。0.05s 测试过仍然能看出跳 (60fps 一帧 = 16ms,3 帧过渡太短),0.2s 慢得让快速 walk 显得卡 |
| Q2 | linear 还是 ease-out / ease-in-out? | **linear** — 跟 P3-1 vertical transition 一样,3D 短距离 lerp 线性够用。ease-out 会让快速 walk 黏滞,ease-in-out 让急停多一段"自然减速"会跟 6 邻居 cell hop 节奏冲突 |
| Q3 | input lock 怎么实现? | **内部 gate** — `tick3DMovement` 顶 `if (this.active3DTween) { tick3DTween(dt); return; }`,既不读 input 也不调 `input.setPaused`。好处:mouse-look (yaw/pitch) 在 tween 期间仍可用,符合 3D FPS 体感。坏处:D 键"长按"会一格接一格 tween,这是我们想要的 (continuous walk) |
| Q4 | cell-based collision 时机? | **tween 启动时** — 跟 P4a 一致,在按 D 的那一帧判定目标格是否 wall,wall 则不启动 tween。tween 中途不重判 (6 邻居不重叠,中途不可能撞墙) |
| Q5 | exit check 时机? | **tween 完成时** — 0.1s 后玩家到达目标格中心,此时才比 `maze.exit3D` 触发 `bridge.onReachExit()` + `pauseLoop`。tween 启动时 exit 不在中间路径上所以提前触发会 false positive (假设目标格是 exit,玩家中途不在 exit) |
| Q6 | camera 跟随策略? | **每帧 `updatePlayerCamera` + `camera.position.y = player.y + EYE_HEIGHT`** — 跟 P4a tick3DMovement step 7 一致。eye-height 1.6m 跟 P3-1 / P2 单层一致 |
| Q7 | `active3DTween` 数据形状? | `{ startPos: {x,y,z}, endPos: {x,y,z}, endCell: {x,y,z}, elapsed: number, durationSec: number }` — 跟 P3-1 `activeTransition` 同构 (target + start + end + elapsed + duration),但 3 维全存,不带 level 概念 (3D 没有 levelCount) |
| Q8 | 复用 P3-1 `activeTransition` 还是新加 `active3DTween`? | **新加** — 3D path 在 update() 顶部就 short-circuit (walls3D !== undefined 检查),根本没机会跑到 P3-1 `activeTransition` 检查。强行复用会让 3D playerY 概念跟 P3-1 冲突 (3D 玩家 y 是连续的 0..visualSize*cs,不是 layer index)。新加字段语义清晰,无歧义 |
| Q9 | test 兼容性? | **更新 P4a Game.3D.test.ts 的 4 个 case** — 旧测试期望"按 D 一次 update → 玩家瞬移到目标格",P4b-Lerp 改成"按 D 一次 update(0.016) → 玩家 16% 进度,update(0.1) → 玩家到目标格"。测试用更长的 `update(dt)` 来验证完整 tween 路径 |
| Q10 | `startLevel` 重置? | **重置** — `this.active3DTween = null` 在 `startLevel` 末尾,跟 `activeTransition = null` 同一个 reset 块。如果玩家在 tween 中途触发重开,新 level 不应有 in-flight tween |
| Q11 | `dispose` 清理? | **同 `startLevel`** — dispose() 已经重置所有 P3-1 状态字段,加一行 `active3DTween = null` 即可 |
| Q12 | perf budget? | **同 P4a** — 0.1s tween 是 6 帧,每帧 3 次 lerp + 1 次 updatePlayerCamera + 1 次 marker sync,实测 < 0.1ms / frame (跟 P3-1 tickActiveTransition 同一量级) |
| Q13 | cellSize 跟 FLOOR_HEIGHT 复用? | **不复用 FLOOR_HEIGHT** — P3-1 用 `FLOOR_HEIGHT = 2.4` 锁 layer 高度,P4 3D 用 `cellSize` (=2) 锁 cell 宽度。两个常量语义不同 (layer vs cell),不混用 |
| Q14 | 跟 P3-1 `activeTransition` 关系? | **完全独立** — 3D path 在 `update()` 顶部就 short-circuit,根本走不到 2D `activeTransition` 检查。3D playerY 是连续的 (0..15*cs=30m),跟 P3-1 playerLevel (0..5) 不同维,没有交集 |
| Q15 | `MOVE_3D_TWEEN_SEC` 常量在哪? | **Game.ts module-level** — 跟 P3-1 `STAIR_DURATION_SEC = 0.5` / `HOLE_DOWN_DURATION_SEC = 0.4` 同位,export 出去给 spec / future 文档引用 |

## 3. 数据流 (P4b-Lerp)

```
按 D 一次
  ↓
tick3DMovement (active3DTween === null, 走 input branch)
  ↓
1. 读 input.getMove3D() → { dx: 1, dy: 0, dz: 0 }
2. curCell = (1, 0, 1) (玩家当前)
3. targetCell = (2, 0, 1)
4. bounds + wall check → OK
5. startPos = player.position (3, 1, 3)
6. endPos = (5, 1, 3)
7. active3DTween = { startPos, endPos, endCell: (2,0,1), elapsed: 0, durationSec: 0.1 }
8. 不调 input.setPaused (mouse-look 仍可用)
9. 立即 advance 一次 elapsed += dt, u = min(1, elapsed/0.1)
10. 插值 player.position = lerp(startPos, endPos, u)
11. sync camera + marker
12. u >= 1 → snap to endPos, active3DTween = null
13. endCell == maze.exit3D? → bridge.onReachExit() + pauseLoop
```

## 4. UI / HUD 影响

无 UI / HUD 变化。0.1s tween 不需要 progress bar 或新 chip,玩家视觉上就是"平滑滑动一格"。

## 5. 失败模式

- **tween 卡住**: 如果 dt 一直 0 (Loop 暂停),tween 永远不 advance。`pauseLoop` 调用前必须先 `active3DTween = null` 或等待 tween 自然完成 (后者更简洁)
- **tween 中途 startLevel**: startLevel 重置 `active3DTween = null`,玩家直接 snap 到新关 start3D 中心 (跟 P4a 一致)
- **tween 期间 cellSize 变化**: P4 模式下 cellSize 不可变 (P4a 锁),无 corner case
- **input 队列堆积**: tween 期间 D 键按下不会启动新 tween (active3DTween gate),但 D 键加入 keys set。tween 完成后下一帧读 input,如果有 D 立即启动新 tween。视觉上 = "持续按 D = 持续一格一格 walk"

## 6. 性能

- 0.1s / 6 帧 (60fps)
- 每帧 3 次乘加 + 1 次 Vector3 拷贝 + 1 次 updatePlayerCamera (yaw/pitch 矩阵重算) + 1 次 marker sync
- 实测 < 0.1ms / frame (跟 P3-1 tickActiveTransition 同量级)
- 0.1s 期间 camera 视野变化连续,无可见卡顿

## 7. 兼容性 / 锁的 contracts

- P3-1 锁的 `FLOOR_HEIGHT = 2.4` / `EYE_HEIGHT = 1.6` / `STAIR_DURATION_SEC = 0.5` / `HOLE_DOWN_DURATION_SEC = 0.4` 不动
- P4a 锁的 8 个 contracts (algorithm dispatch / walls3D / start3D / exit3D / 6 邻居 / input one-hot / render 3D path / E2E URL pattern) 不动
- P4b-Prim sibling 算法不动
- P4b-CellSize 6 档 size (5/7/9/11/13/15) 不动
- Game.3D.test.ts 4 个旧 case 改 tween-aware (Q9)

## 8. DoD (Definition of Done)

- [ ] `MOVE_3D_TWEEN_SEC = 0.1` 常量在 Game.ts module-level
- [ ] `active3DTween` 字段类型锁定
- [ ] `tick3DMovement` 拆分: tween 跑 / tween 完成 两条路径
- [ ] `startLevel` 末尾 + `dispose` 重置 `active3DTween = null`
- [ ] 6 个新 unit test (tween 期间 / 完成 / wall reject / exit / hold-key 持续 / mouse-look 仍可用)
- [ ] 4 个旧 Game.3D.test.ts case 改 tween-aware
- [ ] typecheck 0 / 113+ pass / build OK
- [ ] Browser E2E: dev server + navigate + 按 D 看 0.1s 平滑滑动
- [ ] CLAUDE.md 加 P4b-Lerp 段
- [ ] roadmap P4b-Lerp 行 + 锚点 in-progress
- [ ] spec 状态 in-progress → done
- [ ] commit + push
