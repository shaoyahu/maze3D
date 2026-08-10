# P3-1d multi-transitions — 设计文档（Spec）

**Slug**: p3-1d-multi-transitions
**状态**: draft → in-review → approved → done
**日期**: 2026-08-07
**对应路线图项**: P3-1（已 ship 的 silent bug — 5 个 transition kind 引擎只识别 1 个）
**依赖**: P3-1（multi-level mazes data layer）+ P3-2（hole-down warning flash）
**复杂度**: Large

## 1. 概述

修 P3-1 / P3-1c 路线图**最严重的 silent bug**：`VerticalTransition.kind` 5 个值（`stair-up` / `stair-down` / `hole-down` / `hole-up` / `ladder`），引擎只识别 `hole-down`（P3-2 加的），其他 4 个**永远不触发**。后果：
- 随机 2 层迷宫只生成 `stair-up`（AlgorithmMazeProvider.ts:545），玩家走到上面没反应
- 如果 exit 在 L1，玩家**永远被困 L0**，根本赢不了
- 编辑器能放 `stair-down` / `hole-up` / `ladder`，但跑了没效果

本 spec 让所有 5 个 kind 在引擎里都活起来。

## 2. 目标 / 非目标

### 目标
- **5 个 kind 全部触发**：`stair-up` / `stair-down` / `hole-down` / `hole-up` / `ladder`
- 4 个 walk-onto 自动触发（`stair-up` / `stair-down` / `hole-down` / `hole-up`）
- `ladder` 显式触发：站在 ladder tile + 按 Space（上）/ C（下）才动
- 每种 kind 自己的动画时长（沿用 `transitionDurationSec` 既有 constants）
- 输入锁定：transition 进行中（duration 内）禁用 WASD / Space / C；ladder 走空格跟 jump/pickup 区分
- HUD chip 切换：通过既有 `bridge.onLevelChange?.()` 推送（已完成 P3-1b contract）
- `Scene` 渲染：补齐 `stair-down` / `hole-up` / `ladder` 的视觉（现在 Scene.ts:721-724 返回 null）
- 测试：每个 kind 都有 unit test

### 非目标
- 改 `VerticalTransition` 数据 shape（`kind` / `toLevel` / `toX` / `toZ` 不动）
- 改 `FLOOR_HEIGHT = 2.4` / `EYE_HEIGHT = 1.6`（P3-1b 锁）
- 改 `warningFlash` 状态机（`hole-down` 仍是 0.5s warning + 0.4s drop；其他 hole- 暂时不做 warning，P3-1d 限定 walk-onto 直接进 transition，warning 是 hole 专属）
- 编辑器 UX 改动（编辑器早能放 transition，本 spec 是引擎补齐）
- 3D 路径（`walls3D` 那套自由 y 轴移动，不通过 transitions）

## 3. 用户故事
- 作为玩家，我想要站在 stair 上能爬上/爬下层
- 作为玩家，我想要站在 hole 上能掉下去 / 跳上去
- 作为玩家，我想要站在 ladder 上能按 Space 上去、按 C 下来
- 作为玩家，我期待多关卡迷宫里能上下穿梭，不被困住

## 4. 功能需求

### FR-1: walk-onto 自动触发（4 个 kind）
- `stair-up` / `stair-down` / `hole-up`：玩家从相邻 cell 移动到该 cell → 立即启动 transition
- `hole-down` 沿用 P3-2 既有 `warningFlash` → `startActiveTransition` pipeline
- 玩家输入锁定 transition 期间（沿用 `input.setPaused(true)`，跟 P3-2 一致）
- transition 完成后：玩家 `level` 更新、`playerY` 重算、HUD `onLevelChange` 推送

### FR-2: ladder 显式触发
- 玩家站在 ladder cell 上不动
- 按 Space → 向上 +1 层（`toLevel = currentLevel + 1`）
- 按 C → 向下 -1 层（`toLevel = currentLevel - 1`）
- 0.5s 动画（同 `STAIR_DURATION_SEC`）
- ladder tile 的 `VerticalTransition` 数据约定：`toLevel = currentLevel + 1`（向上），engine 内部根据玩家按 Space 还是 C 决定 toLevel

### FR-3: 动画时长
- 沿用既有 constants：
  - `STAIR_DURATION_SEC = 0.5` → `stair-up` / `stair-down` / `ladder`
  - `HOLE_DURATION_SEC = 0.4` → `hole-down` / `hole-up`
- `transitionDurationSec(kind)` 函数从「只有 hole-down 实用」扩到「5 个 kind 全实用」

### FR-4: 视觉
- 补 Scene.ts `createTransitionMesh` 里 `stair-down` / `hole-up` / `ladder` 的几何体
- `stair-down`：跟 `stair-up` 镜像（旋转方向反一下，颜色淡一点区分）
- `hole-up`：跟 `hole-down` 类似（暗色 plane），但加一个「向上箭头」视觉提示
- `ladder`：竖直方向延伸的细 box（厚度 ≈ 0.1cs）+ 横档纹路

### FR-5: key 绑定
- 2D 路径新增 ladder 键位：
  - `Space` 在 ladder cell 上 → ladder-up
  - `KeyC` 在 ladder cell 上 → ladder-down
  - **不**影响现有：Space pickup / jump、C 没绑过
- 3D 路径不动（3D 是 WASD + Space/C y 轴直走，不通过 ladder transition）

### FR-6: 防止重复触发
- transition 进行中（同帧 + 后续帧）不能再次触发任何 transition
- 沿用既有 `activeTransition` 字段 guard（`if (this.activeTransition) return;`）
- ladder 触发后同样置 `activeTransition`，期间 Space/C 不响应

## 5. 数据 / 类型变更
- 不改 `VerticalTransition` interface（5 个 kind 已 locked）
- 不改 `MazeData` / `AlgorithmMazeProvider`（generator 已正确生成 5 个 kind 的数据）
- 只改 runtime 行为（Game.ts / Scene.ts / InputManager.ts）

## 6. 引擎 / 架构影响

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/engine/Game.ts` | UPDATE | 移除 `if (t.kind !== 'hole-down') return` hardcode；扩展 `startActiveTransition` / 加 ladder 触发路径；扩展 `findTransitionAt` 行为 |
| `src/engine/Scene.ts` | UPDATE | `createTransitionMesh` 补 `stair-down` / `hole-up` / `ladder` 三个分支 |
| `src/engine/InputManager.ts` | UPDATE | 加 ladder key flag（`ladderUpRequested` / `ladderDownRequested`），由 Space/C 按下时设 true，update 后清 false |
| `src/engine/Game.ts` (P3-1) | UPDATE | `update` 每帧检查 ladder 触发条件（玩家在 ladder cell + 对应 key flag） |
| `tests/unit/engine/Game.transitions.test.ts` | NEW | 5 kind × walk-onto / key-trigger 矩阵 |
| `tests/unit/engine/Scene.transitions.test.ts` | NEW | Scene 渲染 5 kind 都出 mesh（不是 null） |

### 边界检查
- 引擎层不新增 `react` / `store/` import ✓
- 任何 `MazeProvider` 实现不变 ✓
- 新增 Three.js 资源进 `disposeScene` 路径 ✓

## 7. UI / UX 变更
- **无新 UI 元素**：所有 transition tile 编辑器已能放，玩家在场景里能看见
- ladder 在场景里要有视觉提示（细 box + 横档）让玩家知道"这里能爬"
- input key hint（暂时不做，follow-up 增量加 HUD key hints）

## 8. 错误处理
- 玩家按 Space 不在 ladder cell → 走现有 pickup / jump 行为（不冲突）
- transition 进行中按 Space/C → 忽略
- ladder 边界（顶层 / 底层）按错键 → 忽略（`findTransitionAt` 找不到对应 toLevel 的 ladder）

## 9. 测试策略

### 单元测试（核心）
- `tests/unit/engine/Game.transitions.test.ts`:
  - **walk-onto 矩阵**：
    - stair-up × L0 → L1（playerY 从 0 增到 FLOOR_HEIGHT）
    - stair-down × L1 → L0（playerY 从 FLOOR_HEIGHT 减到 0）
    - hole-down × L0 → L1（走 warning → drop pipeline）
    - hole-up × L1 → L0（walk-onto 直接触发）
  - **ladder 触发**：
    - 站 L0 ladder + Space → L1
    - 站 L1 ladder + C → L0
    - 站 L0 ladder + C → 无反应（C 是 down，但 L0 下面没 L-1）
    - 不在 ladder cell 按 Space/C → 走 pickup / nothing
  - **防重入**：
    - transition 中再 walk-onto transition cell → 忽略
    - ladder 动画中再按 Space → 忽略
  - **HUD 推送**：
    - transition 完成 → `bridge.onLevelChange?.(newLevel)` 被调用一次

### 组件测试
- 不新增（行为是 engine 内部，RTL 不能测）

### E2E
- 复用现有 P3-1 E2E fixture：跑 v2 URL (`algo-v2-kruskal-30-2-...`)，走 stair-up 验证 L1 渲染
- 新增 E2E case：跑 3 层 v2 URL (`algo-v2-kruskal-30-3-...`)，走 stair-up → stair-up 验证 L2

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `ladder` 键位 Space 跟 pickup 冲突 | 中 | ladder 触发需要「玩家在 ladder cell + 站着不动 + Space keydown」，跟 pickup（任意 cell + WALKING）条件互斥；ladder 优先 |
| Scene 渲染 5 kind 性能开销 | 低 | 每种 transition 1 个 mesh，spec 1-3 transitions per level，量级 ≤ 15 mesh |
| `startActiveTransition` 复用 hole-down pipeline 漏掉 warning 阶段 | 中 | `hole-down` 仍走 `startWarningFlash` → `tickWarningFlash` → `startActiveTransition`；其他 4 kind 直接 `startActiveTransition`；`startActiveTransition` 内部不动 |
| `findTransitionAt` 对 ladder toLevel 默认值处理 | 中 | ladder 数据的 `toLevel` 已经是 `currentLevel + 1`（editor / generator 都这么写），engine 根据 Space/C 决定 toLevel 方向 |

## 11. 完成清单

### 11.1 功能验收
- [ ] 5 个 kind 全部触发（walk-onto × 4 + ladder × 1）
- [ ] ladder 站定 + Space/C 触发，条件错误无反应
- [ ] 玩家从 L0 走 stair-up 到 L1，能在 L1 找出口赢
- [ ] 玩家从 L1 走 stair-down 回 L0
- [ ] 玩家从 L1 走 hole-up 回 L0
- [ ] transition 期间输入锁定，完成后恢复
- [ ] HUD chip 通过 `onLevelChange` 正确切换

### 11.2 引擎 / 架构边界
- [ ] 引擎层不新增 `react` / `store/` import
- [ ] 新增 Three.js 资源进 `disposeScene` 路径

### 11.3 测试
- [ ] 新增 ≥ 10 个 test（5 kind × walk/key 矩阵 + 防重入 + HUD 推送）
- [ ] 现有 1757 tests 全 pass

### 11.4 文档
- [ ] `docs/increments/p3-1d-multi-transitions/spec.md` 写入
- [ ] `docs/increments/p3-1d-multi-transitions/plan.md` 所有 checkbox 勾
- [ ] CLAUDE.md 加 "P3-1d multi-transitions — locked contracts" 段

## 12. 参考
- `src/engine/Game.ts:272-291` (`transitionDurationSec` 既有 ladder placeholder)
- `src/engine/Game.ts:421-441` (`startActiveTransition` 既有)
- `src/engine/Game.ts:1488` (`if (t.kind === 'hole-down')` 现有 hardcode)
- `src/engine/Scene.ts:677-726` (`createTransitionMesh` 现有 5-kind switch)
- `src/maze/AlgorithmMazeProvider.ts:520-550` (stair-up generator 既有)
- `src/engine/InputManager.ts` (3D 路径已有 Space/C flag，2D 路径需要加 ladder 复用)
- P3-1 spec / plan：`docs/increments/p3-1-multi-level-mazes/`
- P3-2 spec / plan：`docs/increments/p3-2-hole-down-warning-flash/`
