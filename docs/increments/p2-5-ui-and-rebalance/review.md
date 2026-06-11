# UI 改版 + 存活模式重平衡 — Review

**Status**: done
**日期**: 2026-06-11
**Spec**: `docs/increments/p2-5-ui-and-rebalance/spec.md`
**Plan**: `docs/increments/p2-5-ui-and-rebalance/plan.md`

---

## 摘要

P2-5 增量已 ship。把"主菜单 3D 化 / LevelSelect 两列 + 原生 select + 进阶折叠 / 敌人按模式硬门 + 算法按模式锁死"三项用户可见改动合成一个 Large 增量完成,共 16 个 commit。

## 实际改动文件

### 新增 (10 个)
- `src/ui/MainMenuScene.ts` — Three.js 场景封装
- `tests/unit/maze/algorithmForMode.test.ts` — 4 case
- `tests/unit/gameStore.rebalance.test.ts` — 5 case
- `tests/unit/engine/game.rebalance.test.ts` — spy 回归哨
- `tests/component/enemyCounter.rebalance.test.tsx` — 4 case
- `tests/component/levelSelect.uiRevamp.test.tsx` — 9+ case
- `tests/component/mainMenu.revamp.test.tsx` — 5 case
- `tests/e2e/ui-revamp.spec.ts` — 5 case
- `tests/e2e/survive-branching.spec.ts` — 2 case
- `docs/increments/p2-5-ui-and-rebalance/{spec,plan,review}.md` — 增量三件套

### 修改 (12 个)
- `src/maze/AlgorithmMazeProvider.ts` — +`algorithmForMode(mode)` 导出
- `src/ui/LevelSelect.tsx` — 两列 grid + 原生 select + 进阶折叠 + `algorithmForMode` 接入
- `src/store/gameStore.ts` — `startLevel` 硬门 enemyCount
- `src/engine/Game.ts` — `startLevel` 硬门 `injectEnemySpawns`
- `src/ui/components/EnemyCounter.tsx` — 非 survive 返回 `null`
- `src/styles/theme.css` — `--select-chevron` + select 样式 + main-menu hover
- `src/ui/components/Button.tsx` — +`hoverLift?: boolean`
- `src/ui/MainMenu.tsx` — 挂载 scene + 半透明 panel + hover-lift
- `docs/increments/_template/roadmap.md` — +P2-5 行 + 活跃锚点 + 详细任务表
- `public/levels/level-tiny-enemy.json` — patrol path 节点修正
- `tests/component/hud.test.tsx` — opt-in `currentMode: 'survive'`
- `tests/e2e/{survive,time-trial,procedural,pause-resume,persistence}.spec.ts` — radio→select 兼容

## 遇到的偏差

1. **HUD test FR-22 兼容**:`tests/component/hud.test.tsx:51` 旧测试只 set `currentEnemyCount: 4`,未 opt-in `currentMode: 'survive'`,P2-5 FR-22 后失败。修法是在 `setState` 加 `currentMode: 'survive'`,与 FR-22 契约一致。属于 P2-5 必须做的兼容,不是临时绕过。

2. **MainMenuScene 工厂测试**:Task 4 计划中给的 `game.rebalance.test.ts` 包含 `fakeCanvas` + `makeMaze` 死代码(jsdom 无 WebGL,完整 end-to-end 走不通)。已删除死代码,只留 spy + construct 探针作为回归哨。

3. **level-tiny-enemy patrol path 修正**:JSON 里敌人巡逻路径第二个节点 `(1,0)` 实际上不是连通 cell,巡逻动画会卡墙。改 `(2,1)` 后 patrol 路径合法。归到 P2-5 commit 而不是单独 fix,是因为 P2-5 的 E2E 在重构 UI 时第一次系统性跑全关卡,顺带暴露了这个潜伏 bug。

4. **enemy-counter 测试 testid 位置**:P2-5 FR-22 把 `EnemyCounter` 改成 `null` 在非 survive 模式。`<HUD />` 测试 group 内 `currentMode` 默认值来自 `beforeEach` 的 `startLevel(maze)`,这里走 `maze.rules.victory = 'reach-exit'`,所以旧测试天然 fail。修法已在 #1 描述。

## 测试覆盖

- **单元测试**:616 / 616 passed(`tests/unit` + `tests/component`,共 52 个文件)
- **E2E**:5 个 P2-5 专属 spec(ui-revamp + survive-branching)+ 5 个被兼容更新的现有 spec(survive / time-trial / procedural / pause-resume / persistence)
- **关键回归**:
  - 算法映射:`algorithmForMode` 穷尽性 switch + 4 case 单测
  - 敌人硬门:`gameStore.rebalance.test.ts` 5 case + `game.rebalance.test.ts` spy
  - UI 显隐:`EnemyCounter` 4 case + `levelSelect.uiRevamp` 9+ case + E2E 5 case
  - 进阶折叠:E2E 显隐切换
  - WebGL fallback:`mainMenu.revamp.test.tsx` 5 case(jsdom 走 fallback 路径)

## FR 验收

| FR | 覆盖 | 验证方式 |
|---|---|---|
| FR-1 (3D scene) | Task 11/12 | `MainMenuScene` 单元 + E2E canvas visible |
| FR-2 (reduced-motion) | Task 11 | `MainMenuScene.init` 内 `matchMedia` 检查 + 单测(jsdom 默认 false) |
| FR-3 (dispose) | Task 11/13 | `dispose()` 释放 rAF + renderer + scene;unmount 路径单测 |
| FR-4 (panel) | Task 12 | `backdrop-filter: blur(8px)` + `rgba(0,0,0,0.35)` |
| FR-5 (hover-lift) | Task 7/8/12 | `Button.hoverLift` + `.main-menu-button` CSS + E2E click |
| FR-6 (--panel / --select-chevron) | Task 7 | `theme.css` 注入 + light/dark 双值 |
| FR-7 (2-col grid) | Task 9/10 | `gridTemplateColumns` + 720px 媒体查询 + E2E |
| FR-8 (mode select) | Task 9/10 | `<select>` 替换 radio + E2E |
| FR-9 (size select) | Task 9/10 | 同上 |
| FR-10 (enemy count 显隐) | Task 9/10 | `mode === 'survive'` 条件 + E2E |
| FR-11 (survive-seconds 显隐) | Task 9 | 同上 |
| FR-12 (progressive 显隐) | Task 9 | 同上 |
| FR-13 (进阶 fold) | Task 9/10/14 | `advancedOpen` state + E2E 显隐切换 |
| FR-14 (分组顺序) | Task 9 | 固定 / 随机 / 指定种子 / 我的关卡 顺序保留 |
| FR-15 (testid 稳定) | Task 9/10 | `data-testid` 挂在 `<option>` 上,`getByTestId` 跨标签仍工作 |
| FR-16 (下拉值生效) | Task 9/10 | `startRandom(selectedSize)` + `algorithmForMode(mode)` 编码 |
| FR-17 (algorithmForMode) | Task 1/2 | 穷尽性 switch + LevelSelect 接入 + E2E 编码断言 |
| FR-18 (enemyCount 硬关) | Task 3/4 | `gameStore.rebalance.test.ts` 3 clamp case + E2E counter |
| FR-19 (injectEnemySpawns 0 透传) | Task 4 | spy + `game.rebalance.test.ts` 探针 |
| FR-20 (spawn schedule 静默) | Task 3 | `currentEnemyCount never exceeds hand-crafted count` case |
| FR-21 (手工敌人保留) | Task 3/4 | `hand-crafted maze.enemies even in reach-exit mode` case |
| FR-22 (EnemyCounter 隐藏) | Task 5 | `enemyCounter.rebalance.test.tsx` 4 case + E2E |

## 风险复盘

| 风险 | 实际 | 缓解效果 |
|---|---|---|
| jsdom 无 WebGL | 已发生;fallback 工作 | 测试覆盖 fallback 路径,E2E 在真浏览器跑 |
| radio→select 破坏 E2E | 已发生;5 个 spec 需更新 | 全在 P2-5 commit 内同步更新 |
| 用户改主意(3D 太重) | 未发生 | 设计可逆,`MainMenu` 组件解耦 |
| SVG data URL 渲染失败 | 未发生 | 兜底无箭头但可用 |
| 阶段 2 后 HUD test 失败 | 已发生 | 修法 1 行,FR-22 契约一致 |

## 备注

- `algorithmForMode` 是 P2-5 引入的"模式 → 算法"映射函数,作为 P2-3 阶段 Q11 (算法对玩家隐藏)的实现层。改 P2-3 的 `startRandom` 流程为统一入口后,任何模式变更都只动这一处。
- `MainMenuScene` 在 jsdom 里走 WebGL fallback(CSS 渐变);E2E 在真浏览器跑挂载 Three.js 场景。两种路径都覆盖,无遗漏。
- 敌人硬门只针对**程序注入**(`injectEnemySpawns` 函数,spawner 随机生成的位置),手工 `MazeData.enemies`(关卡编辑器用户在 `level-tiny-enemy.json` 之类手工摆的)在任何模式都生成(FR-21 契约),符合"关卡设计 ≠ 模式默认"的直觉。
- 旧 P2-3 seed id(用 `'recursive-backtracker'` 编码的)仍能解出原算法(因为 seed 编码自带算法字段),映射变更只影响**新**生成的随机关卡,回归玩家的 best record 不受破坏。
- 路线图 `_template/roadmap.md` 顶部"活跃锚点"块从 `P2-N/A: 等待用户决策` 改为 `P2-5 done`,下一个增量待规划。
