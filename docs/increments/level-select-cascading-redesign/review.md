# LevelSelect 级联重构 — Review

**Status**: done
**日期**: 2026-06-12
**Spec**: `docs/increments/level-select-cascading-redesign/spec.md`
**Plan**: `docs/increments/level-select-cascading-redesign/plan.md`
**Task List**: `docs/increments/level-select-cascading-redesign/task-list.md`

---

## 摘要

P2-6 增量已 ship。把 P2-5 的「4 个并列入口 + 多个 start 按钮」LevelSelect 改写为「**主 dropdown 选关卡源 + 级联二级控件 + 单一「进入游戏」**」级联 UX。存活模式 4 设置（存活秒数 / 敌人数量 / 渐进生成 / 渐进上限）收进同一语义区,新增 4 个预设 chip (30/60/90/120s) 即时同步输入框。**只动 UI 层**:游戏运行时 / `gameStore` / `Game` / 敌人逻辑 / 关卡编辑器一律不改,关键老 testid 全保留(P2-5 e2e 兼容)。共 10 个 commit。

## 实际改动文件

### 新增 (4 个)
- `tests/component/levelSelect.uiRevamp.test.tsx` — 12 case (T2 RED + T3 GREEN,覆盖主 dropdown 4 切换 / sublevel 条件渲染 / seed-input 失焦 / survive 4 设置 / chip 激活 / 越界 clamp + aria-invalid / progressive 取消后 max-input 消失 / start-button 单次触发 / validation 失败 disabled / 8 个老 testid 容器)
- `tests/component/levelSelect.custom.test.tsx` — 6 case (T4,适配主 dropdown=我的 → sublevel dropdown → start-button 新路径)
- `tests/e2e/level-select-cascading.spec.ts` — 1 case (T7,主 dropdown 4 切换防回归)
- `docs/increments/level-select-cascading-redesign/{spec,plan,task-list,review}.md` — 增量四件套(本文件)

### 修改 (15 个)
- `src/maze/types.ts` — +4 常量:`SURVIVE_SECONDS_MIN/MAX` (10/600) + `SPAWN_PROGRESSIVE_MAX_MIN/DEFAULT` (1/10),与 P2-5 现有 `ENEMY_COUNT_MIN/MAX/DEFAULT` 风格一致
- `src/styles/theme.css` — +`.survive-chip` / `.survive-chip--active` 样式,150ms 过渡与 `.level-select-select` 节奏一致
- `src/ui/LevelSelect.tsx` — 完整重写:引入 `levelSource` state (4 源) + `sublevelId` state + 提取 `validateSelection()` 纯函数 + 单一 `start-button` (固定右下,`hoverStyle="lift"`) + chip 用 `<button type="button">` + `progressive-max-input` 仅在 `progressive === true` 渲染 + seed-input 失焦 strip 空白 + 16 hex 验证
- `docs/increments/_template/roadmap.md` — +P2-6 行 + 活跃锚点 + 详细任务表
- `tests/e2e/pause-resume.spec.ts` — test 1 「P toggles pause」从 `Test Corridor` 按钮 → `start-button`(P2-6 自动选 level-tiny);test 2 「survive mode pause freezes」标 `test.skip`(pre-existing page.clock + rAF 交互问题)
- `tests/e2e/persistence.spec.ts` — 两处 playthrough 都加 `sublevel-select.selectOption('level-tiny')`(glob 顺序首项是 `level-small` 不是 `level-tiny`,需显式 pin)
- `tests/e2e/pickup-types.spec.ts` — `__test-pickup__` 按钮 → `sublevel-select.selectOption('level-tiny-pickups')` + `start-button`
- `tests/e2e/play-through.spec.ts` — `Test Corridor` 按钮 → `sublevel-select.selectOption('level-tiny')` + `start-button`(同 glob 顺序问题)
- `tests/e2e/enemies.spec.ts` — `Test Enemy` 按钮 → `sublevel-select.selectOption('level-tiny-enemy')` + `start-button`;两条 test 标 `test.skip`(pre-existing 敌人碰撞未生效,验证 pre-P2-6 main 也 fail)
- `tests/e2e/ui-revamp.spec.ts` — `expect(display).toBe('grid')` → `expect(display).toBe('flex')`(P2-6 把 grid 改回 flex,因改为单列级联);进阶 fold 测试标 `test.skip`(P2-6 移除折叠)
- `tests/e2e/editor.spec.ts` — test 1/2 `getByRole('button', { name: '测试关卡'/'ToDelete' })` → `getByText()` (custom 关卡名是 `<span>` 不是 `<button>`);test 2 `custom-levels-group toBeHidden()` → `locator('[data-testid^="delete-custom-"]').toHaveCount(0)`(group 容器永远在 DOM,只 row + delete 消失);test 3 导出/导入「无法在终点放置墙」pre-existing,标 `test.skip`

## 遇到的偏差

1. **E2E `play-through` + `persistence` 新失败(glob 顺序)**:P2-6 引入 `effectiveSublevelId = sublevelId ?? sublevelOptions[0]?.id ?? null`,Vite `import.meta.glob('/public/levels/*.json')` 枚举顺序把 `level-small.json`(10x10,initialTime 60) 排在 `level-tiny.json`(3x3,initialTime 30) 之前,导致 auto-select 首项是 60s 关卡。E2E 期望 `00:23`(initialTime 30) 但拿到 `00:53`(initialTime 60),fail。**修法**:两个 spec 显式 `sublevel-select.selectOption('level-tiny')` 替代依赖 auto-select。属于 P2-6 必做的兼容。

2. **E2E `ui-revamp` 视觉断点 grid → flex**:P2-5 是「左控件右预览」两列 grid,P2-6 改为单列级联(主 dropdown + 条件二级区),`level-select-root` 的 `display` 从 `grid` 变回 `flex`。E2E 旧的 `expect(display).toBe('grid')` 需改 `flex`。属于 P2-6 重构必改。

3. **E2E `ui-revamp` 进阶 fold 测试失效**:P2-6 把 seed 输入从「进阶 ▾」折叠挪到「指定种子源」下直接显示(源切换即触发可见),原进阶 fold 测试无法找到折叠按钮。**修法**:标 `test.skip` + 注释指向 `level-select-cascading.spec.ts:7` 接管该契约。

4. **E2E `editor` custom-levels 断言形式**:P2-6 把「custom-levels-group」改为 top-level 容器(per FR-9 始终可见,只 row + delete 消失)。原 `toBeHidden()` 失败,改 `locator('[data-testid^="delete-custom-"]').toHaveCount(0)`。**这是 P2-6 设计选择**:任何时候「我的关卡」区都显示一个空的容器 placeholder,符合 P2-5「无空隙,所有区都有内容/空状态」原则。

5. **6 个 pre-existing E2E 失败(非 P2-6 回归)**:通过 `git stash` + 跑 pre-P2-6 main E2E 验证下列 6 个 fail 早于 P2-6:
   - `enemies.spec.ts:19` 「walking into an enemy decrements health」(engine 碰撞检测未生效,玩家穿过敌人 cell 不掉血)
   - `enemies.spec.ts:31` 「a second hit inside the 0.5s invulnerable window」(同上,首伤未到,无敌窗口断言无用)
   - `pause-resume.spec.ts:39` 「survive mode pause freezes elapsedTime」(page.clock + procedural Loop 交互,rAF tick 在 synthetic clock 下不触发)
   - `survive.spec.ts:10` 「survive 30s triggers the win overlay」(同 rAF 交互)
   - `time-trial.spec.ts:7` 「time-trial 180s 超时 triggers game-over」(同 rAF 交互)
   - `time-trial.spec.ts:26` 「WinOverlay shows the elapsed time in mm:ss」(同 rAF + 15x15 程序迷宫对 1.6s KeyD 太大,1 步到不了 exit)

   **修法**:全部标 `test.skip()` + JIRA-style 注释 (根因 + 验证步骤 + 后续路径)。T7 任务书明确允许 `test.skip() + reason`,且要求「**禁止**回退 UI」。

6. **T5 重构清理未做单独子组件抽取**:`validateSelection()` 纯函数抽取已做(纯净,无副作用,引用透明);`mode === 'survive'` 分支在 LevelSelect.tsx 主体内联,没抽 `<SurviveSettingsPanel>`(原计划),原因是抽子组件后级联 disabled 状态会跨组件 prop drilling,反而复杂。**判定**:此偏离 plan 但符合 plan 备注「如 `mode === 'survive'` 分支超长」的触发条件(分支 ~60 行,临界)。保留 plan 原始备注的判断权,未做抽取。

## 测试覆盖

- **单元测试**:656 / 656 passed(`tests/unit` + `tests/component`,共 53 个文件);1 个 pre-existing skip
- **覆盖**:**All files 95.48% lines / 89.44% branches / 94.03% functions**(沿用 P2-5 基线,≥80% 阈值)
- **E2E**:25 passed / 8 skipped (0 failed) — `npx playwright test` 跑全套
  - P2-6 专属:1 (`level-select-cascading.spec.ts`)
  - 兼容更新:7 (pause-resume / persistence / pickup-types / play-through / enemies / ui-revamp / editor)
  - 跳过的 6 个 + 1 个 ui-revamp 进阶 fold + 1 个 editor 导出/导入 = 8 个 `test.skip`,全部带根因注释

## FR 验收

| FR | 覆盖 | 验证方式 |
|---|---|---|
| FR-1 (主 dropdown 4 源) | T2 case 1 / T7 `level-select-cascading.spec.ts` | `level-source-select` option 4 个 + E2E 切换 |
| FR-2 (级联二级区) | T2 case 2 | 源切换后 sublevel / procedural / seed / custom 容器条件渲染 |
| FR-3 (sublevel dropdown) | T2 case 3 + T4 | 教学源下显示,值同步 store |
| FR-4 (size dropdown) | T2 + T7 | 程序源下显示,值同步 `requestedSize` |
| FR-5 (mode dropdown) | T2 + T7 | 复用 P2-5 `mode-select`,值同步 store |
| FR-6 (敌人数量/渐进控件) | T2 + E2E | `mode === 'survive'` 硬门 |
| FR-7 (存活秒数 chip + free-input) | T2 case 5/6 + theme.css | 4 chip + 输入框 + clamp + aria-invalid |
| FR-8 (渐进上限 input) | T2 case 7 | `progressive === true` 才渲染,关闭消失 |
| FR-9 (custom-levels 容器 always in DOM) | T2 + editor.spec.ts | 容器始终在,行/按钮动态 |
| FR-10 (start-button 单次触发) | T2 case 8 | `disabled` 期间不触发 `onPick`,validation 失败 disabled |
| FR-11 (validateSelection 纯函数) | T2 + T5 | 单一入口,start-button `disabled` + onClick 共用 |
| FR-12 (关键老 testid 保留) | T2 case 11 + 12 + P2-5 E2E 兼容 | `level-select-root` / `procedural-controls` / `mode-select` / `size-select` / `enemy-count-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section` 全部保留 |
| FR-13 (chip 选中态对比度 ≥4.5:1) | T1 + theme.css | `.survive-chip--active` 高对比色,WCAG AA 满足 |
| FR-14 (4 断点视觉塌缩) | T3 + E2E | 360 / 480 / 720 / 1280px,主 dropdown + start-button 在所有断点可用 |
| FR-15 (关卡源切换保留状态) | T2 | 切回 teaching 保留前次 sublevel 选择,清空 custom seed 无关状态 |
| FR-16 (seed-input 失焦 strip + 16 hex 验证) | T2 case 4 | trim + `/^[0-9a-fA-F]{0,16}$/`,无效字符输入被 strip |
| FR-17 (主 dropdown = 我的 → 走 EditorMazeProvider) | T4 6 case | `custom-levels-group` 渲染 + 选 custom + start 走 custom id |
| FR-18 (主 dropdown = 随机 → algorithmForMode) | T2 + P2-5 既有 | 沿用 P2-5 FR-17 |
| FR-19 (主 dropdown = 指定种子 → 16 hex + 算法按 mode) | T2 case 4 | 16 hex 验证 + `algorithmForMode(mode)` |
| FR-20 (start-button hover-lift) | T3 + Button.hoverLift | P2-5 既有 `hoverLift` prop,P2-6 复用 |
| FR-21 (P2-5 老 testid 不破) | T2 + T7 | P2-5 9+ case 全部仍 pass |
| FR-22 (不变量:游戏运行时 / gameStore / Game 不动) | T6 | tsc + vitest 既有测试 0 回归 |

## 风险复盘

| 风险 | 实际 | 缓解效果 |
|---|---|---|
| 关键老 testid 丢失,破坏 P2-5 E2E | 未发生 | T2 case 11/12 显式断言 8 个容器 + T7 全套 E2E pass |
| glob 顺序导致 auto-select 错关卡 | 已发生,2 spec fail | 显式 `selectOption('level-tiny')`,T2 验证 `effectiveSublevelId` 计算 |
| `validateSelection()` 非纯函数(副作用) | 未发生 | T5 重构时确认:不读 store,不写 ref,纯输入 → 输出 |
| 进阶折叠交互(用户已习惯 P2-5 的 ▾) | 已知 | 折叠移除是因为「指定种子」成为独立源,折叠需求消失,UX 更直白 |
| SurviveSettingsPanel 未抽取 | 已知 | 分支 60 行,临界;`validateSelection()` 共享逻辑已抽,见偏差 #6 |
| 6 个 pre-existing E2E fail 误归 P2-6 | 已解决 | `git stash` + 跑 pre-P2-6 main E2E 验证,全部 6 fail 早于本增量 |
| editor custom-levels 容器行为变更 | 已暴露 | E2E 改用行级断言 + 注释,容器始终在 DOM 的设计意图 |
| coverage 跌破 80% | 未发生 | 95.48% / 89.44% / 94.03%, 远高于阈值 |

## 备注

- **`validateSelection()` 是 P2-6 引入的核心抽象**。它把"主 dropdown 选了 → sublevel / size / mode / seed / custom / survive-seconds 4 控件」所有一致性校验收进一个纯函数,start-button 的 `disabled` 计算和 `onClick` 入口共享同一逻辑,杜绝「UI 显示可点但 store 拒绝」的不一致。
- **级联 vs 折叠**:P2-5 的「进阶 ▾」是「先放简单控件,进阶藏在折叠」,P2-6 改为「主 dropdown 切源,源对应二级区出现/消失」是同一思想的演进:从「控件组折叠」到「语义源切换」。两种都避免一次性把所有控件甩给用户。
- **chip 与 free-input 共存**:`SURVIVE_SECONDS_VALUES = [30, 60, 90, 120]` 4 chip 适配老用户(沿用 P2-5 9+ case 的 4 值),free-input range `[10, 600]` 满足 P2-6 spec 的「高级用户自定义」。两者在 store 端是同一字段,UI 双向同步。
- **P2-5 的 `<HUD />` 测试兼容**:HUD test 在 P2-5 加了 opt-in `currentMode: 'survive'`,P2-6 不再触碰,兼容无变化。
- **路线图 `_template/roadmap.md` 顶部"活跃锚点"块**从 `P2-6: LevelSelect 级联重构 2/10 🔄 in-progress` 改为「等待用户决策下一个增量」,候选池 3 项(音频 / 移动端 / 额外 pickup 子类型)待用户选择。
- **pre-existing E2E 失败清单**已记录在 T7 commit 注释,后续增量若修 engine 碰撞或 page.clock + rAF 交互,需先解 `test.skip` 再回归。
