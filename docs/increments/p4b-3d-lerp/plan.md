# P4b 实施计划 (3D Player 0.1s tween — 3D Lerp)

**Slug**: p4b-3d-lerp
**复杂度**: S (半天, 1 session ship)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**依赖**: P4b-Prim (3D Prim 第二算法) ✅ ship
**依赖**: P4b-CellSize (3D 6 档 size) ✅ ship

---

## Task Table (P4b-Lerp)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-lerp/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/engine/Game.ts | UPDATE | `MOVE_3D_TWEEN_SEC = 0.1` module-level const + `active3DTween` 字段 + `tick3DTween(dt)` 私有方法 + `tick3DMovement` 拆分 (tween 跑 / tween 完成 两条路径) + `startLevel` + `dispose` 重置 | [ ] |
| 3 | tests/unit/engine/Game.3D.test.ts | UPDATE | 4 个旧 case 改 tween-aware (单次 update(0.016) 期望 progress,加 update(0.1) 测 complete) | [ ] |
| 4 | tests/unit/engine/Game.3D.tween.test.ts (NEW) | ADD | 6+ case: tween 期间位置 progress / tween 完成 snap / wall reject 不启动 tween / exit 触发 onReachExit / 长按 D 连续 tween / mouse-look 在 tween 期间仍可用 | [ ] |
| 5 | CLAUDE.md | UPDATE | P4b-Lerp 段 (在 P4b-CellSize 段后) | [ ] |
| 6 | docs/roadmap.md | UPDATE | 加 P4b-Lerp 行 + 活跃锚点 | [ ] |
| 7 | spec.md | UPDATE | 状态 in-progress → done | [ ] |
| 8 | Commit + push | — | `feat(p4b): 3D Player 0.1s cell-to-cell tween` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2 (engine)** — Game.ts 改: module-level const + 字段 + tick3DTween + tick3DMovement 拆分 + reset
3. **Task 3 (旧 test 改)** — Game.3D.test.ts 4 case 改 tween-aware
4. **Task 4 (新 test)** — Game.3D.tween.test.ts 6 case 覆盖 tween 行为
5. **集成验证** — typecheck + test + build + Browser E2E
6. **Task 5-7 (docs)** — CLAUDE.md + roadmap + spec
7. **Task 8 (commit + push)** — 独立 ship

## 关键设计点 (Q&A 复盘)

### Q3 内部 gate vs `input.setPaused`

**选 内部 gate**。原因:
- 0.1s 短 tween,mouse-look 锁定反而显得卡 (玩家想看下一格但相机被锁)
- 跟 P3-1 vertical transition 不同:P3-1 是 0.4-0.5s 长时 + 玩家"在楼梯上"不期待自由视角
- 实现更简单:不调 `setPaused`,只在 tick3DMovement 顶部加 1 行 `if (this.active3DTween) { tick3DTween(dt); return; }`

### Q8 新加 `active3DTween` 不复用 P3-1 `activeTransition`

**选 新加**。原因:
- 3D path 在 update() 顶部 short-circuit (`walls3D !== undefined` 检查在 activeTransition 检查之前)
- 3D 玩家 y 是连续值 (0..visualSize*cs),不是 layer index (0..levelCount-1)
- 强行复用 P3-1 playerY / playerLevel 会让代码读起来混乱 (3D 模式下 playerLevel 永远是 0)
- 新字段 `active3DTween` 跟 P3-1 `activeTransition` 同构 (start + end + elapsed + duration),代码风格一致

### Q9 旧 test 改 tween-aware

**必改**。P4a 测试 "按 D 一次 update(0.016) → 玩家到目标格" 是 teleport 期望。Lerp 模式下同样 update(0.016) 玩家只在 16% 进度。改法:
- 旧 4 case 加 `update(0.1)` (tween 完成) 后再断言 final position
- 保留 `update(0.016)` 中间态断言 (验证 progress 不是 0 / 1)
- keyup 时机:每个 cell hop 后必须 `keyup`,否则下一帧立即启动新 tween (旧测试漏 keyup 是因为 teleport 不依赖 input queue,lerp 必须清空 keys set)

## 锁的 contracts (跨 scope)

- `MOVE_3D_TWEEN_SEC = 0.1` 单源锁,改值需 spec 决策
- `active3DTween` 字段只在 Game.ts 内部,3D 状态机唯一 source
- 3D 路径 short-circuit 在 update() 顶部,不会被 2D warningFlash / activeTransition 干扰
- 6 邻居 cell-based collision 在 tween 启动时判一次,tween 中途不重判

## 不在 scope

- ❌ P3-1 vertical transition 不变 (climb/fall 仍 0.4-0.5s)
- ❌ 3D 玩家旋转 / 翻滚 (FPS-style strafe 暂不做)
- ❌ 3D 敌人 AI 路径 (3D enemy 是 P4+ 候选)
- ❌ ease-in-out / ease-out (linear 锁定,Q2 决策)
- ❌ tween cancel mid-flight (起动即 0.1s 走完,不能取消)
- ❌ 3D minimap (P4b-Minimap 下一个 scope)
