# P2-19: 扩展程序生成迷宫算法集（+4 算法） — 设计文档（Spec）

**Slug**: p2-19-maze-algorithms
**状态**: draft
**日期**: 2026-08-06
**对应路线图项**: P2-19
**依赖**: P2-3（procedural-modes）
**复杂度**: Medium

## 1. 概述

P2-3 落地了 4 个迷宫生成算法（Recursive Backtracker / Kruskal / Prim / Hunt-and-Kill）+ 3 个尺寸 + 4 个模式。本增量在 jamisbuck.org/mazes 15 种算法的基础上，把"性价比最高"的第一档 4 种补齐到我们现有的 4 种之上，总数 8 种：

- **Eller's** — 行扫描 + union-find 流式
- **Sidewinder** — 行扫描，每个 cell 50% 向东或闭合 run 向上
- **Binary Tree** — 每个 cell 只向北或向东打通一面墙
- **Growing Tree** — 参数化（`newest` / `random` / `middle` / `oldest` 自由组合）

新增 4 个 generator 全部沿用 P2-3 的 `(visualSize, rng) => CellType[][]` 纯函数签名 + `expandThickWall` 厚墙展开。算法名是 URL seed 字符串的一部分（`algo-v1-{algorithm}-{size}-{hex}`），故新增字面量是受控改动。

为了让玩家能真正玩到这 4 个新算法（而不是"代码里有、玩家用不到"），在 `LevelSelect` 的"指定种子关卡"分组里加一个算法下拉（8 项），玩家在输入 seed 的同时可以选算法。`algorithmForMode(mode)` 默认映射保持不变，4 个 mode 仍然各绑 1 个默认算法。

## 2. 目标 / 非目标

### 目标

- 落地 4 个新生成器（纯函数，输入 `(visualSize, rng)`，输出 `CellType[][]`）
- 全部通过现有 8 个 P2-3 单测维度：形状 / 确定性 / 不同 seed 差异 / 三个尺寸的连通性 / 50×50 < 500ms / start+exit 是通路
- `Algorithm` 联合类型扩到 8 个字面量
- `VALID_ALGORITHMS` 数组同步扩到 8 项
- `AlgorithmMazeProvider.generateWalls` 的 exhaustive switch 扩到 8 case（`never` 编译期守卫继续生效）
- `LevelSelect` "指定种子关卡"分组加算法下拉（8 项，默认值 = `algorithmForMode(mode)`）
- 8 个算法名 i18n key（中英各 4 个：`eller` / `sidewinder` / `binary-tree` / `growing-tree`）
- 同 seed 同算法 → 同 `MazeData`（沿用 P2-3 的确定性保证）
- 既有 seed 的 localStorage 最佳成绩保持兼容（算法名加在 whitelist 末尾，旧的 `algo-v1-{algo}-{size}-{hex}` 字符串继续有效）

### 非目标

- **不改 mode→algo 默认映射**：`reach-exit→recursive-backtracker` / `time-trial→prim` / `survive→kruskal` / `caught-by-enemy→recursive-backtracker` 保持不变
- 不动"随机关卡"路径的 UI（玩家点 15/30/50 卡片时仍用 mode 的默认算法）
- 不动 `algorithmForMode` 的返回值
- 不加新的 VictoryType
- 不做 UI 上的"算法缩略图对比"——8 个算法在 UI 上只暴露文字下拉，不展示各自风格预览
- 不实现"算法自动选择"逻辑（按 mode 权重 round-robin 等）
- 不动 "P2-3 review batch"（P2-15 已 ship）：本次改动只新增不修改既有 4 个 generator

## 3. 用户故事

- 作为迷宫探索玩家，我想要在「指定种子关卡」里手动选算法，以便在 8 种迷宫风格里挑我喜欢的（同 seed 不同算法 → 不同迷宫结构）
- 作为速通玩家，我想要一个能精确复现的关卡身份，以便分享「这个 Eller seed」给朋友
- 作为好奇玩家，我想要在 8 种算法之间对比视觉差异，以便理解不同算法的"风格"
- 作为存量玩家，我的旧 best 记录不能因为这次升级而失效

## 4. 功能需求

- FR-1：4 个新生成器（纯函数，输入 `{visualSize, rng}`，输出 `CellType[][]`），签名与 P2-3 一致
- FR-2：所有新算法保证 start ↔ exit 至少一条路径（DFS 单测验证）
- FR-3：所有新算法同 seed → 同 walls（确定性单测）
- FR-4：50×50 尺寸 < 500ms（性能单测）
- FR-5：`Algorithm` 联合类型追加 4 个字面量；`VALID_ALGORITHMS` 同步
- FR-6：`AlgorithmMazeProvider.generateWalls` 的 exhaustive switch 扩到 8 case
- FR-7：`LevelSelect` "指定种子关卡"分组加算法下拉（8 项），玩家在 seed 输入框旁选算法
- FR-8：8 个算法名 i18n key（中英各 4 个）写入 `src/i18n/resources/{zh,en}.ts`
- FR-9：算法下拉默认值 = `algorithmForMode(mode)`，mode 切换时下拉重置为该 mode 的默认算法
- FR-10：算法下拉的"当前选项"会进入 `Seed.algorithm`，进而进入 `algo-v1-{algorithm}-{size}-{hex}` 字符串
- FR-11：既有 seed 字符串（用前 4 种算法的）继续被 `decodeSeed` 接受，无须任何迁移

## 5. 数据 / 类型变更

### 新增 / 修改的类型

- `src/maze/types.ts`：
  - `Algorithm` 联合追加：`'eller' | 'sidewinder' | 'binary-tree' | 'growing-tree'`
- `src/utils/seed.ts`：
  - `VALID_ALGORITHMS` 追加 4 项
- `src/i18n/resources/zh.ts`：
  - 新增 `levels.algorithm.eller` / `levels.algorithm.sidewinder` / `levels.algorithm.binaryTree` / `levels.algorithm.growingTree`
- `src/i18n/resources/en.ts`：
  - 上述 4 个 key 的英文版本
- 无新 store 字段；算法选择存在 `LevelSelect` 局部 state 里（与 `seedInput` / `selectedSize` 平行）

### 受影响 store

- 无 `gameStore` / `levelStore` / `settingsStore` 字段变更

## 6. 引擎 / 架构影响

### 受影响文件

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/generators/eller.ts` | CREATE | 行扫描 + union-find |
| `src/maze/generators/sidewinder.ts` | CREATE | 行扫描 + run 闭合 |
| `src/maze/generators/binaryTree.ts` | CREATE | 每 cell 北/东打通一面墙 |
| `src/maze/generators/growingTree.ts` | CREATE | 参数化 active list |
| `tests/unit/maze/generators/eller.test.ts` | CREATE | 8 case（镜像 kruskal.test.ts） |
| `tests/unit/maze/generators/sidewinder.test.ts` | CREATE | 同上 |
| `tests/unit/maze/generators/binaryTree.test.ts` | CREATE | 同上 |
| `tests/unit/maze/generators/growingTree.test.ts` | CREATE | 同上 |
| `src/maze/types.ts` | UPDATE | `Algorithm` 联合追加 4 个字面量 |
| `src/utils/seed.ts` | UPDATE | `VALID_ALGORITHMS` 追加 4 项 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | `generateWalls` switch 扩到 8 case |
| `src/ui/LevelSelect.tsx` | UPDATE | "指定种子关卡"区加算法下拉 + 局部 state |
| `src/i18n/resources/zh.ts` | UPDATE | 4 个新 key |
| `src/i18n/resources/en.ts` | UPDATE | 4 个新 key |
| `tests/component/menus.test.tsx` | EXTEND | 1-2 个新断言：算法下拉默认/选项数/切换后 seed 编码 |
| `tests/unit/maze/algorithmMazeProvider.test.ts` | EXTEND | 1 个新断言：8 算法 exhaustive |

### 边界检查

- 4 个新 generator 全部走 `expandThickWall`（逻辑网格 → 视觉厚墙网格），跟 P2-3 的 4 个 generator 用同一共享 helper
- 4 个新 generator 不 import `react` / `store` / `../types` 之外的 `src/`
- `generateWalls` switch 继续靠 `_exhaustive: never` 守住新增遗漏
- 算法名仍是 URL seed 的一部分 → 既有 seed 字符串零迁移

## 7. UI / UX 变更

### 屏幕 / 组件改动

- `LevelSelect.tsx`「指定种子关卡」分组：
  - **新增**：算法下拉 `<select>`，选项 = 8 个算法（label 走 i18n），与 `seedInput` / `selectedSize` 同级
  - **位置**：seed 输入框**下方**，尺寸选择器**上方**（保持原版式流）
  - **默认值**：`algorithmForMode(mode)`，mode 切换时重置
  - **i18n label**：`levels.algorithm.label` = "算法 / Algorithm"
  - **i18n options**：4 个新 key（zh + en）
  - **data-testid**：`algorithm-select`，便于 RTL/E2E 锁定

- `LevelSelect` 「随机关卡」分组：**不变**。玩家点 15/30/50 卡片时仍用 `algorithmForMode(mode)` 拿默认算法
- `LevelSelect` 「教学 / 自定义」分组：**不变**

### 交互流程（指定种子关卡 + Eller）

1. 玩家在 LevelSelect 选 "指定种子关卡"（levelSource = 'seed'）
2. 玩家输入 16 位 hex seed，选 30×30
3. 玩家在算法下拉里选 "Eller's"
4. 玩家点 "进入游戏"
5. App 调 `AlgorithmMazeProvider.load(algo-v1-eller-30-{hex})`
6. `generateWalls` 走 `case 'eller':` 分支，调用 `generateEller(30, rng)`
7. Eller 跑行扫描 + union-find，输出 `CellType[][]` → `expandThickWall` → 渲染
8. 进入游戏，迷宫是 Eller 风格

## 8. 错误处理

### 新增错误码

- 无新错误类
- `InvalidSeedError`（P2-3 既有）继续兜底：算法名不在 `VALID_ALGORITHMS` / size 不在白名单 / mazeSeed 不是 16 hex

### 兜底行为

- 玩家选了未在白名单的算法（理论上 UI 不会让玩家选到，URL 篡改时可能）→ `decodeSeed` 抛 `InvalidSeedError` → `App.tsx` 既有 catch 路径走 fallback
- 算法下拉的 i18n key 缺失 → `useT()` 既有 `console.warn` + 返回 key 字符串兜底（已在 P2-8 落地）

## 9. 测试策略

### 单元测试

4 个新 generator 各 8 case（与 `kruskal.test.ts` 同构）：

1. 返回 `visualSize × visualSize` 的 0/1 矩阵
2. 同 seed → 同 walls（确定性）
3. 不同 seed → 不同 walls
4. 15×15 尺寸：start↔exit 可达
5. 30×30 尺寸：start↔exit 可达
6. 50×50 尺寸：start↔exit 可达
7. 50×50 尺寸 < 500ms 性能
8. start 与 exit cell 是通路（`walls[0][0] === 0`、`walls[N-1][N-1] === 0`）

### Growing Tree 专项

- 参数解析单测：默认 `newest:100`（= Recursive Backtracker）→ 跟 RB 走同样 walk pattern
- `random:100`（= Prim）→ 跟 Prim 走同样 frontier pick pattern
- `oldest:100`（= reverse 顺序）→ 跟 `newest:100` 视觉上对称
- 非法参数（如 `abc:100`）→ 兜底为 `newest:100` 或 `console.warn`

### 组件测试

- `tests/component/menus.test.tsx` 加 2 case：
  - 1：算法下拉存在且有 8 个 option
  - 1：默认 option 跟 `algorithmForMode(mode)` 一致；切换 mode 后默认值跟随

### E2E 测试

- 扩展 `procedural.spec.ts`（P2-3 既有）：
  - 加 1 case：直接用 `algo-v1-eller-30-{hex}` URL 进游戏，能加载并渲染迷宫
  - （不需要再为 Sidewinder / BinaryTree / GrowingTree 写独立 E2E；3 个算法已由单测保证确定性 + 渲染层只读 `walls` 不区分算法）

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| Eller / Growing Tree 在 50×50 性能不过 500ms | 低 | 单测覆盖；Eller 是行扫描 O(n)，Growing Tree 是 O(n) frontier |
| Growing Tree 参数解析 UX 复杂 | 中 | UI 不暴露参数字符串；只让玩家在 8 种"preset"里选（默认 `newest:100`），i18n 显示"Growing Tree"不显示参数 |
| 算法名 kebab-case 拼写错导致 seed 编码错位 | 低 | `VALID_ALGORITHMS` 数组 + exhaustive switch + i18n key 一次性写对 |
| 既有 `localStorage` 最佳成绩失效 | 极低 | 算法名是 whitelist **追加**而非替换；旧的 `algo-v1-recursive-backtracker-30-...` 字符串继续被 `decodeSeed` 接受 |
| 4 个新 generator 跟 P2-3 4 个 generator 共享 import 路径但风格不一致 | 中 | 4 个新 generator 全部走 `expandThickWall` helper，跟 kruskal / prim / huntAndKill 同构；BinaryTree 极简例外（不走 thick-wall 路径，理由：算法本身只在 logical grid 上）—— 详 plan §TaskX |

## 11. 完成清单

### 11.1 功能验收

- [ ] FR-1 到 FR-11 全部实现
- [ ] 4 新算法 × 3 尺寸 × reach-exit 端到端可走通
- [ ] 算法下拉在 UI 出现、默认 / 切换 / 进游戏三步可点通
- [ ] 既有 best 记录在算法加 4 个后仍能 decodeSeed 通过

### 11.2 引擎 / 架构边界

- [ ] 4 新 generator 不 import `react` / `store`
- [ ] 4 新 generator 是纯函数
- [ ] `generateWalls` switch 靠 `_exhaustive: never` 守住

### 11.3 测试

- [ ] 4 新 generator × 8 case 单测全过
- [ ] Growing Tree 参数解析单测覆盖（默认 / 3 种 preset / 非法参数）
- [ ] `algorithmMazeProvider.test.ts` 8 算法 exhaustive 断言
- [ ] `menus.test.tsx` 算法下拉 2 case
- [ ] `procedural.spec.ts` Eller URL E2E
- [ ] 单测覆盖率 ≥ 80%
- [ ] `npm run typecheck` / `npm test` / `npm run build` / `npm run test:e2e` 全过

### 11.4 文档

- [ ] `docs/increments/p2-19-maze-algorithms/spec.md` 已写入（本文件）
- [ ] `docs/increments/p2-19-maze-algorithms/plan.md` 已写入
- [ ] `docs/roadmap.md` P2-19 行从 `pending` 改 `done`
- [ ] `README.md` 「Future increments」同步

### 11.5 持久化与兼容

- [ ] 不破坏现有 `localStorage` schema
- [ ] 既有 seed 字符串继续被 `decodeSeed` 接受
- [ ] 浏览器刷新后算法下拉回到 `algorithmForMode(mode)` 默认值（不持久化，跟 `seedInput` / `selectedSize` 一致）

### 11.6 安全与健壮性

- [ ] URL 篡改传入非法算法名 → `InvalidSeedError` 兜底
- [ ] 无 console.log / debugger 残留
- [ ] i18n key 缺失 → `useT` 既有 `console.warn` 兜底

## 12. 参考

- 算法参考：https://www.jamisbuck.org/mazes/ （Recursive Backtracking, Eller's, Sidewinder, Binary Tree, Growing Tree 算法页 + 源码）
- P2-3 spec：`docs/increments/p2-3-procedural-modes/spec.md`
- P2-3 既有 generator 文件：`src/maze/generators/{kruskal,prim,huntAndKill,recursiveBacktracker}.ts`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
