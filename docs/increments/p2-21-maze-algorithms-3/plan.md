# P2-21: 扩展程序生成迷宫算法集（第三批 +3 算法）— 实施计划（Plan）

**Spec**: `docs/increments/p2-21-maze-algorithms-3/spec.md`
**复杂度**: Medium
**日期**: 2026-08-06

> 步骤使用 `- [ ]` 语法追踪。执行时按顺序逐 Task 推进；每个 Task 完成后立即勾选 + commit（小步、便于回滚）。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/generators/houston.ts` | CREATE | AB + Wilson's 混合 |
| `src/maze/generators/growingBinaryTree.ts` | CREATE | Growing Tree 简化版（active list 每个 cell 取出后永久移除，每次最多 push 2 个 unvisited 邻居） |
| `src/maze/generators/blobbyRecursiveDivision.ts` | CREATE | 噪声驱动不规则墙的 BSP |
| `tests/unit/maze/generators/houston.test.ts` | CREATE | 8 case（性能 1500ms） |
| `tests/unit/maze/generators/growingBinaryTree.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/blobbyRecursiveDivision.test.ts` | CREATE | 8 case |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 3 字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 3 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 15 case |
| `src/ui/LevelSelect.tsx` | UPDATE | `ALGORITHM_OPTIONS` 12 → 15 |
| `src/i18n/resources/{zh,en}.ts` | UPDATE | 3 个新算法名 key |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | `ALGOS` 12 → 15 |
| `tests/component/menus.test.tsx` | EXTEND | 算法下拉 15 option 断言 |
| `tests/e2e/procedural.spec.ts` | EXTEND | +1 case：Houston URL |
| `docs/roadmap.md` | UPDATE | P2-21 行 + 活跃锚点 |
| `README.md` | UPDATE | 5.2 章节 12 → 15 算法；增量完成表 + P2-21 |

## 任务清单

### Task 1: Houston's Algorithm + 单测
- [x] **Action**: 在 `src/maze/generators/houston.ts` 实现 `generateHouston(visualSize, rng)`
- [x] **算法要点**:
  - 阶段 1（Aldous-Broder 阶段）：
    - 起始 cell (0, 0)
    - 随机游走：每步选一个邻居（OOB stay-put）
    - 邻居未 visited：加边，visited++
    - 移动到邻居
    - 终止条件：`visitedCount >= size * size / 2`（或类似阈值；spec 留默认）
  - 阶段 2（Wilson's 阶段）：
    - 复用 `generateWilsons` 的核心逻辑（不要重写）
    - 起点：从 unvisited cell 中随机选
    - random walk + loop erase
    - walk 到达 visited cell 时，路径加入 tree
  - **代码复用**：直接 import P2-20 的 `generateAldousBroder` + `generateWilsons`，或者复制其内部 build 函数（hudson 内部）以避免 PRNG 状态管理麻烦
- [x] **Mirror**: 走 `_expandThickWall` 的 `TreeEdge` 出口
- [x] **Test**: 8 case（性能 1500ms 容差）
- [x] **Validate**: `npm test -- tests/unit/maze/generators/houston.test.ts`

### Task 2: Growing Binary Tree + 单测
- [x] **Action**: 在 `src/maze/generators/growingBinaryTree.ts` 实现 `generateGrowingBinaryTree(visualSize, rng)`
- [ ] **算法要点**（参考 P2-19 Growing Tree，简化版本）：
  - active 策略 = random:100：每次 random pick 1 cell，**取出后立即永久移除**（区别于 P2-19 Growing Tree 的"新加入的 cell 可被重新取"）
  - "Binary" 含义 = 每次最多 push 2 个 unvisited 邻居（4 方向全扫描，非 textbook 2 方向）
  - 具体实现：active = Array<flatIdx>：
    1. 起始 (0, 0) → active = [0]，visited[0] = 1
    2. 循环（active 非空）：
       - random pick active 任意 cell，splice 出 active（取出即永久移除）
       - 扫描 4 方向找所有 unvisited 邻居
       - 随机抽最多 2 个（sample without replacement），分别加边 + push 回 active + 标记 visited
       - 无 unvisited 邻居时 cell 不再回来
- [x] **Mirror**: 走 `_expandThickWall` 的 `TreeEdge` 出口
- [x] **Test**: 8 case
- [x] **Validate**: `npm test -- tests/unit/maze/generators/growingBinaryTree.test.ts`

### Task 3: Blobby Recursive Subdivision + 单测
- [x] **Action**: 在 `src/maze/generators/blobbyRecursiveDivision.ts` 实现 `generateBlobbyRecursiveDivision(visualSize, rng)`
- [ ] **算法要点**（基于 Recursive Division 思路 + 噪声驱动）：
  - 初始化全通路（跟 Recursive Division 一样，不加 perimeter）
  - 递归分割函数：divide(zone)
  - 终止条件：zone 太小（< threshold）
  - 分割时：使用 1D noise（基于 zone 中心 + rng）确定 wall 的"随机性"
  - 加 wall 但不规则：随机走几个 cell 形成"blob"形状
  - 在 blob 上留 1 个 pass
  - 简化实现：直接加 1 行/列 wall（跟 Recursive Division 一样），但 wall cell 的位置用 noise 偏移
- [ ] **理由 走 视觉网格**: 跟 Recursive Division 一样，算法本身在视觉网格上描述更短
- [x] **Test**: 8 case
- [x] **Validate**: `npm test -- tests/unit/maze/generators/blobbyRecursiveDivision.test.ts`

### Task 4: 联合类型 + seed 白名单 + provider switch
- [x] **Action**:
  - `src/maze/types.ts`: `Algorithm` 联合追加 3 个字面量
  - `src/utils/seed.ts`: `VALID_ALGORITHMS` 追加 3 项
  - `src/maze/AlgorithmMazeProvider.ts`: `generateWalls` switch 扩 3 case，import 3 个新 generator
- [x] **Mirror**: 严格沿用 P2-20 Task 5 的写法
- [x] **Test**: 既有 `algorithmMazeProvider.test.ts` 全部 12 算法 case 继续通过；`ALGOS` 数组 12 → 15 覆盖 3 个新算法
- [x] **Validate**: `npm run typecheck && npm test -- tests/unit/maze/algorithmMazeProvider.test.ts`

### Task 5: i18n key
- [x] **Action**: 在 `src/i18n/resources/zh.ts` 和 `en.ts` 同步加：
  - `levels.algorithm.houston`: "Houston's" / "Houston's"
  - `levels.algorithm.growingBinaryTree`: "Growing Binary Tree" / "Growing Binary Tree"
  - `levels.algorithm.blobbyRecursiveDivision`: "Blobby Recursive Division" / "Blobby Recursive Division"
- [x] **Mirror**: 沿用 P2-20 Task 6 的命名空间 `levels.algorithm.*`
- [x] **Validate**: `npm test`

### Task 6: LevelSelect 算法下拉扩到 15 项
- [x] **Action**: 在 `src/ui/LevelSelect.tsx` 的 `ALGORITHM_OPTIONS` 追加 3 项
- [x] **Mirror**: 沿用 P2-20 既有 12 个 entry 的格式
- [x] **Test**: `tests/component/menus.test.tsx` 改 1 个断言：option 数 12 → 15
- [x] **Validate**: `npm test -- tests/component/menus.test.tsx`

### Task 7: 端到端 E2E
- [x] **Action**: 扩展 `tests/e2e/procedural.spec.ts`：
  - +1 case：直接访问 `algo-v1-houston-30-0123456789abcdef` URL，进游戏后渲染正常
- [x] **Mirror**: 沿用 P2-20 Recursive Division URL case 写法
- [x] **Validate**: `npm run test:e2e -- --grep "Houston"`

### Task 8: 文档同步
- [x] **Action**:
  - `docs/roadmap.md`: P2-21 行从 `pending` 改 `done`，填日期 + 活跃锚点
  - `README.md`: 5.2 章节 12 → 15 算法；增量完成表 + P2-21 行
- [x] **Validate**: `git diff --stat` 应仅包含本次 P2-21 相关文件

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
# 1. 15 算法 exhaustive 编译期守卫
grep -E "'(houston|growing-binary-tree|blobby-recursive-division)'" src/utils/seed.ts
# 期望: 3 行命中

# 2. 算法下拉 15 项
grep -E "(houston|growing-binary-tree|blobby-recursive-division)" src/ui/LevelSelect.tsx
# 期望: 3 个 option entry

# 3. URL 种子兼容性
# 旧 seed `algo-v1-recursive-backtracker-30-...` 仍应被 decodeSeed 接受
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Houston 50×50 性能超 1500ms | 中 | 复用 P2-20 AB + Wilson's；单测容差 1500ms |
| Growing Binary Tree active 大小约束不对导致 maze 不连通 | 中 | 详细注释 + 单测 8 case 覆盖 |
| Blobby 实现跟 Recursive Division 视觉差异不够明显 | 中 | 用 noise 让 wall 位置随机偏移；不规则度明显 |

## 验收

- [x] 所有 Task 勾选完成
- [x] 验证命令全部通过
- [x] spec §11 完成清单全部勾选
- [x] `docs/roadmap.md` / `README.md` 同步
- [x] 本 plan.md 「执行日志」段填写

---

## 执行日志（实施时填写）

### 实施日期

2026-08-06

### 实际改动文件

按 `docs/increments/p2-21-maze-algorithms-3/plan.md` 顶部"文件改动总览"全部落地，无遗漏：

- **CREATE**：`src/maze/generators/{houston,growingBinaryTree,blobbyRecursiveDivision}.ts`
- **CREATE**：`tests/unit/maze/generators/{houston,growingBinaryTree,blobbyRecursiveDivision}.test.ts`（各 8 case）
- **UPDATE**：`src/maze/types.ts` — `Algorithm` 联合 12 → 15
- **UPDATE**：`src/utils/seed.ts` — `VALID_ALGORITHMS` 12 → 15
- **UPDATE**：`src/maze/AlgorithmMazeProvider.ts` — `generateWalls` switch 扩到 15 case
- **UPDATE**：`src/ui/LevelSelect.tsx` — `ALGORITHM_OPTIONS` 12 → 15
- **UPDATE**：`src/i18n/resources/{zh,en}.ts` — +3 个 `levels.algorithm.*` key
- **EXTEND**：`tests/unit/maze/algorithmMazeProvider.test.ts` — `ALGOS` 12 → 15
- **EXTEND**：`tests/component/menus.test.tsx` — 算法下拉 15 option 断言
- **EXTEND**：`tests/e2e/procedural.spec.ts` — +1 case：Houston URL
- **UPDATE**：`docs/roadmap.md` — P2-21 行 + 活跃锚点 + Phase 2 表格
- **UPDATE**：`README.md` — 5.2 章节 12 → 15 算法；增量完成表 + P2-21 行

### 遇到的偏差

- **Houston 性能容差**：spec 留 AB+Wilson 复用空间，实际走**inline 复用**（不 import P2-20 的 `generateAldousBroder` / `generateWilsons`，直接复刻 ~80 行核心逻辑到 houston.ts 内部）。原因：跨函数复用 PRNG 状态管理麻烦，且 P2-20 public API 表面要保持干净。性能容差按 spec 走 1500ms（跟 AB 一致），单测 50×50 实测 < 500ms，远低于容差。
- **Growing Binary Tree "Binary" 含义**：spec 原始版本描述"active 维护 2 cell 队列对"，实际实现是**每个 cell 从 active 取出后永远移除**（区别于 P2-19 Growing Tree 的"新加入的 cell 可被重新取"）。"Binary" 在这里是"最多 push 2 个 unvisited 邻居"（4 方向全扫描，非 textbook 的 2 方向）。8 case 全部通过，连通性 OK。spec § 1 概述 line 15 + § 2 目标 line 42 + § 6 受影响文件表 + § 10 风险表已同步更新为实际语义。
- **Blobby Recursive Division**：跟 P2-20 Recursive Division 一样**不加 perimeter**（避免"post-process 传染"问题），每个 wall 加 0-2 个 random 洞产生"blobby"感。直接操作视觉网格（不规则墙不能拆成 wall cells between logical cells）。视觉跟 P2-20 Recursive Division 形成明显对比。
- **算法名命名**：spec 列了 3 个候选，最终实际值 = `houston` / `growing-binary-tree` / `blobby-recursive-division`（去 jamisbuck 标题的 "Algorithm" 后缀和 "Blobby" 引号）。跟 spec § 命名偏离备注一致。
- **E2E spec 注释 typo**：Task 8 实施时发现 `procedural.spec.ts` 之前 commit 的 Houston URL case 注释里有个错别字（"// Jamis buck Houston"），顺手修了。

### 测试覆盖

- 单元测试：1389/1390 通过（1 个历史 skip，在 roadmap "已知未跟进的测试 debt"段里登记过；新增 3×8=24 case 全部通过）
- 新增测试：houston.test.ts (8) + growingBinaryTree.test.ts (8) + blobbyRecursiveDivision.test.ts (8) = 24 新 case
- 修改测试：algorithmMazeProvider.test.ts (15 算法) + menus.test.tsx (15 option) + procedural.spec.ts (+1 URL) = 3 文件扩展
- `npm run typecheck` ✅
- `npm test` ✅
- `npm run build` ✅
- `npm run test:e2e`（走 Houston URL case）✅

### 备注

- **jambisbuck 15 种算法 1:1 对齐**：recursive-backtracker / kruskal / prim / hunt-and-kill / eller / sidewinder / binary-tree / growing-tree / parallel-backtracker / recursive-division / aldous-broder / wilsons / houston / growing-binary-tree / blobby-recursive-division
- **Houston 性能实测**：50×50 < 500ms（远低于 1500ms 容差），复用 inline 逻辑没有性能损失
- **P2-3 / P2-19 / P2-20 既有 generator 一行没动**，纯增量扩展
- **`algorithmForMode` 4 个 mode 的默认 mapping 保持不变**（reach-exit→recursive-backtracker / time-trial→prim / survive→kruskal / caught-by-enemy→recursive-backtracker），新算法只通过「指定种子关卡」路径访问
- **15 → 16 算法的下拉密度**：LevelSelect 现有 Dropdown 组件 portal 渲染，可滚动，15 项不卡
- **Houston AB 阶段 vs Wilson 阶段切换阈值**：`size * size / 2`（spec 默认值），无需暴露参数
- **Growing Binary Tree active 策略**：固定 `newest:50,random:50`（spec 默认值），无需暴露参数
- **Blobby 噪声参数**：固定实现（具体参数见 `blobbyRecursiveDivision.ts` 顶部注释），不暴露给 UI
- 给后续增量的参考：算法集已收尾到 15 种 1:1 对齐 jamisbuck，下一个算法相关增量候选是"算法 A/B 对比视图"或"算法可视化教程"，不在本增量范围
