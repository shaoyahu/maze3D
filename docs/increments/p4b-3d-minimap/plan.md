# P4b 实施计划 (3D top-down minimap)

**Slug**: p4b-3d-minimap
**复杂度**: M (半天-1 天, 1 session ship)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**依赖**: P4b-Lerp (3D Player tween) ✅ ship

---

## Task Table (P4b-Minimap)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-minimap/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/engine/Game.ts | UPDATE | `getPlayerY()` accessor (跟 `getPlayerPosition` 平行) + `tick3DTween` 完成时调 `recordVisit(parchment, yCell, endCell.x, endCell.z)` | [ ] |
| 3 | src/ui/components/Minimap.tsx | UPDATE | `PlayerSnapshot` 加 `y` 字段 + `snapshotsEqual` 加 y delta 早出 + `is3D = maze.walls3D !== undefined` dispatch + 3D path 渲染 `walls3D[yCell]` + 出口 off-layer 提示 + "L{n}/{total}" 标签 | [ ] |
| 4 | tests/unit/engine/Game.3D.tween.test.ts (UPDATE) | UPDATE | 加 2 case: `tick3DTween` 完成时调 `recordVisit` (parchment.visitedCells.get(yCell) 含 "x,z") + 跟 2D 互斥 (同一个 recordVisit 调用不会同时写两个 level) | [ ] |
| 5 | tests/unit/components/Minimap.3D.test.tsx (NEW) | ADD | 5+ case: is3D dispatch / y-cell 切换 / off-layer exit ↑↓ 提示 / 出口同层 COLOR_EXIT rect / "L{n}/{total}" 标签 | [ ] |
| 6 | CLAUDE.md | UPDATE | P4b-Minimap 段 (在 P4b-Lerp 段后) | [ ] |
| 7 | docs/roadmap.md | UPDATE | 加 P4b-Minimap 行 + 活跃锚点 | [ ] |
| 8 | spec.md | UPDATE | 状态 in-progress → done | [ ] |
| 9 | Commit + push | — | `feat(p4b): 3D top-down minimap` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2 (engine accessor + recordVisit)** — Game.ts 加 getPlayerY + tick3DTween recordVisit
3. **Task 3 (minimap 3D dispatch)** — Minimap.tsx is3D dispatch + y-snapshot + StaticMaze3D + 出口 off-layer + y-level 标签
4. **Task 4 (engine test)** — Game.3D.tween.test.ts 加 2 recordVisit case
5. **Task 5 (minimap test)** — Minimap.3D.test.tsx 新建
6. **集成验证** — typecheck + test + build + Browser E2E
7. **Task 6-8 (docs)** — CLAUDE.md + roadmap + spec
8. **Task 9 (commit + push)** — 独立 ship

## 关键设计点 (Q&A 复盘)

### Q1-Q2 顶视图 vs 全景

**选 单层顶视图**。原因:
- 跟 2D minimap 100% 同构,代码复用率最高
- 120×120 容器装不下 15×15×15 = 3375 cells 的全景 (太密)
- 全景 (orthographic projection) 需要更多计算 + SVG path 命令,跟 2D minimap 的 `<rect>` 简单渲染差太远
- 玩家只要知道 "我在哪一层、这一层怎么走",不一定要看 3D 全貌
- 全景是 P4c+ 候选 (跟 InstancedMesh / octree culling 一起做)

### Q3 floor 算 y-cell

**选 `Math.floor(player.position.y / cellSize)`**。原因:
- 跟 2D path `Math.floor(player.position.x / cs)` 一致
- tween 中间态 (y 不在格中心) 用 floor 自然处理 — 跨越格边界时 floor 翻下一格
- 玩家视觉:从 y=0.99 (在 y=0 cell 边界) → y=1.01 (在 y=1 cell 边界) 一帧跨格,minimap 重渲染到 y=1 layer。10Hz poll 抓一次稳定后无感

### Q4 polling 复用

**选 复用 10Hz polling**。原因:
- `useTickRef` 已经每 100ms 抓 player pos + yaw + fov,加 y 字段最小改动
- 早出条件加 y delta,player 静止时仍 0 重渲染
- tween 完成时 y 翻格 → 下次 poll 抓新 y → 触发 minimap 重渲染 → 新 layer 的 walls 显示
- 比新加 store field 简单 (避免 store churn)

### Q5 recordVisit 复用

**选 复用 P3-1 `recordVisit` 机制**。原因:
- 数据 shape `Map<level, Set<"x,z">>` 完全相同,2D 跟 3D 互斥 (一个 maze 不会同时有 walls 和 walls3D)
- `tick3DTween` 完成时调一次,跟 2D path 在 cell-mismatch check 之后的时机一致
- parchment copy-on-write 机制 (引用相等短路) 跟 2D 路径同样 work,player 静止时 0 重渲染
- 不需要新数据结构,不需要新 accessor

### Q6-Q7 标签 + off-layer 提示

**选 minimap 容器内文字 + 玩家 arrow 下方方向**。原因:
- "L1/15" 标签放在 minimap 容器右上角,跟现有 minimap 同位置,不占额外空间
- 出口 off-layer 提示放在玩家 arrow 下方 1.5 cell,视觉紧贴玩家位置
- HUD `LevelIndicator` chip 留给 P4b+ scope (要 dispatch 2D/3D),不在 P4b-Minimap 范围

## 锁的 contracts (跨 scope)

- `getPlayerY()` accessor 单源锁,3D minimap 唯一数据来源
- `recordVisit(parchment, yCell, x, z)` 调用时机锁 (tween 完成时),跟 2D path `recordVisit(parchment, playerLevel, x, z)` 互斥
- `PlayerSnapshot.y` 字段 + `snapshotsEqual` y delta 早出条件
- `is3D = maze.walls3D !== undefined` dispatch 锁
- `StaticMaze3D` 跟 `StaticMaze` 同结构 (rect per cell),只换数据源
- 出口 dispatch:同层 COLOR_EXIT rect / off-layer "↑/↓ exit" 文字
- y-level 标签位置锁:minimap 容器右上角 15px 等宽字体 var(--accent)

## 不在 scope

- ❌ HUD `LevelIndicator` chip dispatch 2D/3D (P4b+ 单独 scope)
- ❌ 3D 全景 minimap (orthographic projection,P4c+ 候选)
- ❌ 3D minimap 容器尺寸调整 (120×120 跟 2D 一致,3D 关卡每 cell 8-24px 可读)
- ❌ 3D 玩家旋转显示 (3D 模式下 player yaw 已有,不需要新加)
- ❌ minimap 拖拽 / 缩放 (P2-3 锁的固定 120×120 容器)
- ❌ 3D visited cells 跨层合并显示 (3D 玩家不需要看所有层历史,只看当前 y-layer)
