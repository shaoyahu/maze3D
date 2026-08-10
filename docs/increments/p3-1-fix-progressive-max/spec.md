# P3-1 fix-progressive-max — 设计文档（Spec）

**Slug**: p3-1-fix-progressive-max
**状态**: draft → in-review → approved → done
**日期**: 2026-08-07
**对应路线图项**: P3-1（已 ship 的 silent bug 修复）
**依赖**: —
**复杂度**: Small

## 1. 概述

修一个 silent bug：`LevelSelect` 暴露了「渐进上限」输入框（`progressiveMax`，默认 10），但 `buildOptions` 只读 `progressive: boolean`，从来不读 `progressiveMax`，玩家改了上限值完全没效果。本 spec 把 `progressiveMax` 接入到 `SpawnSchedule.max`，让 runtime 真的按上限截断渐进 spawn。

## 2. 目标 / 非目标

### 目标
- `SpawnSchedule` 新增 `max: number` 字段，含义是「渐进 spawn 在场上同时存在的敌人总数上限」
- `buildOptions` 把 `ctx.progressiveMax` 透传到 `spawnSchedule.max`
- `enemySpawner.injectEnemySpawns` 在接受 spawn 时按 `max` 截断
- 1 个 unit test 覆盖「progressiveMax=3 → spawn 数组最多 3 个」

### 非目标
- 改 `intervalSec` / `onPickup` / `enabled` 语义（已 ship 的 contract 不动）
- 改 `ENEMY_COUNT_MAX` / `ENEMY_COUNT_MIN` / `ENEMY_COUNT_DEFAULT`（那是「开局初始数量」概念，不是渐进上限）
- 改 UI 输入框约束（保留现有 [1, 20] 范围，跟 P2-6 锁一致）

## 3. 用户故事
- 作为玩家，我想要「敌人涨到 X 个就停」，以便我不会被无限 spawn 淹没
- 作为玩家，我期待「渐进上限」输入框改了的值真的生效，不是装饰

## 4. 功能需求
- FR-1: `SpawnSchedule.max: number`（默认 = `SPAWN_PROGRESSIVE_MAX_DEFAULT = 10`）
- FR-2: `LevelSelect.buildOptions` 把 `ctx.progressiveMax` 写到 `spawnSchedule.max`
- FR-3: `injectEnemySpawns(maze, count, options)` 在 `options.spawnSchedule?.max !== undefined && > 0` 时把 out.length 截到 `max`
- FR-4: `URL` round-trip：`spawnSchedule.max` 跟 `enabled` 一起进 query string（`?progressive=1&progressiveMax=5`）

## 5. 数据 / 类型变更

### 修改的类型
- `src/maze/types.ts`:
  - `SpawnSchedule` 加 `max: number` 字段
  - `SPAWN_SCHEDULE_DEFAULT.max = SPAWN_PROGRESSIVE_MAX_DEFAULT`

### 不改的 Store
- `gameStore` / `levelStore` / `settingsStore` 都不变（`spawnSchedule` 已存在）

## 6. 引擎 / 架构影响

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `SpawnSchedule` 加 `max` 字段 + `SPAWN_SCHEDULE_DEFAULT.max` |
| `src/maze/enemySpawner.ts` | UPDATE | `injectEnemySpawns` 末尾 `out.length < target` 改成 `out.length < Math.min(target, options.spawnSchedule.max ?? target)` |
| `src/ui/LevelSelect.tsx` | UPDATE | `buildOptions` 把 `ctx.progressiveMax` 透传到 `spawnSchedule.max` |
| `src/utils/gameUrl.ts` | UPDATE | `parseGameSearchParams` 读 `progressiveMax` query；`buildGameSearchParams` 写 `progressiveMax` query（跟 `progressive` lockstep） |
| `tests/unit/maze/enemySpawner.test.ts` | UPDATE | 加 1 test 验证 `spawnSchedule.max=3` 截断 |
| `tests/component/levelSelect.multiLevel.test.tsx` | UPDATE | 加 1 test 验证 `progressiveMax=3` 进 options.spawnSchedule.max |

### 边界检查
- 引擎层不新增 `react` / `store/` import ✓
- 没有新增 Three.js 资源 ✓
- `MazeProvider` 接口不变 ✓

## 7. UI / UX 变更
- **无新 UI**：输入框已经存在，只是接通数据
- 输入框约束保留 [1, 20]，跟 P2-6 spec 锁一致

## 8. 错误处理
- `progressiveMax` 不在 query / options → fall back to `SPAWN_PROGRESSIVE_MAX_DEFAULT`
- `progressiveMax` 非法（负数 / NaN / 字符串）→ `parseGameSearchParams` 返 `bad-progressive-max` 错误码
- 范围 [1, 20] 跟 P2-6 一致（input 框 onChange 已 clamp）

## 9. 测试策略

### 单元测试
- `tests/unit/maze/enemySpawner.test.ts`:
  - 新增：「spawnSchedule.max=3 → out 长度 = 3，即使 target=10」
  - 新增：「spawnSchedule.max undefined → 不截断（back-compat）」
- `tests/component/levelSelect.multiLevel.test.tsx`:
  - 新增：「LevelSelect progressiveMax=3 → onPick options.spawnSchedule.max === 3」

### 组件测试
- 沿用 LevelSelect 现有 RTL 套件，不新增

### E2E
- 暂不写（runtime 行为可被 unit 完全覆盖）

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 破坏 P2-6 既有 progressive 行为 | 低 | 保留 `enabled` / `intervalSec` 字段语义不变；只加 `max` 字段 + 默认值 |
| 旧 URL 没有 `progressiveMax` 参数 | 低 | `parseGameSearchParams` fall back 到 DEFAULT，跟 P2-6 旧 URL 无 `progressive` 参数时 fall back 到 enabled=true 同一模式 |
| 改 `SpawnSchedule` 接口破坏其他 consumer | 低 | `max` 是 optional 还是 required？走 **required** 路径（DEFAULT 给值），让类型系统帮我找漏改的地方 |

## 11. 完成清单

### 11.1 功能验收
- [ ] FR-1~FR-4 全部实现
- [ ] LevelSelect 输入框改值 → URL query 反映 → reload 后 runtime 真的截断
- [ ] 边界 [1, 20] 行为保留

### 11.3 测试
- [ ] 新增 3 个 test（spawner × 2 + LevelSelect × 1）
- [ ] 现有 1757 tests 全 pass

### 11.4 文档
- [ ] `docs/increments/p3-1-fix-progressive-max/spec.md` 写入
- [ ] `docs/increments/p3-1-fix-progressive-max/plan.md` 所有 checkbox 勾

## 12. 参考
- `src/maze/types.ts:519-523` (SpawnSchedule 当前定义)
- `src/maze/types.ts:619-623` (SPAWN_PROGRESSIVE_MAX_DEFAULT 注释)
- `src/store/levelStore.ts` (P2-6 progressive 实现)
