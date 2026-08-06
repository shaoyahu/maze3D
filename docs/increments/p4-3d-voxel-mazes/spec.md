# P4: 3D 体素迷宫 (P4a MVP)

**Slug**: p4-3d-voxel-mazes
**状态**: done (P4a MVP ship 2026-08-06)
**日期**: 2026-08-06
**对应路线图项**: P4 (候选,3D 体素迷宫)
**依赖**: P3-1 / P3-1d / P3-2 / P3-3 (P3 全 ship)
**复杂度**: P4a MVP = L (1 session ship MVP), P4 全 = X-Large (多 session)

---

## 1. 概述

P3-1 实现了"2D 堆叠"多层 (每层独立 2D + transition),但玩家仍是 2D 平面移动。**P4 实现"真 3D 体素"**：单个立方体空间内 `walls: CellType[][][]` (z × y × x),玩家可以在前后左右上下 6 方向自由穿行, 类似 Metroid Prime 3D 关卡或《Maze 3D》。

P3-1 (堆叠 2D) 和 P4 (体素 3D) 是两种不同形态, 不是替代关系 — P4 不动 P3-1 任何数据/逻辑, 而是**新增** 3D 数据模型 + 1 个 generator + 3D 渲染, 让玩家可以选择"平面多层"或"立体 3D"。

**P4a MVP scope** (本增量 ship):
- 1 个 3D generator (Recursive Backtracker, 调研首选, 1 天实现)
- 3D 数据模型 (MazeData.walls3D, 可选字段不破坏 P3-1)
- 3D BFS reachability
- seed codec v3 (`algo-v3-3d-recursive-backtracker-{size}-{hex}`)
- AlgorithmMazeProvider 路由 v3
- 3D Scene 渲染 (cuboid per cell, 玩家能 6 方向移动)

**P4b 后续候选** (不本增量 ship):
- 3D Prim (调研次选, branching 多)
- 3D Cellular Automata (差异化 cave 视觉)
- 3D editor (multi-layer editor 3D 化)
- 3D minimap (top-down 透视)
- 3D enemy AI (6 邻居 pathfinding)
- 3D tutorial / parchment (parchment 是 2D, 3D 需要新形态)

## 2. 决策表 (P4a MVP)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | P4a 用哪个 3D generator? | **3D Recursive Backtracker** (调研首选, 实现 1 天, 1:1 翻译 2D 模板) |
| Q2 | 3D 数据模型形态? | `MazeData.walls3D?: CellType[][][]` 可选字段 (z × y × x), `levelCount` 1 (整个 3D 立方体) |
| Q3 | 3D cell 尺寸? | 沿用 `MazeData.cellSize = 2` (单位米), 视觉上跟 P3-1 单层一致 |
| Q4 | 3D 立方体大小? | `size: 5/7/9` (logicalSize 3/4/5), visualSize = `2 * logicalSize - 1` 沿用 thick-wall 习惯 (3D 版本: 2*3-1=5, 2*4-1=7, 2*5-1=9) |
| Q5 | 玩家 3D 移动? | 6 邻居 WASD + Space/C (Space=up, C=down) |
| Q6 | 3D 渲染 mesh? | `BoxGeometry(1, 1, 1)` per wall cell (sparse — 只画 wall, 不画 passage) |
| Q7 | 3D seed codec? | `algo-v3-3d-recursive-backtracker-{size}-{hex}` (v3 引入, 区别 v1/v2) |
| Q8 | 3D 跟 P3-1 兼容? | P3-1 关卡仍是 2D (用 `walls: CellType[][]`); P4 关卡用 `walls3D: CellType[][][]`. 同时存在由 `MazeData.walls3D !== undefined` 判定 |
| Q9 | 3D BFS reachability? | 6 邻居 BFS (前后左右上下), O(N) |
| Q10 | 3D 起点终点? | 算法完成后挑最大连通 component, 随机 cell 起点, 距离 > N/3 的 cell 终点 |
| Q11 | 3D enemy 范围? | P4a **不做** enemy (spec 留 P4b+), 只玩家裸跑 |
| Q12 | 3D 跟 2D Mode 区别? | reach-exit / time-trial / survive 都跑 (algorithmForMode 不动, 3D 只是几何维度不同) |
| Q13 | 3D 教学关? | P4a **不做**, 留 P4b (teaching 形态需要单独设计 3D 引导) |
| Q14 | 3D seed v3 算法名? | '3d-recursive-backtracker' (新增, 不与现有 15 算法冲突) |
| Q15 | 3D 性能预算? | 5³=125 cells < 50ms; 7³=343 < 200ms; 9³=729 < 1s |

## 3. 数据模型

### 3.1 MazeData 新增字段 (P4a)

```typescript
export interface MazeData {
  // ... 现有 P2 / P3-1 字段 (id, name, size, cellSize, start, exit, walls, ...)
  // P3-1 已有: levelCount, transitions
  
  // P4: 3D 体素迷宫 walls. 如果存在, 渲染走 3D 路径; 否则走 2D (P2/P3-1).
  // z × y × x 顺序, CellType = 0/1 (0=passage, 1=wall). 
  // logicalSize = Math.min(walls3D.length) - 与 2D 一样 "thick-wall" 编码:
  //   logical (3, 4, 5) → visual (5, 7, 9)
  // 立方体所有 3 维等长.
  walls3D?: CellType[][][];
}
```

### 3.2 Algorithm 联合新增 (P4a)

```typescript
export type Algorithm = 
  // ... 现有 15 字面量
  | '3d-recursive-backtracker';  // P4a
```

`ALGORITHM_REGISTRY` 在 P4a 加 1 entry。

### 3.3 Seed codec v3 (P4a)

```
algo-v3-3d-recursive-backtracker-{size}-{hex}
                  ↑ size ∈ {5, 7, 9} (visualSize, 包含 thick-wall)
                  ↑ hex 16 chars

区别 v1/v2: v1/v2 是 P3-1 单层 + 6 维 2D maze, v3 是 3D 体素
```

## 4. 算法: 3D Recursive Backtracker

```typescript
export function generateRecursiveBacktracker3D(visualSize: number, rng: () => number): CellType[][][] {
  // visualSize: 5/7/9 (odd, 含 thick-wall)
  // logicalSize = (visualSize + 1) / 2
  const logicalSize = (visualSize + 1) / 2;
  
  // 1. 初始化: 所有 cell = wall
  const walls: CellType[][][] = Array.from(
    { length: visualSize },
    () => Array.from(
      { length: visualSize },
      () => Array<CellType>(visualSize).fill(1)
    )
  );
  
  // 2. pick 起点 (随机 logical cell, 不在边界)
  const startX = 1 + Math.floor(rng() * (logicalSize - 2));
  const startY = 1 + Math.floor(rng() * (logicalSize - 2));
  const startZ = 1 + Math.floor(rng() * (logicalSize - 2));
  
  // 3. DFS: 6 邻居 (前后左右上下), 2x 步长跨 thick-wall
  const stack: Array<[number, number, number]> = [[startX, startY, startZ]];
  walls[startZ][startY][startX] = 0;  // logical coord = visual coord / 2 (but here we work in logical)
  // ... wait, recursion should work in logical coords then expand to visual
  
  // ... (算法主流程略, 1:1 翻译 2D recursiveBacktracker.ts 改 6 邻居)
}
```

### 4.1 3D Thick-Wall Expansion

`src/maze/_expandThickWall.ts` 现有 2D 版本扩展 `CellType[][]` (logical → visual) 加 wall 边框。P4a 改写为 3D 版本:

```typescript
function expandThickWall3D(logical: CellType[][]): CellType[][][] {
  // logical 3D grid → visual 3D grid (扩 2x 加 wall 边框)
  // 1:1 翻译 2D 版本, 在 z/y/x 三个方向都做 padding
}
```

## 5. 3D BFS Reachability

```typescript
export function bfs3DReachable(
  walls3D: CellType[][][],
  start: { x: number; y: number; z: number },
  exit: { x: number; y: number; z: number },
): { reachable: boolean; visited: Set<string> } {
  // 6 邻居 BFS (前后左右上下)
  // O(N) per test
  // 与现有 2D bfsReachable 平行
}
```

## 6. 3D Scene 渲染

`buildScene` 加 3D 路径:

```typescript
if (maze.walls3D) {
  // 3D path: 画 cuboid per wall cell
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (maze.walls3D[z][y][x] === 1) {
          const box = new THREE.BoxGeometry(cs, cs, cs);
          const mesh = new THREE.Mesh(box, wallMaterial);
          mesh.position.set(x * cs + cs/2, y * cs + cs/2, z * cs + cs/2);
          scene.add(mesh);
          walls.push(mesh);
        }
      }
    }
  }
} else {
  // 2D path (现有 P2/P3-1)
}
```

P4a **简化**:
- 不画 passage 地面/天花板 (P3-1 多层每层有 floor, P4 体素玩家在 cell 内, 不画 floor)
- 不画 ceiling
- 玩家位置在 cell 中心 (cs/2 偏移)
- 相机: 第一人称视角 (与 P3-1 相同, 不改)

## 7. 3D Player Movement

```typescript
// P4a 简化: 玩家在 logical cell 中心, WASD 走 4 邻居, Space/C 走上下
function move3D(player, direction) {
  const cs = currentMaze.cellSize;
  const { dx, dy, dz } = directionToDelta(direction);
  const nx = player.x + dx, ny = player.y + dy, nz = player.z + dz;
  if (inBounds3D(nx, ny, nz, w, h, d) && walls3D[nz][ny][nx] === 0) {
    player.x = nx; player.y = ny; player.z = nz;
  }
}
```

P4a 简化: 玩家**瞬移**到目标 cell (不插值, P4b 再加 lerp 动画)。

## 8. 实施步骤 (P4a 任务表)

| # | 文件 | 类型 | 内容 |
|---|---|---|---|
| 1 | `src/maze/types.ts` | UPDATE | `MazeData.walls3D?: CellType[][][]` + `Algorithm` 加 `'3d-recursive-backtracker'` |
| 2 | `src/maze/_expandThickWall.ts` (新建) | ADD | 3D thick-wall expansion |
| 3 | `src/maze/generators/recursiveBacktracker3D.ts` (新建) | ADD | 3D RB generator (1:1 翻译 2D) |
| 4 | `src/maze/algorithmRegistry.ts` | UPDATE | 加 `'3d-recursive-backtracker'` entry + 6 邻居 helper |
| 5 | `src/maze/reachability.ts` | UPDATE | `bfs3DReachable` (6 邻居 BFS) |
| 6 | `src/utils/seed.ts` | UPDATE | `encodeSeedV3` / `decodeSeed` v3 分支 |
| 7 | `src/maze/AlgorithmMazeProvider.ts` | UPDATE | v3 seed 走 `generateRecursiveBacktracker3D` + 写 `walls3D` |
| 8 | `src/engine/Scene.ts` | UPDATE | `buildScene` 加 3D 路径 (cuboid per wall) |
| 9 | `src/engine/Player.ts` + `src/entities/Player.ts` | UPDATE | 3D position + movement (WASD + Space/C) |
| 10 | `src/engine/Collision.ts` | UPDATE | 3D 6 邻居 collision check |
| 11 | Tests (新) | ADD | 3D RB determinism + 3D BFS + 3D seed codec |
| 12 | CLAUDE.md / roadmap / spec | UPDATE | P4 段 + 活跃锚点 + 状态 done |
| 13 | Commit + push | — | `feat(p4): 3D 体素迷宫 MVP (Recursive Backtracker)` |

## 9. 验收 (5 框)

- [ ] **正确性**: 3D seed `algo-v3-3d-recursive-backtracker-7-xxx` round-trip 完整, 玩家 6 方向移动, 终点可达
- [ ] **非破坏性**: 现有 2D 关卡 (P2/P3-1/P3-2/P3-3) 仍跑
- [ ] **守门**: 算法 deterministic (同 seed 同输出), BFS 验证可达
- [ ] **视觉**: 3D 立方体渲染 (cuboid per wall), 玩家 6 方向自由穿行
- [ ] **测试**: 5+ test (3D RB 1 case + 3D BFS 1 case + 3D seed 1 case + 3D Scene render 1 case + 3D Player move 1 case)

## 10. 冻结契约 (CLAUDE.md 锁定)

- `FLOOR_HEIGHT = 2.4` (P3-1, P4 不动 — P4 不用 FLOOR_HEIGHT, 用 cellSize)
- `EYE_HEIGHT = 1.6` (P3-1, P4 不动)
- 4-mode mapping (P2-3, P4 不动)
- ALGORITHM_REGISTRY 16 算法 (P2-21 15 + P4 1), 仍 single source of truth
- seed v1/v2/v3 各自 codec (`algo-v1-...` / `algo-v2-...` / `algo-v3-...`)

## 11. 遗留 (P4b+)

- 3D Prim (调研次选)
- 3D Cellular Automata (差异化)
- 3D editor (multi-layer editor 3D 化)
- 3D minimap (top-down 透视或 cutout)
- 3D enemy AI (6 邻居 pathfinding)
- 3D tutorial / parchment
- 3D Player 移动 lerp 动画 (P4a 瞬移)
- 3D 起点终点选最大连通 component
- 3D 多 cell size (5/7/9 → 11/13/15?)
- 3D performance: 11³=1331 cells < 5s
