# P4b 实施计划 (3D Prim)

**Slug**: p4b-3d-prim
**复杂度**: S (半天, 1 session ship)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship

---

## Task Table (P4b-Prim)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-prim/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/maze/types.ts | UPDATE | `Algorithm` 联合加 `'3d-prim'` 字面量 | [ ] |
| 3 | src/maze/generators/prim3D.ts (NEW) | ADD | 3D Prim generator (1:1 翻译 2D prim.ts 升 6 邻居) + `VALID_3D_SIZES` 复用 P4a + `isVoxel3DSize` 复用 P4a | [ ] |
| 4 | src/utils/seed.ts | UPDATE | `VALID_3D_ALGORITHMS` 加 `'3d-prim'` (数组末尾) | [ ] |
| 5 | src/maze/AlgorithmMazeProvider.ts | UPDATE | `load3D` 加 `'3d-prim'` 分支 (跟 P4a RB 并列 else if) | [ ] |
| 6 | tests/unit/maze/prim3D.test.ts (NEW) | ADD | 3D Prim 5+ case (whitelist / cube shape / 边界 wall / determinism / 不同 seed / spanning-tree reachability) | [ ] |
| 7 | tests/unit/utils/seed.test.ts | UPDATE | v3 codec 接受 '3d-prim' round-trip (1 case) | [ ] |
| 8 | tests/unit/maze/algorithmMazeProvider.test.ts | UPDATE | '3d-prim' load 形状 test (1 case) | [ ] |
| 9 | CLAUDE.md | UPDATE | P4b-Prim 段 (在 P4 段后) | [ ] |
| 10 | docs/roadmap.md | UPDATE | 加 P4b-Prim 行 + 活跃锚点 | [ ] |
| 11 | spec.md | UPDATE | 状态 decision-finalized → done | [ ] |
| 12 | Commit + push | — | `feat(p4b): 3D Prim 第二算法` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 (上面 + 上面) ✓
2. **Task 2-3 (Algorithm + generator)** — Algorithm 加 '3d-prim' + prim3D.ts (1:1 翻译 2D Prim 升 6 邻居)
3. **Task 4-5 (seed + provider)** — VALID_3D_ALGORITHMS + load3D 分支
4. **Task 6-8 (test)** — 3 个文件 / 7+ case
5. **Task 9-11 (doc)** — CLAUDE.md + roadmap + spec
6. **Task 12 (commit + push)** — `feat(p4b)`

## Frozen contracts (lockstep 跟 P4a)

- FLOOR_HEIGHT / EYE_HEIGHT 不动
- 4-mode mapping + algorithmForMode 不动
- ALGORITHM_REGISTRY 不动 (3D Prim 不进, 跟 P4a RB 一致)
- seed v1/v2/v3 codec 不动
- 1-6 层 levelCount 不动
- isProcedural 4 处已包括 v3 (P4a 修过), P4b 算法名自动接受

## 集成验证

- [ ] typecheck: 0 error
- [ ] vitest: 全量, +5-7 test, 0 fail
- [ ] vite build: OK
- [ ] Browser E2E (manual): 3D Prim seed 加载 + 6 方向移动 + 出口可达

## Commit 策略

- 1 commit: `feat(p4b): 3D Prim 第二算法` (按 P3-N 风格)

## 实施时间估算

- Task 2-3 (algo + generator): 0.5h
- Task 4-5 (seed + provider): 0.1h
- Task 6-8 (test): 0.5h
- Task 9-11 (doc): 0.1h
- **总**: ~1.2h (单 session 短)

P4b-Prim ship 后开 P4b-CellSize (11/13/15), 然后 P4b-Lerp (0.1s tween), 最后 P4b-Minimap (3D top-down)。
