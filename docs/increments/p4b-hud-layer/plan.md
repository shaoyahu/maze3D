# P4b 实施计划 (HUD LevelIndicator 2D/3D dispatch)

**Slug**: p4b-hud-layer
**复杂度**: S (1-2 hour ship)
**依赖**: P4a + P4b-Lerp + P4b-Minimap 全部 ✅

---

## Task Table (P4b-HudLayer)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-hud-layer/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/engine/Game.ts | UPDATE | `tick3DTween` 完成时 `bridge.onLevelChange?.(yCell)` 推送 + `startLevel` 3D path 初始 push | [ ] |
| 3 | tests/unit/engine/Game.3D.tween.test.ts (UPDATE) | UPDATE | 加 1 case: tick3DTween 完成时 fire onLevelChange(yCell) | [ ] |
| 4 | tests/unit/engine/Game.startLevel.test.ts (UPDATE) or new | UPDATE or ADD | 1 case: startLevel 3D path fire onLevelChange(start3D.y) | [ ] |
| 5 | CLAUDE.md | UPDATE | P4b-HudLayer 段 (在 P4b-Minimap 段后) | [ ] |
| 6 | docs/roadmap.md | UPDATE | 加 P4b-HudLayer 行 + 活跃锚点 | [ ] |
| 7 | spec.md | UPDATE | 状态 in-progress → done | [ ] |
| 8 | Commit + push | — | `feat(p4b): HUD LevelIndicator 2D/3D dispatch` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2 (engine push)** — Game.ts tick3DTween + startLevel 3D path 2 行 push
3. **Task 3-4 (test)** — 2 unit test 加 recordVisit / onLevelChange push
4. **集成验证** — typecheck + test + build + Browser E2E
5. **Task 5-7 (docs)** — CLAUDE.md + roadmap + spec
6. **Task 8 (commit + push)** — 独立 ship

## 关键设计点 (Q&A 复盘)

### Q1 复用 onLevelChange 不新加 onYCellChange

**选 复用**。原因:
- `onLevelChange` 语义就是 "current visible layer index",2D 是 vertical layer 0..N-1,3D 是 y-cell 0..visualSize-1
- 2D 跟 3D 路径在 `update()` 顶部 short-circuit 互斥,callback 永远不会在同一 session 收到两种值
- 新加 `onYCellChange` 会让 bridge API 变胖,而且消费者 (`useGameStore.setCurrentLevel` + HUD chip) 已经能正确处理任意 0-indexed 整数
- 改动最小:只加 2 行 push

### Q2 推 y-cell 时机

**选 tween 完成时**。原因:
- 跟 2D `tickActiveTransition` 完成时推 vertical layer 完全对称
- tween 中间态 y 不稳定,`Math.floor(y / cs)` 可能跨格,完成时再算稳定
- 1 次 0.1s tween = 1 次 push,跟 1 次 0.4-0.5s P3-1 transition = 1 次 push 性能对称
- 玩家连续 walk (Space 长按) = 连续 tween = 连续 push,setter no-op guard 防止重复渲染

### Q3 startLevel 3D push

**选 是**。原因:
- 跟 P3-1 `startLevel` 推 initial level 一致,避免 chip 在 level 加载第一帧显示 "L1" 而不是正确的初始 y-cell
- P4a provider 的 `start3D.y` 是固定 cell 坐标 (0..visualSize-1),不是浮点 y,直接 push 即可
- 2D 跟 3D 都不会越界 (provider 验证过)

## 锁的 contracts (跨 scope)

- `bridge.onLevelChange` 签名 + 语义 (current visible layer) 不动
- `useGameStore.setCurrentLevel` no-op guard 行为不动
- HUD `LevelIndicator` chip 渲染逻辑 (1-indexed display) 不动
- 3D minimap 用 `getPlayerY()` 独立派生,不依赖 `currentLevel`
- 2D minimap 用 `currentLevel` (P3-1 vertical layer) 不动
- 2D 跟 3D 路径在 `update()` 顶部 short-circuit 互斥

## 不在 scope

- ❌ HUD chip 显示 total (e.g. "L5/15" 代替 "L5") — P4b+ scope
- ❌ 3D 全景 minimap — P4b+ 候选
- ❌ InstancedMesh / octree culling — P4b+ 性能优化
- ❌ 3D enemy / 3D editor / 3D tutorial — 大的 P4+ 扩展
- ❌ HUD chip 改样式 / 颜色 — UI scope 留给未来
