# P2-20: 扩展程序生成迷宫算法集（第二批 +4 算法）— 实施计划（Plan）

**Spec**: `docs/increments/p2-20-maze-algorithms-2/spec.md`
**复杂度**: Medium
**日期**: 2026-08-06

> 步骤使用 `- [ ]` 语法追踪。执行时按顺序逐 Task 推进；每个 Task 完成后立即勾选 + commit（小步、便于回滚）。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/generators/parallelBacktracker.ts` | CREATE | Parallel RB（多 walker + 颜色合并） |
| `src/maze/generators/recursiveDivision.ts` | CREATE | Recursive Division（直接操作视觉网格） |
| `src/maze/generators/aldousBroder.ts` | CREATE | 随机游走生成树 |
| `src/maze/generators/wilsons.ts` | CREATE | Loop-erased random walk |
| `tests/unit/maze/generators/parallelBacktracker.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/recursiveDivision.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/aldousBroder.test.ts` | CREATE | 8 case（性能容差 1500ms） |
| `tests/unit/maze/generators/wilsons.test.ts` | CREATE | 8 case |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 4 字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 4 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 12 case |
| `src/ui/LevelSelect.tsx` | UPDATE | `ALGORITHM_OPTIONS` 8 → 12 |
| `src/i18n/resources/{zh,en}.ts` | UPDATE | 4 个新算法名 key |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | `ALGOS` 8 → 12 |
| `tests/component/menus.test.tsx` | EXTEND | 算法下拉 12 option 断言 |
| `tests/e2e/procedural.spec.ts` | EXTEND | +1 case：Recursive Division URL |
| `docs/roadmap.md` | UPDATE | P2-20 行 + 活跃锚点 |
| `README.md` | UPDATE | 5.2 章节 8 → 12 算法；增量完成表 + P2-20 |

## 任务清单

### Task 1: Parallel Backtracker 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/parallelBacktracker.ts` 实现 `generateParallelBacktracker(visualSize, rng)`
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑
  - 维护一个 `color: number[]` 数组（每个 cell 一个颜色，相同颜色 = 同一棵 frontier tree）
  - 初始：所有 cell color = 自己的索引
  - 维护 `active: number[]` 列表（所有 frontier cell 的 flat index）
  - 循环：
    - 从 `active` 里随机挑一个 cell
    - 随机选一个邻居方向（4 个）
    - 如果邻居在边界外：跳过（不动 active）
    - 如果邻居颜色 = 当前颜色：跳过（同色已经 connected，不重复加边）
    - 如果邻居颜色 ≠ 当前颜色：
      - 加边（当前 cell → 邻居）
      - 把邻居所在颜色组的所有 cell 改成当前颜色（union）
      - 把邻居加入 `active`（如果它不在 active 里）
    - 如果当前 cell 没有有效邻居：从 active 移除
  - 直到 active 为空
- [ ] **Mirror**: 走 `_expandThickWall` 的 `TreeEdge` 出口
- [ ] **Test**: 8 case
- [ ] **Validate**: `npm test -- tests/unit/maze/generators/parallelBacktracker.test.ts`

### Task 2: Recursive Division 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/recursiveDivision.ts` 实现 `generateRecursiveDivision(visualSize, rng)`
- [ ] **算法要点**（与 P2-19 Binary Tree 一样**直接操作视觉网格**，不走 `expandThickWall`）：
  - 初始化 `visualSize × visualSize` 全通路（`walls[z][x] = 0`）
  - 沿外周加墙：`walls[0][...] = 1`, `walls[visualSize-1][...] = 1`, `walls[...][0] = 1`, `walls[...][visualSize-1] = 1`
  - 递归函数 `divide(z0, z1, x0, x1)` 处理子矩形（z0/z1/x0/x1 是 logical 索引，0 ≤ z0 < z1 ≤ logicalSize）：
    - 终止条件：宽 < 2 或高 < 2（无法再加 wall）
    - 随机选"水平分割"或"垂直分割"：
      - 水平：z0..z1 中选一个 wall row `(z0+1) + 2k`（odd visual index），开 pass 在某个 column（pass 是墙上的洞，逻辑上是把那个 wall cell 改回 0）
      - 垂直：x0..x1 中选一个 wall col，开 pass 在某个 row
    - 递归处理两个子矩形
  - 注意：start (0, 0) 和 exit (lastX, lastX) 必须保持通路
- [ ] **理由 走 视觉网格**: 算法本身在视觉网格上描述更短；thick-wall 展开的中间层会绕（每面 wall 是 odd index cell，不是"逻辑 cell 之间的边"）
- [ ] **Test**: 8 case
- [ ] **Validate**: `npm test -- tests/unit/maze/generators/recursiveDivision.test.ts`

### Task 3: Aldous-Broder 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/aldousBroder.ts` 实现 `generateAldousBroder(visualSize, rng)`
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑
  - 初始：所有 cell `visited = false`；`current = (0, 0)`；`visited[0] = true`
  - 循环（直到所有 cell visited）：
    - 随机选 `current` 的一个邻居（在边界内）
    - 如果邻居未 visited：加边（current → 邻居），`visited[neighbor] = true`
    - `current = neighbor`
  - 这是 textbook Aldous-Broder，每次都走（不管是否 visited）
- [ ] **Mirror**: 走 `_expandThickWall` 的 `TreeEdge` 出口
- [ ] **Test**: 8 case（性能容差 1500ms，spec §9 解释）
- [ ] **Validate**: `npm test -- tests/unit/maze/generators/aldousBroder.test.ts`

### Task 4: Wilson's 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/wilsons.ts` 实现 `generateWilsons(visualSize, rng)`
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑
  - 初始：所有 cell `unvisited`；随机挑一个 cell 标记为 `visited`（start point）
  - 循环（直到所有 cell visited）：
    - 随机挑一个 unvisited cell 作为 walk 起点
    - 走 random walk：每步随机选一个邻居（在边界内）
    - 用 `path: number[]` 记录 walk 经过的 cell 序列
    - 如果 walk 进入一个 visited cell：
      - 把 `path` 里所有 cell 加到 `visited` 集合
      - `path` 里相邻 cell 之间加边（生成树边）
      - 清空 `path`
    - 如果 walk 重复经过一个 cell（loop）：
      - 把 `path` 里该 cell 之后的部分丢掉（loop erase）
- [ ] **Mirror**: 走 `_expandThickWall` 的 `TreeEdge` 出口
- [ ] **Test**: 8 case
- [ ] **Validate**: `npm test -- tests/unit/maze/generators/wilsons.test.ts`

### Task 5: 联合类型 + seed 白名单 + provider switch
- [ ] **Action**:
  - `src/maze/types.ts`: `Algorithm` 联合追加 4 个字面量
  - `src/utils/seed.ts`: `VALID_ALGORITHMS` 追加 4 项
  - `src/maze/AlgorithmMazeProvider.ts`: `generateWalls` switch 扩 4 case，import 4 个新 generator
- [ ] **Mirror**: 严格沿用 P2-19 Task 5 的写法
- [ ] **Test**: 既有 `algorithmMazeProvider.test.ts` 全部 8 算法 case 继续通过；`ALGOS` 数组 8 → 12 覆盖 4 个新算法
- [ ] **Validate**: `npm run typecheck && npm test -- tests/unit/maze/algorithmMazeProvider.test.ts`

### Task 6: i18n key
- [ ] **Action**: 在 `src/i18n/resources/zh.ts` 和 `en.ts` 同步加：
  - `levels.algorithm.parallelBacktracker`: "Parallel Backtracker" / "Parallel Backtracker"
  - `levels.algorithm.recursiveDivision`: "Recursive Division" / "Recursive Division"
  - `levels.algorithm.aldousBroder`: "Aldous-Broder" / "Aldous-Broder"
  - `levels.algorithm.wilsons`: "Wilson's" / "Wilson's"
- [ ] **Mirror**: 沿用 P2-19 Task 6 的命名空间 `levels.algorithm.*`
- [ ] **Validate**: `npm test`

### Task 7: LevelSelect 算法下拉扩到 12 项
- [ ] **Action**: 在 `src/ui/LevelSelect.tsx` 的 `ALGORITHM_OPTIONS` 追加 4 项
- [ ] **Mirror**: 沿用 P2-19 既有 8 个 entry 的格式
- [ ] **Test**: `tests/component/menus.test.tsx` 改 1 个断言：option 数 8 → 12
- [ ] **Validate**: `npm test -- tests/component/menus.test.tsx`

### Task 8: 端到端 E2E
- [ ] **Action**: 扩展 `tests/e2e/procedural.spec.ts`：
  - +1 case：直接访问 `algo-v1-recursive-division-30-0123456789abcdef` URL，进游戏后渲染正常
- [ ] **Mirror**: 沿用 P2-19 既有 Eller URL case 写法
- [ ] **Validate**: `npm run test:e2e -- --grep "Recursive Division"`

### Task 9: 文档同步
- [ ] **Action**:
  - `docs/roadmap.md`: P2-20 行从 `pending` 改 `done`，填日期 + 活跃锚点
  - `README.md`: 5.2 章节 8 → 12 算法；增量完成表 + P2-20 行
- [ ] **Validate**: `git diff --stat` 应仅包含本次 P2-20 相关文件

## 验证

实施完毕，所有 Task 勾完，跑：

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

并手动 sanity check：

```bash
# 1. 12 算法 exhaustive 编译期守卫
grep -E "'(parallel-backtracker|recursive-division|aldous-broder|wilsons)'" src/utils/seed.ts
# 期望: 4 行命中

# 2. 算法下拉 12 项
grep -E "(parallel-backtracker|recursive-division|aldous-broder|wilsons)" src/ui/LevelSelect.tsx
# 期望: 4 个 option entry

# 3. URL 种子兼容性
# 旧 seed `algo-v1-recursive-backtracker-30-...` 仍应被 decodeSeed 接受
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Aldous-Broder 50×50 性能超 1500ms | 中 | 单测容差 1500ms；如果还失败，减小 size 或加容差（仍比 RB/Kruskal 慢很多） |
| Wilson's loop erase 实现 bug | 中 | 详细注释 + 单测 8 case；debug 模式下加 invariant 检查 |
| Recursive Division 在 odd visualSize 边界 | 低 | API 限定 size ∈ {15, 30, 50}（odd），直接处理；非 odd 不支持 |
| Parallel Backtracker 颜色合并 race | 低 | 串行实现（不并发）+ 显式 union-find |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] `docs/roadmap.md` / `README.md` 同步
- [ ] 本 plan.md 「执行日志」段填写

---

## 执行日志（实施时填写）

### 实施日期

2026-08-06

### 实际改动文件

**新增**
- `src/maze/generators/parallelBacktracker.ts` — Parallel RB（多 walker + 颜色合并；union 用 O(N) 扫描，因为 logicalSize ≤ 25）
- `src/maze/generators/recursiveDivision.ts` — Recursive Division（直接操作视觉网格，**无 perimeter** — 见下面"遇到的偏差 #2"）
- `src/maze/generators/aldousBroder.ts` — 随机游走，O(N²) 期望游走；OOB 时 stay-put
- `src/maze/generators/wilsons.ts` — Loop-erased random walk；用 Map<flatIdx, positionInPath> 做 loop erase
- `tests/unit/maze/generators/parallelBacktracker.test.ts` — 8 case
- `tests/unit/maze/generators/recursiveDivision.test.ts` — 8 case
- `tests/unit/maze/generators/aldousBroder.test.ts` — 8 case（性能 1500ms 容差）
- `tests/unit/maze/generators/wilsons.test.ts` — 8 case

**修改**
- `src/maze/types.ts` — `Algorithm` 联合 8 → 12
- `src/utils/seed.ts` — `VALID_ALGORITHMS` 8 → 12
- `src/maze/AlgorithmMazeProvider.ts` — `generateWalls` switch 8 → 12 case；import 4 个新 generator
- `src/ui/LevelSelect.tsx` — `ALGORITHM_OPTIONS` 8 → 12
- `src/i18n/resources/zh.ts` + `en.ts` — 4 个新 key
- `tests/unit/maze/algorithmMazeProvider.test.ts` — `ALGOS` 8 → 12
- `tests/component/menus.test.tsx` — option 数断言 8 → 12
- `tests/e2e/procedural.spec.ts` — +1 case：Recursive Division URL
- `docs/roadmap.md` — P2-20 行 + 活跃锚点更新
- `README.md` — 5.2 章节改 12 算法；增量完成表 + P2-20 行

### 遇到的偏差

**#1 Aldous-Broder 性能预算从 500ms 放宽到 1500ms（按 spec 设计）**

实际跑下来 50×50 只用 13ms 远低于 1500ms 预算。spec §9 担心 O(N²) 期望游走有长尾，但 Node V8 + mulberry32 的实现在 50×50 上很快。1500ms 留得足够宽松。

**#2 Recursive Division 不加 perimeter walls，放弃教科书版房间风格**

教科书版 Recursive Division 把外周设成 wall，start/exit 在角上。我最初按 P2-19 Binary Tree 的 post-process 套路写了 BFS 兜底，但发现这种 post-process 沿行/列会"传染"——开了 (0,1) 就把整个第一列开完，最后 maze 完全空。

试了 3 种 post-process 策略都失败：
1. 沿行扫描 + 开第一个 reachable 邻居墙 → 整行被打开
2. 找 boundary cell → BFS 重置太慢
3. Multi-source BFS 找最近可达 cell → 实现复杂且会让大量 wall 被打开

最终决定：**不加 perimeter walls**，让边界保持通路。视觉是"房间在内部 + 可走的外圈"，start/exit 也在角上但跟内部联通。注释里写明 trade-off。

如果后续用户/玩家反馈要求教科书"外围是墙 + 一个入口"风格，再单独开增量（加 floor detection + 强制 door 即可）。

**#3 `AlgorithmForMode` 保持 P2-3 锁定不动**

spec §2 已写"不动 algorithmForMode"，实施按此执行。4 个 mode 仍然绑前 4 个 legacy 算法（reach-exit→recursive-backtracker / time-trial→prim / survive→kruskal / caught-by-enemy→recursive-backtracker）。新 8 算法只通过"指定种子关卡"路径访问。

**#4 `parallel-backtracker` 命名比 jamisbuck 短**

jamisbuck 标题是 "Recursive Backtracking (Parallel Seeds)"，URL 用了 `parallel-backtracker`（spec §12 命名偏离备注里写明了）。玩家在 UI 上看到的是 i18n label "Parallel Backtracker"。

### 测试覆盖

- 单测：1365/1366（1 个历史 skip）
- `npm run typecheck` ✅ 0 错误
- `npm test` ✅ 96 个 test file 1365 passing
- `npm run build` ✅ Vite 生产构建成功（147 modules, 0 警告）
- E2E `procedural.spec.ts` Recursive Division URL case ✅（chromium 2.0s）

### 备注

- `Algorithm` 联合扩到 12 字面量，因为是 URL seed 的一部分（`algo-v1-{algorithm}-{size}-{hex}`），**新增字面量是受控改动**（加在 VALID_ALGORITHMS 末尾，旧字符串继续 decode）。**重命名 / 删除已有字面量 = breaking change**。
- 12 算法全部走 `(visualSize, rng) => CellType[][]` 纯函数签名，**唯一例外仍是 Recursive Division**（直接操作视觉网格 + 12 算法里唯一不做 perimeter）。
- 4 个新 generator 的视觉特征：
  - **Parallel Backtracker**：多个 frontier tree 并行生长，遇到时合并 → "梳子"状通道（与 RB 的"spaghetti"形成对比）
  - **Recursive Division**：外圈可走、内部房间（视觉上跟前 8 个"走廊"感不同）
  - **Aldous-Broder / Wilson's**：均匀采样生成树，无偏、无长走廊；Wilson's 实现是 P2-20 4 个里最复杂的（loop erase + 路径压缩 + visited 跟踪）
- Aldous-Broder 50×50 实际 ~13ms；Wilson's 50×50 实际 < 50ms。1500ms 性能容差对两者都过度宽松。
- 12 算法覆盖了 jamisbuck 网站的 80%（剩 3 个：Houston / Growing Binary Tree / Blobby Recursive Subdivision，spec §2 列为"非目标"）。
