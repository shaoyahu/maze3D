# 3D 迷宫生成算法调研

**Slug**: research/3d-maze-algorithms
**作者**: P3-1a workstream
**对应 Spec**: `docs/increments/p3-1-multi-level-mazes/spec.md` §14（Q8）
**目的**: 为 P4 真 3D 体素迷宫增量做技术储备
**状态**: 调研结论（不写代码，等 P4 立项）

---

## 总览

3D 迷宫生成是经典 2D 迷宫生成在立方体格点上的直接推广，核心区别只是从 4 邻居 (±x, ±z) 扩展到 6 邻居 (±x, ±y, ±z)。但"3D"在游戏行业里含义混乱：P3-1 的多层是"2D 堆叠"（每层独立 2D + transition），而 P4 谈的"真 3D"是单个立方体空间内 `walls: CellType[][][]` 的体素迷宫（玩家可以在前后左右上下自由穿行，类似 Metroid Prime 的 3D 关卡或《Maze 3D》Steam 游戏里的那种）。

调研范围聚焦后者。当前学术 / 工业界的 3D 迷宫生成资料相对零散：3D Prim / 3D Recursive Backtracker 是把 2D 算法机械扩展，几乎无新意；Wilson 和 Aldous-Broder 在 3D 上有严肃数学（Peres & Revelle 关于 3D UST 缩放极限的工作），但运行时间随维度急剧恶化；BSP 和 Cellular Automata 在 3D 几乎没有人写过"3D 适配指南"，参考实现寥寥。把这事做对的关键不是"找到完美算法"，而是"在 maze3D 现有数据模型 + 15 个 2D generator 沉淀上，挑 3 个能落地的"。

---

## 算法 1: 3D Prim

**原理**：3D 立方体格点上的 randomized Prim。维护一个"前沿"集合（已经入树、但仍有未访问邻居的 cell），从种子里反复随机选一个前沿 cell，检查它的 6 个邻居中未访问的、随机挑一个打通、加入树。与 2D 唯一的差别是 4 邻居 → 6 邻居。输出是一棵"立方体形状"的 spanning tree。

**复杂度**：O(N log N)，N = logicalSize³；期望迷宫长度 O(N)，与 2D Prim 同量级；额外 O(N) 空间存前沿和 visited。3D 立方体上 N = 10³ = 1000，比 2D 的 10² = 100 大 10 倍，但因为只是多 2 个邻居分支，开销是常数因子。

**数据模型适配**：
- 与 2D `CellType[][]`：完全解耦。3D Prim 直接在 `CellType[][][]`（z × y × x）上跑，不复用任何 2D 路径。
- 真 3D 表示：必须用 `CellType[][][]`（typed array 最佳），因为 `visualSize=15` 时 3D 立方体 = 15³ = 3375 cell，3 维数组内存 ~10 KB（Uint8Array）；sparse 表示在 50³ = 125000 cell 时才需要考虑。
- 对接成本：**中**。需要新写 `generatePrim3D(visualSize, rng): CellType[][][]` 函数，复用 `_expandThickWall` 思路改写成 3D 版本（逻辑格点 + 6 方向邻接）。
- 3D BFS reachability：O(N) per test（visited + queue），与 2D 等价复杂。

**性能预估**：20×20×20 logicalSize=10，N=1000 cell，期望 < 50ms。50×50×50 N=15625 估 < 1s。

**风险 / 注意点**：3D Prim 在视觉上比 2D 更"密集"（branching factor 6 比 4 大 50%），走起来反而更简单、容易绕远。

**实现预估**：1.5 天（含单测 + 现有 `_expandThickWall` 工具改造）。

**参考资料**:
- Wikipedia: <https://en.wikipedia.org/wiki/Maze_generation_algorithm#Randomized_Prim's_algorithm>
- Jamis Buck, "Mazes for Programmers" Ch.4（2D Prim 模板，扩展到 3D 直接）
- Peres & Revelle, "Scaling limits of the uniform spanning tree and loop-erased random walk on finite graphs"（2005）— 3D UST 缩放极限

---

## 算法 2: 3D Recursive Backtracker

**原理**：3D 立方体格点上的 DFS。栈式回溯，起点入栈后重复：若当前 cell 有未访问邻居（6 方向中），随机挑一个打通、推入栈；否则弹栈回溯。输出也是 spanning tree，但路径"扭曲度"比 Prim 高——有 3D 等价的"主路感"。

**复杂度**：O(N)，N = logicalSize³。每次 push/pop O(1)，每个 cell 处理一次。3D 立方体的 worst-case 栈深度 = N（一条直线），与 2D 一样大。

**数据模型适配**：
- 与 2D：完全解耦。DFS 主体逻辑 1:1 翻译 4 邻居 → 6 邻居即可。
- 真 3D 表示：与 3D Prim 相同，`CellType[][][]` Uint8Array。
- 对接成本：**低**。是 8 个算法里最容易从 2D 迁移的，因为 `recursiveBacktracker.ts` 主体只用了 `edges[][]` 位掩码 + 4 邻居函数，改成 6 邻居 + 3D 数组即可。
- 3D BFS reachability：O(N) per test。

**性能预估**：20³ 估 < 30ms（DFS 比 Prim 略快，frontier 操作更少）；50³ 估 < 500ms。

**风险 / 注意点**：3D DFS 容易产生"螺旋下降"路径（往一个方向走 10 步后回溯），走起来非常绕、视觉上有"鬼打墙"感。P4 落地时建议用 `orderedDirs` 的随机性打破单调下潜。

**实现预估**：1 天（最简单，从 2D 改 6 邻居）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Maze_generation_algorithm#Randomized_depth-first_search>
- Jamis Buck: <http://weblog.jamisbuck.org/2010/12/27/maze-generation-recursive-backtracking>
- 现有 2D 实现: `src/maze/generators/recursiveBacktracker.ts`（迁移模板）

---

## 算法 3: 3D Aldous-Broder

**原理**：3D 上的均匀生成树（UST）采样器。随机游走：起始 cell 标 visited；每步随机选 6 邻居之一走过去；**如果**新 cell 未 visited，就打通当前到新 cell 的墙并标 visited。无论是否打通，都继续走。直到所有 cell visited。3D 立方体上 hitting time = O(N²)（维度越高，随机游走覆盖时间越长）。

**复杂度**：期望 O(N²)，N = logicalSize³。这是最显著的 3D vs 2D 差异：2D 是 O(N²) 但常数小，3D 是 O(N²) 但 N 涨 10 倍、实际开销是 2D 的 ~100 倍。N=1000 时 3D 期望 hit time 约 10⁶ 步。

**数据模型适配**：
- 与 2D：解耦，但需要新的 PRNG 调用模式（6 邻居 pick 比 4 邻居多 1 个 rng()）。
- 真 3D 表示：`CellType[][][]` 同上。
- 对接成本：**中**。3D 主体逻辑 1:1 翻译，主要工作是把 O(N) 的 visited set 优化到 O(1) lookup（Uint8Array），否则 20³ 也能跑几秒。
- 3D BFS reachability：O(N)，算法完成后做一次验证。

**性能预估**：20³ 期望 ~2-5s；50³ 期望 ~5-15 分钟（基本不可用）。这是 P4 必须量化的"costly algorithms"。

**风险 / 注意点**：3D 立方体的 random walk 已知"3D random walk 是 transient 的"（与 2D recurrent 相反），实际分布不是真正的 UST 而是"biased UST"，走廊偏长且有 drift。要 P4 接受这个 bias 还是用 Wilson 替代，文档需明确。

**实现预估**：2 天（含性能压测）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Maze_generation_algorithm#Aldous-Broder_algorithm>
- Jamis Buck: <http://weblog.jamisbuck.org/2011/1/17/maze-generation-aldous-broder-algorithm>
- Peres & Revelle (2005) 3D UST 缩放极限

---

## 算法 4: 3D Wilson's

**原理**：3D 上的真正 UST 采样器。loop-erased random walk（LERW）：从任一未 visited cell 出发做 random walk（6 邻居），如果 walk 撞到当前路径形成环，就 erase 这个环；如果撞到 visited 集合，就接受整条 walk 为树。重复直到所有 cell visited。Wilson 的"UERW 退火"特性保证最终分布是 exact UST。

**复杂度**：3D 上的 LERW 已知增长指数 ≈ 0.14 (Peres & Revelle 2005 的 d=3 case)，远小于 2D 的 5/4。期望总步数 = O(N²) ~ 同 Aldous-Broder 同量级。但因为是 perfect UST，分布更"自然"（长廊少、branching 多）。

**数据模型适配**：
- 与 2D：参考 `wilsons.ts` 的 `pathIndex: Map<cell, position>` 模式，3D 直接改 key = `${x},${y},${z}`。
- 真 3D 表示：spanning tree 本身用 `Set<number>` 邻接表（同 2D），但 cell index = `(y*size + z)*size + x`（一维 flatten）。
- 对接成本：**中-高**。`wilsons.ts` 的 loop erase 逻辑对 3D 透明，但 3D 的 walk 步数是 2D 的 10² 倍，需要做 PRNG 批量优化（同 Houston 的优化思路）。
- 3D BFS reachability：O(N)。

**性能预估**：20³ 期望 ~3-8s（比 Aldous-Broder 略慢但分布更好）；50³ 期望 ~10-30 分钟（仍不可用）。需要 P4 设计"小尺寸 Wilson（≤10³）+ 大尺寸用别的算法"的分级策略。

**风险 / 注意点**：3D Wilson 的"wait time"已知比 2D 大很多（2D 的 first passage 短，3D 的 first passage 长），用户会看到"长时间没反应"。

**实现预估**：3 天（最难，需要 loop erase 调优 + 性能压测）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Loop-erased_random_walk>
- ermeel86/wilsons_algorithm_in_python: <https://github.com/ermeel86/wilsons_algorithm_in_python>（explicit cubic lattice 实现）
- Peres & Revelle (2005): "Scaling limits of the uniform spanning tree and loop-erased random walk on finite graphs"
- 现有 2D 实现: `src/maze/generators/wilsons.ts`

---

## 算法 5: 3D Eller

**原理**：3D 立方体的逐层（Y 轴）扫描。2D Eller 是"行扫描 + set union + down carve"；3D 扩展为"slice 扫描 + set union + Y 方向 carve"。每层内部做 2D Eller（4 邻居 + set 维护），然后每个 set 至少 1 个 cell 向 Y 方向打通到下一 slice（否则 set 与下一层断开）。最后一片强制 union 保证连通。

**复杂度**：O(N)，N = logicalSize³。每 cell 处理一次：2D Eller 是 O(slice²) 总、Y 方向 carve 是 O(slice²) 总（per slice），所以是 O(slices × slice²) = O(slice³) = O(N)。

**数据模型适配**：
- 与 2D：参考 `eller.ts` 的 rowSets + cameFromAbove 模式，3D 扩展为 `sliceSets[x, z]` + 同样模式。
- 真 3D 表示：算法主体在 logical 3D 立方体上跑（用邻接表 + Uint16Array 的 set id），输出用 `CellType[][][]`。
- 对接成本：**中**。`eller.ts` 的 100 行 2D 逻辑需要扩展为 3D（约 150-180 行），主要工作是 Y 方向 carve 时的 set 处理。
- 3D BFS reachability：O(N) 验证最后一片是否全连通。

**性能预估**：20³ 估 < 50ms（最快的一档，因为 1 维是行扫描，cache 友好）；50³ 估 < 500ms。

**风险 / 注意点**：3D Eller 的"Y 方向 carve 概率"如果选 50%，可能让某些 cell 与 Y 方向断开（视觉上"垂直通道太少"），需要调参或固定 carve 数。

**实现预估**：2.5 天（中等，复用 2D 模式但 3D 调试更难）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Maze_generation_algorithm#Eller's_algorithm>
- Jamis Buck: <http://weblog.jamisbuck.org/2010/12/29/maze-generation-eller-s-algorithm>
- 现有 2D 实现: `src/maze/generators/eller.ts`

---

## 算法 6: 3D BSP

**原理**：3D 立方体的递归空间分割。2D BSP 是"在房间中央画横竖线分成 4 块，每块在 3 面墙上挖洞连接"；3D 扩展为"在立方体中央画 X / Y / Z 三个方向的分割面，分成 8 个子立方体（octree 风格），每个子立方体在 7 个面上挖洞连接"。递归到无法分割为止。

**复杂度**：O(N) expected，O(N log N) worst case（分割不平衡时）。N = logicalSize³。每个 cell 处理 1 次 set 标签，连接墙是 7 个面。

**数据模型适配**：
- 与 2D：参考 `_subdivideBsp.ts`，3D 改写为 8 路分割（不是 4 路）。
- 真 3D 表示：算法主流程不直接生成 walls，而是先生成 room boundaries + 连接列表，最后用 `CellType[][][]` 填充。可以在 P4 中复用 P2-21 的 BSP 边界生成器。
- 对接成本：**高**。8 路分割的边界 case 比 4 路多 1 倍，子立方体不平衡的可能性更高。
- 3D BFS reachability：O(N) 验证 BSP 树连通性。

**性能预估**：20³ 估 < 100ms（最坏情况分割 5-6 层）；50³ 估 < 2s。

**风险 / 注意点**：3D BSP 视觉上"长直线多"，跟 2D 一样缺乏分支、容易走到底；3D 特别容易"死胡同"（3D 空间里 7 个面都要考虑，1 个不通就死）。Wikipedia 反复提到 3D BSP 比 2D BSP 视觉效果差。

**实现预估**：3 天（边界条件多）。

**参考资料**:
- Wikipedia: <https://en.wikipedia.org/wiki/Binary_space_partitioning#Application_to_mazes>
- Jamis Buck: <http://weblog.jamisbuck.org/2011/1/12/maze-generation-recursive-division-algorithm>
- 现有 2D BSP: `src/maze/generators/recursiveDivision.ts` + `_subdivideBsp.ts`

---

## 算法 7: 3D Cellular Automata

**原理**：3D 版本的元胞自动机 cave generation。区别于 spanning tree 算法：CA 不保证连通性，也不生成"迷宫树"，而是生成"有机的洞穴结构"。规则通常是 B5-7/S6-8 之类：cell 下一状态是 wall 还是 passage，由它的 6 / 26 邻居中 wall 的数量决定。迭代 N 次（通常 4-6）达到稳定结构。

**复杂度**：O(iterations × N)，N = logicalSize³。每次迭代扫所有 cell、检查 6 或 26 邻居、查表。iterations=5 时 20³ 估 5 次扫描 = 5000 cell × 5 = 25K 操作。

**数据模型适配**：
- 与 2D：CA 是"非 spanning tree"，跟现有 15 个 generator 形态完全不同（新概念，要新增 generator category）。
- 真 3D 表示：`CellType[][][]` 是天然表示（CA 一次状态就是一个 3D 数组）。
- 对接成本：**中**。算法本身是 3D 原生，但与现有 generator registry 签名 `(visualSize, rng) => CellType[][][]` 完全不冲突（只是多 1 维），且不保证连通性——需要后处理"挑最大连通 component 作为迷宫"。
- 3D BFS reachability：CA 输出不一定连通，必须 BFS 找最大连通块。

**性能预估**：20³ iterations=5 估 < 200ms；50³ iterations=5 估 < 3s。

**风险 / 注意点**：CA 不保证连通性，P4 落地时需要"找最大连通 component + 补 wall 隔离"的后处理；CA 在 3D 容易出现"巨大 open chamber"（无迷宫感）— 需要调 rule 阈值。

**实现预估**：2 天（算法简单 + 后处理连通性 1 天）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Cellular_automaton#Mazes>
- RogueBasin: <http://www.roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels>（2D 经典资源，3D 思路相同）
- "Mazes for Programmers" Ch.11（cave generation 章节）

---

## 算法 8: 3D Kruskal

**原理**：3D 立方体上的 randomized Kruskal。把所有 6N³ 边（每个 cell 6 条，共享后 3N³ 条）随机打乱，按顺序 union 6 邻居：若两个 cell 不在同一 union set，就打通并 union。输出 UST。

**复杂度**：O(N log N) expected，N = logicalSize³。Union-Find 用 path compression + union by rank 是 α(N) amortized。3D 比 2D 多 50% 边要处理，2D N² 边 3D 3N³ 边。

**数据模型适配**：
- 与 2D：参考 `kruskal.ts` 的 Union-Find 实现，3D 改 4 邻居 → 6 邻居。
- 真 3D 表示：union-find 用 `Uint16Array` parent + rank，walls 用 `CellType[][][]`。
- 对接成本：**低**。算法主体 1:1 翻译，2D 实现 50 行可改 3D 70 行。
- 3D BFS reachability：O(N)。

**性能预估**：20³ 估 < 80ms；50³ 估 < 1s。

**风险 / 注意点**：3D Kruskal 视觉"乱"（每条边等概率，与 2D 一样），在 3D 容易产生"球状"结构（中心密、边缘稀）。

**实现预估**：1.5 天（与 3D Prim 同档）。

**参考资料**:
- <https://en.wikipedia.org/wiki/Maze_generation_algorithm#Randomized_Kruskal's_algorithm>
- Jamis Buck: <http://weblog.jamisbuck.org/2011/1/3/maze-generation-kruskal-s-algorithm>
- 现有 2D 实现: `src/maze/generators/kruskal.ts`

---

## 其他（简评）

**3D Sidewinder / 3D Binary Tree / 3D Hunt-and-Kill / 3D Growing Tree**：这 4 个算法在 2D 都有偏置（Sidewinder 长直道、Binary Tree 东北偏、Hunt-and-Kill 偏长路），3D 扩展后偏置更明显且视觉感"单调"，P4 优先级低。Java Maze3D GitHub 项目实测用过 Growing Tree on 3D（<https://github.com/adammilan/Java-Maze3d_Full>），代码可参考但 3D 偏置问题没解决。

---

## P4 推荐 top 3

1. **3D Recursive Backtracker**（首选）—— 从 2D 1:1 改 6 邻居，1 天实现；视觉"扭曲有探索感"是 3D 玩家最喜欢的形态；maze3D 现有 2D RB 模板完整可复用。

2. **3D Prim**（次选）—— 与 3D RB 互补，branching 多、不容易走死；现有 `_expandThickWall` 工具改 3D 后整个 generator family 都受益；性能好（20³ < 50ms），适合"快速生成多迷宫"场景。

3. **3D Cellular Automata**（视觉差异化）—— 不是 spanning tree，产出"洞穴感"结构，跟 P4 主打的"非 P3-1 堆叠 2D"差异化最强；cave generation 视觉与现有 2D 迷宫完全不像，能直接拉开"真 3D"的辨识度；不保证连通性这个缺点在 P4 可以通过"后处理挑最大连通块 + 放 transition 楼梯连接隔离区"化解。

不推荐 3D Wilson / 3D Aldous-Broder（P4 默认 20³ 性能可用但 50³ 不可用，UST 优势用户感知不到）；不推荐 3D BSP（视觉长直 + 死胡同多，跟 3D 立体感相悖）。
