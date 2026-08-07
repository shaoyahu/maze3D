# P4b: 3D Prim — 3D 体素立方体第二算法 (Randomized Prim)

**Slug**: p4b-3d-prim
**状态**: done (P4b-Prim ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4b 候选 (3D Prim)
**依赖**: P4a (3D Recursive Backtracker MVP)
**复杂度**: S (半天, 1 session ship)

---

## 1. 概述

P4a 落地了 3D Recursive Backtracker — 单算法 3D MVP。**P4b-Prim 加 3D Prim 作第二算法**：

- 沿用 P4a 立方体 thick-wall 编码 (visualSize odd indices = spanning tree)
- 沿用 P4a 1:1 翻译 2D 套路 (3D Prim = 2D Prim 升级到 6 邻居, 数据布局 `[z][y][x]`)
- 沿用 P4a registry-bypass (3D 不进 ALGORITHM_REGISTRY, 算法名 `3d-prim`)
- 沿用 P4a 性能预算 (5³/7³/9³ cells < 50ms/200ms/1s)

P4a 8 个 frozen contracts 不动。P4b-Prim 只是 `AlgorithmMazeProvider.load3D` 多一个 case + `Algorithm` 联合多一个字面量 + `VALID_3D_ALGORITHMS` 多一项 + 新 generator。

**P4a Q1 (调研首选 = 3D RB) 仍正确** — P4b-Prim 是 3D 第二算法, 不是替换。P4a 调研报告 (`docs/research/3d-maze-algorithms.md`) 排过序, 3D Prim 跟 3D RB 是 1:1 对应 2D RB/Prim, branching 风格不同 (Prim 更"向外扩张", RB 更"深钻")。

## 2. 决策表 (P4b-Prim)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | 3D Prim 算法核心? | 经典 Randomized Prim's: frontier 维护 (visited-cell → unvisited-cell) 候选墙, 每次随机选一个 carve。跟 2D Prim `buildPrimTree` 1:1 翻译。 |
| Q2 | 3D Prim 数据布局? | 沿用 P4a 立方体 `[z][y][x]` CellType[][][], outer ring 全 wall, odd indices 是 spanning tree 节点。 |
| Q3 | 3D Prim start cell? | 随机 odd index (跟 P4a RB 一致), PRNG 决定。 |
| Q4 | 3D Prim 6 邻居? | `±x, ±y, ±z`, 跟 P4a RB DIRS 数组一致。thick-wall 编码下步长 2 (odd → odd)。 |
| Q5 | 3D Prim frontier 数据结构? | flat `Array<{ax,ay,az, bx,by,bz}>` + swap-and-pop 删除 (复用 2D Prim 套路, 0(1) 随机取)。 |
| Q6 | 3D Prim 跟 P4a RB 差异? | 数据布局 / 6 邻居 / thick-wall 都一样。差异只在外层循环: RB = stack-based DFS, Prim = frontier + 随机选。 |
| Q7 | 3D Prim name 命名? | `'3d-prim'` (3D-前缀强制, 跟 `'3d-recursive-backtracker'` 对仗)。 |
| Q8 | 3D Prim seed v3? | `algo-v3-3d-prim-{size}-{hex}`, size ∈ {5,7,9}。 |
| Q9 | 3D Prim 跟 P4a 兼容性? | 完全后向兼容。P4a 关卡仍跑 3D RB, P4b 关卡跑 3D Prim; dispatch 走 `seed.algorithm` 区分。 |
| Q10 | 3D Prim reachability? | 跟 P4a RB 一样是 spanning tree, 所有非 wall cell 互通。`isReachable3D` (P4a 已有) 直接验证, 不用新写。 |
| Q11 | 3D Prim 性能预算? | 跟 P4a RB 同 (5³/7³/9³ < 50ms/200ms/1s)。Prim 的 frontier 操作比 RB 的 stack 略贵, 但量级相同。 |
| Q12 | 3D Prim 跟 ALGORITHM_REGISTRY? | 不进 registry (跟 P4a RB 一致, 签名 `[][][]` 不兼容 2D `[][]`)。load3D 自己 dispatch 3D 算法。 |
| Q13 | 3D Prim 跟 gameUrl.ts isProcedural? | 已是 v3 dispatch, 新算法加到 `VALID_3D_ALGORITHMS` + codec 接受 `algo-v3-3d-prim-...`。 |
| Q14 | 3D Prim test 覆盖? | 5+ case: determinism (同 seed 同 output) + 不同 seed 不同 output + 边界 wall 完整 + 立方体 shape + spanning-tree reachability (any-pair 验证) + provider load 形状 + seed v3 codec round-trip。 |
| Q15 | 3D Prim spec/plan 锁定? | 跟 P4a 同结构 (15 Q + 9 sections), frozen contracts 单列, 跟 P4a 8 条 lockstep。 |

## 3. 数据模型

P4b-Prim 不动 P4a 数据模型。复用:
- `MazeData.walls3D?: CellType[][][]` (z × y × x, outer ring 全 wall)
- `MazeData.start3D?: {x,y,z}` / `exit3D?: {x,y,z}`
- `Algorithm` 联合加 `'3d-prim'` 字面量

## 4. 算法: 3D Randomized Prim

```typescript
// 跟 2D prim.ts 1:1 翻译, 升 4 邻居 → 6 邻居.
export function generatePrim3D(visualSize: number, rng: () => number): CellType[][][] {
  // 1. 初始化: 所有 cell = wall, outer ring = wall
  // 2. start = 随机 odd index (3 个轴, 都用 same odd logical 索引跟 P4a RB 一致)
  // 3. visited = 标记 start cell
  // 4. frontier = []; pushNeighbors(start, frontier) 把 6 邻居 (midpoint + b-cell) 加入
  // 5. while frontier.length > 0:
  //      idx = floor(rng() * frontier.length)
  //      e = frontier[idx]; swap-and-pop
  //      if visited[b]: continue (stale)
  //      visited[b] = 1
  //      carve walls[az][ay][ax] = 0, walls[midz][midy][midx] = 0, walls[bz][by][bx] = 0
  //      pushNeighbors(b, frontier)
  // 6. return walls
}
```

### 4.1 跟 P4a RB 的差异

| 维度 | P4a RB | P4b Prim |
|---|---|---|
| 外层循环 | stack-based DFS | frontier 随机选 |
| 数据结构 | `Array<[x,y,z]>` stack | `Array<{ax,ay,az, bx,by,bz}>` frontier |
| 随机选邻居时机 | 每次 pop 时从 DIRS 选 1 个 | 每次 frontier.length > 0 时随机选 1 个 |
| 风格 | 深钻 (长蛇) | 扩张 (短枝) |
| Determinism | 同样 (PRNG 消费顺序在 contract) | 同样 (start pick + 每次 frontier 选 1 个) |
| 形状保证 | spanning tree | spanning tree |

### 4.2 Thick-Wall Expansion

P4b-Prim 不需要独立 `_expandThickWall3D.ts` (跟 P4a RB 一样): 直接在 visualSize grid 上操作, 步长 2, midpoint cell 同时被 carve 0。1:1 翻译 2D Prim。

## 5. Algorithm 路由

```typescript
// src/maze/types.ts
export type Algorithm =
  // ... 现有 15 字面量 + P4a '3d-recursive-backtracker'
  | '3d-prim';  // P4b-Prim

// src/utils/seed.ts
const VALID_3D_ALGORITHMS: readonly string[] = [
  '3d-recursive-backtracker',
  '3d-prim',  // P4b-Prim
];

// src/maze/AlgorithmMazeProvider.ts
private load3D(algorithm, size, mazeSeed, prng, id): MazeData {
  if (algorithm === '3d-recursive-backtracker') {
    walls3D = generateRecursiveBacktracker3D(size, prng);
  } else if (algorithm === '3d-prim') {
    walls3D = generatePrim3D(size, prng);
  } else {
    throw new Error(`AlgorithmMazeProvider.load3D: unhandled v3 algorithm ${algorithm}`);
  }
  // ... rest 跟 P4a 一样
}
```

## 6. Seed codec v3 (P4b-Prim 复用 P4a)

`algo-v3-3d-prim-{size}-{hex}` — `decodeSeed` 已经在 v3 分支接受任何 `3d-` prefix 算法名 (白名单 `VALID_3D_ALGORITHMS` 控制)。P4b-Prim 加 `'3d-prim'` 到白名单后 codec 自动接受。

`encodeSeedV3` 不变: 调用者传 `algorithm: '3d-prim'`, encoder 生成 `algo-v3-3d-prim-...`。

`gameUrl.ts` 4 处 `isProcedural` 锁已包括 v3 (P4a 修过), 自动接受 v3 算法名。

## 7. Scene 渲染

P4b-Prim **不动 Scene.ts**。3D Scene 只看 `walls3D` (cuboid per wall cell), 跟 3D 算法无关。同一 scene graph 接受任何 3D 算法的 walls3D。

## 8. 实施步骤 (P4b-Prim 任务表)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-prim/{spec,plan}.md | ADD | 增量文档 | [ ] |
| 2 | src/maze/types.ts | UPDATE | `Algorithm` 联合加 `'3d-prim'` | [ ] |
| 3 | src/maze/generators/prim3D.ts (NEW) | ADD | 3D Prim generator (1:1 翻译 2D prim.ts 升 6 邻居) + `VALID_3D_SIZES` + `isVoxel3DSize` 复用 P4a | [ ] |
| 4 | src/utils/seed.ts | UPDATE | `VALID_3D_ALGORITHMS` 加 `'3d-prim'` | [ ] |
| 5 | src/maze/AlgorithmMazeProvider.ts | UPDATE | `load3D` 加 `'3d-prim'` 分支 (跟 P4a RB 并列) | [ ] |
| 6 | tests/unit/maze/prim3D.test.ts (NEW) | ADD | 3D Prim determinism + reachability + 边界 wall + 形状 (5+ case) | [ ] |
| 7 | tests/unit/utils/seed.test.ts | UPDATE | v3 codec 接受 '3d-prim' round-trip (1 case) | [ ] |
| 8 | tests/unit/maze/algorithmMazeProvider.test.ts | UPDATE | '3d-prim' load 形状 test (1 case) | [ ] |
| 9 | CLAUDE.md | UPDATE | P4b-Prim 段 (在 P4 段后) | [ ] |
| 10 | docs/roadmap.md | UPDATE | 加 P4b-Prim 行 + 活跃锚点 | [ ] |
| 11 | spec.md | UPDATE | 状态 decision-finalized → done | [ ] |
| 12 | Commit + push | — | `feat(p4b): 3D Prim 第二算法` | [ ] |

## 9. 验收 (5 框)

- [ ] **正确性**: 3D seed `algo-v3-3d-prim-7-xxx` round-trip 完整, 立方体形状 + outer ring 完整
- [ ] **非破坏性**: 现有 3D RB (P4a) 仍跑 + 现有 2D 关卡 (P2/P3-1/P3-2/P3-3) 仍跑
- [ ] **守门**: 算法 deterministic (同 seed 同 output), BFS 验证 any-pair spanning tree 可达
- [ ] **视觉**: 3D Prim 立方体渲染 (cuboid per wall), 玩家能 6 方向自由穿行
- [ ] **测试**: 5+ test (3D Prim determinism + reachability + boundary + provider round-trip + seed codec)

## 10. 冻结契约 (CLAUDE.md 锁定, 跟 P4a 8 条 lockstep)

- FLOOR_HEIGHT = 2.4 / EYE_HEIGHT = 1.6 不动 (P4b 不用)
- 4-mode mapping (P2-3) 不动
- ALGORITHM_REGISTRY 16 算法 (P2-21 15 + P4a 1) + **P4b 1 = 17** — 但 P4b 3D Prim 不进 registry, 仍走 3D dispatch
- seed v1/v2/v3 各自 codec (P4b 加 v3 算法名 '3d-prim')
- 1-6 层 levelCount 不动 (P4b 仍用 walls3D 替代堆叠)
- `MazeData.walls3D` / `start3D` / `exit3D` 字段不增不改
- 3D RB 与 3D Prim 是 2 个 3D 算法, dispatch 走 `algorithm` 区分
- isProcedural 4 处 lockstep 已包括 v3 (P4a 修过), P4b 算法名自动接受

## 11. 遗留 (P4b 之后 / P4c+)

- 3D Kruskal (3D 第三算法, union-find, branching 更均匀)
- 3D Aldous-Broder / Wilson's (随机游走族, O(N²) 慢但视觉独特)
- 3D Cellular Automata (差异化 cave 视觉, P4a spec §15)
- 3D editor / minimap / enemy AI / tutorial (P4a spec §15 P4b 候选)
- 3D Player 移动 lerp 动画 (P4a 瞬移升级)
- 3D 多 cell size 11/13/15 (性能预算验证)
