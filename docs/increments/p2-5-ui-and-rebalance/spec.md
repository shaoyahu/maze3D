# P2-5: 界面改版 + 存活模式重平衡 — 设计文档 (Spec)

**Slug**: `p2-5-ui-and-rebalance`
**Status**: done
**Date**: 2026-06-11
**对应路线图项**: P2-5
**依赖**: —
**复杂度**: Large
**相关文件**: `src/ui/MainMenu.tsx`, `src/ui/LevelSelect.tsx`, `src/ui/components/Button.tsx`, `src/ui/components/EnemyCounter.tsx`, `src/store/gameStore.ts`, `src/engine/Game.ts`, `src/maze/AlgorithmMazeProvider.ts`, `src/maze/types.ts`, `src/maze/enemySpawner.ts`, `src/styles/theme.css`, `docs/increments/_template/roadmap.md`

> 本文档已 ship 并归档。原始 source-of-truth 在 `docs/superpowers/specs/2026-06-11-p2-5-ui-and-rebalance-design.md`;本文件为增量目录的镜像副本,保持 spec/plan/review 三件套在 `docs/increments/p2-5-ui-and-rebalance/` 下。

---

## 1. 概述

把三项用户可见改动合成一个增量,因为它们共享文件、单独发版对玩家没有增量价值:

1. **主菜单视觉改版** — 把纯色平铺背景替换成有设计感的 3D 主体(一个慢速旋转的迷你迷宫),把标题和按钮放到半透明面板上。
2. **开始前界面 (LevelSelect) 体验改版** — 改成两列布局,把 4 个程序生成相关控件从 radio/滑块/复选框全部换成原生下拉,把 seed 输入藏到 "进阶 ▾" 折叠后面,让敌人相关控件按游戏模式显隐。
3. **游戏平衡重平衡** — 把程序生成算法按 `VictoryType` 锁死(reach-exit → recursive-backtracker, time-trial → prim, survive → kruskal),把敌人的硬性生成门关到只有 survive 模式才有。这修复了实测中发现的 "单路径迷宫 + 敌人 = 玩家被追到死" 的问题。

这 3 个区域共享 `LevelSelect.tsx`、`theme.css` 和选项/状态模型。拆成 3 个子增量意味着连续 3 个 PR 改同一组文件,对玩家没增量价值。

## 2. 目标 / 非目标

### 目标

- G1. 让主菜单看起来像成品游戏,不像占位符。
- G2. 让开始前界面一目了然:玩家 2–3 秒内能选好关卡,而不是解析 8 个堆叠的控件。
- G3. 让 seed 输入成为高级用户的功能,不是默认就能看见的。
- G4. 让敌人系统感觉公平:敌人只出现在能产生岔路的模式里。
- G5. 保留 P2-3 Q11 的 "算法对玩家隐藏" 不变量 —— 玩家选模式,算法是实现细节。
- G6. 在合理范围内保留所有现有 E2E 和单元测试。那些断言 "敌人数量滑块在所有模式都可见" 的测试要更新;断言 "手工关卡里的敌人会生成" 的测试要继续通过。

### 非目标

- N1. **不新增迷宫生成算法。** 复用现有 4 种。用户对 "岔路" 的需求 kruskal 已经满足。
- N2. **不新增敌人 AI 行为。** patrol / dwell / chase + FOV 已经够。难度由 `enemyAggression` (P2-4a) 控,不是新行为。
- N3. **不做音频。** 音频候选继续留在候选池。
- N4. **不做移动端 / 触屏重做。** 两列布局在窄屏自动塌成 1 列,但不做其它移动端工作。
- N5. **不新增 pickup 类型。** 额外 pickup 子类型候选继续留在池里。
- N6. **不新增游戏模式。** reach-exit / time-trial / survive 仍是全集。
- N7. **实现时不做网页设计参考搜索。** 用户要求搜索;但本环境的 `WebSearch` 和 `WebFetch` 在脑暴阶段都不可用。3D 主体 + 两列是常见的独立游戏模式,§7 里只描述要点不附外链。如果用户要具体参考链接,可以重试搜索。

## 3. 用户故事

- 作为回归玩家,我希望主菜单看起来精致,让我觉得游戏做完了,不是被弃坑了。
- 作为新玩家,我希望开始前界面能一屏装下、常用选项都能直接看到,这样我几秒内就能开始玩。
- 作为休闲玩家,我不想被 "Seed (16 hex)" 砸脸 —— 我完全不知道 seed 是什么。
- 作为知道 seed 是什么的回归玩家,我想要一个明显标着 "进阶" 的按钮,点开才让我输 seed。
- 作为玩 reach-exit / time-trial 模式的玩家,我不想看到 "敌人数量: 3" 这种滑块,看着像是我应该设置一下。
- 作为存活模式玩家,我希望有岔路和分叉,这样我能绕路逃敌人 —— 不是一条直线走廊被追到死。
- 作为关卡编辑器用户 (P2-4b),我手工摆过敌人的手工关卡,放到 reach-exit 模式里应该还能用(关卡本身是设计的一部分)。

## 4. 功能需求

### 主菜单 (FR-1 ~ FR-6)

- FR-1. `MainMenu` 组件必须把一个 Three.js 场景作为背景渲染,铺满整个视口。场景是一个低多边形迷宫(灰色墙、无 pickup/敌人)、15×15 尺寸,3/4 角度俯视,相机绕中心缓慢自转。
- FR-2. 当 `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 为 true 时,相机自转必须暂停(或跳过),改为渲染一帧静态画面。
- FR-3. Three.js renderer 必须在 mount 时创建,并在 `useEffect` 的 cleanup 里 dispose,这样离开菜单时 rAF 循环不会残留。
- FR-4. 标题 "3D Maze" 必须位于半透明面板上(`backdrop-filter: blur(8px)`,`background: rgba(0,0,0,0.35)`),叠加在 3D 场景之上。
- FR-5. 按钮必须有 hover 态:垂直上浮 2px + 背景变亮。
- FR-6. 主题里必须新增一个 `--panel` CSS 变量(浅色 + 深色都有),用作面板背景色。

### 开始前界面 (FR-7 ~ FR-16)

- FR-7. `LevelSelect` 组件必须用 2 列 CSS grid 布局:左列 = 选项面板,右列 = 关卡列表。视口宽度小于 720px 时,两列堆叠成单列。
- FR-8. 游戏模式下拉必须用原生 `<select>`(已美化),选项为 "到达出口" / "限时挑战" / "存活模式"。当前选中的模式是初始值。
- FR-9. 尺寸下拉必须用原生 `<select>`,选项为 15 / 30 / 50。当前选中的尺寸是初始值。
- FR-10. 敌人数量下拉必须用原生 `<select>`,选项为 0..10。**只在当前模式为 `survive` 时才渲染。** 其它模式要么显示一行 "无敌人" 文案,要么直接隐藏整行。
- FR-11. 存活秒数下拉必须用原生 `<select>`,选项为 30 / 60 / 90 / 120。**只在当前模式为 `survive` 时才渲染。**
- FR-12. 渐进生成勾选框必须只在当前模式为 `survive` 时才渲染。
- FR-13. seed 输入默认隐藏。一个 "进阶 ▾" 按钮切换展开面板,面板里包含 seed 文本输入框 + 一个 "使用上次 seed" 按钮(从 localStorage 读 `maze3d.lastSeed`;输入框本身继续保留 P2-4a FR-20 的 localStorage 持久化,成功开一局时写回)。
- FR-14. 右列关卡必须按以下顺序分组:固定关卡 / 随机关卡(一个 "随机关卡" 按钮,使用当前尺寸) / 指定种子关卡("指定种子关卡" 分组始终显示;组内的 seed 文本框默认隐藏,由 FR-13 的 "进阶 ▾" 控制显隐) / 我的关卡。指定种子分组的 "开始" 按钮是该组唯一的按钮。
- FR-15. radio→select 重构后,mode / size / survive-seconds / enemy-count 控件上的所有 `data-testid` 必须保持稳定(比如 `data-testid="mode-time-trial"` 必须继续工作,不管是 radio 还是 option)。
- FR-16. 程序生成开局处理器(`startRandom`、`startSpecified`)必须从下拉控件读取当前值,而不是从之前显示的 radio 状态。

### 游戏平衡 (FR-17 ~ FR-22)

- FR-17. 程序生成算法按 `VictoryType` 锁死:
    - `reach-exit` → `recursive-backtracker`
    - `time-trial` → `prim`
    - `survive` → `kruskal`

    取代 `LevelSelect.tsx` 里现有的 `PROCEDURAL_ALGORITHM = 'recursive-backtracker'` 常量。映射关系放在 `src/maze/AlgorithmMazeProvider.ts` 里新导出的 `algorithmForMode(mode: VictoryType): Algorithm` 辅助函数中(也可以放到一个小常量文件)。所有程序生成开局处理器都走这个辅助函数。

- FR-18. `engine/Game.ts` 的 `startLevel(maze, options)` 必须在 `options.mode !== 'survive'` 时把 `enemyCount` 强制为 0。store 侧的 `gameStore.startLevel` 同样要这样处理,这样 HUD 在非 survive 模式下显示 0。
- FR-19. `injectEnemySpawns(maze, 0)` 必须是空操作透传(也就是这个函数本来就处理 0;这里只是把契约显式化)。非 survive 模式下,不会注入任何由 spawner 生成的敌人。
- FR-20. 渐进生成调度器在 `mode !== 'survive'` 时必须是空操作。`lastSpawnAt` / `lastPickupCountForSpawn` 这些簿记继续跑(没成本),但不会有实际生成。最简实现:把 `applySpawnTrigger` 调用包在 `mode === 'survive'` 条件里,schedule 配置忽略。
- FR-21. 手工 JSON 关卡(比如 `level-small.json`)可以填充 `MazeData.enemies`。这些敌人必须在任何模式下都生成,因为它们是关卡设计的一部分。硬门只针对 **程序注入**,不剥除手工摆放的敌人。
- FR-22. `EnemyCounter` HUD 组件在非 survive 模式下必须隐藏自己(返回 `null`)。原因:FR-18 硬门之后非 survive 模式 count 总是 0,所以可见条件等价于 "mode === 'survive'"。当 `mode === 'survive'` 且用户把滑块拖到 0 时,组件保持可见,显示 "0"。

## 5. 数据 / 类型变化

### 新增 / 修改的类型

- `src/maze/AlgorithmMazeProvider.ts`:
    - **新增** 导出函数 `algorithmForMode(mode: VictoryType): Algorithm` (FR-17)。
- `src/maze/types.ts`:
    - **不新增类型。** `Algorithm` 和 `VictoryType` 联合类型保持不变。3 路 mode→algorithm 映射是函数,不是新类型。

### 新增 / 修改的 store 字段

- `gameStore`:
    - **不新增字段。** `currentMode` 已经存在;`startLevel` 里初始化敌人数量的逻辑更新为按 FR-18 硬门。
- `levelStore`:
    - **不变。** 最佳记录不受影响。
- `settingsStore`:
    - **不变。** 现有的 `enemyAggression` 设置保持。

### 常量

- **删除**: `LevelSelect.tsx` 中的 `const PROCEDURAL_ALGORITHM: Algorithm = 'recursive-backtracker'`。改为 `algorithmForMode(mode)`。
- **删除**: `const SPECIFIED_DEFAULT_SIZE: MazeSize = 30` 改为参数;指定种子流程使用当前尺寸下拉的值(默认 30,保持原行为)。

## 6. 引擎 / 架构影响

### 受影响的文件

| 文件 | 变更 | 说明 |
|---|---|---|
| `src/ui/MainMenu.tsx` | 修改 | 挂载 Three.js 场景 + 半透明面板 + 新按钮样式 |
| `src/ui/MainMenuScene.ts` | **新增** | 主菜单背景用的低多边形迷宫渲染器 |
| `src/ui/LevelSelect.tsx` | 修改 | 两列布局、下拉、折叠 seed、按模式显隐控件 |
| `src/ui/components/Button.tsx` | 修改 | 新增 hover-lift 变体;确保可选且向后兼容 |
| `src/ui/components/EnemyCounter.tsx` | 修改 | 读 `currentMode`;在非 survive 模式隐藏 |
| `src/store/gameStore.ts` | 修改 | `startLevel` 在非 survive 把 enemyCount 硬关为 0 |
| `src/engine/Game.ts` | 修改 | `startLevel` 把 `injectEnemySpawns` 调用硬关为只在 survive |
| `src/maze/AlgorithmMazeProvider.ts` | 修改 | 新增 `algorithmForMode` 辅助函数;改写 `startRandom` 调用方 |
| `theme.css` | 修改 | 新增 `--panel` 变量;主菜单面板 + select 箭头样式 |
| `docs/increments/_template/roadmap.md` | 修改 | 把 "P2-N/A: 等待用户决策" 替换为 P2-5;新增一行 |
| `docs/increments/p2-5-ui-and-rebalance/spec.md` | **新增** | 增量 spec (writing-plans 的产出) |
| `docs/increments/p2-5-ui-and-rebalance/plan.md` | **新增** | 增量 plan (writing-plans 的产出) |
| `docs/increments/p2-5-ui-and-rebalance/review.md` | **新增** | 增量 review (writing-plans 的产出) |

### 新模块

- `src/ui/MainMenuScene.ts` —— 封装主菜单 Three.js 场景。负责 renderer、scene、camera 以及单帧/循环渲染。向外暴露 `dispose()` 给调用的 `useEffect` 在 unmount 时调用。不 import `react` 或 `store/`。按 DoD §14.2 ("engine/store boundary") 的要求,这个文件放在 `ui/` 因为菜单属于 UI —— 但 Three.js 代码本身的形态和 `engine/Scene.ts` 一样,所以同样要遵守 dispose 规范。

### 边界检查 (DoD §14.2)

- `src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/` 不允许 import `react` 或 `store/`。
- 新增的 `MainMenuScene.ts` 必须实现完整的 `dispose()`,释放 renderer、scene 和所有 geometry/material。
- `AlgorithmMazeProvider` 仍是一个完整的 `MazeProvider` 实现(`algorithmForMode` 辅助函数是纯增量)。
- `injectEnemySpawns` 是纯函数,无 React 或 store 依赖;对 0 敌人数量的契约不变。

## 7. UI / UX

### 界面 / 组件变化

- `MainMenu`: 新的 3D 背景、半透明标题面板、按钮 hover 上浮。
- `LevelSelect`: 两列 grid、原生 `<select>` 控件、"进阶" 折叠、按模式显隐的敌人控件。
- `EnemyCounter`: 在非 survive 模式隐藏。
- `Button`(共享): 可选的 hover-lift 变体。

### 视觉风格

- `--panel`(新增): 主菜单标题用的半透明深色叠层。浅色 + 深色主题各一个值。
- `--select-chevron`(新增): 内联 SVG data URL,作为下拉箭头(用 `appearance: none` 隐藏原生外观后,仍保留视觉提示)。
- 新主菜单按钮样式:hover 时垂直上浮 2px(`transform: translateY(-2px)`)、背景变亮、150ms ease-out 过渡。
- 3D 迷宫用和游戏内墙体一样的颜色(`var(--wall)`),让菜单和游戏画面观感一致。

### 交互流程

**主菜单**:
1. App 启动时挂载 `MainMenu`。
2. `MainMenu` 挂载 `MainMenuScene`(Three.js 背景)。
3. 用户点 "开始" → `onStart` → App 路由到 `LevelSelect`。
4. `LevelSelect` 挂载;`MainMenu` 卸载,`MainMenuScene.dispose()` 执行。

**开始前 (LevelSelect)**:
1. 用户看到左列有 mode/size/选项 下拉(mode 默认 "限时挑战";size 默认 30)。
2. 用户从下拉选择 mode。如果 mode 改成 "存活模式",敌人 / 存活秒数 / 渐进生成行出现。
3. 用户点右列的 "随机关卡" → `startRandom(size)` → 迷宫 id 编码 `algorithmForMode(mode)` + size + 十六进制 seed。
4. 或者,用户点 "进阶 ▾" → seed 输入出现 → 用户输入或粘贴 16 位十六进制 seed → 用户点右列 "指定种子关卡" 分组里的 "开始"。
5. 用户点 "返回" → `MainMenu` 重新挂载 → `MainMenuScene` 重新创建。

**存活模式游戏过程**(作为上下文,不是新内容):
1. 存活模式玩家进入 kruskal 迷宫(多岔路)。
2. 初始 3 个敌人在人工挑选的格子生成。
3. 每 15 秒 或 每次捡 pickup,+1 敌人,直到 10 个上限。
4. 玩家必须用岔路绕路的方式撑过 90 秒(默认),从追击中逃脱。

## 8. 错误处理

### 新错误场景

- **没有。** 新代码路径复用现有错误处理:
    - seed 输入非法 → 现有的 `setSeedError` 路径 (P2-4a FR-20)。
    - MazeProvider `load()` 失败 → `LevelSelect` 已有的 `error` prop(已处理)。
    - Three.js context loss → 吞掉 + 打日志;菜单不是关键路径。(FR-1 实现时应该把 renderer 初始化包在 try/catch 里,WebGL 不可用时回退到 CSS 渐变背景。)

### 回退行为

- 浏览器没有 WebGL → `MainMenuScene` 初始化失败 → `MainMenu` 回退到 CSS 渐变(`linear-gradient` 从 `--accent` 到 `--bg`),菜单其它部分正常工作。
- `prefers-reduced-motion: reduce` → 相机不自转;渲染 1 帧。
- `localStorage` 不可用(Safari 隐私模式)→ 静默跳过读 `maze3d.lastSeed`;seed 输入框从空开始。

## 9. 测试策略

### 单元测试 (Vitest)

- `src/maze/AlgorithmMazeProvider.test.ts`(或新增 `algorithmForMode.test.ts`):
    - `algorithmForMode('reach-exit')` 返回 `'recursive-backtracker'`。
    - `algorithmForMode('time-trial')` 返回 `'prim'`。
    - `algorithmForMode('survive')` 返回 `'kruskal'`。
    - 穷尽性:新增一个 `VictoryType` 让测试失败(用带 `_exhaustive: never` 模式的 switch)。
- `src/store/gameStore.test.ts`:
    - `startLevel` 用 `mode: 'reach-exit'` + `enemyCount: 3` → `currentEnemyCount === 0` (FR-18)。
    - `startLevel` 用 `mode: 'survive'` + `enemyCount: 3` → `currentEnemyCount === 3` (保留现有行为)。
    - `startLevel` 用 `mode: 'reach-exit'` + `spawnSchedule.enabled: true` → 渐进调度是空操作 (FR-20)。
- `src/engine/game.test.ts`(或 `Game.startLevel.test.ts`):
    - 当 `mode !== 'survive'` 时,不调用 `injectEnemySpawns`。
    - 手工 `MazeData.enemies` 在任何模式下都会生成 (FR-21)。
- `src/maze/enemySpawner.test.ts`:
    - `injectEnemySpawns(maze, 0)` 返回空数组(已有,如未显式则补上)。

### 组件测试 (React Testing Library)

- `tests/component/LevelSelect.test.tsx`:
    - **新增** 测试:mode = reach-exit 隐藏敌人 / 存活秒数 / 渐进生成控件。
    - **新增** 测试:mode = survive 显示所有 3 个控件。
    - **新增** 测试:点 "进阶 ▾" 展开 seed 输入;再点一次折叠。
    - **新增** 测试:radio→select 重构后,现有 data-testid 保持稳定。
    - **修改** 测试:`startRandom` 用 `algorithmForMode(mode)` 返回的算法调用。
- `tests/component/EnemyCounter.test.tsx`:
    - **新增** 测试:当 `currentEnemyCount === 0` 且 mode ≠ survive 时,渲染为空。
    - **新增** 测试:当 `currentEnemyCount === 0` 且 mode = survive 时,渲染 "0"。
- `tests/component/MainMenu.test.tsx`:
    - **新增** 测试:render 时挂载 `MainMenuScene`;unmount 时调用 `dispose()`。
    - **新增** 测试:点 "开始" 调用 `onStart`(已有)。

### E2E 测试 (Playwright)

- `tests/e2e/ui-revamp.spec.ts`(新增):
    - 加载 `/` → 断言菜单有 `<canvas>` 元素。
    - 点 "开始" → 路由到关卡选择界面 → 断言新的两列布局。
    - 在 LevelSelect,把 mode 下拉改成 "存活模式" → 断言敌人 / 存活秒数 / 渐进生成行出现。
    - 点 "进阶 ▾" → 断言 seed 输入出现。
- `tests/e2e/survive-branching.spec.ts`(新增):
    - 用已知 seed 开一局存活模式。
    - 断言生成的迷宫至少有 N 个岔路口(N 从 kruskal 样本里经验选取)—— 这是 FR-17 的回归测试。
- 现有 E2E 测试:
    - `survive.spec.ts`: 继续通过(kruskal + survive 敌人仍工作)。
    - `procedural.spec.ts`: 如果之前断言过具体算法,可能要更新;把断言改成 "3 种 mode→algorithm 之一"。
    - `time-trial.spec.ts`: 继续通过(prim + 无敌人仍工作)。

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 部分设备 WebGL context 丢失 | 低 | `MainMenuScene` 回退到 CSS 渐变 |
| 主菜单背景的 rAF 循环耗电 | 低 | unmount 时 `dispose()`;遵守 `prefers-reduced-motion` |
| radio→select 重构导致现有 E2E 测试失败 | 中 | 保持 data-testid 稳定;把那些断言 `<input type="radio">` 的测试改成断言 `<select>` |
| 用户想要不同方向的主菜单(比如 brutalist card) | 低 | spec 批准后才进入 plan/实现;设计通过 `MainMenu` 组件可逆 |
| 手工关卡带敌人放到 reach-exit 模式,本以为是 bug 实际是设计 | 低 | FR-21 保留这种行为。在 spec 里写清楚。 |
| 如果未来 mode 增多,`algorithmForMode` 变成 god-function | 低 | 当前是 3 行 switch + 穷尽性检查。长了再重构为查表。 |
| 回归玩家的 best-record seed 当时是 `'recursive-backtracker'` 生成的,现在 reach-exit 产出不同迷宫 | 无 | 编码的 seed id 包含算法字段,旧 seed id 仍能解出原算法。映射变更只影响 **新** 的程序生成开局。 |

## 11. 待用户确认的开放问题

以下选项需要用户在 spec 审阅时确认:

- Q-A. 3D 主体方向是否合适?还是想要 CSS/SVG 氛围感 或 brutalist card?
- Q-B. 两列布局是否合适?还是想要顶部横条 / 单列打磨?
- Q-C. 按模式锁算法(reach-exit=RB、time-trial=prim、survive=kruskal)是否合适?还是想要 kruskal 通杀 或其它映射?
- Q-D. 敌人硬关到 survive 模式是否合适?还是想要软关(UI 隐藏滑块但值仍生效)?
- Q-E. 合成 1 个 Large 增量是否合适?还是想要 3 个子增量(P2-5a/b/c)?
- Q-F. `EnemyCounter` 在非 survive 时是隐藏,还是显示 "0 / 0"?

本草案的默认值(用户在审阅时没改就用这些):
- Q-A: 3D 主体。Q-B: 两列。Q-C: 按模式锁算法。Q-D: 硬关。Q-E: 1 个 Large。Q-F: 隐藏。

## 12. 参考

- 游戏设计 spec: `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- P2-3 (程序生成模式) spec: `docs/increments/procedural-modes/spec.md`
- P2-3 Q11 (算法对玩家隐藏): `docs/increments/_template/roadmap.md` §设计决策记录
- P2-4a (敌人 + 存活模式) spec: `docs/increments/enemies-editor/spec.md`
- P2-4a FR-20 (seed 输入 localStorage): `docs/increments/enemies-editor/spec.md`
- DoD 模板: `docs/increments/_template/dod.md`
- 路线图: `docs/increments/_template/roadmap.md`
- 现有 `LevelSelect.tsx`: `src/ui/LevelSelect.tsx`
- 现有 `MainMenu.tsx`: `src/ui/MainMenu.tsx`
- 现有 `gameStore.ts`(`startLevel` 流程): `src/store/gameStore.ts`
- 生成器: `src/maze/generators/{recursiveBacktracker,kruskal,prim,huntAndKill}.ts`
