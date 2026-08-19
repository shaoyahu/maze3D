# P0 follow-up — Plan

**Spec**: `docs/increments/p0-followups/spec.md`
**复杂度**: Small (3 task 合并: P5-cleanup S + cross-layer BFS M + CI audit S, 1 PR 3 commit)
**日期**: 2026-08-13

> 1 PR 3 commit 模式（commit 1 = P5-cleanup, commit 2 = cross-layer BFS, commit 3 = CI audit + spec/plan）。
> 跟 P5-2 (`b113218` + `867aa89`) 一致。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `docs/increments/p0-followups/spec.md` | CREATE | P0 follow-up spec |
| `docs/increments/p0-followups/plan.md` | CREATE | P0 follow-up plan |
| `src/maze/types.ts` | UPDATE | 删 walls3D/start3D/exit3D 字段 + 3D algorithm union + 3D 注释 |
| `src/maze/generators/recursiveBacktracker3D.ts` | DELETE | 3D RB 生成器 (P4a) |
| `src/maze/generators/prim3D.ts` | DELETE | 3D Prim 生成器 (P4b-Prim) |
| `src/maze/reachability.ts` | UPDATE | 删 isReachable3D 函数 + 3D 注释 |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | 删 load3D + pickStartExit3D + 3D dispatch |
| `src/engine/Scene.ts` | UPDATE | 删 buildScene3D + walls3D 分支 + 3D 注释; 修 maze.walls! |
| `src/engine/Game.ts` | UPDATE | 删 walls3D short-circuit + active3DTween + tick3DMovement + getPlayerY |
| `src/engine/InputManager.ts` | UPDATE | 删 getMove3D + 3D 注释 |
| `src/utils/seed.ts` | UPDATE | 删 SEED_RE_V3 + VALID_3D_* + encodeSeedV3 + decodeSeed v3 分支 |
| `src/utils/gameUrl.ts` | UPDATE | 删 algo-v3- 引用 |
| `src/App.tsx` | UPDATE | 删 algo-v3- 引用 + 3D 注释 |
| `src/ui/components/Minimap.tsx` | UPDATE | 删 is3D dispatch + 3D walls3D 引用 + getPlayerY + 3D label/hint/cone |
| `src/ui/editor/editorValidation.ts` | UPDATE | 65 行 isReachable → isReachableMultiLevel (multi-layer) |
| `tests/unit/maze/recursiveBacktracker3D.test.ts` | DELETE | 3D RB test |
| `tests/unit/maze/prim3D.test.ts` | DELETE | 3D Prim test |
| `tests/unit/maze/cellsize.perf.test.ts` | DELETE | 3D 性能 test |
| `tests/unit/engine/Scene.3D.test.ts` | DELETE | 3D Scene test |
| `tests/unit/engine/Game.3D.test.ts` | DELETE | 3D Game test |
| `tests/unit/engine/Game.3D.tween.test.ts` | DELETE | 3D tween test |
| `tests/component/Minimap.3D.test.tsx` | DELETE | 3D Minimap test |
| `tests/unit/editorValidation.test.ts` | UPDATE | 加 2 case 跨层 BFS |
| `.husky/pre-commit` | UPDATE | 加 maze.walls! grep |
| `.github/workflows/ci.yml` | UPDATE | 加 audit step |
| `docs/reviews/2026-08-13-p0-followups-review.md` | CREATE | P0 review artifact |

## 任务清单

### Commit 1: P5-cleanup (FR-1 + FR-2 + FR-4 之一部分: Scene.ts:218 fix)
- [x] **Action 1.1**: 删 `src/maze/generators/recursiveBacktracker3D.ts` + `prim3D.ts` 整个文件
- [x] **Action 1.2**: `src/maze/types.ts` 删 walls3D/start3D/exit3D 字段 + 3D algorithm union + 3D 注释 (FR-1.1, FR-1.2, FR-1.3)
- [x] **Action 1.3**: `src/maze/reachability.ts` 删 isReachable3D 函数 + 3D 注释 (FR-1.6)
- [x] **Action 1.4**: `src/maze/AlgorithmMazeProvider.ts` 删 load3D + pickStartExit3D + 3D dispatch (FR-1.7)
- [x] **Action 1.5**: `src/engine/Scene.ts` 删 buildScene3D + walls3D 分支 + 3D 注释 (FR-1.8); 修 Scene.ts:218 `maze.walls!` → `maze.walls ?? maze.walls2d![0]!` (FR-1.16)
- [x] **Action 1.6**: `src/engine/Game.ts` 删 walls3D short-circuit + active3DTween + tick3DMovement + getPlayerY + 3D start path (FR-1.9, FR-1.15)
- [x] **Action 1.7**: `src/engine/InputManager.ts` 删 getMove3D + 3D 注释 (FR-1.10)
- [x] **Action 1.8**: `src/utils/seed.ts` 删 SEED_RE_V3 + VALID_3D_* + encodeSeedV3 + decodeSeed v3 分支 + 3D 注释 (FR-1.11)
- [x] **Action 1.9**: `src/utils/gameUrl.ts` 删 algo-v3- 引用 (FR-1.12)
- [x] **Action 1.10**: `src/App.tsx` 删 algo-v3- 引用 + 3D 注释 (FR-1.13)
- [x] **Action 1.11**: `src/ui/components/Minimap.tsx` 删 is3D dispatch + 3D walls3D 引用 + getPlayerY + 3D label/hint/cone + data-is-3d (FR-1.14)
- [x] **Action 1.12**: 删 7 个 3D test 文件 (FR-2.1-2.7)
- [x] **Test**: `npx tsc --noEmit -p tsconfig.app.json` 通过
- [x] **Validate**: `npx vitest run` 全部通过 (期望 1814 - 1620 = 194 tests 减少)
- [x] **Commit 1**: `chore(p0-followups): P5-cleanup — delete 3D dead code from P4 refactor-fp2d`

### Commit 2: cross-layer BFS wire (FR-3)
- [x] **Action 2.1**: `src/ui/editor/editorValidation.ts` 改 65 行 isReachable → isReachableMultiLevel (multi-layer 分支); 单 layer 保留 isReachable; 删 sameLayer short-circuit
- [x] **Test**: 新增 `tests/unit/editorValidation.test.ts` 2 case (跨 transition 可达 + 不可达)
- [x] **Validate**: `npx tsc --noEmit && npx vitest run`
- [x] **Commit 2**: `feat(p0-followups): editorValidation cross-layer BFS via isReachableMultiLevel`

### Commit 3: CI audit grep (FR-4)
- [x] **Action 3.1**: `.husky/pre-commit` 加 grep: `! grep -rn 'maze\.walls!' src/ tests/ --include='*.ts' --include='*.tsx' | grep -v '??' | grep .`
- [x] **Action 3.2**: `.github/workflows/ci.yml` 加 audit step (同上 grep 失败红)
- [x] **Test**: 本地手动 `git commit` 一个故意含 `maze.walls!` 的 patch 验证 pre-commit 拒绝
- [x] **Commit 3**: `chore(p0-followups): CI audit grep for maze.walls! non-null assert + spec/plan`

## 验证

```bash
# 必须全部通过才能 ship
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 删 3D dead code 漏 import → typecheck fail | 高 | typecheck 是 single source of truth |
| Scene.ts:218 fallback 误改 → 2D 模式崩 | 低 | 跟 P5-2 Minimap/ParchmentMap 修法一致 |
| editorValidation 跨层 BFS 误报 | 中 | 单元测试覆盖多层跨 transition case |
| pre-commit grep false positive | 低 | 排除 `??` 模式 |

## 验收

- [x] 所有 Task 勾选完成
- [x] 验证命令全部通过
- [x] spec §11 完成清单全部勾选
- [x] review artifact 文档化

---

## 执行日志（实施时填写）

### 实施日期
2026-08-13

### 实际改动文件
（实施后填）

### 遇到的偏差
（实施后填）

### 测试覆盖
- 单元覆盖率：（实施后跑 coverage 填）

### 备注
（实施后填）
