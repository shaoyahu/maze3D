# P4b 实施计划 (3D 多 cell size 11/13/15)

**Slug**: p4b-3d-cellsize
**复杂度**: S (半天, 1 session ship — 主要是数据层扩 1 数组 + 测试)
**依赖**: P4a (3D RB) + P4b-Prim (3D Prim) 都已 ship

---

## Task Table (P4b-CellSize)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-3d-cellsize/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/maze/generators/recursiveBacktracker3D.ts | UPDATE | `VALID_3D_SIZES` 加 11/13/15 (数组末尾) | [ ] |
| 3 | src/utils/seed.ts | UPDATE | `VALID_3D_SIZES` 同步扩 (codec 白名单 + decodeSeed whitelist check) | [ ] |
| 4 | tests/unit/maze/recursiveBacktracker3D.test.ts | UPDATE | whitelist 测试接受 6 sizes (改写 `it('whitelist is {5, 7, 9}')`) | [ ] |
| 5 | tests/unit/maze/prim3D.test.ts | UPDATE | 同上 | [ ] |
| 6 | tests/unit/utils/seed.test.ts | UPDATE | v3 codec round-trip 6 sizes (改写 `it('encodeSeedV3 round-trips every 3D size in {5, 7, 9}')`) | [ ] |
| 7 | tests/unit/maze/algorithmMazeProvider.test.ts | UPDATE | 3D load 6 sizes × 2 算法 (改写 P4a + P4b-Prim 段) | [ ] |
| 8 | tests/unit/maze/cellsize.perf.test.ts (NEW) | ADD | perf budget 11³/13³/15³ × RB / Prim < 1.5s/3s/5s (6 case) | [ ] |
| 9 | CLAUDE.md | UPDATE | P4b-CellSize 段 (在 P4b-Prim 段后) — VALID_3D_SIZES 扩 / perf budget 锁 / draw call 警告 | [ ] |
| 10 | docs/roadmap.md | UPDATE | 加 P4b-CellSize 行 + 活跃锚点 | [ ] |
| 11 | spec.md | UPDATE | 状态 decision-finalized → done | [ ] |
| 12 | Commit + push | — | `feat(p4b): 3D 多 cell size 11/13/15` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2-3 (数据层扩)** — `VALID_3D_SIZES` 2 处同步扩 (recursiveBacktracker3D.ts + seed.ts)
3. **Task 4-7 (测试改写)** — 5 个 test file whitelist case 改 6 sizes,perf test 新建
4. **Task 8 (perf test)** — 实测 6 case (3 size × 2 algo),如果超时调 budget
5. **Task 9-11 (doc)** — CLAUDE.md + roadmap + spec
6. **Task 12 (commit + push)** — `feat(p4b): 3D 多 cell size 11/13/15`

## Frozen contracts (lockstep 跟 P4a 8 + P4b-Prim sibling)

- FLOOR_HEIGHT / EYE_HEIGHT 不动
- 4-mode mapping + algorithmForMode 不动
- ALGORITHM_REGISTRY 不动
- seed v1/v2/v3 codec 不动 (size 字符串部分自动接受)
- 1-6 层 levelCount 不动
- `MazeData.walls3D` / `start3D` / `exit3D` 字段不增不改
- VALID_3D_SIZES = [5, 7, 9, 11, 13, 15] (P4a [5,7,9] 扩 3 个)

## 集成验证

- [ ] typecheck: 0 error
- [ ] vitest: 全量, +6 perf test, 0 fail
- [ ] vite build: OK
- [ ] Browser E2E (manual): 11³/13³/15³ seed 加载 + 6 方向移动 + 出口可达
- [ ] perf budget: 11³ < 1.5s, 13³ < 3s, 15³ < 5s (实测)

## Commit 策略

- 1 commit: `feat(p4b): 3D 多 cell size 11/13/15` (按 P3-N 风格)

## 实施时间估算

- Task 2-3 (数据层): 0.1h
- Task 4-7 (测试改写): 0.5h
- Task 8 (perf test): 0.3h
- Task 9-11 (doc): 0.1h
- **总**: ~1h (单 session 短)

P4b-CellSize ship 后开 P4b-Lerp (3D Player 0.1s tween), 然后 P4b-Minimap (3D top-down minimap)。
