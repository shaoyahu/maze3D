# P4b-CellSize: 3D 多 cell size 11/13/15

**Slug**: p4b-3d-cellsize
**状态**: done (P4b-CellSize ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4b candidate (3D 多 cell size 11/13/15)
**依赖**: P4a (3D RB MVP) + P4b-Prim (3D Prim 第二算法) 都已 ship
**复杂度**: S (半天, 1 session ship — 数据层扩 1 数组 + perf budget 验证 + 测试)

---

## 1. 概述

P4a 锁 `VALID_3D_SIZES = [5, 7, 9]`,3 个小尺寸。P4b-CellSize 扩到 `[5, 7, 9, 11, 13, 15]`,加入 3 个中尺寸。**11/13/15 是 P4a spec §15 预留的 P4b candidate 范围**。

为什么 5/7/9 不够:
- 5³ = 125 cells (5×5×5) — 视觉太"挤",passage 短
- 7³ = 343 cells — 默认尺寸,迷宫感足
- 9³ = 729 cells — 较深,但仍可几秒走完

11/13/15 给玩家更长/更深的探索体验:
- 11³ = 1331 cells (cube 边长 22m, cs=2)
- 13³ = 2197 cells (cube 边长 26m)
- 15³ = 3375 cells (cube 边长 30m, P4a spec §15 提到的"5s budget"上限)

**P4a 调研报告** (`docs/research/3d-maze-algorithms.md`) 锁 3D RB / Prim 算法 O(N),所以 11³/13³/15³ 仍可秒级生成 — 这是 P4a 选 3D RB/Prim 的关键原因(避开 3D CA/3D AB-Wilson 的 O(N²) 慢算法)。

## 2. 决策表 (P4b-CellSize)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | P4b-CellSize 扩展尺寸? | `[5, 7, 9, 11, 13, 15]` — P4a [5,7,9] + P4a spec §15 留的 [11,13,15] |
| Q2 | 11/13/15 性能预算? | 11³=1331 < 1.5s; 13³=2197 < 3s; 15³=3375 < 5s (P4a spec §15 留的 5s 上限)。实测后按 1.5x P4a 算 budget 验证。 |
| Q3 | 11/13/15 视觉/玩法? | 跟 5/7/9 完全一样,只是 cube 更大。3D RB / 3D Prim / 3D BFS / 3D Scene / 3D 移动 / 3D exit check 全不需改。 |
| Q4 | 11/13/15 内存? | visualSize=15 → walls3D 是 3375 CellType 数组,JS number 8 byte → ~27 KB per maze. JSON storage round-trip 也在 KB 级。P4a validator (JsonMazeProvider) 已有 MAX_MAZE_SIZE 防御,够用。 |
| Q5 | 11/13/15 性能算法瓶颈? | 3D RB = O(N) cells; 3D Prim = O(N) cells (frontier 摊销 O(1) per pick)。两个算法 O(N) 总 cells = O(visualSize³)。 |
| Q6 | 11/13/15 锁进 whitelist 还是新? | 直接扩 `VALID_3D_SIZES` 单数组 (跟 P4a 同位置)。`isVoxel3DSize` 复用,自动接受新值。 |
| Q7 | 11/13/15 跟 P4a 兼容性? | 完全后向兼容。P4a 关卡 5/7/9 仍跑,P4b 关卡 11/13/15 走新预算。 |
| Q8 | 11/13/15 跟 ALGORITHM_REGISTRY? | 不动。3D 算法不走 registry (P4a 锁),3D sizes 跟算法无关。 |
| Q9 | 11/13/15 跟 gameUrl.ts? | 不动。isProcedural 4 处已 lockstep 加 v3 (P4a 修过),size 是字符串部分,自动接受 11/13/15。 |
| Q10 | 11/13/15 跟 editor 2D? | 不动。Editor 是 2D-only (3D editor 是 P4c+ candidate), 不会路由到 3D 关卡。 |
| Q11 | 11/13/15 跟 minimap 2D 投影? | 跟 P4a 一样,3D 路径下 minimap 是 2D 投影 (P4b-Minimap 候选会修)。 |
| Q12 | 11/13/15 test 覆盖? | (a) whitelist 接受 6 sizes, (b) recursiveBacktracker3D 接受 6 sizes + 生成正确, (c) prim3D 接受 6 sizes + 生成正确, (d) seed v3 codec round-trip 6 sizes, (e) provider load 6 sizes, (f) 性能 budget 11/13/15 实测。 |
| Q13 | 11/13/15 spec/plan 锁定? | 跟 P4a/P4b-Prim 同结构 (15 Q + 9 sections), frozen contracts 跟 P4a 8 + P4b-Prim sibling 锁。 |
| Q14 | 11/13/15 跟 UI 体验? | 玩家 6 方向移动仍是 cell-based 瞬移,大 cube 只意味着更多 cells 探索,无新交互。P4b-Lerp (3D Player 0.1s tween) 是 P4b 下一个 scope, 跟 P4b-CellSize 独立。 |
| Q15 | 11/13/15 commit 策略? | 1 commit: `feat(p4b): 3D 多 cell size 11/13/15`。按 ship-each 节奏独立 review + push。 |

## 3. 数据模型

P4b-CellSize **不动数据模型**。复用:
- `MazeData.walls3D: CellType[][][]` (z × y × x, 任意 odd visualSize ≥ 5)
- `MazeData.start3D / exit3D: {x, y, z}` (任意 cell coords)
- 3D 算法 generator 直接操作 visualSize grid (P4a/P4b-Prim 风格)
- JSON validator (JsonMazeProvider) 接受任意 size,已有 MAX_MAZE_SIZE 200 防御 (P3-1d 加的)

## 4. 算法约束

3D RB / 3D Prim 的算法形态 O(N),visualSize=15 = 3375 cells,跟 visualSize=9 = 729 cells 比 4.6x cells,大致 4-5x 时间。在 P4a 5s budget 之内。

**新增的 perf budget 推算**:
- 11³ = 1331 cells, 5/7/9 数据点外推 → 1-1.5s
- 13³ = 2197 cells → 2-3s
- 15³ = 3375 cells → 3-5s (P4a spec §15 锁 5s 上限)

实际值会先跑 perf test 验证。perf budget 锁:
- 11³ < 1.5s
- 13³ < 3s
- 15³ < 5s

跟 P4a [50ms, 200ms, 1s] 推算 (每多 2 cells, 50ms/200ms/1s = 1x/4x/20x; 增长超线性) 一致。

## 5. Seed codec v3 (P4b-CellSize 复用 P4a/P4b-Prim)

`algo-v3-{algorithm}-{size}-{hex}`,size ∈ {5, 7, 9, 11, 13, 15}。codec 自动接受新 size (regex `(\d+)` 配 `VALID_3D_SIZES` 白名单)。

`encodeSeedV3` 不变,`VALID_3D_SIZES` 单数组扩。

## 6. Scene 渲染 (P4b-CellSize 不动 Scene)

3D Scene 用 BoxGeometry per wall cell. visualSize=15 → 15³ = 3375 cells, ~1687 wall cuboids (half walls). 共享 geometry + material,所以 GPU draw call 数稳定。

**性能**:
- 11³ → 1331 cells, ~665 cuboid meshes
- 15³ → 3375 cells, ~1687 cuboid meshes

JS heap: ~1687 mesh handles * ~1KB each = ~1.7MB (acceptable)

draw call cost: ~1687 per frame, under 1000-call budget 临界 — 15³ 在某些 GPU 上可能掉帧。P4a draw call budget 1000 没文档明确锁 (P4a 注释"commodity hardware"),P4b-CellSize 不改 1000 budget 但**加注释说 15³ 接近极限**。

## 7. 实施步骤 (P4b-CellSize 任务表)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-cellsize/{spec,plan}.md | ADD | 增量文档 | [ ] |
| 2 | src/maze/generators/recursiveBacktracker3D.ts | UPDATE | `VALID_3D_SIZES` 加 11/13/15 | [ ] |
| 3 | src/utils/seed.ts | UPDATE | `VALID_3D_SIZES` 同步扩 (codec 白名单) | [ ] |
| 4 | tests/unit/maze/recursiveBacktracker3D.test.ts | UPDATE | whitelist 测试接受 6 sizes (3 case 改写) | [ ] |
| 5 | tests/unit/maze/prim3D.test.ts | UPDATE | whitelist 测试接受 6 sizes (3 case 改写) | [ ] |
| 6 | tests/unit/utils/seed.test.ts | UPDATE | v3 codec round-trip 6 sizes | [ ] |
| 7 | tests/unit/maze/algorithmMazeProvider.test.ts | UPDATE | 3D load 6 sizes (RB + Prim 各自 6 sizes) | [ ] |
| 8 | tests/unit/maze/cellsize.perf.test.ts (NEW) | ADD | perf budget: 11/13/15 sizes × RB + Prim 算法 < 1.5s/3s/5s | [ ] |
| 9 | CLAUDE.md | UPDATE | P4b-CellSize 段 (在 P4b-Prim 段后) | [ ] |
| 10 | docs/roadmap.md | UPDATE | 加 P4b-CellSize 行 + 活跃锚点 | [ ] |
| 11 | spec.md | UPDATE | 状态 decision-finalized → done | [ ] |
| 12 | Commit + push | — | `feat(p4b): 3D 多 cell size 11/13/15` | [ ] |

## 8. 验收 (5 框)

- [ ] **正确性**: 3D seed `algo-v3-{3d-recursive-backtracker|3d-prim}-{11|13|15}-{hex}` round-trip 完整
- [ ] **非破坏性**: 现有 5/7/9 关卡 (P4a/P4b-Prim) 仍跑,所有 2D 关卡 (P2/P3-1/P3-2/P3-3) 仍跑
- [ ] **守门**: 算法 deterministic (同 seed 同 output), isReachable3D 验证 spanning tree
- [ ] **视觉**: 11/13/15 立方体渲染 (cuboid per wall),玩家能 6 方向自由穿行
- [ ] **测试**: 8+ test (whitelist 6 sizes / RB 6 sizes / Prim 6 sizes / codec 6 sizes / provider 6 sizes / perf 6 sizes),0 fail
- [ ] **性能**: 11³/13³/15³ × RB / Prim < 1.5s/3s/5s (实测)

## 9. 冻结契约 (CLAUDE.md 锁定, 跟 P4a 8 + P4b-Prim sibling 锁 lockstep)

- FLOOR_HEIGHT (2.4) / EYE_HEIGHT (1.6) 不动 (3D 用 cellSize 不用 FLOOR_HEIGHT)
- 4-mode mapping (P2-3) 不动
- ALGORITHM_REGISTRY 不动 (3D RB + 3D Prim 都不进, 3D sizes 跟算法无关)
- seed v1/v2/v3 codec 不动 (size 字符串部分自动接受 6 sizes)
- 1-6 层 levelCount 不动 (P4b 仍用 walls3D 替代堆叠)
- `MazeData.walls3D` / `start3D` / `exit3D` 字段不增不改
- VALID_3D_SIZES = [5, 7, 9, 11, 13, 15] (P4a [5,7,9] 扩 3 个)
- isVoxel3DSize 复用, 自动接受新 sizes
- 3D RB + 3D Prim 共用 VALID_3D_SIZES, 性能 budget RB ≈ Prim (O(N) 形态)
- 11/13/15 跟 gameUrl isProcedural 4 处 lockstep: 自动接受 (size 是字符串部分, 不影响 isProcedural gate)

## 10. 遗留 (P4b 之后 / P4c+)

- 3D 算法: 3D Kruskal / 3D Aldous-Broder / 3D Wilson's / 3D CA (P4b-Prim 后候选)
- 3D 大尺寸: 17/19/21 cells (P4b-CellSize 进一步扩, performance 是瓶颈)
- 3D Player 移动 lerp 动画 (P4b-Lerp 候选, 手感 polish)
- 3D minimap (P4b-Minimap 候选, 可视 polish)
- 3D editor / enemy AI / tutorial (P4a spec §15 P4b+ 候选)
