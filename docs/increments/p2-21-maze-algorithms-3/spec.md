# P2-21: 扩展程序生成迷宫算法集（第三批 +3 算法）— 设计文档（Spec）

**Slug**: p2-21-maze-algorithms-3
**状态**: done
**日期**: 2026-08-06
**对应路线图项**: P2-21
**依赖**: P2-3, P2-19, P2-20
**复杂度**: Medium

## 1. 概述

P2-3 / P2-19 / P2-20 累计落地 12 种算法。本增量收尾 jamisbuck.org/mazes 的 15 种算法，再加 3 种：

- **Houston's Algorithm** — Aldous-Broder + Wilson's 混合：先用 AB 走到访问过半切到 Wilson's。比 Wilson's 实际快，比 AB 视觉更"长廊"
- **Growing Binary Tree** — Growing Tree 简化版，active list 维护 random:100 策略（每个 cell 取出后永久移除），"Binary" 含义=每次最多 push 2 个 unvisited 邻居（4 方向全扫描，非 textbook 2 方向）。介于 RB（newest:100）和 Prim（random:100）之间
- **"Blobby" Recursive Subdivision** — BSP + 噪声驱动的"模糊房间"分割。墙体不是直的，是用随机游走/噪声生成的不规则形状。**Jamis Buck 标为实验性算法**——视觉上跟前 12 个"spanning tree"风格不同，接近"自然洞穴"

新算法全部沿用 `(visualSize, rng) => CellType[][]` 纯函数签名。Houston 走 `expandThickWall`（算法本质是 spanning tree），Growing Binary Tree 走 `expandThickWall`，Blobby 直接操作视觉网格（不规则墙不能拆成 wall cells between logical cells）。Houston 实现复用 P2-20 的 AB + Wilson's 代码（_不要重新发明轮子_)。

让玩家能玩到这 3 个新算法是「指定种子关卡」分组的算法下拉——P2-20 加的 12-option 下拉扩到 15-option。"随机关卡"路径继续用 `algorithmForMode(mode)` 拿默认算法，4 个 mode 的默认映射**不动**。

## 2. 目标 / 非目标

### 目标

- 落地 3 个新生成器（纯函数）
- 全部通过现有 8 个 P2-3 / P2-19 / P2-20 单测维度：形状 / 确定性 / 不同 seed 差异 / 三个尺寸的连通性 / 50×50 < 500ms（Houston 1500ms）/ start+exit 是通路
- `Algorithm` 联合类型扩到 15 个字面量；`VALID_ALGORITHMS` 数组同步扩到 15 项
- `AlgorithmMazeProvider.generateWalls` 的 exhaustive switch 扩到 15 case
- `LevelSelect` "指定种子关卡"分组的算法下拉扩到 15 项
- 6 个新算法名 i18n key（中英各 3 个）
- 既有 seed 字符串（用前 12 种算法的）继续被 `decodeSeed` 接受，无须任何迁移
- 4 个 mode 的 `algorithmForMode` 默认映射保持不变

### 非目标

- **不改 mode→algo 默认映射**
- 不动"随机关卡"路径的 UI
- 不加新 VictoryType / 不动现有 store 字段
- 不动 P2-19 / P2-20 的 8 个 generator
- 不在 LevelSelect 暴露 Houston 的 AB/Wilson 切换阈值参数（用默认值 = cell 数量一半）
- 不在 LevelSelect 暴露 Growing Binary Tree 的策略参数（用默认 = random:100）
- 不实现 Blobby 的参数化（噪声幅度等）；用固定参数

## 3. 用户故事

- 作为迷宫探索玩家，我想要在「指定种子关卡」里挑 Houston 体验"快 + 长廊"，挑 Growing Binary Tree 体验 Growing Tree 的简化版，挑 Blobby 看自然洞穴感
- 作为速通玩家，我想要"这个 Houston seed" 字符串可分享
- 作为好奇玩家，我想要 12 → 15 个算法风格对比
- 作为存量玩家，我的旧 best 记录（用前 12 种算法的 seed）不能因为这次升级而失效
- **jamboree 完成感**：跟 jamisbuck 网站的算法列表 1:1 对齐（除了 jamisbuck 自己标为实验性的少数几个）

## 4. 功能需求

- FR-1：3 个新生成器（纯函数，输入 `{visualSize, rng}`，输出 `CellType[][]`）
- FR-2：所有新算法保证 start ↔ exit 至少一条路径
- FR-3：所有新算法同 seed → 同 walls（确定性）
- FR-4：50×50 尺寸 < 500ms 性能（**Houston 例外，容差 1500ms 跟 AB 一致**）
- FR-5：`Algorithm` 联合追加 3 字面量；`VALID_ALGORITHMS` 同步
- FR-6：`AlgorithmMazeProvider.generateWalls` exhaustive switch 扩到 15 case
- FR-7：`LevelSelect` "指定种子关卡"分组的算法下拉扩到 15 项
- FR-8：3 个新算法名 i18n key（中英各 3 个）写入 `src/i18n/resources/{zh,en}.ts`
- FR-9：算法下拉在 `algorithmForMode` 默认 mapping 不变前提下，玩家能挑 15 个里任一个
- FR-10：既有 seed 字符串（前 12 种算法的）继续被 `decodeSeed` 接受
- FR-11：Houston 的实现复用 P2-20 的 `generateAldousBroder` 和 `generateWilsons` 的代码（**不要重新发明轮子**）

## 5. 数据 / 类型变更

### 新增 / 修改的类型

- `src/maze/types.ts`：
  - `Algorithm` 联合追加 3 字面量：`'houston' | 'growing-binary-tree' | 'blobby-recursive-division'`
- `src/utils/seed.ts`：
  - `VALID_ALGORITHMS` 追加 3 项
- `src/i18n/resources/{zh,en}.ts`：
  - 新增 `levels.algorithm.houston` / `levels.algorithm.growingBinaryTree` / `levels.algorithm.blobbyRecursiveDivision`
- 无新 store 字段

### 受影响 store

- 无 `gameStore` / `levelStore` / `settingsStore` 字段变更

## 6. 引擎 / 架构影响

### 受影响文件

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/generators/houston.ts` | CREATE | AB + Wilson's 混合（复用 P2-20） |
| `src/maze/generators/growingBinaryTree.ts` | CREATE | Growing Tree 简化版（active list 每个 cell 取出后永久移除，每次最多 push 2 个 unvisited 邻居） |
| `src/maze/generators/blobbyRecursiveDivision.ts` | CREATE | Blobby Recursive Subdivision（噪声驱动不规则墙） |
| `tests/unit/maze/generators/houston.test.ts` | CREATE | 8 case（性能 1500ms） |
| `tests/unit/maze/generators/growingBinaryTree.test.ts` | CREATE | 8 case |
| `tests/unit/maze/generators/blobbyRecursiveDivision.test.ts` | CREATE | 8 case |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 3 字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 3 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 15 case |
| `src/ui/LevelSelect.tsx` | UPDATE | `ALGORITHM_OPTIONS` 12 → 15 |
| `src/i18n/resources/{zh,en}.ts` | UPDATE | 3 个新 key |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | `ALGOS` 12 → 15 |
| `tests/component/menus.test.tsx` | EXTEND | 算法下拉 option 数断言 12 → 15 |
| `tests/e2e/procedural.spec.ts` | EXTEND | +1 case：Houston URL |
| `docs/roadmap.md` | UPDATE | P2-21 行 + 活跃锚点 |
| `README.md` | UPDATE | 5.2 章节 12 → 15 算法；增量完成表 + P2-21 |

### 边界检查

- 3 个新 generator 全部不 import `react` / `store`
- Houston 复用 P2-20 的 Aldous-Broder + Wilson's 代码（不重复实现）
- Growing Binary Tree 走 `expandThickWall`
- Blobby 直接操作视觉网格（不规则墙不能拆成 wall cells between logical cells）
- `generateWalls` switch 继续靠 `_exhaustive: never` 守住新增遗漏
- 算法名仍是 URL seed 的一部分 → 既有 seed 字符串零迁移

## 7. UI / UX 变更

### 屏幕 / 组件改动

- `LevelSelect.tsx` 算法下拉：
  - 选项数 12 → 15
  - 新增 3 个 option（label 走 i18n，value 走算法名字面量）
  - 顺序：原 12 个保留 + 3 个新加在末尾

- `LevelSelect` 「随机关卡」分组：**不变**
- `LevelSelect` 「教学 / 自定义」分组：**不变**

### 交互流程（指定种子关卡 + Houston）

1. 玩家在 LevelSelect 选 "指定种子关卡"（levelSource = 'seed'）
2. 玩家输入 16 位 hex seed，选 30×30
3. 玩家在算法下拉里选 "Houston's"
4. 玩家点 "进入游戏"
5. App 调 `AlgorithmMazeProvider.load(algo-v1-houston-30-{hex})`
6. `generateWalls` 走 `case 'houston':` 分支
7. Houston 跑：先用 AB 走到访问过半，再切到 Wilson's 处理剩余
8. 进入游戏，迷宫是 Houston 风格（视觉介于 AB 和 Wilson's 之间，偏向 Wilson's 但更快生成）

## 8. 错误处理

### 新增错误码

- 无新错误类
- `InvalidSeedError`（P2-3 既有）继续兜底

### 兜底行为

- 玩家选了未在白名单的算法 → `InvalidSeedError` 兜底
- i18n key 缺失 → `useT` 既有 `console.warn` 兜底

## 9. 测试策略

### 单元测试

3 个新 generator 各 8 case（与 P2-20 同构）：

1. 返回 `visualSize × visualSize` 的 0/1 矩阵
2. 同 seed → 同 walls（确定性）
3. 不同 seed → 不同 walls
4. 15×15 尺寸：start↔exit 可达
5. 30×30 尺寸：start↔exit 可达
6. 50×50 尺寸：start↔exit 可达
7. 50×50 尺寸 < 500ms（**Houston 例外 1500ms**）
8. start 与 exit cell 是通路

### 组件测试

- `tests/component/menus.test.tsx` 改 1 个断言：算法下拉 option 数 12 → 15

### E2E 测试

- 扩展 `tests/e2e/procedural.spec.ts`：
  - +1 case：直接访问 `algo-v1-houston-30-{hex}` URL，进游戏后渲染正常

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Houston 50×50 性能超 1500ms | 中 | 跟 AB / Wilson 类似的 O(N² / N log N) 复杂度；复用 P2-20 代码不出意外 |
| Growing Binary Tree active 策略（random:100 + 最多 push 2 个 unvisited 邻居）实现偏移导致连通性问题 | 中 | 沿用 Growing Tree 框架 + 简化；单测 8 case 覆盖连通性 |
| Blobby 噪声参数（实现细节）不固定 | 低 | 固定参数（噪声幅度 0.3，迭代 3 次），单测覆盖即可 |
| 算法下拉 15 项过密 | 低 | 项目现有 Dropdown 组件 portal 渲染，可滚动 |
| `blobby-recursive-division` 命名偏长 | 低 | 跟 `recursive-division` 平行（前者加 `blobby` 前缀） |

## 11. 完成清单

### 11.1 功能验收

- [x] FR-1 到 FR-11 全部实现
- [x] 3 新算法 × 3 尺寸 × reach-exit 端到端可走通
- [x] 算法下拉在 UI 出现 15 项、默认 / 切换 / 进游戏三步可点通
- [x] 既有 best 记录在算法加 3 个后仍能 decodeSeed 通过

### 11.2 引擎 / 架构边界

- [x] 3 新 generator 不 import `react` / `store`
- [x] Houston 复用 P2-20 的 AB + Wilson's 代码（不重新发明）
- [x] Growing Binary Tree 走 `expandThickWall`
- [x] Blobby 直接操作视觉网格
- [x] `generateWalls` switch 靠 `_exhaustive: never` 守住

### 11.3 测试

- [x] 3 新 generator × 8 case 单测全过
- [x] `algorithmMazeProvider.test.ts` 15 算法 exhaustive 断言
- [x] `menus.test.tsx` 算法下拉 15 option
- [x] `procedural.spec.ts` Houston URL E2E
- [x] 单测覆盖率 ≥ 80%
- [x] `npm run typecheck` / `npm test` / `npm run build` / `npm run test:e2e` 全过

### 11.4 文档

- [x] `docs/increments/p2-21-maze-algorithms-3/spec.md` 已写入（本文件）
- [x] `docs/increments/p2-21-maze-algorithms-3/plan.md` 已写入
- [x] `docs/roadmap.md` P2-21 行从 `pending` 改 `done`
- [x] `README.md` 5.2 章节 12 → 15 算法；增量完成表 + P2-21 行

### 11.5 持久化与兼容

- [x] 不破坏现有 `localStorage` schema
- [x] 既有 seed 字符串继续被 `decodeSeed` 接受
- [x] 浏览器刷新后算法下拉回到 `algorithmForMode(mode)` 默认值

### 11.6 安全与健壮性

- [x] URL 篡改传入非法算法名 → `InvalidSeedError` 兜底
- [x] 无 console.log / debugger 残留
- [x] i18n key 缺失 → `useT` 既有 `console.warn` 兜底

## 12. 参考

- 算法参考：https://www.jamisbuck.org/mazes/ （Houston's, Growing Binary Tree, Blobby Recursive Subdivision 算法页 + 源码）
- "Mazes for Programmers" by Jamis Buck (book) — Houston 章节
- P2-19 spec：`docs/increments/p2-19-maze-algorithms/spec.md`
- P2-20 spec：`docs/increments/p2-20-maze-algorithms-2/spec.md`
- P2-20 既有 generator 文件：`src/maze/generators/{parallelBacktracker,recursiveDivision,aldousBroder,wilsons}.ts`（Houston 复用 AB + Wilson's）
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`

### 命名偏离备注

- jamisbuck 页面标题是 "Houston's Algorithm" / "Growing Binary Tree Algorithm" / ""Blobby" Recursive Subdivision Algorithm"。
- URL seed 字符串里去掉了 "Algorithm" 后缀，"Blobby" 的引号也去掉以求简洁：`houston` / `growing-binary-tree` / `blobby-recursive-division`。
- i18n label 沿用 P2-19 / P2-20 风格：英文 + 中文双语。
