# P2-11 教学关卡重设计 — 实施计划（Plan）

**Spec**: `docs/increments/p2-11-tutorial-revamp/spec.md`
**复杂度**: Medium
**日期**: 2026-06-16

> 步骤使用 `- [ ]` 语法追踪。一次只做一个 Task，完成后勾选 + 跑验证。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `public/levels/level-tiny.json` → `teaching-01.json` | RENAME + UPDATE | name 改"基础教学" + 加 tutorialSteps |
| `public/levels/level-tiny-pickups.json` → `teaching-02.json` | RENAME + UPDATE | name 改"路过拾遗" + 缩为 1 个 pickup + tutorialSteps |
| `public/levels/level-tiny-enemy.json` | DELETE | 被 teaching-03 取代 |
| `public/levels/level-small.json` → `teaching-04.json` | RENAME + UPDATE | name 改"最终试炼" + requireAllPickups + tutorialSteps |
| `public/levels/teaching-03.json` | CREATE | 新建 7×7 回字形 JSON |
| `src/maze/types.ts` | UPDATE | TutorialStep / TutorialTrigger / VictoryType / 4 个新字段 |
| `src/utils/tutorialValidator.ts` | CREATE | 校验 tutorialSteps JSON |
| `src/maze/builtInLevels.ts` | UPDATE | glob 过滤 `teaching-*.json` |
| `src/store/tutorialStore.ts` | CREATE | Zustand 教学 store |
| `src/ui/components/TutorialBanner.tsx` | CREATE | 屏幕底部横幅 |
| `src/ui/GameCanvas.tsx` | UPDATE | 渲染 TutorialBanner；GameBridge 接 onTutorialEvent |
| `src/engine/Game.ts` | UPDATE | 发送 tutorial events；`caught-by-enemy` 胜利路径 |
| `src/game/Rules.ts` | UPDATE | `crossesExit` 支持 `requireAllPickups` 门控；新增 `isPlayerCaughtByEnemy` |
| `src/ui/overlays/WinOverlay.tsx` | UPDATE | caught-by-enemy 文案 + "下一关"按钮 |
| `src/ui/overlays/GameOverOverlay.tsx` | UPDATE | 区分"被追上（教程）"与"真失败"（不应出现） |
| `src/ui/components/Minimap.tsx` | UPDATE | `maze.hideMinimap` 时返回 null |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 4 个新字段控件 |
| `src/store/editorStore.ts` | UPDATE | 4 个新 setter actions |
| `src/i18n/resources/zh.ts` | UPDATE | 新增 `tutorial.*` 8 条 + 新关名 i18n |
| `src/i18n/resources/en.ts` | UPDATE | 同上 |
| `src/styles/theme.css` | UPDATE | 新增 `.tutorial-banner__*` 样式 |
| `tests/unit/store/tutorialStore.test.ts` | CREATE | step 推进 / 超时 / 重置 |
| `tests/unit/utils/tutorialValidator.test.ts` | CREATE | schema 校验 |
| `tests/unit/maze/types.test.ts` | UPDATE | 守卫覆盖 `caught-by-enemy` |
| `tests/unit/game/Rules.test.ts` | UPDATE | requireAllPickups 门控、isPlayerCaughtByEnemy |
| `tests/component/TutorialBanner.test.tsx` | CREATE | 当前步骤渲染 / 隐藏 |
| `tests/component/Minimap.test.tsx` | CREATE / UPDATE | hideMinimap → null |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | UPDATE | 4 个新字段控件断言 |
| `tests/e2e/teaching-flow.spec.ts` | CREATE | 端到端跑过 4 关教程 |

## 任务清单

### Task 1: types.ts 扩展 + 单元测试
- [ ] **Action**:
  - `src/maze/types.ts`:
    - 新增 `TutorialStep` / `TutorialTrigger` 类型
    - `VictoryType` 加 `'caught-by-enemy'`，同步更新 `VICTORY_TYPE_VALUES` 与 `isVictoryType` 守卫
    - `MazeData` 加 `hideMinimap?` / `tutorialSteps?`
    - `LevelRules` 加 `enemyAggression?` / `requireAllPickups?`
- [ ] **Mirror**: 现有 `EnemyAggression` / `PickupType` / `VictoryType` 联合扩展模式
- [ ] **Test**: `tests/unit/maze/types.test.ts` 加 `caught-by-enemy` 守卫覆盖
- [ ] **Validate**: `npx vitest run tests/unit/maze/types.test.ts`

### Task 2: 新建 `tutorialValidator.ts` + 单测
- [ ] **Action**:
  - `src/utils/tutorialValidator.ts`:
    - 纯函数 `validateTutorialSteps(unknown): { ok: true; steps: TutorialStep[] } | { ok: false; error: string }`
    - 校验：每步必有 id / messageKey / trigger.type；`timeout` trigger 必有 timeoutSec；`key-pressed` 必有 keys
- [ ] **Mirror**: 现有 `isPickupType` / `isVictoryType` 守卫风格
- [ ] **Test**: `tests/unit/utils/tutorialValidator.test.ts` 覆盖合法 / 缺字段 / 类型错
- [ ] **Validate**: `npx vitest run tests/unit/utils/tutorialValidator.test.ts`

### Task 3: 新建 `tutorialStore.ts` + 单测
- [ ] **Action**:
  - `src/store/tutorialStore.ts`:
    - Zustand store，状态：`steps`、`currentStepId`、`_timeoutRef`
    - `start(steps)`：重置 + 设 currentStepId = steps[0].id + 启动 timeout
    - `dispatch(event)`：匹配当前步骤 trigger → 调 `_advance()`
    - `_advance()`：移动到下一步；若到末尾则清空 + 关闭 timeout
    - mouse-look 累计：`_accumMouseLook` ref
- [ ] **Mirror**: 现有 Zustand store 风格（参考 `useEditorStore`）
- [ ] **Test**: `tests/unit/store/tutorialStore.test.ts` 覆盖 start / dispatch 匹配 / dispatch 不匹配 / 超时 / reset
- [ ] **Validate**: `npx vitest run tests/unit/store/tutorialStore.test.ts`

### Task 4: GameBridge 扩展 + 引擎 tutorial events
- [ ] **Action**:
  - `src/engine/Game.ts`:
    - `GameBridge` 接口加 `onTutorialEvent?: (event: TutorialEvent) => void`
    - 鼠标累计 yaw/pitch：每帧累加 `(deltaYaw + deltaPitch)`，超过 0.3 rad 触发 `mouse-look` event
    - InputManager key down → 转发为 `key-pressed` event（复用现有 keydown 路径）
    - 拾取触发 → `pickup-collected` event
    - crossesExit 触发 → `reached-exit` event
  - `src/ui/GameCanvas.tsx`:
    - 现有 GameBridge 配置加 `onTutorialEvent` 回调，dispatch 到 `tutorialStore`
- [ ] **Mirror**: 现有 `onPickup` / `onEnemyHit` GameBridge 回调风格
- [ ] **Test**: `npx vitest run tests/unit/store/tutorialStore.test.ts`（间接验证 dispatch 路径）
- [ ] **Validate**: `npx vitest run tests/unit/store/tutorialStore.test.ts`

### Task 5: `Rules.ts` 扩展（requireAllPickups + isPlayerCaughtByEnemy）
- [ ] **Action**:
  - `src/game/Rules.ts`:
    - `crossesExit` 增加可选参数 `collectedCount?: number`，当 `maze.rules.requireAllPickups === true` 且 `collectedCount < expected` → 返回 false
    - 新增 `isPlayerCaughtByEnemy(health: number, lastHitBy: 'enemy' | 'other'): boolean`
- [ ] **Mirror**: 现有 `crossesExit` 纯函数风格
- [ ] **Test**: `tests/unit/game/Rules.test.ts` 加两条用例（requireAllPickups=true/未收集 → false；caughtByEnemy true/false）
- [ ] **Validate**: `npx vitest run tests/unit/game/Rules.test.ts`

### Task 6: Game.ts 胜利路径扩展（caught-by-enemy）
- [ ] **Action**:
  - `src/engine/Game.ts`:
    - 玩家 health=0 时判定 `lastHitBy`：是 enemy → 走 `caught-by-enemy` 胜利路径
    - 在 GameBridge 现有 `onGameOver` / `onWin` 之外，加 `onCaughtByEnemy` 回调（或复用 `onWin` 但 victoryKind='caught-by-enemy'）
  - `src/store/gameStore.ts`:
    - 新增 victory kind 状态字段（若需要区分 caught-by-enemy 文案）
- [ ] **Mirror**: 现有 survive 胜利路径
- [ ] **Test**: `tests/unit/game/Rules.test.ts` 覆盖 isPlayerCaughtByEnemy
- [ ] **Validate**: `npx vitest run tests/unit/game/Rules.test.ts`

### Task 7: WinOverlay 文案分支（caught-by-enemy）
- [ ] **Action**:
  - `src/ui/overlays/WinOverlay.tsx`:
    - 接收 `victoryKind: VictoryType` prop
    - `victoryKind === 'caught-by-enemy'` → 标题"被追上了 — 教学完成" / "Caught — Tutorial Complete"；副标题"你体验了一次敌人的追逐。下一关：最终试炼" / "You experienced the chase. Next: Final Trial"
    - 仍显示「下一关」按钮（教学关 → 下一 teaching）
- [ ] **Mirror**: 现有 WinOverlay 文案分支（time-trial 用时 / reach-exit 拾取进度）
- [ ] **Test**: 现有 WinOverlay 测试加 caught-by-enemy 用例
- [ ] **Validate**: `npx vitest run tests/component/overlays.test.tsx`

### Task 8: TutorialBanner 组件
- [ ] **Action**:
  - `src/ui/components/TutorialBanner.tsx`:
    - Props: `steps: TutorialStep[]`、`currentStepId: string | null`
    - 位置：fixed bottom 60px
    - 视觉：黑底 70% + 圆角 + 进度 chip + 文案
    - data-testid: `tutorial-banner`
  - `src/ui/GameCanvas.tsx`: 条件渲染 `<TutorialBanner>` 当 maze.tutorialSteps?.length > 0
- [ ] **Mirror**: 现有 `WarningsPopup` 抽屉 / `Minimap` 视觉风格
- [ ] **Test**: `tests/component/TutorialBanner.test.tsx` 覆盖渲染 / 步骤切换 / 进度 chip
- [ ] **Validate**: `npx vitest run tests/component/TutorialBanner.test.tsx`

### Task 9: Minimap hideMinimap 支持
- [ ] **Action**:
  - `src/ui/components/Minimap.tsx`:
    - 顶部加 `if (maze.hideMinimap) return null;`
- [ ] **Mirror**: 现有组件 early-return 风格
- [ ] **Test**: `tests/component/Minimap.test.tsx` 加 hideMinimap=true → null 用例
- [ ] **Validate**: `npx vitest run tests/component/Minimap.test.tsx`

### Task 10: 关卡数据迁移 + 新建 teaching-03
- [ ] **Action**:
  - rename: `level-tiny.json` → `teaching-01.json`，改 name 为"基础教学"，加 tutorialSteps
  - rename: `level-tiny-pickups.json` → `teaching-02.json`，改 name 为"路过拾遗"，**缩 pickups 为 1 个** (x=2, z=0, type='health', value=1)，加 tutorialSteps
  - delete: `level-tiny-enemy.json`
  - rename: `level-small.json` → `teaching-04.json`，改 name 为"最终试炼"，加 rules.requireAllPickups=true，加 tutorialSteps
  - create: `teaching-03.json` 7×7 回字形，enemyAggression='medium'，hideMinimap=true，victory='caught-by-enemy'，加 tutorialSteps
- [ ] **Mirror**: 现有 `level-small.json` 格式
- [ ] **Test**: 运行现有 JsonMazeProvider 测试
- [ ] **Validate**: `npx vitest run tests/unit/maze/JsonMazeProvider.test.ts`（如有）+ 手动 `cat public/levels/teaching-*.json` 验证 JSON 合法

### Task 11: builtInLevels glob 过滤更新
- [ ] **Action**:
  - `src/maze/builtInLevels.ts`:
    - glob pattern 改为 `/public/levels/teaching-*.json`（**仅教学关**） + 保留原 `level-*.json` 作为非教学关卡（如有需要）
    - 实际上原 level-*.json 都是教学关卡（level-small.json 之前是"试炼场"），所以现在全部迁到 teaching-*；原 level-* 文件应被删除（Task 10 已完成 rename/delete）
- [ ] **Mirror**: 现有 glob 风格
- [ ] **Test**: JsonMazeProvider 测试覆盖 4 关列表顺序
- [ ] **Validate**: `npx vitest run tests/unit/maze/`

### Task 12: 编辑器 4 个新字段控件
- [ ] **Action**:
  - `src/store/editorStore.ts`:
    - 新增 actions: `setHideMinimap(bool)`, `setEnemyAggression(value | null)`, `setRequireAllPickups(bool)`, `setTutorialSteps(steps)`
  - `src/ui/editor/EditorPropertiesPanel.tsx`:
    - 新增 4 个 Card：「HUD」/「难度」/「胜利条件」/「教学步骤」
    - checkbox 控件 → 直接调 setter
    - select（enemyAggression）→ setter（特殊选项 "inherit" → null）
    - JSON textarea（tutorialSteps）→ `validateTutorialSteps` + 显示预览
- [ ] **Mirror**: 现有 properties panel Card 折叠风格 + `editorStore.set*` 模式
- [ ] **Test**: `tests/component/editor/EditorPropertiesPanel.test.tsx` 加 4 个新控件存在性 + 行为
- [ ] **Validate**: `npx vitest run tests/component/editor/EditorPropertiesPanel.test.tsx`

### Task 13: i18n 文案
- [ ] **Action**:
  - `src/i18n/resources/zh.ts`:
    - 新增 8 条 `tutorial.teaching0N.stepM` 文案
    - 新增 4 条新关名（中文）
  - `src/i18n/resources/en.ts`:
    - 同上英文
  - 4 个 JSON 关卡中 `i18n.en` 字段更新为新英文名
- [ ] **Mirror**: 现有 `tutorial.*` 不存在（前缀无冲突），沿用 `levels.*` 命名风格
- [ ] **Test**: 跑 `tests/unit/i18n/keysParity.test.ts` 自动校验
- [ ] **Validate**: `npx vitest run tests/unit/i18n/`

### Task 14: 样式 + theme.css
- [ ] **Action**:
  - `src/styles/theme.css`:
    - 新增 `.tutorial-banner__*` 样式（mirror `.warnings-popup__*` 命名）
- [ ] **Validate**: `npm run build` 检查 CSS bundle

### Task 15: E2E teaching-flow
- [ ] **Action**:
  - `tests/e2e/teaching-flow.spec.ts`:
    - 用例 1：进入 teaching-01 → 等 banner step1 → 触发 mouse move → 等 step2 → 按 W → 通关
    - 用例 2：进入 teaching-02 → 走到拾取 → 走到出口 → 通关
    - 用例 3：进入 teaching-03 → 等 banner step1+step2 → 故意不动 → 几秒后被追上 → WinOverlay 文案校验
    - 用例 4：进入 teaching-04 → 不拾取直奔出口 → 不通关 → 拾取后再通关
- [ ] **Mirror**: 现有 E2E `level-tiny.json` 模式
- [ ] **Validate**: `npm run test:e2e`

### Task 16: 全套验证 + 文档收尾
- [ ] **Action**:
  - `npm run typecheck` → 0 error
  - `npm test` → 0 fail
  - `npm run build` → 0 error
  - `npm run test:e2e` → 0 fail（除已 skip 的）
  - `docs/roadmap.md` 注册 P2-11 行（in-progress）
  - `docs/roadmap.md` P2-11 状态从 `🔄 in-progress` → `✅ done`（Task 全部完成后）
- [ ] **Validate**: 上述命令全绿

## 验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `caught-by-enemy` 与 GameOver 路径冲突 | 高 | Task 6 显式判定"最后一击来自敌人"；GameOver 仅在 health=0 且非 enemy 时触发 |
| tutorial store setTimeout StrictMode 双触发 | 中 | Task 3 用 ref 持 timer id + cleanup；单测覆盖 |
| 回字形 7×7 几何数值调参 | 中 | Task 10 设计阶段已估算 8-12s；E2E 多跑几次取中位 |
| `requireAllPickups` 触发后 WinOverlay 复现 | 中 | Task 5 拾取完成前 crossesExit 返回 false；UI 层单次渲染 |
| 编辑器新字段影响老自定义关卡 JSON | 中 | JsonMazeProvider sanitize：未知字段保留；新字段缺失当 undefined |
| `mouse-look` 阈值在不同 DPI 下不一致 | 中 | 阈值用 rad，不用 px；Task 4 单元 + E2E 验证 |
| VictoryType 加成员影响 isVictoryType | 中 | Task 1 同步更新白名单；Rules.ts switch 加 default |
| 老 `level-tiny*.json` rename 后的 best record 兼容性 | 低 | 这些关卡在 best record 中无引用；Task 10 一次性迁移 |

## 验收

- [ ] 所有 Task 1-16 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §11 完成清单全部勾选
- [ ] `docs/roadmap.md` 中 P2-11 行从 `in-progress` → `done`
- [ ] 不自动 commit，等用户手动 `git add` + `git commit`

---

## 执行日志（实施时填写）

### 实施日期
（实施时填写）

### 实际改动文件
（实施完成后回填）

### 遇到的偏差
（实施过程中与 spec 的差异）

### 测试覆盖
- 单元覆盖率：...%
- 新增 / 修改测试：...（条数）

### 备注
（任何给后续增量有参考价值的发现）