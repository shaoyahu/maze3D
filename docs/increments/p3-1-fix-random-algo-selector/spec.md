# P3-1 fix-random-algo-selector — 设计文档（Spec）

**Slug**: p3-1-fix-random-algo-selector
**状态**: draft → in-review → approved → done
**日期**: 2026-08-07
**对应路线图项**: P3-1（已 ship 的 silent UX 一致性 bug）
**依赖**: —
**复杂度**: Small

## 1. 概述

修一个 silent UX 不一致：`LevelSelect` 的「随机生成」tab 拿不到 algorithm 选择器（被 `showSeedFields = levelSource === 'seed'` 锁住），用户即使在 random tab 也只能按 `algorithmForMode(mode)` 默认走，不能自己挑算法。这跟刚修的 `levelCount` 是同款问题（UI 显式选项不接进 validateSelection）。本 spec 把 algorithm 选择器暴露到 random tab，让 validateSelection random 分支也用 `ctx.selectedAlgorithm`。

## 2. 目标 / 非目标

### 目标
- `LevelSelect` 把 algorithm 选择器从「只在 seed tab 显示」改成「random + seed 都显示」
- `validateSelection` random 分支用 `ctx.selectedAlgorithm`（跟 seed 分支一致），不再硬编 `algorithmForMode(mode)`
- `selectedAlgorithm` state 在 mode 切换时仍然按 `algorithmForMode(mode)` reset（保留 P2-19 行为）
- 1-2 个 test 覆盖

### 非目标
- 改 `algorithmForMode` 的 4-mode mapping（P2-3 锁，不动）
- 改 mode 切换时 `selectedAlgorithm` reset 行为（P2-19 锁，不动）
- 改 algorithm 选择器 UI 本身（dropdown 形状不变）

## 3. 用户故事
- 作为玩家，我想要在随机生成时也能选 Eller / Aldous-Broder 等特定算法
- 作为玩家，我期待 random tab 的算法选择跟 seed tab 一致

## 4. 功能需求
- FR-1: `LevelSelect` 把 `algorithm-select` 渲染条件从 `showSeedFields` 改为 `showProceduralFields`（random + seed 都可见）
- FR-2: `validateSelection` random 分支：`algorithm: ctx.selectedAlgorithm`（替换 `algorithmForMode(ctx.mode)`）
- FR-3: mode 切换时 `selectedAlgorithm` 仍然 reset 到 `algorithmForMode(newMode)`（P2-19 行为保留）
- FR-4: 旧 random 行为（mode→algo 默认映射）作为 mode 切换后的 fallback 保留

## 5. 数据 / 类型变更
- 不改任何 type / interface / store
- `LevelSelect.tsx` UI 渲染条件 + `validateSelection` 内部行为

## 6. 引擎 / 架构影响

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/ui/LevelSelect.tsx` | UPDATE | `showSeedFields` 拆 / `algorithm-select` 渲染条件改；`validateSelection` random 分支用 `ctx.selectedAlgorithm` |
| `tests/component/levelSelect.multiLevel.test.tsx` | UPDATE | 加 2 test（random 选 algorithm X → onPick 出 `algo-v1-X-...`） |

### 边界检查
- 引擎层不新增任何 import ✓
- `MazeProvider` 接口不变 ✓
- `algorithmForMode` 仍然 4-mode mapping locked ✓

## 7. UI / UX 变更
- **random tab 多了 algorithm 下拉**（之前隐藏）
- 视觉上跟 seed tab 完全一致（同一个 `algorithm-select` 组件）
- mode 切换仍然 reset algorithm pick（默认 → 手动覆盖）

## 8. 错误处理
- 不变（沿用 P2-19 + P2-21 既有验证逻辑）

## 9. 测试策略

### 单元测试
- `tests/component/levelSelect.multiLevel.test.tsx`:
  - 新增：「random tab 切到 algorithm=eller → onPick 出 v1 id 包含 `algorithm=eller`」
  - 新增：「random tab 默认 mode=time-trial → onPick 出 v1 id 包含 `algorithm=recursive-backtracker`（沿用 P2-19 default）」

### E2E
- 暂不写

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 旧 user 习惯 random 默认按 mode 选 algorithm | 低 | mode 切换时仍然 reset `selectedAlgorithm`（P2-19），第一次进 random tab 看到的还是熟悉默认 |
| `selectedAlgorithm` 在 random tab 显示后跟 algorithmForMode 冲突 | 低 | `validateSelection` random 分支用 `ctx.selectedAlgorithm`；mode 切换 reset 是单向 flow |

## 11. 完成清单

### 11.1 功能验收
- [ ] FR-1~FR-4 全部实现
- [ ] random tab 切 algorithm → URL 出对应 algorithm
- [ ] mode 切换后 algorithm 自动 reset（P2-19 行为保留）

### 11.3 测试
- [ ] 新增 2 test
- [ ] 现有 tests 全 pass

### 11.4 文档
- [ ] `docs/increments/p3-1-fix-random-algo-selector/spec.md` 写入
- [ ] `docs/increments/p3-1-fix-random-algo-selector/plan.md` 所有 checkbox 勾

## 12. 参考
- `src/ui/LevelSelect.tsx:144-147` (P2-19 算法选择锁在 seed)
- `src/ui/LevelSelect.tsx:172-179` (random 分支 validateSelection)
- `src/maze/AlgorithmMazeProvider.ts` (algorithmForMode 实现)
