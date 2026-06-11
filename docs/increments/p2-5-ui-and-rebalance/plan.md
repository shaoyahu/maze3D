# UI 改版 + 存活模式重平衡 — 实施计划 (Plan)

**Spec**: `docs/increments/p2-5-ui-and-rebalance/spec.md`
**Roadmap**: `docs/increments/_template/roadmap.md` § P2-5
**复杂度**: Large（3–5 天）
**日期**: 2026-06-11

> 步骤使用 `- [ ]` 语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。
>
> **范围声明**：本 plan 把三项用户可见改动合成一个 Large 增量：主菜单 3D 化、LevelSelect 两列 + 原生 select + 进阶折叠、敌人按模式硬门 + 算法按模式锁死。它们共享 `LevelSelect.tsx` / `theme.css` / 选项/状态模型；拆成 3 个子增量意味着连续 3 个 PR 改同一组文件,对玩家没增量价值。
>
> **Source-of-truth**：本文件是 `_template/increment-plan.md` 风格的可发布副本，详细 step-by-step 步骤（含完整代码片段、精确行号、git commit message）见 `docs/superpowers/plans/2026-06-11-p2-5-ui-and-rebalance.md`（`Task N` 一一对应）。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/AlgorithmMazeProvider.ts` | UPDATE | 新增 `algorithmForMode(mode)` 导出 (FR-17) |
| `tests/unit/maze/algorithmForMode.test.ts` | CREATE | 3 case + 1 穷尽性 |
| `src/ui/LevelSelect.tsx` | UPDATE | 接入 `algorithmForMode` (FR-17) |
| `src/store/gameStore.ts` | UPDATE | `startLevel` 在非 survive 把 enemyCount 硬关为 0 (FR-18/FR-20/FR-21) |
| `src/engine/Game.ts` | UPDATE | `startLevel` 把 `injectEnemySpawns` 调用包在 `mode === 'survive'` 条件里 (FR-18/FR-19/FR-21) |
| `src/ui/components/EnemyCounter.tsx` | UPDATE | 非 survive 模式返回 `null` (FR-22) |
| `tests/unit/gameStore.rebalance.test.ts` | CREATE | 5 case: 3 clamp + 1 hand-crafted + 1 schedule |
| `tests/unit/engine/game.rebalance.test.ts` | CREATE | spy 回归哨 |
| `tests/component/enemyCounter.rebalance.test.tsx` | CREATE | 4 case: 2 hide + 2 render |
| `src/styles/theme.css` | UPDATE | 新增 `--select-chevron` + `.level-select-select` 样式 + `.main-menu-button` hover-lift (FR-1/FR-5/FR-6) |
| `src/ui/components/Button.tsx` | UPDATE | 新增 `hoverLift?: boolean` 可选 prop (FR-5) |
| `src/ui/LevelSelect.tsx` | UPDATE | 两列 grid + 原生 select + 进阶折叠 + 按模式显隐 (FR-7..FR-16) |
| `tests/component/levelSelect.uiRevamp.test.tsx` | CREATE | 9+ case 覆盖 grid/selects/mode-gated/advanced fold/algorithmForMode 编码 |
| `src/ui/MainMenuScene.ts` | CREATE | Three.js 场景封装（r127），低多边形迷宫 + 慢转 + reduced-motion 静态帧 (FR-1/FR-2/FR-3) |
| `src/ui/MainMenu.tsx` | UPDATE | 挂载场景 + 半透明 panel + hover-lift 按钮 + WebGL fallback (FR-1/FR-4/FR-5) |
| `tests/component/mainMenu.revamp.test.tsx` | CREATE | 5 case: 挂载 / 卸载 / WebGL fallback / 按钮点击 |
| `tests/e2e/ui-revamp.spec.ts` | CREATE | 5 case: scene / 2-col / mode-gated / advanced fold / placeholder |
| `tests/e2e/survive-branching.spec.ts` | CREATE | 2 case: survive kruskal + enemy counter 可见；reach-exit counter 隐藏 |
| `docs/increments/p2-5-ui-and-rebalance/{spec,plan,review}.md` | CREATE | 增量三件套（本文件 + spec + review） |
| `docs/increments/_template/roadmap.md` | UPDATE | 新增 P2-5 行 + 活跃锚点 + 详细任务表 |
| `public/levels/level-tiny-enemy.json` | UPDATE | 修一个 enemy patrol path 节点（(1,0) → (2,1)）保证巡逻连通 |
| `tests/e2e/{survive,time-trial,procedural,pause-resume,persistence}.spec.ts` | UPDATE | radio→select 兼容 + canvas mount wait + main-menu-start testid |
| `tests/component/hud.test.tsx` | UPDATE | P2-5 FR-22 后 enemy-counter 测试需 opt-in `currentMode: 'survive'` |

## 任务清单

### Task 1: `algorithmForMode(mode)` 纯函数辅助
- [x] **Action**: 在 `src/maze/AlgorithmMazeProvider.ts` 新增 `algorithmForMode(mode: VictoryType): Algorithm` 导出（switch + 穷尽性 `never`）
- [x] **Mirror**: 沿用 P2-3 已有的 `AlgorithmMazeProvider.generateWalls` 穷尽性 switch 模式
- [x] **Test**: `tests/unit/maze/algorithmForMode.test.ts` 3 case + 1 穷尽性
- [x] **Validate**: `npx vitest run tests/unit/maze/algorithmForMode.test.ts && npm run typecheck`

### Task 2: LevelSelect 接入 `algorithmForMode`
- [x] **Action**: 删 `PROCEDURAL_ALGORITHM` 常量；`startRandom` / `startSpecified` 改用 `algorithmForMode(mode)`
- [x] **Mirror**: P2-3 引入的 seed 编码格式（`algo-v1-{algorithm}-{size}-{hex}`）
- [x] **Test**: 现有 `tests/component/levelSelect.custom.test.tsx` + `tests/component/menus.test.tsx` 仍 GREEN
- [x] **Validate**: `npx vitest run tests/component/levelSelect.custom.test.tsx tests/component/menus.test.tsx`

### Task 3: `gameStore.startLevel` 硬关 enemyCount
- [x] **Action**: `startLevel` 内 `requestedEnemyCount = mode === 'survive' ? clampEnemyCount(...) : 0`；`progressiveEnemyCount: requestedEnemyCount`
- [x] **Mirror**: 已有 `clampEnemyCount` 辅助；`injectEnemySpawns` 0→空数组契约
- [x] **Test**: `tests/unit/gameStore.rebalance.test.ts` 5 case
- [x] **Validate**: `npx vitest run tests/unit/gameStore.rebalance.test.ts tests/unit/gameStore.test.ts`

### Task 4: `Game.startLevel` 启动时也硬关
- [x] **Action**: `src/engine/Game.ts` `startLevel` 把 `injectEnemySpawns` 调用包在 `mode === 'survive'` 条件里
- [x] **Mirror**: 与 Task 3 的 store 侧 gating 配对（两端一致）
- [x] **Test**: `tests/unit/engine/game.rebalance.test.ts` spy 回归哨
- [x] **Validate**: `npx vitest run tests/unit tests/component`

### Task 5: `EnemyCounter` 在非 survive 模式隐藏
- [x] **Action**: 组件 `if (mode !== 'survive') return null`；订阅 `currentMode + currentEnemyCount` 双字段
- [x] **Mirror**: P2-4a 已有的 `EnemyCounter` 测试接口
- [x] **Test**: `tests/component/enemyCounter.rebalance.test.tsx` 4 case
- [x] **Validate**: `npx vitest run tests/component/enemyCounter.rebalance.test.tsx`

### Task 6: 阶段 2 整体回归
- [x] **Action**: 跑全 unit + component 套件
- [x] **Mirror**: — (回归检查)
- [x] **Test**: `tests/unit` + `tests/component` 全部
- [x] **Validate**: `npx vitest run tests/unit tests/component && npm run typecheck`

### Task 7: `theme.css` 新增 select + main-menu hover 样式
- [x] **Action**: 新增 `:root --select-chevron`（light + dark）、`.level-select-select`、`.main-menu-button` hover 上浮
- [x] **Mirror**: 已有 `theme.css` 的 `:root[data-theme="dark"]` 模式
- [x] **Test**: 视觉（dev server）+ 现有 component 测试不回归
- [x] **Validate**: `npx vitest run tests/component/menus.test.tsx`

### Task 8: `Button` 接受 `hoverLift` prop
- [x] **Action**: 新增 `hoverLift?: boolean` 可选 prop；className 在 true 时追加 `main-menu-button`
- [x] **Mirror**: 已有 `ButtonProps` 接口
- [x] **Test**: 现有 `tests/component/{menus,settings,levelSelect.custom}.test.tsx` 不回归
- [x] **Validate**: `npx vitest run tests/component/menus.test.tsx tests/component/settings.test.tsx tests/component/levelSelect.custom.test.tsx`

### Task 9: `LevelSelect` 改成两列 grid + 原生 select + 进阶折叠
- [x] **Action**: root 改 `gridTemplateColumns: 'minmax(280px, 360px) 1fr'`（720px 以下塌成 1 列）；mode/survive-seconds/enemy-count/size 全部换 `<select>`；`progressive` 与 enemy 控件包在 `mode === 'survive'` 条件里；seed 输入挪到 进阶 ▾ 折叠
- [x] **Mirror**: 已有 `data-testid` 挂到 `<option>` 上保持稳定
- [x] **Test**: 由 Task 10 覆盖
- [x] **Validate**: `npm run typecheck`

### Task 10: `LevelSelect` UI 重构测试
- [x] **Action**: `tests/component/levelSelect.uiRevamp.test.tsx` 9+ case
- [x] **Mirror**: P2-3 已有的 `getByTestId` 风格
- [x] **Test**: 同上
- [x] **Validate**: `npx vitest run tests/component/levelSelect.uiRevamp.test.tsx && npx vitest run tests/component`

### Task 11: 新增 `MainMenuScene` 模块
- [x] **Action**: `src/ui/MainMenuScene.ts` 封装 renderer/camera/scene/rAF；`prefers-reduced-motion` 时只渲染一帧；`dispose()` 释放所有资源
- [x] **Mirror**: `engine/Renderer`、`engine/Camera`、`engine/Scene` 的工厂 + dispose 模式
- [x] **Test**: 由 Task 13 覆盖（jsdom 无 WebGL，触发 fallback 路径）
- [x] **Validate**: `npm run typecheck`

### Task 12: `MainMenu` 挂载 `MainMenuScene` + 半透明 panel
- [x] **Action**: `src/ui/MainMenu.tsx` useEffect 挂载 scene；WebGL throw 时回退到 CSS 渐变；panel `rgba(0,0,0,0.35)` + `backdrop-filter: blur(8px)`；按钮传 `hoverLift`
- [x] **Mirror**: 已有 `MainMenuProps` 接口；CSS 变量 `--panel` 沿用
- [x] **Test**: 由 Task 13 覆盖
- [x] **Validate**: `npm run typecheck`

### Task 13: `MainMenu` 测试
- [x] **Action**: `tests/component/mainMenu.revamp.test.tsx` 5 case
- [x] **Mirror**: P2-4b 已有的 mount/dispose 测试模式
- [x] **Test**: 同上
- [x] **Validate**: `npx vitest run tests/component/mainMenu.revamp.test.tsx && npx vitest run tests/component/menus.test.tsx`

### Task 14: E2E — UI 改版
- [x] **Action**: `tests/e2e/ui-revamp.spec.ts` 5 case
- [x] **Mirror**: P2-3 已有的 `getByTestId` + `getByRole` 模式
- [x] **Test**: 同上
- [x] **Validate**: `npx playwright test tests/e2e/ui-revamp.spec.ts`

### Task 15: E2E — 存活模式 + kruskal 岔路回归
- [x] **Action**: `tests/e2e/survive-branching.spec.ts` 2 case
- [x] **Mirror**: P2-4a 已有的 `page.clock` + `selectOption` 模式
- [x] **Test**: 同上 + 跑全套 E2E
- [x] **Validate**: `npx playwright test && npx playwright test tests/e2e/survive-branching.spec.ts`

### Task 16: 增量文档 + 路线图
- [x] **Action**: 复制 spec 到 `docs/increments/p2-5-ui-and-rebalance/spec.md`；写本 plan；写 `review.md`（实际改动 + 偏差）；更新 `roadmap.md` 加 P2-5 行 + 活跃锚点
- [x] **Mirror**: 已有 P2-4a / P2-4b 的 spec/plan/review 三件套结构
- [x] **Test**: —
- [x] **Validate**: `git grep` 不应再找到 `P2-N/A: 等待用户决策` 活跃锚点

## 验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| jsdom 没有 WebGL，`MainMenuScene.init()` 在测试里抛错 | 中 | 初始化包在 try/catch + fallback 路径，组件测试覆盖 fallback 行为；E2E 在真浏览器跑 |
| radio→select 重构破坏现有 E2E testid 假设 | 中 | 保持 `data-testid` 挂在 option 上；`getByTestId` 跨标签仍工作 |
| 用户改主意：主菜单 3D 太重，想要 brutalist card | 低 | 设计通过 `MainMenu` 组件可逆 |
| `--select-chevron` SVG data URL 在某些浏览器渲染失败 | 低 | 用 `background-image` + size 限定；失败时回退到无箭头但仍可用 |
| 阶段 2 之后 HUD enemy-counter 测试 (`hud.test.tsx:51`) 失败 | 中 | 已修：测试 opt-in `currentMode: 'survive'`（与 FR-22 契约一致） |

## 验收

- [x] 所有 Task 勾选完成 (16 个)
- [x] `npm run typecheck && npm run test && npm run build && npm run test:e2e` 全部通过
- [x] spec §11 完成清单全部勾选（Q-A 到 Q-F 默认值）
- [x] `docs/increments/p2-5-ui-and-rebalance/review.md` 填好实际改动
- [x] 路线图 P2-5 行从 `pending` 改为 `done`

---

## 执行日志（实施时填写）

### 实施日期
2026-06-11

### 实际改动文件
完整 diff 见 `git log --oneline --grep="P2-5"`。共 16 个 commit 横跨 24 个 commit ahead of origin/main（其余是 P2-5 之后的次要调整）。

### 遇到的偏差
- `tests/unit/engine/game.rebalance.test.ts` 留下了 plan 骨架的 `fakeCanvas` 常量和 `makeMaze` 辅助函数未使用 → 已删除（commit `f369024` 附带）。
- `tests/component/hud.test.tsx:51` 旧测试只 set `currentEnemyCount: 4`，未 opt-in `currentMode: 'survive'`，P2-5 FR-22 后失败 → 已加 `currentMode: 'survive'`（commit `f369024`）。
- `public/levels/level-tiny-enemy.json` 的 enemy patrol path 第二个节点 (1,0) 不是连通 cell，巡逻会卡墙 → 改为 (2,1)（commit `f369024`）。

### 测试覆盖
- 单元测试：616 / 616 passed（`tests/unit` + `tests/component`，共 52 个文件）
- E2E：5 个 P2-5 专属 spec + 5 个被兼容更新的现有 spec（survive / time-trial / procedural / pause-resume / persistence）

### 备注
- `algorithmForMode` 走 switch + 穷尽性 `never` 检查，未来加 VictoryType 时编译器会强制更新。
- `MainMenuScene` 在 jsdom 里走 WebGL fallback（CSS 渐变），不影响真实浏览器用户体验。
- 敌人硬门只针对**程序注入**（`injectEnemySpawns`），手工 `MazeData.enemies`（关卡编辑器用户摆的）在任何模式都生成（FR-21）。
- 旧 P2-3 seed id（用 `'recursive-backtracker'` 编码的）仍能解出原算法，映射变更只影响**新**的随机关卡。
