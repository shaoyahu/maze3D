# P0 follow-up — Spec

**Slug**: `p0-followups`
**状态**: draft → in-review → approved → done
**日期**: 2026-08-13
**对应路线图项**: P5-2 review §8 L-1 follow-up + Phase 3 cross-layer BFS + CI audit
**依赖**: P5-2 (`p5-editor-multilayer`)
**复杂度**: Small (3 task 合并: P5-cleanup S + cross-layer BFS M + CI audit S, 1 PR 3 commit)

> 用户 override CLAUDE.md「一次一个增量」节奏：3 task 一起 ship（user 明确指示）。
> 1 PR 3 commit 模式跟 P5-2 (`b113218` + `867aa89` + review artifact) 一致。

## 1. 概述

P5-2 review 推下来 3 个 follow-up，这次一起闭环：

1. **P5-cleanup**: 删 P4 refactor-fp2d 没清干净的 3D dead code (walls3D field / 3D 算法 / v3 codec / buildScene3D / load3D / isReachable3D / getMove3D / getPlayerY / is3D dispatch / active3DTween / 3D 注释噪音)，同时修一个 P5-2 漏修的 `maze.walls!` non-null assert (Scene.ts:218)
2. **Phase 3 cross-layer BFS wire**: `editorValidation.isReachable` 改用 `isReachableMultiLevel` (P3-1 已锁的函数) 当多 layer 时，让多层关卡退出/入口跨 transition BFS 真正可达性验证
3. **CI audit grep**: pre-commit hook 抓 `maze.walls!` non-null assert (P5-2 review H-1 fix 揭示的 typecheck 蒙混 vector), CI step 防止未来 regression

## 2. 目标 / 非目标

### 目标
- 删 P4 refactor-fp2d 残留的 3D dead code：12 个文件、~2500 行 (含 3D test 1620 行)
- 修 P5-2 review 漏修的 1 个 `maze.walls!` non-null assert
- editorValidation 多层关卡走 `isReachableMultiLevel` (P3-1 锁的 transitions graph BFS)
- 加 pre-commit hook + CI step 抓 `maze.walls!` 防止 regression

### 非目标
- 3D mode 不重建（P4-refactor-fp2d 决策锁定 3D = `view=fp3d` query + 2D 多层数据 + 第一人称视角）
- 3D enemy AI / 3D editor / 3D tutorial / 真正 3D 体素立方体 → 留 P1/P2 远期
- 改 2D 多层 data model (P3-1 + P5-1 锁定)
- 改 ALGORITHM_REGISTRY (15 算法 SoT 锁定)
- 新增敌人 AI / pickup / trap / door 行为

## 3. 用户故事

- 作为 maintainer，我希望 P4 refactor-fp2d 决策 (3D 模式 = 2D 多层数据 + 第一人称渲染) 在代码里彻底闭环，没有 3D dead code 残留误导未来 contributor
- 作为关卡设计者，我希望多层关卡在 editor 里 design validation 能正确识别 "跨 transition 可达" vs "真的不可达"，而不是无论啥都告警 "exit unreachable"
- 作为 maintainer，我希望 CI 能抓 typecheck 蒙混的 `maze.walls!` 模式，防止未来 contributor 复制 P5-2 review H-1 bug 路径

## 4. 功能需求

### FR-1: P5-cleanup 删 3D dead code
- F1.1: `MazeData.walls3D?: CellType[][][]` 字段删除 (types.ts:222)
- F1.2: `MazeData.start3D?: { x; y; z }` + `exit3D?: { x; y; z }` 字段删除 (types.ts:203-204)
- F1.3: `'3d-recursive-backtracker' | '3d-prim'` 从 `Algorithm` 联合删除 (types.ts:437,447)
- F1.4: `src/maze/generators/recursiveBacktracker3D.ts` 整个文件删除
- F1.5: `src/maze/generators/prim3D.ts` 整个文件删除
- F1.6: `src/maze/reachability.ts` `isReachable3D` 函数 + 注释删除
- F1.7: `src/maze/AlgorithmMazeProvider.ts` `load3D` 方法 + `pickStartExit3D` helper + 3D dispatch 路径删除
- F1.8: `src/engine/Scene.ts` `buildScene3D` 函数 + `walls3D !== undefined` dispatch + 3D 注释删除
- F1.9: `src/engine/Game.ts` `walls3D` short-circuit + `active3DTween` 字段 + `tick3DMovement` + `getMove3D` 调用 + 3D start path (`createPlayer(start3D, ..., '3d')`) 全部删除
- F1.10: `src/engine/InputManager.ts` `getMove3D` 方法 + 3D y-axis binding 注释删除
- F1.11: `src/utils/seed.ts` `SEED_RE_V3` regex + `VALID_3D_SIZES` + `VALID_3D_ALGORITHMS` + `encodeSeedV3` + `decodeSeed` v3 分支 + 3D 注释全部删除
- F1.12: `src/utils/gameUrl.ts` 删 `algo-v3-` 引用 (line 237)
- F1.13: `src/App.tsx` 删 `algo-v3-` 引用 (line 350) + 3D 注释 (line 343-346)
- F1.14: `src/ui/components/Minimap.tsx` 删 `is3D` dispatch + 3D path (16+ 处 walls3D 引用 + getPlayerY 调用 + 3D y-level label + 3D off-layer exit hint + 3D view cone) + data-is-3d testid
- F1.15: `src/engine/Game.ts` `getPlayerY()` 方法删除 (line 378-380, 4 处 Minimap 调用都死)
- F1.16: Scene.ts:218 `[maze.walls!]` 改用 `maze.walls ?? maze.walls2d![0]!` (P5-2 review H-1 漏修点)

### FR-2: 删 3D test 文件
- F2.1: `tests/unit/maze/recursiveBacktracker3D.test.ts` 删 (178 行)
- F2.2: `tests/unit/maze/prim3D.test.ts` 删 (189 行)
- F2.3: `tests/unit/maze/cellsize.perf.test.ts` 删 (91 行, 3D 性能)
- F2.4: `tests/unit/engine/Scene.3D.test.ts` 删 (172 行)
- F2.5: `tests/unit/engine/Game.3D.test.ts` 删 (308 行)
- F2.6: `tests/unit/engine/Game.3D.tween.test.ts` 删 (418 行)
- F2.7: `tests/component/Minimap.3D.test.tsx` 删 (264 行)

### FR-3: editorValidation 接 isReachableMultiLevel
- F3.1: `src/ui/editor/editorValidation.ts:65` 改用 `isReachableMultiLevel` 当多 layer (levelCount > 1) 时
- F3.2: 单 layer 路径保留 `isReachable` (P3-1 锁的 2D BFS 不变)
- F3.3: `sameLayer` short-circuit 移除 (新 BFS 跨层正确)
- F3.4: 新 test: 多层关卡 start/exit 同层 → isReachableMultiLevel 调用; 跨层 → transitions graph BFS

### FR-4: CI audit grep (pre-commit + CI step)
- F4.1: `.husky/pre-commit` 加 grep 步骤: `! grep -rn 'maze\.walls!' src/ tests/ --include='*.ts' --include='*.tsx' | grep -v '??'` (允许 `??` 显式 fallback)
- F4.2: `.github/workflows/ci.yml` 加 step: 同 grep 失败即红
- F4.3: spec 文档解释: `maze.walls!` non-null assert 是 P5-2 review H-1 揭示的 typecheck 蒙混 vector (strict mutex 排除 multi-layer `walls`，但 `maze.walls!` 仍过 typecheck, 运行时 multi-layer 关卡会 crash)

## 5. 数据 / 类型变更

### 删除的字段
- `MazeData.walls3D?: CellType[][][]` (P4a)
- `MazeData.start3D?: { x; y; z }` (P4a)
- `MazeData.exit3D?: { x; y; z }` (P4a)

### 删除的联合成员
- `Algorithm` 联合删除 `'3d-recursive-backtracker'` 和 `'3d-prim'` 字面量 (types.ts:437,447)

### 不变的字段
- `MazeData.walls2d?` (P5-1 锁) — 保留
- `MazeData.walls?` (P5-2 锁) — 保留
- `MazeData.transitions?: VerticalTransition[]` (P3-1 锁) — 保留
- 15 个 2D 算法 (ALGORITHM_REGISTRY 锁) — 保留

## 6. 引擎 / 架构影响

### 受影响文件 (P5-cleanup 删 3D)
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | 删 walls3D/start3D/exit3D 字段 + 3D algorithm union + 3D 注释 |
| `src/maze/generators/recursiveBacktracker3D.ts` | DELETE | 整个 3D RB 生成器 (190 行) |
| `src/maze/generators/prim3D.ts` | DELETE | 整个 3D Prim 生成器 (265 行) |
| `src/maze/reachability.ts` | UPDATE | 删 isReachable3D 函数 + 3D 注释 (P3-1 isReachableMultiLevel 保留) |
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | 删 load3D + pickStartExit3D + 3D dispatch |
| `src/engine/Scene.ts` | UPDATE | 删 buildScene3D + `maze.walls3D !== undefined` 分支 + 3D 注释; 修 `maze.walls!` → `?? maze.walls2d![0]!` |
| `src/engine/Game.ts` | UPDATE | 删 walls3D short-circuit + active3DTween + tick3DMovement + getPlayerY + 3D start path |
| `src/engine/InputManager.ts` | UPDATE | 删 getMove3D + 3D y-axis binding 注释 |
| `src/utils/seed.ts` | UPDATE | 删 SEED_RE_V3 + VALID_3D_* + encodeSeedV3 + decodeSeed v3 分支 |
| `src/utils/gameUrl.ts` | UPDATE | 删 `algo-v3-` 引用 |
| `src/App.tsx` | UPDATE | 删 `algo-v3-` 引用 + 3D 注释 |
| `src/ui/components/Minimap.tsx` | UPDATE | 删 is3D dispatch + 3D walls3D 引用 + getPlayerY 调用 + 3D y-level label + 3D off-layer exit hint + 3D view cone + data-is-3d testid |

### 删 3D test 文件 (FR-2)
| 文件 | 改动类型 | 行数 |
|---|---|---|
| `tests/unit/maze/recursiveBacktracker3D.test.ts` | DELETE | 178 |
| `tests/unit/maze/prim3D.test.ts` | DELETE | 189 |
| `tests/unit/maze/cellsize.perf.test.ts` | DELETE | 91 |
| `tests/unit/engine/Scene.3D.test.ts` | DELETE | 172 |
| `tests/unit/engine/Game.3D.test.ts` | DELETE | 308 |
| `tests/unit/engine/Game.3D.tween.test.ts` | DELETE | 418 |
| `tests/component/Minimap.3D.test.tsx` | DELETE | 264 |

### editorValidation 改动 (FR-3)
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/ui/editor/editorValidation.ts` | UPDATE | 65 行 isReachable → isReachableMultiLevel (multi-layer 分支) |
| `tests/unit/editorValidation.test.ts` | UPDATE | 加 2-3 case (跨层可达/不可达/transitions 桥接) |

### CI 改动 (FR-4)
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `.husky/pre-commit` | UPDATE | 加 grep 检查 |
| `.github/workflows/ci.yml` | UPDATE | 加 audit step |

### 边界检查
- 引擎层（`src/engine/**`、`src/maze/**`）继续不 `import` react / zustand / `../store/**` (P5-2 锁)
- `AlgorithmMazeProvider.load` 公开 API 不变 (删除 `load3D` 是私有方法)
- 2D 多层 data model (P3-1 + P5-1) 完整保留

## 7. UI / UX 变更

- 无新 UI 改动
- Minimap 删 3D dispatch: 永远 2D top-down 单层 (P4-refactor-fp2d 决策), `currentLayer` 走 `storedLevel` (P4-refactor-fp2d 锁)
- editorValidation: 多层关卡跨 transition 可达时, 静默成功 (不显示 warning); 不可达时, 沿用现有 `editor.validation.exitUnreachable` 文案

## 8. 错误处理

### 新增错误码
- 无 (只是删 dead code + 接已有 BFS)

### 兜底行为
- `algo-v3-` URL 仍然在 gameUrl `isProcedural` 接受 (v3 prefix) — 但 `decodeSeed` 删 v3 分支后 v3 URL 会 throw InvalidSeedError. 这是 spec 锁定: 3D 算法已经作废, 老 v3 URL 走 `bad-seed` 错误路径 (P4-refactor-fp2d 决策)
- Scene.ts:218 fallback `maze.walls ?? maze.walls2d![0]!` — multi-layer 关卡 走 `walls2d[0]`, single-layer 走 `walls`. 与 P5-2 Minimap/ParchmentMap 修法一致

## 9. 测试策略

### 单元测试
- `tests/unit/editorValidation.test.ts`:
  - 单层 BFS 路径不动 (回归测试)
  - 新增 2 case: 多层跨 transition 可达 / 不可达
- 全量 `npm test` 通过 (含 P5-2 末 1814 tests)

### 组件测试 (RTL)
- Minimap.test.tsx 删 3D data-is-3d 断言
- ParchmentMap.test.tsx 不动 (P5-2 已修)

### E2E 测试 (Playwright)
- 不新增 (3D dead code 删后无 E2E 路径涉及)
- 复用 P5-1 teaching-multilayer-01.json 走多层流程 (已被 P5-1 E2E 覆盖)

### CI 步骤
- pre-commit: `grep -rn 'maze\.walls!' src/ tests/ --include='*.ts' --include='*.tsx' | grep -v '??' | grep .` 必须空
- CI: 同上

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 删 3D dead code 漏 import → typecheck fail | 高 | typecheck 是 single source of truth, 跑 `npx tsc --noEmit -p tsconfig.app.json` 必过 |
| Scene.ts:218 fallback 误改 → 2D 模式崩 | 低 | `maze.walls ?? maze.walls2d![0]!` 跟 P5-2 Minimap/ParchmentMap 修法一致 (已 ship 验证) |
| editorValidation 跨层 BFS 误报 (可达关卡告警) | 中 | 单元测试覆盖多层跨 transition 可达 case; 跑 teaching-multilayer-01.json 走 dev server 验证 |
| pre-commit grep false positive (合法 `maze.walls!` 路径) | 低 | grep 排除 `??` 模式 (允许 `maze.walls ?? maze.walls2d![0]!`); spec §FR-4 文档化 |
| P3-1 isReachableMultiLevel API 不匹配 | 低 | 函数已经存在 (reachability.ts:170) 完整实现, spec 锁的 |

## 11. 完成清单 (dod)

### 11.1 功能验收
- [x] FR-1 P5-cleanup 16 子项全部 ship
- [x] FR-2 7 个 3D test 文件删
- [x] FR-3 editorValidation 接 isReachableMultiLevel
- [x] FR-4 CI audit grep ship

### 11.2 引擎 / 架构边界
- [x] 引擎层继续不 `import` react / zustand
- [x] AlgorithmMazeProvider.load 公开 API 不变
- [x] 新增 Three.js 资源无 (只删)

### 11.3 测试
- [x] 单元测试覆盖率 ≥80% (P5-2 末 1814 tests 通过 + P0 删 3D test 后总数下降)
- [x] editorValidation 新 case 覆盖
- [x] `npm run typecheck` 与 `npm run build` 通过
- [x] pre-commit hook 阻止 commit 含 `maze.walls!`

### 11.4 文档
- [x] `docs/increments/p0-followups/spec.md` 已写
- [x] `docs/increments/p0-followups/plan.md` 已写
- [x] review artifact 文档化 P0 cleanup rationale

### 11.5 持久化与兼容
- [x] 不破坏 `localStorage` schema (无新字段)
- [x] 不新增设置项
- [x] 老 `algo-v3-*` URL 走 `bad-seed` 错误路径 (P4-refactor-fp2d 决策)

### 11.6 安全与健壮性
- [x] typecheck 蒙混 vector 关闭 (pre-commit grep)
- [x] 无 console.log 残留
- [x] 无硬编码密钥

## 12. 参考

- P5-2 review artifact: `docs/reviews/2026-08-12-p5-editor-multilayer-review.md` (L-1 推 P5-cleanup)
- P4-refactor-fp2d 决策: 3D 模式 = `view=fp3d` + 2D 多层数据 + 第一人称视角
- P3-1 锁: isReachableMultiLevel + transitions graph BFS
- P5-1 锁: walls2d + walls xor walls2d mutex
- P5-2 锁: walls walls2d mutex + perLayerWalls utils + 5 决策
- PR #1 (P4-refactor-fp2d) + PR #2 (P5-2) 待 review
