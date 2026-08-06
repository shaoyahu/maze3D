# P3-2 实施计划

**Slug**: p3-2-hole-down-warning-flash
**依赖**: P3-1 (f30ffed), P3-1d (be7bebc)
**复杂度**: S
**预估**: 1-2h 单 session

---

## 任务表 (Task Table)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p3-2-hole-down-warning-flash/{spec,plan}.md | ADD | 增量文档 (锁定决策) | [x] |
| 2 | src/engine/Game.ts | UPDATE | `warningFlash` 状态机 + 0.5s pre-transition + 自动 transfer 到 activeTransition | [ ] |
| 3 | src/engine/Scene.ts | UPDATE | 红色 ring mesh per hole-down cell + `setWarningFlashState` closure | [ ] |
| 4 | tests/unit/engine/Game.warningFlash.test.ts | ADD | 4 case: hole-down 触发 / 0.5s 后自动落体 / non-hole-down 走旧路径 / startLevel 重置 | [ ] |
| 5 | CLAUDE.md | UPDATE | 新增 P3-2 段 (在 Multi-level mazes 段后) | [ ] |
| 6 | docs/roadmap.md | UPDATE | 加 P3-2 行 + 活跃锚点 | [ ] |
| 7 | spec.md | UPDATE | 状态 draft → done | [ ] |

## 实施顺序

1. **Task 2 (Game.ts)** — 核心状态机, 不做这个没法做 test
2. **Task 3 (Scene.ts)** — 视觉闭环 (没有视觉, warning 期间玩家看不到提示)
3. **Task 4 (test)** — 跑 test, 验证 Task 2+3 集成正确
4. **Task 5+6+7 (doc)** — 文档同步, ship 前必做

## Frozen contracts (lockstep)

- FLOOR_HEIGHT / EYE_HEIGHT 不动
- Algorithm 15 + 4-mode 不动
- 1-6 层 levelCount 不动
- seed codec v1/v2 不动

## 集成验证 (收尾)

- [ ] typecheck: 0 error
- [ ] vitest: 全量, +4 test (Game.warningFlash 4 case), 0 fail
- [ ] vite build: OK
- [ ] CLAUDE.md / roadmap / spec 状态同步

## Commit 策略

- 1 commit: `feat(p3-2): hole-down 0.5s warning flash 警示` (按 P3-1 风格)
- 涵盖: src 改动 + test + doc
- 不分多 commit (单 S 复杂度)
