# P2-20: 扩展程序生成迷宫算法集（第二批 +4 算法）— 设计文档（Spec）

**Slug**: p2-20-maze-algorithms-2
**状态**: draft
**日期**: 2026-08-06
**对应路线图项**: P2-20
**依赖**: P2-3, P2-19
**复杂度**: Medium

## 1. 概述

P2-3 落地 4 个算法，**P2-19** 扩到 8 个。本增量在 jamisbuck.org/mazes 15 种算法的基础上补齐"第二档"4 种：

- **Parallel Backtracker** — Recursive Backtracking 的并行变体（多个 walker 同时跑，遇到时合并）
- **Recursive Division** — "反向"算法：从全是通道开始，加墙分割成"房间"
- **Aldous-Broder** — 随机游走产生**均匀采样**的生成树（无偏迷宫）
- **Wilson's** — Loop-erased random walk，比 Aldous-Broder 快很多但实现更复杂

新算法全部沿用 P2-3 / P2-19 的 `(visualSize, rng) => CellType[][]` 纯函数签名。Recursive Division 直接操作视觉网格（跟 P2-19 Binary Tree 一样），其他 3 个走 `_expandThickWall` 厚墙展开。

让玩家能玩到这 4 个新算法是"指定种子关卡"分组的算法下拉——P2-19 加的 8-option 下拉会扩到 12-option。"随机关卡"路径继续用 `algorithmForMode(mode)` 拿默认算法，4 个 mode 的默认映射（P2-3 + P2-19 已锁）**不动**。

## 2. 目标 / 非目标

### 目标

- 落地 4 个新生成器（纯函数，输入 `(visualSize, rng)`，输出 `CellType[][]`）
- 全部通过现有 8 个 P2-3 / P2-19 单测维度：形状 / 确定性 / 不同 seed 差异 / 三个尺寸的连通性 / 50×50 < 500ms / start+exit 是通路
- `Algorithm` 联合类型扩到 12 个字面量；`VALID_ALGORITHMS` 数组同步扩到 12 项
- `AlgorithmMazeProvider.generateWalls` 的 exhaustive switch 扩到 12 case（`_exhaustive: never` 继续生效）
- `LevelSelect` "指定种子关卡"分组的算法下拉扩到 12 项
- 8 个新算法名 i18n key（中英各 4 个）
- 既有 seed 字符串（用前 8 种算法的）继续被 `decodeSeed` 接受，无须任何迁移
- 4 个 mode 的 `algorithmForMode` 默认映射保持不变

### 非目标

- **不改 mode→algo 默认映射**：`reach-exit→recursive-backtracker` / `time-trial→prim` / `survive→kruskal` / `caught-by-enemy→recursive-backtracker` 保持 P2-3 / P2-19 不变
- 不动"随机关卡"路径的 UI
- 不加新 VictoryType / 不动现有 store 字段
- 不动 P2-19 的 4 个新 generator（Eller / Sidewinder / Binary Tree / Growing Tree）
- 不实现 Houston's Algorithm（AB + Wilson 混合，需要 AB 和 Wilson 都先做）
- 不实现 Blobby Recursive Subdivision（跟迷宫"生成树保证连通"哲学不一致，视觉上 BSP 风格太偏 BSP）
- 不实现 Growing Binary Tree（Growing Tree 的特化，价值不如 Growing Tree 本体）
- 不在 LevelSelect 暴露 Wilson 策略参数（`newest:50,random:50` 等），仍是默认 `newest:100` = Recursive Backtracker 行为

## 3. 用户故事

- 作为迷宫探索玩家，我想要在「指定种子关卡」里挑 Recursive Division 看地牢房间感，挑 Aldous-Broder / Wilson 看均匀无偏迷宫，挑 Parallel Backtracker 看并行梳子
- 作为速通玩家，我想要一个能精确复现的 seed 字符串，以便分享"这个 Wilson seed"给朋友
- 作为好奇玩家，我想要 8 → 12 个算法风格对比
- 作为存量玩家，我的旧 best 记录（用前 8 种算法的 seed）不能因为这次升级而失效

## 4. 功能需求

- FR-1：4 个新生成器（纯函数，输入 `{visualSize, rng}`，输出 `CellType[][]`）
- FR-2：所有新算法保证 start ↔ exit 至少一条路径
- FR-3：所有新算法同 seed → 同 walls（确定性）
- FR-4：50×50 尺寸 < 500ms 性能（**Aldous-Broder 可能微超 500ms，加宽到 1500ms 容差**）
- FR-5：`Algorithm` 联合追加 4 字面量；`VALID_ALGORITHMS` 同步
- FR-6：`AlgorithmMazeProvider.generateWalls` exhaustive switch 扩到 12 case
- FR-7：`LevelSelect` "指定种子关卡"分组的算法下拉扩到 12 项
- FR-8：4 个新算法名 i18n key（中英各 4 个）写入 `src/i18n/resources/{zh,en}.ts`
- FR-9：算法下拉在 `algorithmForMode` 默认 mapping 不变前提下，玩家能挑 12 个里任一个
- FR-10：既有 seed 字符串（前 8 种算法的）继续被 `decodeSeed` 接受

## 5. 数据 / 类型变更

### 新增 / 修改的类型

- `src/maze/types.ts`：
  - `Algorithm` 联合追加 4 字面量：`'parallel-backtracker' | 'recursive-division' | 'aldous-broder' | 'wilsons'`
- `src/utils/seed.ts`：
  - `VALID_ALGORITHMS` 追加 4 项
- `src/i18n/resources/{zh,en}.ts`：
  - 新增 `levels.algorithm.parallelBacktracker` / `levels.algorithm.recursiveDivision` / `levels.algorithm.aldousBroder` / `levels.algorithm.wilsons`
- 无新 store 字段；算法选择存在 `LevelSelect` 局部 state（沿用 P2-19 的 `selectedAlgorithm`）

### 受影响 store

- 无 `gameStore` / `levelStore` / `settingsStore` 字段变更

## 6. 引擎 / 架构影响

### 受影响文件

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/generators/parallelBacktracker.ts` | CREATE | Parallel RB（多 walker + 颜色合并） |
| `src/maze/generators/recursiveDivision.ts` | CREATE | Recursive Division（直接操作视觉网格，加 wall + 开 1 pass） |
| `src/maze/generators/aldousBroder.ts` | CREATE | 随机游走生成树 |
| `src/maze/generators/wilsons.ts` | CREATE | Loop-erased random walk |
| `tests/unit/maze/generators/parallelBacktracker.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/recursiveDivision.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/aldousBroder.test.ts` | CREATE | 8 case（性能容差 1500ms） |
| `tests/unit/maze/generators/wilsons.test.ts` | CREATE | 8 case |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 4 字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 4 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 12 case |
| `src/ui/LevelSelect.tsx` | UPDATE | `ALGORITHM_OPTIONS` 4 → 12 |
| `src/i18n/resources/{zh,en}.ts` | UPDATE | 4 个新 key |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | `ALGOS` 8 → 12 |
| `tests/component/menus.test.tsx` | EXTEND | 算法下拉 option 数断言 8 → 12 |
| `tests/e2e/procedural.spec.ts` | EXTEND | +1 case：Recursive Division URL |
| `docs/roadmap.md` | UPDATE | P2-20 行 + 活跃锚点 |
| `README.md` | UPDATE | 5.2 章节 8 → 12 算法；增量完成表 + P2-20 |

### 边界检查

- 4 个新 generator 全部不 import `react` / `store`
- 4 个新 generator 中 3 个（Parallel / Aldous-Broder / Wilson）走 `_expandThickWall` 厚墙展开（沿用 P2-3 / P2-19 风格）
- 1 个（Recursive Division）直接操作视觉网格，跟 P2-19 Binary Tree 同——理由：算法本身在视觉网格上描述更短，thick-wall 展开的中间层会绕
- `generateWalls` switch 继续靠 `_exhaustive: never` 守住新增遗漏
- 算法名仍是 URL seed 的一部分 → 既有 seed 字符串零迁移

## 7. UI / UX 变更

### 屏幕 / 组件改动

- `LevelSelect.tsx` 算法下拉：
  - 选项数 8 → 12
  - 新增 4 个 option（label 走 i18n，value 走算法名字面量）
  - 顺序：原 8 个保留 + 4 个新加在末尾
  - i18n：4 个新 key

- `LevelSelect` 「随机关卡」分组：**不变**（继续用 `algorithmForMode(mode)`）
- `LevelSelect` 「教学 / 自定义」分组：**不变**

### 交互流程（指定种子关卡 + Recursive Division）

1. 玩家在 LevelSelect 选 "指定种子关卡"（levelSource = 'seed'）
2. 玩家输入 16 位 hex seed，选 30×30
3. 玩家在算法下拉里选 "Recursive Division"
4. 玩家点 "进入游戏"
5. App 调 `AlgorithmMazeProvider.load(algo-v1-recursive-division-30-{hex})`
6. `generateWalls` 走 `case 'recursive-division':` 分支，调用 `generateRecursiveDivision(30, rng)`
7. Recursive Division 跑矩形二分 + 加 wall + 开 pass，输出 `CellType[][]`
8. 进入游戏，迷宫是房间式结构

## 8. 错误处理

### 新增错误码

- 无新错误类
- `InvalidSeedError`（P2-3 既有）继续兜底：算法名不在 `VALID_ALGORITHMS` / size 不在白名单 / mazeSeed 不是 16 hex

### 兜底行为

- 玩家选了未在白名单的算法（理论上 UI 不会让玩家选到，URL 篡改时可能）→ `decodeSeed` 抛 `InvalidSeedError` → `App.tsx` 既有 catch 路径走 fallback
- 算法下拉的 i18n key 缺失 → `useT()` 既有 `console.warn` + 返回 key 字符串兜底（P2-8 落地）

## 9. 测试策略

### 单元测试

4 个新 generator 各 8 case（与 P2-19 `kruskal.test.ts` 同构）：

1. 返回 `visualSize × visualSize` 的 0/1 矩阵
2. 同 seed → 同 walls（确定性）
3. 不同 seed → 不同 walls
4. 15×15 尺寸：start↔exit 可达
5. 30×30 尺寸：start↔exit 可达
6. 50×50 尺寸：start↔exit 可达
7. 50×50 尺寸 < 500ms 性能（**Aldous-Broder 例外，容差 1500ms**）
8. start 与 exit cell 是通路（`walls[0][0] === 0`、`walls[N-1][N-1] === 0`）

### Aldous-Broder 性能容差说明

- 50×50 = 625 cell，O(N²) 期望游走 = ~390K 步
- 每次步：1 个 rng() 调用 + 4 个邻居访问
- 50×50 在 Node V8 上 预期 200-800ms
- 99% 情况下 < 1500ms，留 1500ms 容差（vs 其他算法 500ms）防止 flaky test

### 组件测试

- `tests/component/menus.test.tsx` 改 1 个断言：算法下拉 option 数 8 → 12

### E2E 测试

- 扩展 `tests/e2e/procedural.spec.ts`：
  - +1 case：直接用 `algo-v1-recursive-division-30-{hex}` URL 进游戏，能加载并渲染迷宫

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Aldous-Broder 50×50 性能超 500ms | 中 | 单测容差 1500ms；如果还失败，CI 用更小 size（30×30 跑 perf） |
| Wilson's 实现有 bug 导致 path 不是 tree | 中 | 单测 8 case 覆盖连通性；debug 模式下加 visited walk 长度断言 |
| Recursive Division 在 odd visualSize 边界处理 | 低 | 跟 P2-19 Binary Tree 一样：visualSize 总是 15/30/50（odd），直接处理；非 odd 不支持（但 API 限定） |
| Parallel Backtracker 颜色合并 race | 低 | 串行实现 + 显式 union-find；多 walker 不并发 |
| 算法下拉 12 项过密（移动端 dropdown 可用性） | 低 | 项目现有 Dropdown 组件 portal 渲染，pwa responsive；接受 12 项 |
| `parallel-backtracker` 命名跟 jamisbuck 标题不完全一致 | 低 | 在文件头注释和 spec §11 备注里说明 |

## 11. 完成清单

### 11.1 功能验收

- [ ] FR-1 到 FR-10 全部实现
- [ ] 4 新算法 × 3 尺寸 × reach-exit 端到端可走通
- [ ] 算法下拉在 UI 出现 12 项、默认 / 切换 / 进游戏三步可点通
- [ ] 既有 best 记录在算法加 4 个后仍能 decodeSeed 通过

### 11.2 引擎 / 架构边界

- [ ] 4 新 generator 不 import `react` / `store`
- [ ] 3 新走 `expandThickWall`、1 新（Recursive Division）走视觉网格
- [ ] `generateWalls` switch 靠 `_exhaustive: never` 守住

### 11.3 测试

- [ ] 4 新 generator × 8 case 单测全过
- [ ] `algorithmMazeProvider.test.ts` 12 算法 exhaustive 断言
- [ ] `menus.test.tsx` 算法下拉 12 option
- [ ] `procedural.spec.ts` Recursive Division URL E2E
- [ ] 单测覆盖率 ≥ 80%
- [ ] `npm run typecheck` / `npm test` / `npm run build` / `npm run test:e2e` 全过

### 11.4 文档

- [ ] `docs/increments/p2-20-maze-algorithms-2/spec.md` 已写入（本文件）
- [ ] `docs/increments/p2-20-maze-algorithms-2/plan.md` 已写入
- [ ] `docs/roadmap.md` P2-20 行从 `pending` 改 `done`
- [ ] `README.md` 5.2 章节 8 → 12 算法；增量完成表 + P2-20 行

### 11.5 持久化与兼容

- [ ] 不破坏现有 `localStorage` schema
- [ ] 既有 seed 字符串继续被 `decodeSeed` 接受
- [ ] 浏览器刷新后算法下拉回到 `algorithmForMode(mode)` 默认值（沿用 P2-19 行为）

### 11.6 安全与健壮性

- [ ] URL 篡改传入非法算法名 → `InvalidSeedError` 兜底
- [ ] 无 console.log / debugger 残留
- [ ] i18n key 缺失 → `useT` 既有 `console.warn` 兜底

## 12. 参考

- 算法参考：https://www.jamisbuck.org/mazes/ （Recursive Backtracking (Parallel Seeds), Recursive Division, Aldous-Broder, Wilson's 算法页 + 源码）
- P2-19 spec：`docs/increments/p2-19-maze-algorithms/spec.md`
- P2-3 spec：`docs/increments/p2-3-procedural-modes/spec.md`
- P2-19 既有 generator 文件：`src/maze/generators/{eller,sidewinder,binaryTree,growingTree}.ts`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
- "Mazes for Programmers" by Jamis Buck (book) — Aldous-Broder / Wilson's 章节

### 命名偏离备注

- jamisbuck 页面标题是 "Recursive Backtracking (Parallel Seeds)" / "Wilson's Algorithm" / "Aldous-Broder Algorithm" / "Recursive Division Algorithm"。
- URL seed 字符串里去掉了 "Algorithm" 后缀和 "Recursive" 前缀以求简洁：`parallel-backtracker` / `wilsons` / `aldous-broder` / `recursive-division`。
- i18n label 沿用 P2-19 风格：英文 + 中文双语 `"Wilson's"` / `"Wilson's"` 等。`recursive-division` 中文用"递归分割"也可以，但项目既有 UI 风格倾向英文 + 短横线 kebab-case 串直接显示，所以 i18n label 保持英文。
