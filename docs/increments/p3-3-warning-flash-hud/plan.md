# P3-3 实施计划

**Slug**: p3-3-warning-flash-hud
**依赖**: P3-1 / P3-1d / P3-2
**复杂度**: S
**预估**: 1h 单 session

---

## Task Table

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p3-3-warning-flash-hud/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/store/gameStore.ts | UPDATE | `warningFlashUntil: number` + `warningFlashTriggerId: number` + 2 setter | [ ] |
| 3 | src/engine/Game.ts | UPDATE | GameBridge `onWarningFlashState?: (active: boolean) => void` + 3 处调 | [ ] |
| 4 | src/ui/GameCanvas.tsx | UPDATE | bridge 实现 onWarningFlashState → setWarningFlashUntil / setWarningFlashTriggerId | [ ] |
| 5 | src/ui/components/WarningFlashOverlay.tsx (NEW) | ADD | 复制 InvulnerableFlash 模板, 订阅 warningFlashUntil | [ ] |
| 6 | src/ui/HUD.tsx | UPDATE | 加 `<WarningFlashOverlay />` | [ ] |
| 7 | tests/unit/store/gameStore.warningFlash.test.ts (NEW) | ADD | 2 case: setWarningFlashUntil 设值 / initial === 0 | [ ] |
| 8 | tests/unit/components/warningFlashOverlay.test.tsx (NEW) | ADD | 3 case: inactive / active / restart | [ ] |
| 9 | CLAUDE.md | UPDATE | 新增 P3-3 段 (在 P3-2 段后) | [ ] |
| 10 | docs/roadmap.md | UPDATE | 加 P3-3 行 + 活跃锚点 | [ ] |
| 11 | spec.md | UPDATE | 状态 draft → done | [ ] |

## 实施顺序

1. Task 2-3 (数据层) — gameStore + GameBridge interface
2. Task 4-6 (UI 层) — bridge 实现 + Overlay 组件 + HUD 集成
3. Task 7-8 (test) — store + component test
4. Task 9-11 (doc) — 文档同步

## Frozen contracts (lockstep)

- WARNING_FLASH_DURATION_SEC = 0.5 (P3-2 锁定, P3-3 必须对齐)
- invulnerable-fade keyframe (theme.css:199) 复用, 不引入新 CSS
- 4-mode mapping + 1-6 层 + 算法 SoT 不动

## 集成验证

- [ ] typecheck: 0 error
- [ ] vitest: 全量, +5 test (2 store + 3 component), 0 fail
- [ ] vite build: OK
- [ ] CLAUDE.md / roadmap / spec 状态同步

## Commit 策略

- 1 commit: `feat(p3-3): HUD 0.5s 红色 vignette overlay 与 P3-2 同步`
