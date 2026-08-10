# P3-1d multi-transitions — 实施计划（Plan）

**Spec**: `docs/increments/p3-1d-multi-transitions/spec.md`
**复杂度**: Large
**日期**: 2026-08-07

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/engine/Game.ts` | UPDATE | 移除 `kind === 'hole-down'` hardcode；扩展 walk-onto 触发到 4 个 kind；加 ladder 触发路径 |
| `src/engine/Scene.ts` | UPDATE | `createTransitionMesh` 补 `stair-down` / `hole-up` / `ladder` 三个分支 |
| `src/engine/InputManager.ts` | UPDATE | 加 `ladderUpRequested` / `ladderDownRequested` flag（Space/C keydown → flag，update 后清） |
| `src/maze/types.ts` | UPDATE | `FLOOR_HEIGHT` / `EYE_HEIGHT` / 已有 5-kind transition 既有，不动；如需要加 `LADDER_KEY_HOLD_THRESHOLD` |
| `tests/unit/engine/Game.transitions.test.ts` | NEW | 5 kind × walk/key 矩阵 + 防重入 + HUD 推送 |
| `tests/unit/engine/Scene.transitions.test.ts` | NEW | Scene 渲染 5 kind 都出 mesh |
| `CLAUDE.md` | UPDATE | 加 "P3-1d multi-transitions — locked contracts" 段 |

## 任务清单

### Task 1: InputManager 加 ladder key flag
- [ ] **Action**: 加 `private ladderUpRequested: boolean` / `ladderDownRequested: boolean`，Space keydown → `ladderUpRequested = true`，KeyC keydown → `ladderDownRequested = true`；update 末尾清
- [ ] **Mirror**: 现有 3D 路径的 `getMove3D` 用 `requested` flag 模式
- [ ] **Test**: 1 个 unit test「Space keydown → ladderUpRequested = true」
- [ ] **Validate**: `npx vitest run tests/unit/inputManager.test.ts`

### Task 2: Game.update 移除 hole-down hardcode
- [ ] **Action**: 找 `if (t.kind === 'hole-down')` 的两个 site（line 457 和 1488），改成 4 kind 走同一条 path：
  - `hole-down` → `startWarningFlash`（沿用 P3-2 pipeline）
  - 其他 4 kind → `startActiveTransition` 直接
- [ ] **Mirror**: 既有 hole-down pipeline + startActiveTransition
- [ ] **Test**: 1 个 test「stair-up walk-onto → activeTransition 启动，playerY 从 0 增到 FLOOR_HEIGHT」
- [ ] **Validate**: `npx vitest run tests/unit/engine/Game.transitions.test.ts`

### Task 3: Game.update 加 ladder 触发路径
- [ ] **Action**: 玩家移动 tick 之后，单独加一段 ladder 触发逻辑：
  - 玩家当前 cell 是 ladder tile
  - 玩家没在 `activeTransition`
  - `ladderUpRequested` → 启 transition (toLevel = currentLevel + 1)
  - `ladderDownRequested` → 启 transition (toLevel = currentLevel - 1)
  - 没有 toLevel 边界 / 边界外 → ignore
- [ ] **Mirror**: 既有 walk-onto 触发（同一处 update tick）
- [ ] **Test**: 4 个 test（up/down/in-bound/out-of-bound）
- [ ] **Validate**: `npx vitest run tests/unit/engine/Game.transitions.test.ts`

### Task 4: Scene.createTransitionMesh 补 3 个 kind
- [ ] **Action**:
  - `stair-down`: 镜像 stair-up（旋转 z 正方向，颜色淡）
  - `hole-up`: 跟 hole-down 类似 plane，加向上箭头纹理或几何
  - `ladder`: 竖直细 box (cs × floorHeight × cs*0.1) + 横档（多个细 box 水平叠在 ladder 上）
- [ ] **Mirror**: 既有 stair-up / hole-down
- [ ] **Test**: Scene.transitions.test.ts「5 kind 都返回非 null mesh」
- [ ] **Validate**: `npx vitest run tests/unit/engine/Scene.transitions.test.ts`

### Task 5: 防重入 + HUD 推送
- [ ] **Action**:
  - 既有 `if (this.activeTransition) return;` guard 已经能防 walk-onto 重复触发，verify
  - ladder 触发前加同样 guard
  - 既有 `startActiveTransition` 完成路径（`tickActiveTransition`）已经 fire `bridge.onLevelChange?.(targetLevel)`，verify 4 kind 都走这条路径
- [ ] **Mirror**: 既有 hole-down 完成路径
- [ ] **Test**: 2 个 test「walk-onto during transition → ignore」+「transition 完成 → onLevelChange fired」
- [ ] **Validate**: `npx vitest run tests/unit/engine/Game.transitions.test.ts`

### Task 6: 跨 wave 集成（Game.3D 路径不动）
- [ ] **Action**: verify 3D 路径（`walls3D` 那套）不通过 `transitions` 数组，单独 6-neighbor 移动，不被本 spec 改动影响
- [ ] **Test**: 现有 Game.3D.test.ts 全 pass
- [ ] **Validate**: `npx vitest run tests/unit/engine/Game.3D.test.ts`

### Task 7: CLAUDE.md 新增 contract 段
- [ ] **Action**: 在 CLAUDE.md 现有 P3-1 / P3-2 / P3-3 段后加 "P3-1d multi-transitions — locked contracts"：
  - 5 kind × 触发方式（walk-onto vs ladder key）
  - 动画时长复用既有 constants
  - ladder 键位 Space / C
  - 2D/3D 互斥：3D 不通过 transitions
  - HUD 推送通过既有 `bridge.onLevelChange`
- [ ] **Mirror**: 现有 P4b-* contract 段
- [ ] **Validate**: 文档 review

## 验证

```bash
# 必须全部通过才能 mark done
npx tsc --noEmit
npx vitest run tests/unit/engine/Game.transitions.test.ts
npx vitest run tests/unit/engine/Scene.transitions.test.ts
npx vitest run tests/unit/inputManager.test.ts
npx vitest run  # 全量回归（1757 + 新增）
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 5 kind 同时改 Game.ts 改出回归 | 中 | ship-each 节奏：先 Task 1+2+3 改完跑全量；Task 4 单独改 Scene 跑全量；Task 5 验防重入 + HUD |
| `ladder` 触发条件漏 edge case | 中 | 4 个 test 覆盖 in-bound / out-of-bound / 动画中重复 / 不在 ladder cell |
| `startActiveTransition` 内部隐式依赖 hole-down 流程 | 低 | 该函数本来就不区分 kind，只看 `kind` 走 `transitionDurationSec` 取时长，扩展无副作用 |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾
- [ ] CLAUDE.md 新增 P3-1d 段

## 执行日志（实施时填写）

### 实施日期
2026-08-07

### 实际改动文件
（待填）

### 遇到的偏差
（待填）

### 测试覆盖
- 单元覆盖率：≥ 80%
- 新增 / 修改测试：≥ 10 个

### 备注
（待填）
