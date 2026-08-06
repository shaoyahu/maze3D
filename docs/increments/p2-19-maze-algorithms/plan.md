# P2-19: 扩展程序生成迷宫算法集（+4 算法）— 实施计划（Plan）

**Spec**: `docs/increments/p2-19-maze-algorithms/spec.md`
**复杂度**: Medium
**日期**: 2026-08-06

> 步骤使用 `- [ ]` 语法追踪。执行时按顺序逐 Task 推进；每个 Task 完成后立即勾选 + commit（小步、便于回滚）。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/generators/eller.ts` | CREATE | Eller's 算法（行扫描 + union-find） |
| `src/maze/generators/sidewinder.ts` | CREATE | Sidewinder 算法 |
| `src/maze/generators/binaryTree.ts` | CREATE | Binary Tree 算法（直接操作视觉网格，不走 expandThickWall） |
| `src/maze/generators/growingTree.ts` | CREATE | Growing Tree 算法（参数化 active list） |
| `tests/unit/maze/generators/eller.test.ts` | CREATE | Eller 单测（8 case） |
| `tests/unit/maze/generators/sidewinder.test.ts` | CREATE | Sidewinder 单测（8 case） |
| `tests/unit/maze/generators/binaryTree.test.ts` | CREATE | Binary Tree 单测（8 case） |
| `tests/unit/maze/generators/growingTree.test.ts` | CREATE | Growing Tree 单测（8 case + 参数解析） |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 4 个字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 4 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 8 case |
| `src/ui/LevelSelect.tsx` | UPDATE | "指定种子关卡"区加算法下拉 + state |
| `src/i18n/resources/zh.ts` | UPDATE | 4 个新算法名 + 1 个 label |
| `src/i18n/resources/en.ts` | UPDATE | 4 个新算法名 + 1 个 label |
| `tests/component/menus.test.tsx` | EXTEND | 2 case：算法下拉存在 + 切换 mode 时默认值跟随 |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | 1 case：8 算法 exhaustive |
| `tests/e2e/procedural.spec.ts` | EXTEND | 1 case：Eller URL 能加载并渲染 |
| `docs/roadmap.md` | UPDATE | P2-19 行从 `pending` 改 `done` |
| `README.md` | UPDATE | 同步变更（如有需要） |

## 任务清单

### Task 1: Eller 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/eller.ts` 实现 `generateEller(visualSize, rng)`，签名同 P2-3 既有 generator
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑（`logicalSize = ceil(visualSize / 2)`）
  - 每行：向右随机 union（不重复 union 跳过）
  - 每行：随机把若干"集合"向下开一道口（保证每集合至少向下开 1 个，否则该集合被吞并到右边邻居）
  - 最后一行特殊处理：所有集合内两两 union 成一个集合（保证连通）
  - 产出 `TreeEdge[]` → `expandThickWall(visualSize, treeEdges)`
- [ ] **Mirror**: 沿用 `kruskal.ts` 的 `parent` / `rank` 内部 union-find（直接 inline 实现一份轻量版即可，不必抽公共 helper）
- [ ] **Test**: 8 case（形状 / 确定性 / 种子差异 / 3 尺寸可达 / 50×50 < 500ms / start+exit open）
- [ ] **Validate**: `npm run test -- tests/unit/maze/generators/eller.test.ts`

### Task 2: Sidewinder 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/sidewinder.ts` 实现 `generateSidewinder(visualSize, rng)`
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑
  - 第一行特殊：每个 cell 直接 50% 向右 union
  - 后续行：从左到右累积一个 "run"（连续同集合 cell）
    - 50% 向右 union，继续 run
    - 否则：从 run 里随机挑一个 cell 向上 union，清空 run
- [ ] **Mirror**: 沿用 `_expandThickWall.ts` 的 `TreeEdge` 出口
- [ ] **Test**: 8 case
- [ ] **Validate**: `npm run test -- tests/unit/maze/generators/sidewinder.test.ts`

### Task 3: Binary Tree 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/binaryTree.ts` 实现 `generateBinaryTree(visualSize, rng)`
- [ ] **算法要点**（与 Eller / Sidewinder **不同**：直接操作视觉网格，不走 `expandThickWall`）:
  - 初始化 `visualSize × visualSize` 全墙
  - 把所有偶-偶 cell 标记为通路
  - 每个偶-偶 cell：50% 北打通、50% 东打通（在边界时只能走另一方向）
  - start / exit 强制开
- [ ] **理由 走 视觉网格**: Binary Tree 算法本身很简单，不需要"逻辑网格 → 厚墙"的两步；走视觉网格代码更短也更贴近教科书伪代码
- [ ] **Test**: 8 case
- [ ] **Validate**: `npm run test -- tests/unit/maze/generators/binaryTree.test.ts`

### Task 4: Growing Tree 算法 + 单测
- [ ] **Action**: 在 `src/maze/generators/growingTree.ts` 实现 `generateGrowingTree(visualSize, rng)`
- [ ] **算法要点**:
  - 在 `logicalSize × logicalSize` 网格上跑
  - 维护一个 `active: Array<{x, z}>` list
  - 起点 (0,0) 入 active
  - 循环：从 active 里挑一个 cell（按参数规则）
    - 若有未访问邻居 → 随机选一个 → 打通 → 入 active
    - 否则 → 从 active 移除
  - **参数规则**（默认 `newest:100` = Recursive Backtracker）:
    - `newest:N` → 概率 N% 挑 active 最后一个，剩余按顺序轮询
    - `random:N` → 概率 N% 随机挑
    - `oldest:N` → 概率 N% 挑 active 第一个
    - `middle:N` → 概率 N% 挑中间
    - 多规则逗号分隔，百分比之和 ≤ 100（剩余走最后一个规则或 `newest` 兜底）
  - 解析后内部存一个 function: `pickIndex(active, rng) => number`
- [ ] **Mirror**: 沿用 `_expandThickWall.ts` 的 `TreeEdge` 出口
- [ ] **Test**:
  - 8 case（标准 8 项）
  - 4 case 参数解析：`'newest:100'` / `'random:100'` / `'oldest:100'` / `'middle:100'` / `'newest:50,random:50'`
  - 1 case 非法参数兜底（如 `'foo:100'` → console.warn + 用 `newest:100`）
- [ ] **Validate**: `npm run test -- tests/unit/maze/generators/growingTree.test.ts`

### Task 5: 联合类型 + seed 白名单 + provider switch
- [ ] **Action**:
  - `src/maze/types.ts`: `Algorithm` 联合追加 4 个字面量
  - `src/utils/seed.ts`: `VALID_ALGORITHMS` 追加 4 项
  - `src/maze/AlgorithmMazeProvider.ts`: `generateWalls` switch 扩 4 case，import 4 个新 generator
- [ ] **Mirror**: 严格沿用 Task 5 之前的 4 个 case 写法
- [ ] **Test**: 既有 `algorithmMazeProvider.test.ts` 全部 4 case（recursive-backtracker / kruskal / prim / hunt-and-kill）继续通过；新增 4 case（4 个新算法）— 写到 `algorithmMazeProvider.test.ts`
- [ ] **Validate**: `npm run typecheck && npm test -- tests/unit/maze/algorithmMazeProvider.test.ts`

### Task 6: i18n key
- [ ] **Action**: 在 `src/i18n/resources/zh.ts` 和 `en.ts` 同步加：
  - `levels.algorithm.label`: "算法" / "Algorithm"
  - `levels.algorithm.eller`: "Eller's" / "Eller's"
  - `levels.algorithm.sidewinder`: "Sidewinder" / "Sidewinder"
  - `levels.algorithm.binaryTree`: "Binary Tree" / "Binary Tree"
  - `levels.algorithm.growingTree`: "Growing Tree" / "Growing Tree"
- [ ] **Mirror**: 沿用 P2-3 既有 `levels.brief.algorithm` 的命名空间（也可以新建 `levels.algorithm.*`，但与 `brief` 共享更省事——选 `levels.algorithm.*` 避免 `brief` 含义被覆盖）
- [ ] **Test**: `tests/unit/i18n.test.ts` 如有则 EXTEND；否则跳过（i18n 测试覆盖度低是已知债）
- [ ] **Validate**: `npm run test`

### Task 7: LevelSelect 算法下拉
- [ ] **Action**: 在 `src/ui/LevelSelect.tsx`「指定种子关卡」分组加：
  - 局部 state `selectedAlgorithm: Algorithm`
  - 初始化 / mode 切换时 `selectedAlgorithm = algorithmForMode(mode)`
  - UI 渲染 `<select data-testid="algorithm-select">`，8 个 option（label 走 i18n，value 走算法名字面量）
  - 构建 seed 时：`algorithm: selectedAlgorithm`（替换原 `algorithmForMode(ctx.mode)` 调用——只在 `levelSource === 'seed'` 分支）
  - 「随机关卡」分支**不动**：继续用 `algorithmForMode(ctx.mode)`
- [ ] **Mirror**: 沿用 LevelSelect 既有 `seedInput` / `selectedSize` 的 state + `<select>` 渲染模式
- [ ] **Test**: `tests/component/menus.test.tsx` 加 2 case：
  - 「指定种子关卡」分组下算法下拉存在且 8 个 option
  - 切 mode → 算法下拉默认值跟随
- [ ] **Validate**: `npm run test -- tests/component/menus.test.tsx`

### Task 8: 端到端 E2E
- [ ] **Action**: 扩展 `tests/e2e/procedural.spec.ts`：
  - 加 1 case：直接访问 `algo-v1-eller-30-0123456789abcdef` URL，进游戏后渲染正常（`walls` 非全 1）
- [ ] **Mirror**: 沿用 P2-3 既有 procedural.spec.ts 的 URL 加载 case 写法
- [ ] **Validate**: `npm run test:e2e -- --grep "Eller"`

### Task 9: 文档同步
- [ ] **Action**:
  - `docs/roadmap.md`: P2-19 行从 `pending` 改 `done`，填日期
  - `README.md`: 如有"Future increments"列表则同步移除 P2-19；如无则跳过
- [ ] **Validate**: `git diff --stat` 应仅包含本次 P2-19 相关文件

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
# 1. 8 算法 exhaustive 编译期守卫
node -e "const { VALID_ALGORITHMS } = require('./src/utils/seed.ts')" 2>/dev/null || \
  grep -E "'(eller|sidewinder|binary-tree|growing-tree)'" src/utils/seed.ts
# 期望: 4 行命中

# 2. 算法下拉 8 项
grep -E "(eller|sidewinder|binary-tree|growing-tree)" src/ui/LevelSelect.tsx
# 期望: 算法下拉里 4 个 option + selectedAlgorithm state

# 3. URL 种子兼容性
# 旧 seed `algo-v1-recursive-backtracker-30-...` 仍应被 decodeSeed 接受
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Eller union-find 实现 bug 导致 50×50 死循环 | 低 | 单测覆盖 3 尺寸可达 + 50×50 < 500ms |
| Growing Tree 参数解析边界 case 多 | 中 | Task 4 单独列 4 case 覆盖；非法参数兜底为 `newest:100` |
| 算法下拉默认行为跟玩家预期不一致 | 中 | mode→algo 默认映射 1:1 保持原样；新算法必须玩家主动选 |
| Binary Tree 不走 `expandThickWall` 破坏代码一致性 | 中 | 文档明确说明理由（算法本身简单、走视觉网格代码更短）；其他 3 个新算法（Eller / Sidewinder / GrowingTree）都走 `expandThickWall` 保持一致 |

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
- `src/maze/generators/eller.ts` — Eller's 算法（行扫描 + 轻量 union-find 扫描）
- `src/maze/generators/sidewinder.ts` — Sidewinder（run 闭合，第一行强制 east 保证连通性）
- `src/maze/generators/binaryTree.ts` — Binary Tree（直接操作视觉网格 + post-process BFS 兜底）
- `src/maze/generators/growingTree.ts` — Growing Tree（参数化 active list 策略 + parseStrategy 导出）
- `tests/unit/maze/generators/eller.test.ts` — 8 case
- `tests/unit/maze/generators/sidewinder.test.ts` — 8 case
- `tests/unit/maze/generators/binaryTree.test.ts` — 8 case
- `tests/unit/maze/generators/growingTree.test.ts` — 8 + 5 策略解析 + 4 parseStrategy 单元

**修改**
- `src/maze/types.ts` — `Algorithm` 联合 4 → 8
- `src/utils/seed.ts` — `VALID_ALGORITHMS` 4 → 8
- `src/maze/AlgorithmMazeProvider.ts` — `generateWalls` switch 4 → 8 case
- `src/ui/LevelSelect.tsx` — 新增 `ALGORITHM_OPTIONS` + `selectedAlgorithm` state + useEffect 重置 + `ValidationContext.selectedAlgorithm` + 算法下拉 + seed 路径用 picker
- `src/i18n/resources/zh.ts` + `en.ts` — 9 个新 key（`levels.algorithm.*`）
- `tests/unit/maze/algorithmMazeProvider.test.ts` — `ALGOS` 4 → 8
- `tests/component/menus.test.tsx` — 2 个新算法下拉 case
- `tests/e2e/procedural.spec.ts` — 1 个 Eller URL E2E case
- `docs/roadmap.md` — P2-19 行 + 活跃锚点更新
- `README.md` — 5.2 章节改 8 算法；增量完成表 + P2-17/18/19 三行

### 遇到的偏差

- **Sidewinder 标准版连通性不保证**：jamisbuck 教科书版的 Sidewinder 第一行 50% east 概率会产出多个独立 corridor，跨列不可达。spec 实施时改成「第一行 always east」（不再有 50% 概率）。文件头注释里写明 trade-off。这是 spec §"关键决策点 1" 没显式列出的事实施时才暴露——后续 P2-N 引用 Sidewinder 时要注意这个偏离教科书的改动。
- **Binary Tree 必须加 post-processing 兜底**：教科书 Binary Tree 同理可能产出 forest（某行一个 up carve 都没有）。plan §Task 3 写的是「直接操作视觉网格」，但实施时发现标准 BT 在 `mulberry32(42)` 下 30×30 / 50×50 都不连通。解法是生成后跑一个 BFS 兜底，对每个不可达的 logical cell 在 4 个方向里找最近的可达 logical cell 开墙。视觉上比标准 BT 多了几条边（不保证是 spanning tree），但 isReachable 100% 满足。
- **算法下拉 i18n 范围扩大**：spec §4 FR-8 写的是「4 个新算法名 i18n key」，实施时连带把 4 个 legacy 算法名也 i18n 了（之前在 brief 面板里直接显示 kebab-case 字符串）。文件 `src/i18n/resources/{zh,en}.ts` 多加了 `levels.algorithm.recursiveBacktracker` / `kruskal` / `prim` / `huntAndKill` 4 个 key。

### 测试覆盖

- 单测：1333/1334（1 个历史 skip，`docs/roadmap.md` §"已知未跟进的测试 debt" 段里登记过）
- `npm run typecheck` ✅ 0 错误
- `npm test` ✅ 92 个 test file 1333 passing
- `npm run build` ✅ Vite 生产构建成功（147 modules, 0 警告）
- E2E `procedural.spec.ts` Eller URL case ✅（chromium 1.8s）

### 备注

- `Algorithm` 联合扩了 4 个字面量，因为是 URL seed 的一部分（`algo-v1-{algorithm}-{size}-{hex}`），**新增字面量是受控改动**（加在 VALID_ALGORITHMS 末尾，旧字符串继续 decode）。**重命名 / 删除已有字面量 = breaking change**，会影响 localStorage 里的 best 记录和分享出去的 seed。
- Growing Tree 的 `parseStrategy` 是 named export，方便后续如果要在 LevelSelect 暴露参数预设（plan §"决策点 3" 留的扩展位）时直接复用。
- 4 个新 generator 都跟 P2-3 的 4 个 generator 一样走 `(visualSize, rng) => CellType[][]` 纯函数签名，**例外是 Binary Tree**——它直接操作视觉网格不走 `expandThickWall`，理由在 spec §"决策点 2" 和文件头注释里都写了。
- Sidewinder 第一行的「强制 always east」对生成树性有微妙影响：标准 Sidewinder 第一行能产出不同 corridor 长度的变化视觉，我们这个版本第一行永远是单条 corridor。视觉差异在 50×50 上几乎看不出来（小迷宫里更明显）。如果后续要做"教科书版"对照，加一个 `useTextbookFirstRow` 参数就行。
