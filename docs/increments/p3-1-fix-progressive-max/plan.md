# P3-1 fix-progressive-max — 实施计划（Plan）

**Spec**: `docs/increments/p3-1-fix-progressive-max/spec.md`
**复杂度**: Small
**日期**: 2026-08-07

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | `SpawnSchedule` 加 `max` 字段 + `SPAWN_SCHEDULE_DEFAULT.max` |
| `src/maze/enemySpawner.ts` | UPDATE | `injectEnemySpawns` 末尾按 `options.spawnSchedule.max` 截断 |
| `src/ui/LevelSelect.tsx` | UPDATE | `buildOptions` 把 `ctx.progressiveMax` 写到 `spawnSchedule.max` |
| `src/utils/gameUrl.ts` | UPDATE | `parseGameSearchParams` 读 `progressiveMax`；`buildGameSearchParams` 写 `progressiveMax` |
| `tests/unit/maze/enemySpawner.test.ts` | UPDATE | 新增 2 test（max 截断 + undefined back-compat） |
| `tests/component/levelSelect.multiLevel.test.tsx` | UPDATE | 新增 1 test（progressiveMax → options.spawnSchedule.max） |

## 任务清单

### Task 1: `SpawnSchedule` 加 `max` 字段
- [x] **Action**: `src/maze/types.ts` `SpawnSchedule` interface 加 `max: number`；`SPAWN_SCHEDULE_DEFAULT.max = SPAWN_PROGRESSIVE_MAX_DEFAULT` (= 10)
- [x] **Mirror**: P2-6 既有 `intervalSec` / `onPickup` / `enabled` 字段
- [x] **Test**: typecheck 通过 + 现有 enemySpawner test 全部 pass（验证 back-compat）
- [x] **Validate**: `npx tsc --noEmit`

### Task 2: `enemySpawner.injectEnemySpawns` 截断
- [x] **Action**: 把 `for` 循环条件 `out.length < target` 改成 `out.length < Math.min(target, options?.spawnSchedule?.max ?? target)`
- [x] **Mirror**: 现有 `count` 参数的 `clampEnemyCount` 处理模式
- [x] **Test**: 新增 test「max=3 → out.length=3 即使 target=10」
- [x] **Validate**: `npx vitest run tests/unit/maze/enemySpawner.test.ts`

### Task 3: `LevelSelect.buildOptions` 透传 `progressiveMax`
- [x] **Action**: `buildOptions` 里 `const spawnSchedule: SpawnSchedule = { ...SPAWN_SCHEDULE_DEFAULT, enabled: ctx.progressive, max: ctx.progressiveMax }`
- [x] **Mirror**: 现有 `enabled: ctx.progressive` 模式
- [x] **Test**: 新增 test「LevelSelect progressiveMax=3 → onPick options.spawnSchedule.max === 3」
- [x] **Validate**: `npx vitest run tests/component/levelSelect.multiLevel.test.tsx`

### Task 4: `gameUrl.ts` round-trip
- [x] **Action**:
  - 加 `PROGRESSIVE_MAX_QUERY = 'progressiveMax'` 常量
  - `parseGameSearchParams` 里读 `progressiveMax`，clamp 到 [1, 20]，写到 `options.spawnSchedule.max`
  - `buildGameSearchParams` 里写 `progressiveMax` query（条件：`options.spawnSchedule?.max` 存在且 !== DEFAULT）
  - `GameUrlError` 加 `'bad-progressive-max'`
- [x] **Mirror**: 现有 `PROGRESSIVE_QUERY` (`'progressive'`) 模式
- [x] **Test**: 新增 1 test「URL 带 progressiveMax=5 → 解析后 spawnSchedule.max=5」
- [x] **Validate**: `npx vitest run tests/unit/utils/gameUrl.test.ts`

## 验证

```bash
# 必须全部通过才能标记 done
npx tsc --noEmit
npx vitest run tests/unit/maze/enemySpawner.test.ts
npx vitest run tests/component/levelSelect.multiLevel.test.tsx
npx vitest run tests/unit/utils/gameUrl.test.ts
npx vitest run  # 全量回归
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `SpawnSchedule.max` 是 required 还是 optional 影响 test 编译 | 低 | 走 required（DEFAULT 给值），typecheck 找漏改 |
| 旧 `spawnSchedule` 字面量（测试 mock）没有 `max` 字段 | 中 | 全量测试跑一遍，失败的 mock 补 `max: 10` |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾
