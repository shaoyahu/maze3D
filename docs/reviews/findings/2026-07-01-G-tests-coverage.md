# Finding G — Tests & Coverage (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (tests domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `tests/**`, `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`

## Confirmed Findings

### FCR-C-1: `ui-revamp.spec.ts:6` 引用已删除的 `main-menu-scene` testid
- **File**: [tests/e2e/ui-revamp.spec.ts:6](../../tests/e2e/ui-revamp.spec.ts#L6)
- **Status**: `expect(page.getByTestId('main-menu-scene')).toBeVisible()` 必失败——`src/ui/MainMenu.tsx:13` 只有 `main-menu-panel`。
- **Track alongside**: F-2026-06-15-H-3.6(2 处 mainMenu.revamp skip 是同类处置)。
- **Fix**: 删除该断言 / 替换为 `main-menu-panel` / `test.skip` + F-tag。

### FCR-C-2: 4 个 E2E spec 引用已被替换的内置关卡 id
- **Files**: pickup-types.spec.ts:11 · enemies.spec.ts:15 · play-through.spec.ts:11 · persistence.spec.ts:12,29
- **Status**: `selectOption('level-tiny-pickups')` 等——`public/levels/` 只有 `teaching-XX.json`(P2-11 替换)。
- **Fix**: 选项 A 还原 4 个 fixture;选项 B spec 改成 teaching-XX + 起手坐标重对位。

### FCR-H-1: `vitest.config.ts` 阈值低于文档基线
- **File**: [vitest.config.ts:25](../../vitest.config.ts#L25)
- **Status**: `70/65/65/70` vs 文档 `80/75/75/80`。注释 F-2026-06-17-FCR-H-1 解释是 P2-15 把 3 个文件移出 exclude 的临时下调——但目前 `engine/Camera.ts` / `engine/Renderer.ts` / `engine/Loop.ts` **仍在 exclude 列表**,阈值下调失去对应收益,纯负债。
- **Fix**: 核对三文件是否真达 80/75/75/80,达标后恢复。

### FCR-M-10: `teaching-flow.spec.ts` 只覆盖 1 of 8 教学关
- **File**: [tests/e2e/teaching-flow.spec.ts:6-9](../../tests/e2e/teaching-flow.spec.ts#L6-L9)
- **Status**: 仅 `teaching-01`;其余 7 关被 skip,理由是 timing-sensitive 依赖 `page.clock`。但 `teaching-02`(dungeon + pickups)和 `teaching-04`(caught-by-enemy)路径是确定性的,不需要 page.clock。
- **Fix**: 编写确定性 walkthrough,不依赖 clock fastForward。

### FCR-M-11: `_expandThickWall` helper 无独立单测
- **File**: [src/maze/generators/_expandThickWall.ts](../../maze/generators/_expandThickWall.ts)
- **Status**: 4 个生成器集成测试覆盖它,但 helper 本身(奇/偶 size 边界、midpoint 计算、neighbor cell 处理)无直接测试。集成 fail 时定位成本高。
- **Fix**: `tests/unit/maze/generators/_expandThickWall.test.ts`,10 个 case。

### FCR-M-12: `applySpawnTrigger` 无直接 unit test
- **File**: `src/game/Rules.ts:300`
- **Status**: 通过 `gameStore.rebalance.test.ts` 间接覆盖 `progressiveEnemyCount` 断言,但 `applySpawnTrigger` 纯函数契约(`newLastSpawnAt === elapsedTime` / `pickupCountCollected` 触发条件 / `progressiveSpawn` gate)无 pin。
- **Fix**: `tests/unit/rules.spawn.test.ts` 固定 6 个 case。

## Verified Clean (not gaps)

- ✅ `computeSlowMultiplier`(Rules)P2-18 单测 4 个 case 完整(slowUntil <= now / now < slowUntil / slowUntil = 0 / 边界)
- ✅ `gameStore.test.ts` `currentLevelId` round-trip + `tick` 行为覆盖
- ✅ `Enemy.test.ts` patrol/dwell/chase 状态机 + FOV + path node + initial-heading 修复
- ✅ `types.test.ts` `isTrapKind` / `isKeyColor`(P2-18)+ 全部 `is*` 守卫
- ✅ `getT.test.ts` 占位符 + unknown locale fallback
- ✅ `persist.test.ts` debounced writer + localStorage polyfill 兼容
- ✅ `collision.test.ts` / `player.test.ts` / `pickup.test.ts` 完整
- ✅ 4 个 generator `*.test.ts` shape + determinism + reachability(15/30/50)+ perf(<500ms @ 50x50)+ start/exit 开放 + fingerprint

## Subagent Claims Status

| Agent G HIGH claim | Verification |
|--------------------|------------|
| `doors-traps.spec.ts:16,44,71` 三测试 30s timeout 因 `editor-manual__backdrop` 自动阻挡 | **不成立**——`EditorPage.tsx:69` `useState(false)`,manual 默认关闭。降级为 PENDING — 待人工跑 `npx playwright test tests/e2e/doors-traps.spec.ts` 确认根因(可能 stale testid / 元素遮挡,backdrop 不背锅) |
| `vitest.config.ts:25` 阈值 `70/65/65/70` | **成立**——见 FCR-H-1 |

## Pre-existing Skips (已 F-tag,不属本次回归)

- [tests/e2e/enemies.spec.ts:26,41](../../tests/e2e/enemies.spec.ts#L26) · [survive.spec.ts:18](../../tests/e2e/survive.spec.ts#L18) · [time-trial.spec.ts:12,38](../../tests/e2e/time-trial.spec.ts#L12) · [pause-resume.spec.ts:39](../../tests/e2e/pause-resume.spec.ts#L39) — `page.clock + rAF` 不兼容(F-2026-06-15-H-3.7)
- [tests/e2e/editor.spec.ts:48,120](../../tests/e2e/editor.spec.ts#L48) — `carveLShape` root cause FR-9 P2-15 已修,fixme 待 npx playwright 验证后改 active
- mainMenu.revamp 2 处 skip(F-2026-06-15-H-3.6)——断言已删除的 scene container

## Pending Verification

- **P-1**: `npx playwright test tests/e2e/doors-traps.spec.ts` —— 若 3 fail,记录实际 timeout 原因(可能 stale testid 或元素遮挡,backdrop 不背锅)
- **P-2**: 跑完整 `npx playwright test` 套件,确认 FCR-C-1 / FCR-C-2 fail count 与预期一致