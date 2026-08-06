# P4 实施计划 (P4a MVP)

**Slug**: p4-3d-voxel-mazes
**复杂度**: P4a MVP = L (1 session ship, 数据 + 1 generator + 3D 渲染)
**P4 全**: X-Large (多 session, 见 P4b/P4c 候选)

---

## Task Table (P4a MVP)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4-3d-voxel-mazes/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/maze/types.ts | UPDATE | `MazeData.walls3D?: CellType[][][]` + `MazeData.start3D?/exit3D?` + `Algorithm` 加 `'3d-recursive-backtracker'` | [x] |
| 3 | src/maze/_expandThickWall3D.ts (NEW) | — | **未实施** — P4a RB 直接返回 visual 3D 数组(logical → visual 内嵌在 generator),不需要独立 expand 文件。注释: P4b 多算法时再加。 | [—] |
| 4 | src/maze/generators/recursiveBacktracker3D.ts (NEW) | ADD | 3D RB generator (1:1 翻译 2D + VALID_3D_SIZES + isVoxel3DSize) | [x] |
| 5 | src/maze/algorithmRegistry.ts | — | **不更新** — 3D RB 不通过 registry(签名不兼容)。3D 路由由 AlgorithmMazeProvider.load3D 内部 dispatch。 | [—] |
| 6 | src/maze/reachability.ts | UPDATE | `isReachable3D` (6 邻居 BFS) | [x] |
| 7 | src/utils/seed.ts | UPDATE | `encodeSeedV3` / `decodeSeed` v3 分支 + VALID_3D_ALGORITHMS + VALID_3D_SIZES | [x] |
| 8 | src/maze/AlgorithmMazeProvider.ts | UPDATE | v3 seed → `generateRecursiveBacktracker3D` + 写 `walls3D` + start3D/exit3D + transitions:[] | [x] |
| 9 | src/engine/Scene.ts | UPDATE | `buildScene` 加 3D 早返回 + `buildScene3D()` 函数(cuboid per wall + 3D exit + 3D playerMarker) | [x] |
| 10 | src/entities/Player.ts + src/engine/Player.ts | UPDATE | `createPlayer` 加 3D overload (mode: '3d' discriminator) + 复用 EYE_HEIGHT (1.6m) | [x] |
| 11 | src/engine/InputManager.ts + src/engine/Game.ts | UPDATE | `getMove3D()` 6 邻居 + `Game.tick3DMovement()` cell-based collision + 3D exit check (绕开 Collision.resolveMove 2D 路径) | [x] |
| 12 | tests/unit/maze/recursiveBacktracker3D.test.ts (NEW) | ADD | 3D RB 10 case (whitelist / cube shape / 边界 wall / determinism / 不同 seed / spanning-tree reachability / start=exit / start=wall) | [x] |
| 13 | tests/unit/utils/seed.test.ts | UPDATE | v3 codec round-trip + edge cases (7 case) | [x] |
| 14 | tests/unit/inputManager.test.ts | UPDATE | getMove3D 8 case (W/S/A/D/Space/C/cancel pairs/no Arrow binding) | [x] |
| 15 | tests/unit/maze/algorithmMazeProvider.test.ts | UPDATE | 3D load 4 case (size 5/7/9 round-trip / determinism / 不同 seed / bad algorithm rejected) | [x] |
| 16 | tests/unit/engine/Game.3D.test.ts (NEW) | ADD | Game 3D 5 case (buildScene3D walls / D teleport / wall rejection / Space vertical climb / exit check) | [x] |
| 17 | CLAUDE.md | UPDATE | P4 段(在 P3-3 后)— MazeData 字段 / algorithm union / 3D size whitelist / seed v3 codec / 3D Scene / 6 邻居 / 3D Game tick / 不做列表 / 为什么 bypass registry | [x] |
| 18 | docs/roadmap.md | UPDATE | 加 P4 行 + 活跃锚点 + 已完成 P4a + 下一个任务 P4b 候选 | [x] |
| 19 | spec.md | UPDATE | 状态 decision-finalized → done | [x] |
| 20 | Commit + push | — | `feat(p4): 3D 体素迷宫 MVP (Recursive Backtracker)` | [ ] |

## 实施顺序

1. **Task 2 (types)** — `MazeData.walls3D` + `start3D?/exit3D?` + Algorithm 加 `'3d-recursive-backtracker'` ✓
2. **Task 4 (3D RB generator)** — 1:1 翻译 2D, 6 邻居 DFS, thick-wall odd indices ✓
3. **Task 6 (3D BFS)** — `isReachable3D` 6 邻居, head-index FIFO ✓
4. **Task 7 (seed v3)** — `encodeSeedV3` / `decodeSeed` v3 分支 + 3D whitelist ✓
5. **Task 8 (provider)** — `load3D` 路由 + 写 `walls3D` + start3D/exit3D + transitions:[] ✓
6. **Task 9 (3D scene)** — `buildScene3D()` cuboid per wall ✓
7. **Task 10-11 (player + input + game tick)** — 6 邻居 + 3D collision + 3D exit check ✓
8. **Task 12-16 (test)** — 5 文件 / ~34 case ✓
9. **Task 17-19 (doc)** — CLAUDE.md + roadmap + spec ✓
10. **Task 20 (commit + push)** — `feat(p4)` ⏳

## Frozen contracts (lockstep)

- FLOOR_HEIGHT / EYE_HEIGHT 不动 (P4 不用 FLOOR_HEIGHT, 用 cellSize; EYE_HEIGHT 1.6m 仍用)
- 4-mode mapping + algorithmForMode 不动
- ALGORITHM_REGISTRY 仍 single source of truth (P4a 3D RB 不进 registry, 签名不兼容)
- seed v1/v2/v3 各自 codec (3D 算法名带 `3d-` 前缀)
- 1-6 层 levelCount 不动 (P4a 3D 用 walls3D 替代堆叠, levelCount 故意不设)

## 集成验证

- [x] typecheck: 0 error
- [x] vitest: 全量, 111 files / 1695 pass / 1 skip / 0 fail (P4a 新增 ~34 case, 5 文件)
- [x] vite build: 886ms OK
- [ ] 3D 路径 E2E (manual): 创建 v3 seed, 玩家能 6 方向移动, 终点可达

## Commit 策略

- 1 commit: `feat(p4): 3D 体素迷宫 MVP (Recursive Backtracker)` (按 P3-N 风格)

## 实施时间

- 数据层 (Task 2/4/6/7/8): ~1.5h
- 渲染 + 移动 (Task 9-11): ~1.5h
- 测试 + 文档 (Task 12-19): ~0.5h
- **总**: ~3.5h (单 session 内 ship)

P4a 完成后 roadmap 加 P4b / P4c 候选 (3D Prim / CA / editor / minimap / enemy AI / tutorial / Player 移动 lerp / 多 cell size 11/13/15).
