# P3-1 fix-random-algo-selector — 实施计划（Plan）

**Spec**: `docs/increments/p3-1-fix-random-algo-selector/spec.md`
**复杂度**: Small
**日期**: 2026-08-07

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/ui/LevelSelect.tsx` | UPDATE | `showSeedFields` 拆出 `showAlgorithmPicker`；algorithm-select 渲染条件从 `showSeedFields` 改为 `showAlgorithmPicker`；`validateSelection` random 分支用 `ctx.selectedAlgorithm` |
| `tests/component/levelSelect.multiLevel.test.tsx` | UPDATE | 新增 2 test（random 选 algorithm X + random mode default） |

## 任务清单

### Task 1: `showSeedFields` 拆出 `showAlgorithmPicker`
- [x] **Action**: `const showAlgorithmPicker = showProceduralFields;`（random + seed 都满足）
- [x] **Mirror**: 现有 `showProceduralFields` 已经是 `levelSource === 'random' || levelSource === 'seed'`
- [x] **Test**: typecheck 通过
- [x] **Validate**: `npx tsc --noEmit`

### Task 2: algorithm-select 渲染条件
- [x] **Action**: 把 `algorithm-select` 渲染 gate 从 `showSeedFields` 换成 `showAlgorithmPicker`
- [x] **Mirror**: 现有 size-select / mode-select 都用 `showProceduralFields`
- [x] **Test**: 跑 LevelSelect 现有测试，验证 random tab 也能看到 algorithm-select
- [x] **Validate**: `npx vitest run tests/component/levelSelect.multiLevel.test.tsx`

### Task 3: `validateSelection` random 分支用 `selectedAlgorithm`
- [x] **Action**: `random` 分支 `algorithm: algorithmForMode(ctx.mode)` → `algorithm: ctx.selectedAlgorithm`
- [x] **Mirror**: seed 分支既有的 `algorithm: ctx.selectedAlgorithm`
- [x] **Test**: 新增「random 选 algorithm=eller → onPick 出 v1 id 包含 `algorithm=eller`」
- [x] **Validate**: `npx vitest run tests/component/levelSelect.multiLevel.test.tsx`

### Task 4: 默认行为 test
- [x] **Action**: 不改 mode reset useEffect
- [x] **Test**: 新增「random tab 默认 mode=time-trial → onPick 出 v1 id 包含 `algorithm=recursive-backtracker`」
- [x] **Validate**: `npx vitest run tests/component/levelSelect.multiLevel.test.tsx`

## 验证

```bash
npx tsc --noEmit
npx vitest run tests/component/levelSelect.multiLevel.test.tsx
npx vitest run  # 全量回归
```

## 风险
- 极小。`selectedAlgorithm` 已有 mode reset useEffect（line 400-402），第一次进 random tab 看到的仍是熟悉默认。

## 验收
- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾
