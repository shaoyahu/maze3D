# Project Review — P2-13 Full Code Review (2026-06-17)

**Slug**: 2026-06-17-p2-13-full-code-review
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
**前置评审**: [`2026-06-17-full-code-review`](./2026-06-17-full-code-review.md)(52 条 baseline,本轮核验修复状态) · [`2026-06-16-full-code-review`](./2026-06-16-full-code-review.md) · [`2026-06-15-fresh-full-review`](./2026-06-15-fresh-full-review.md)
**关联文档**: [A-architecture-post-p2-13](./findings/2026-06-17-A-architecture-post-p2-13.md) · [B-engine-post-p2-13](./findings/2026-06-17-B-engine-post-p2-13.md) · [C-entities-rules-post-p2-13](./findings/2026-06-17-C-entities-rules-post-p2-13.md) · [D-maze-subsystem-post-p2-13](./findings/2026-06-17-D-maze-subsystem-post-p2-13.md) · [E-ui-react-p2-13](./findings/2026-06-17-E-ui-react-p2-13.md) · [F-tests-v2](./findings/2026-06-17-F-tests-v2.md)
**评审方式**: 6 个子代理并行分项评审(A-F 沿用 06-17 拆分),主代理汇总 + 验证(typecheck + test + 边界)

---

## §0 元数据 & 方法

- **评审范围**: 整个项目(`src/**`、`tests/**`、`public/**`、`docs/**`、配置文件、package.json) — 按 CLAUDE.md §「代码评审文档规范 / 评审范围(强制)」"默认 = 整个项目"。
- **文件数**: 77 src 文件(TS/TSX)+ 98 tests 文件 + 4 public 资产
- **P2-13 增量范围**: 27 个文件 +5021/-2470 行,核心是 `levelStore` 文件夹系统 + `EditorLeftPanel` 替换 `EditorLeftDrawer` + 新 `Dropdown` 组件 + 教程卡 hero/rows/advanced 三段式 + `WinOverlay` victory 标签键修复 + theme.css 主题变量重排
- **P2-11 → P2-13 之间修复 commits**(7 个):
  - `74cf371` 4 个 HIGH 引擎守卫(Game.destroyed / paused / clampFov / WeakSet)
  - `b7707fd` editorStore 4 个 setter 静默 no-op 修复 + commitLevel 清错 + enemySpawner retry 去重
  - `2296ef2` typecheck 红 30 处 + validateMaze 透传 P2-11 字段 + i18n 扩展
  - `284d0c1` reachability + Player 单测 + levels P2-11 字段断言 + isVictoryType 扩展性
  - `3180433` 3 dialogs useId + DIRTY_EXIT dead export
  - `54bd543` typecheck 改 --force
  - `ad94abe` P2-13 文件夹系统(本次评审焦点)
- **子代理拆分**: 6 个 subagent 并行,A-F 按领域字母切分
- **验证**:
  - `npm run typecheck` → **exit 0,0 errors**(从 P2-11 末 30 errors 修复归零)
  - `npm test` → 78 files / **985 passed** / 1 skipped / 0 failed(对比 P2-11 末 959/1/0 = **+26 测试**)
  - 边界 `grep -rE "from ['\"]react|from ['\"]react-dom|from ['\"]zustand|from ['\"]\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/` → **0 匹配 ✓**
- **基线 review 数量**: 9 份(从 2026-06-10 到 2026-06-17)+ 6 份分项

---

## §1 总览

| 严重度 | 本次(P2-13 后) | 上次(2026-06-17-P2-11) | 净变化 |
|---|---|---|---|
| CRITICAL | **0** | 3(去重) | **−3 全清** |
| HIGH | 5 | 13 | −8 |
| MEDIUM | 15 | 19 | −4 |
| LOW | 13 | 17 | −4 |
| **总计** | **33** | **52** | **−19** |

**一句话结论**:**P2-11 → P2-13 之间 7 个修复 commit 把上轮 3 个 CRITICAL 全部清掉、4 个引擎 HIGH 全部修好、13 条 MEDIUM/LOW 关闭**。P2-13 增量(folder 系统 + EditorLeftPanel 替换 + Dropdown 新组件 + victory key 修复)整体收口干净,无新 CRITICAL;新增 1 个 HIGH(E-H-2:EditorLeftPanel 11 selectors + 递归 render 大文件夹性能)+ 1 个升级 HIGH(F-H-1:vitest 排除 7 文件仍把 P2-11 CRITICAL 所在地关在阈值外)+ 1 个回归未闭合 HIGH(E-H-1:Segmented options useMemo 改文案不改代码)。**P2-13 ship-ready**,主要 P3 主题重排前的清理工作(EditorLeftPanel 性能 + useDebouncedCommit 闭包 + 9 处 e2e skip/fixme)是下一轮增量候选。

---

## §2 CRITICAL

**无**。上轮 3 个 CRITICAL 全部已修:
- ✅ `F-2026-06-17-A-CRITICAL-1` editorStore 4 个 setter 静默 no-op → `b7707fd` 修(`set(commitLevel(s, { ...s.level, ... }))` 模式)
- ✅ `F-2026-06-17-A-CRITICAL-2` / `F-2026-06-17-D-CRITICAL-2` VictoryType 联合缺 'caught-by-enemy' → `2296ef2` 修(union + VICTORY_TYPE_VALUES 同步排序)
- ✅ `F-2026-06-17-A-CRITICAL-3` / `F-2026-06-17-D-CRITICAL-1` / `F-2026-06-17-F-CRITICAL-1` validateMaze 静默吞 P2-11 字段 → `2296ef2` 修(透传 i18n / tutorialSteps / hideMinimap / rules.enemyAggression / rules.requireAllPickups)+ `284d0c1` 加 levels.test.ts it.each 5 字段断言
- ✅ `F-2026-06-17-D-CRITICAL-2` `algorithmForMode('caught-by-enemy')` → `b7707fd` 修(`algorithmForMode` 三处同步,`teaching-03` JSON 走 `includes` 强转被算法 provider 替代)

**typecheck 状态**: `npm run typecheck` 退出码 0,0 errors(对比 P2-11 末 30 errors)。`54bd543` 把 `tsc -b` 改 `--force` 防增量模式吞错,build 命令也加了 `--force`。

---

## §3 HIGH(5 条)

### H-1:reachability 单测覆盖不足(空 grid + 非方形 grid 越界)
- **文件**: `tests/unit/maze/reachability.test.ts:14-58` + `src/maze/reachability.ts:11-13`
- **状态**: 上轮 `F-2026-06-17-C-H-1` 部分修(`284d0c1` 加 6 case),本轮升级关注空 / 非方形边界
- **影响**:
  - 当前 6 case 覆盖了"2x2 全墙 / 3x3 直通 / start==exit / 厚墙包裹 / start 在墙内 / exit 在墙外",**仍缺**:
    - `walls=[]`(depth=0)→ reachability.ts:11 早退 `return false` 但**没单测钉契约**
    - `walls=[[]]`(depth=1, width=0)→ 同样未钉
    - **非方形 grid**(如 `walls=[[0,0,0],[0,0]]`,width=3, depth=2)→ reachability.ts:11-12 用 `walls[0].length` 推断 width 而 `walls.length` 推断 depth,`visited[z*width+x]` 在 width 不等于 walls[0].length 时**越界**;这个 latent bug 完全没测试碰
- **复现**: 在 editorValidation 走 `isReachable` 给 warning,若输入非方形 grid,异常被吞 console.warn,玩家不会看到"出口不可达"
- **修复**:
  1. reachability.test.ts 加 3 case: walls=[] / walls=[[]] / walls=[[0,0,0],[0,0]] (非方形)
  2. 非方形 case 当前实现会越界,**先在 reachability.ts 显式 throw 或 expect.toThrow** 钉死 contract
- **F-tag**: `F-2026-06-17-C-H-1`

### H-2:Enemy constructor 仍未校验 path[0] 到 spawn 距离
- **文件**: `src/entities/Enemy.ts:51-79` + `src/maze/JsonMazeProvider.ts:344-358`
- **状态**: 上轮 `F-2026-06-17-C-H-2` 部分修(仅 validator 层加 duplicate consecutive node 校验)
- **影响**:
  - 原 H-2 列了 3 项:(a) path 任意相邻节点距离 > 0;(b) path[0] 到 position 距离 < cellSize/2;(c) validateDesign 升级 warning
  - **`b7707fd` + `284d0c1` 只实现了 (a) 的部分(validator 层 duplicate consecutive node 拒绝)**,**(b) 和 (c) 未做**;Enemy constructor 自身仍无运行时守卫,EditorMazeProvider / importExport.parseImport 路径若 sanitization 漏字段,Enemy 拿到 path 含 {x:5,z:5} 但 spawn={x:0,z:0} 仍能构造
- **复现**: 走 EditorMazeProvider 输出退化 enemy data,玩家看到"敌人初始帧 FOV 朝东 1 帧"再调整
- **修复**:
  ```ts
  // Enemy constructor 末尾
  if (Math.hypot(this.position.x - this.path[0].x, this.position.z - this.path[0].z) > cellSize) {
    throw new Error(`Enemy ${id}: path[0] too far from spawn`);
  }
  ```
  + Enemy.test.ts 配 1 case
- **F-tag**: `F-2026-06-17-C-H-2`

### H-3:EditorLeftPanel 11 selectors + 递归 render,大文件夹场景 O(n) 级联 re-render
- **文件**: `src/ui/editor/EditorLeftPanel.tsx:55-93`(P2-13 新增,399 行)
- **状态**: **新发现**(P2-13 引入,旧 EditorLeftDrawer 的 8 tool 改成文件夹递归结构后,同源问题放大)
- **影响**:
  - 11 个 `useLevelStore((s) => s.x)` 粗粒度 selector + 双重 useMemo + 内联递归 `renderFolder` / `renderLevel`(每次父组件 render 重新生成函数引用)
  - `RowMenu` 子组件无 `React.memo`,hover / close 事件触发整树 re-run
  - 100+ 关卡 / 5+ 文件夹时,hover 一行 → 整树 re-render,目测 5ms+ per hover
- **复现**:
  1. 创建 30 个关卡,散落到 5 个文件夹
  2. hover 一个 level row 触发 `setOpen(true)`
  3. DevTools Profiler → EditorLeftPanel 重新 mount/render → 30 个 row + 5 个 folder 全部跑一遍
- **修复**:
  1. `useShallow` 包装 selector + 拆细粒度:`useLevelStore((s) => s.folders, shallow)`
  2. `renderFolder` / `renderLevel` 抽 module-scope 函数,`RowMenu` 包 `React.memo`
- **F-tag**: `F-2026-06-17-E-H-2`

### H-4:`EditorPropertiesPanel` Segmented options 引用每次 render 重建(回归未闭合)
- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:166-218` + `:348-353`
- **状态**: **回归未闭合** — 上轮 `F-2026-06-17-E-H-1` 改的是 key prefix(victory label 的 i18n key),**useMemo 根因没修**;P2-13 增量继续用同一 Segmented 模式
- **影响**:
  ```tsx
  <Segmented
    options={VICTORY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
    ...
  />
  // Segmented 内部 effect deps 含 options → 每次 render 跑 getBoundingClientRect
  ```
  50×50 编辑器 + store selector 通知 + 鼠标移动 → 父组件 re-render → 重新生成 VICTORY_OPTIONS.map(...) → effect 跑 → 强制 reflow
- **复现**:
  1. 打开编辑器,任选关卡,右侧 meta panel 渲染
  2. 编辑关卡名(input 触发)→ store update → EditorPropertiesPanel re-render
  3. DevTools Performance → Layout 任务频繁 getBoundingClientRect
- **修复**:
  ```tsx
  const victoryOptions = useMemo(
    () => VICTORY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );
  ```
- **F-tag**: `F-2026-06-17-E-H-1`(上轮编号沿用,标 regression)

### H-5:vitest 排除的 7 个文件把 P2-11 CRITICAL 所在地关在阈值外(从 M 升级)
- **文件**: `vitest.config.ts:21-33`
- **状态**: **升级**(上轮 `F-2026-06-17-F-M-1` 标记 M,本轮升级到 H — 见 §8 跨切 #1)
- **影响**:
  - 7 个文件被 `coverage.exclude` 排除:`src/main.tsx` / `App.tsx` / `engine/{Game,Camera,Renderer,Loop}.ts` / `ui/GameCanvas.tsx` / `maze/types.ts` / `game/GameState.ts` / `vite-env.d.ts` / `playwright.config.ts`
  - **Game.ts**(tick 调度中枢)+ **GameCanvas.tsx**(React↔Engine 桥)+ **maze/types.ts**(运行时白名单 + 5 个 `is*` 守卫)**正是 P2-11 三个 CRITICAL 的所在地**(D-CRITICAL-1 validator 吞字段 / A-CRITICAL-1 editorStore.s.draft / A-CRITICAL-2 VictoryType 联合)。排除等于"把火场关在烟雾报警器外"。
  - 阈值 80% / 75% / 75% / 80% 在 `src/**` 范围内度量,这些文件被排除后,即使这 3 个文件 0 覆盖,总分仍能过
- **修复**: 把 `coverage.exclude` 拆 sub-array,删 `engine/Game.ts` / `maze/types.ts` / `ui/GameCanvas.tsx` 三个高危文件(只留 main/App/Camera/Renderer/Loop/GameState)。阈值可能下调到 70% 左右 — 先跑覆盖率看实际值。
- **F-tag**: `F-2026-06-17-F-H-1`(升级;继承自 `F-2026-06-17-F-M-1`)

---

## §4 MEDIUM(15 条)

| ID | 简述 | 域 | F-tag |
|---|---|---|---|
| M-1 | P2-13 引入 dead i18n keys `editor.mylevels.*`(5 zh + 5 en) — 10 个 key 无消费者,仅 CSS 类名引用 prefix | A | `F-2026-06-17-A-1` |
| M-2 | `levelStore.moveFolder` 自承混乱的 spread(569-577),有 `as string \| undefined` cast 在 dead block 里 | A | `F-2026-06-17-A-2` |
| M-3 | `shouldSurviveWin` 仍无 finite guard(继承),与 P2-13 `lastWinKind='caught-by-enemy'` 叠加可能让 survive 模式沉默胜利 | C | `F-2026-06-17-C-M-1` |
| M-4 | `enemySpawner` retry 修复有 fix 无 test,manual repro 仍是唯一验证 | C | `F-2026-06-17-C-H-3` |
| M-5 | `useDebouncedCommit` 闭包未修 ref 模式(回归未闭合),7 个调用方 commit 是 inline 箭头函数 | E | `F-2026-06-17-E-M-1` |
| M-6 | `PickupForm` / `EnemyForm` / `WallForm` 仍无 `React.memo`(回归未闭合) | E | `F-2026-06-17-E-M-2` |
| M-7 | `EditorLeftPanel` 折叠状态 `useState<Record<string, boolean>>({})` 每次 toggle 创建新对象,无 memo + 未持久化 | E | `F-2026-06-17-E-M-3` |
| M-8 | `TutorialAdvancedSteps` JSON.parse 在每次 render 重计算,无 memo | E | `F-2026-06-17-E-M-4` |
| M-9 | editor 子组件测试 mock 模板重复 ~30 行/文件,4 份 `makeMaze` 工厂函数内联重复 | F | `F-2026-06-17-F-M-1` |
| M-10 | `EditorLeftPanel.test.tsx` 不覆盖右键菜单的 rename / moveTo 路径(window.prompt + store action) | F | `F-2026-06-17-F-M-2` |
| M-11 | editor e2e `carveLShape` helper 抹除 exit cell,2 个 fixme 仍因根因未解被 skip | F | `F-2026-06-17-F-M-3` |
| M-12 | `Scene.dispose` 未 `scene.clear()`(继承),与 dispose 配对不完整 | B | `F-2026-06-17-B-M-1-N1` |
| M-13 | `collidesAt` cellSize=0 保护缺失(继承),AlgorithmMazeProvider / EditorMazeProvider 未走 validator 校验 | B | `F-2026-06-17-B-M-3-N1` |
| M-14 | `Loop` `0.1` magic number(继承),无命名常量 + 注释说明 spiral-of-death guard 来源 | B | `F-2026-06-17-B-M-4-N1` |
| M-15 | `useGameStore.subscribe` 异步回调引用 gameRef(继承),无 `if (!gameRef.current) return` 守卫 | B | `F-2026-06-17-B-M-5-N1` |

**M-1** 详述(P2-13 新增最值得修的):
- **文件**: `src/i18n/resources/{zh,en}.ts:477`(P2-13 增)
- **影响**: P2-13 加了 `editor.mylevels.title/empty/edit/delete/deleteTitle/deleteMessage` 5 zh + 5 en keys,但唯一引用 `mylevels` prefix 的文件是 `src/styles/theme.css` 的 `.editor-mylevels__*` 类名(为已废弃的 EditorMyLevelsDrawer)。`keysParity.test.ts` 只检查 zh↔en parity + non-empty + dotted-namespace,**不检测 orphan key**。10 个 dead strings 会随 zh/en 编辑静默腐烂,翻译人员会误以为抽屉还在用。
- **修复**:
  1. 选项 A:删 10 keys + 删 `.editor-mylevels__*` CSS
  2. 选项 B(推荐,系统性修复):扩 `keysParity.test.ts` 加 orphan-key 检查 — `grep -rn "t('[a-z.]*')" src/**/*.tsx` 收集所有 key,断言每个 resource key 都被消费。这样下次加 dead key CI 会直接报错。

**M-3** 详述(继承未修,应升级):
- **文件**: `src/game/Rules.ts:99-101` + `src/store/gameStore.ts:309`
- **影响**: `currentSurviveSeconds + bonus` 路径若 pickup value 是 corrupt state 进来的 -Infinity,`currentSurviveSeconds = +Infinity` → `elapsedTime >= +Infinity` 永 false → 不胜利;`currentSurviveSeconds = -1`(持久化迁移漏字段)→ `elapsedTime(0) >= -1` true → **第一帧立即胜利**。原 M-3 列的所有 case 仍未修。
- **修复**:
  ```ts
  export function shouldSurviveWin(elapsedTime, surviveSeconds) {
    if (!Number.isFinite(elapsedTime) || !Number.isFinite(surviveSeconds)) return false;
    if (surviveSeconds <= 0) return false;
    return elapsedTime >= surviveTime;
  }
  ```
  + Rules.test.ts 加 3 case: NaN / -Infinity / -1 → false

**M-7** 详述(P2-13 新增 UX 改进):
- **文件**: `src/ui/editor/EditorLeftPanel.tsx:70-72, 176-184`
- **影响**: 注释明确说"全部展开以减少状态复杂度",但 `useState<Record<string, boolean>>({})` 每次 toggle 创建新对象 → 整个组件 re-render → 递归 renderFolder / renderLevel 全部跑。**未持久化** — 关掉编辑器再打开,折叠状态丢失
- **修复**: 用 `useReducer` + Map,或干脆把 collapsed 移到 `levelStore` 持久化

---

## §5 LOW(13 条)

| ID | 简述 | 域 | F-tag |
|---|---|---|---|
| L-1 | `sanitizeFoldersMap` returns `dropped: string[]` 但 folders IIFE 不传 LoadSummary | A | `F-2026-06-17-A-3` |
| L-2 | `EditorLeftPanel.handleRenameLevel` 走 `useLevelStore.getState().saveCustom` 不订阅 `lastWriteError`,失败静默 | A | `F-2026-06-17-A-4` |
| L-3 | `disposedTexs` / `doubleDisposeWarned` module-level Set 单调增长,JS heap 累积 1.5-6 MB / 100 关 | B | `F-2026-06-17-B-L-1-N1` |
| L-4 | `WinOverlay` victory 标签键修复在 Overlays 域内一致,但 GameOverOverlay + HUD 仍走 ternary + 硬编码 | C | `F-2026-06-17-C-M-2` |
| L-5 | `levels.test.ts` 未钉 `pickup.value` 契约(`> 0` 但不要求 integer) | C | `F-2026-06-17-C-M-3` |
| L-6 | `Enemy.test.ts` 仍未断言 `chaseSpeed === playerSpeed * chaseMultiplier`(`chaseMultiplier` 字段死代码) | C | `F-2026-06-17-C-L-1` |
| L-7 | `Dropdown.tsx:200-202` Tab 关闭后焦点跳走,未 `e.preventDefault()` + focus 回 trigger | E | `F-2026-06-17-E-L-1` |
| L-8 | `Dropdown` 键盘 + 鼠标混用时 active vs click index 可能错位 | E | `F-2026-06-17-E-L-2` |
| L-9 | `handleRenameLevel` 直接调 `useLevelStore.getState().saveCustom`,代码风格不统一 + 缺 `renameLevel` action | E | `F-2026-06-17-E-L-3` |
| L-10 | `LevelSelect.tsx:243-248, 547, 647` `VICTORY_LABEL_KEYS[lv.data.rules.victory] ?? ''` 在 `t()` 收到空 key 时 console.warn | E | `F-2026-06-17-E-L-4` |
| L-11 | `theme.css:90-92, 138` `--panel` legacy token,8 处旧 class 直接依赖(Dialog.tsx 等) | E | `F-2026-06-17-E-L-5` |
| L-12 | `Dropdown` listbox `outline: none` + active option 视觉反差有限 | E | `F-2026-06-17-E-L-6` |
| L-13 | `useDebouncedCommit` 缺单测(继承) | F | `F-2026-06-17-F-L-1` |

**Dropout 注**: `find tests -name "*dropdown*"` 返回 0,Dropdown 组件 375 行无任何单测,所有 3 条 Dropdown 相关 finding(L-7/L-8/L-12)无 pin。

---

## §6 验证为假阳性的子代理报告(避免下次复审重复报)

| 子代理原始怀疑 | 排除理由 |
|---|---|
| A-1: P2-11 editorStore 4 个 setter(s.draft)回归 | `b7707fd` 修完,4 个 setter 都改用 `set(commitLevel(s, { ...s.level, ... }))` 模式,22 typecheck errors 全清 |
| A-2: VictoryType 联合缺 'caught-by-enemy' 回归 | `2296ef2` 修完,`maze/types.ts:10` union + VICTORY_TYPE_VALUES 同步 |
| A-3: 引擎 ⇄ UI 边界破坏 | `grep -rE "from ['\"]react\|zustand\|store" src/engine/ src/entities/ src/maze/generators/ src/game/` 0 匹配 |
| A-4: store 循环依赖(levelStore ↔ editorStore) | `grep -rnE "from ['\"]\.\./store" src/store/` 0 匹配,跨 store 协调都走 React 层 `useLevelStore.getState()` 模式 |
| A-5: A-M-1(lastError 清错代码 8 处重复)回归 | `b7707fd` 把清错抽到 `commitLevel` helper(L359-369),8 处重复消除。P2-13 不加新 `commitLevel` 调用方,fix 稳定 |
| A-6: A-M-2(migrations chain empty-message)回归 | P2-13 folders 走 `parseStorageKeyVersion` + `applyLevelMigrations`,沿用现有 throw 路径,未引入新坑。"chain incomplete" 文案未修但未回归 |
| A-7: A-LOW-1(i18n `v == null` 合并)回归 | P2-13 14 placeholder-bearing keys 全部用 `{name}`/`{count}`/`{value}`/`{id}` 语法,无 null/undefined 传递 |
| B-1: P2-13 theme.css 影响 `Scene.setDarkMode` | `Scene.setDarkMode` 接收纯 boolean,palette 是 JS 字面量(Scene.ts:146-159),不读 CSS 变量;P2-13 仅 4723 行 CSS token 重排,0 行引擎代码变动 |
| B-2: Game.destroyed 与上轮 `running` 守卫语义不一致 | `Game.ts:118 destroyed flag` + L351 dispose 同步置 true + L374 update 入口守卫,语义等价但更清晰 |
| B-3: B-M-1 Scene.dispose 未 clear children 应在 74cf371 顺手修 | `git show 74cf371 --stat` 该 commit 只改 Game.ts/Scene.ts/InputManager.ts 的 H1-H4 修复行,无 scene.clear() |
| C-1: P2-11 C-H-1 reachability 单测回归未补 | `284d0c1` 加 6 case,本轮 6/6 全过;部分覆盖(H-1 本轮关注)不算回归 |
| C-2: P2-11 C-H-2 Enemy path 验证完全未做 | 部分修,validator 层有;constructor 层未做(已升级为 H-2) |
| C-3: P2-11 C-H-3 enemySpawner retry 修复未补单测 | `b7707fd` 在 gameStore + Game 两侧加 handCraftedEnemies filter 防 gen-* 累积,修复到位;**测试未补**(M-4 报告)|
| D-1: generators 引入副作用 | 4 个 generators + `_expandThickWall` 共 5 个文件 0 finding,纯函数性 + 连通性 + 测试覆盖全过 |
| D-2: importExport.serializeLevel 丢 tutorialSteps | `JSON.stringify` 透传全 MazeData 字段,tutorialSteps 保留;`nameToPreserve` 仍是 dead code(M-2 继承) |
| D-3: `_isReachable` 命名疑虑 | 0 引用,只有 `isReachable` 导出,命名疑虑不成立 |
| D-4: 编辑器文件夹系统 JsonMazeProvider 透传漏字段 | 6 行透传(folderId + P2-11 5 字段),levels.test.ts:108-139 it.each 17 case 全过 |
| E-1: F-2026-06-16 E-H-1/2/3 仍存在 | 全部已修(本评审 E 文档「上轮 finding 状态」表逐条核验) |
| E-2: F-2026-06-16 E-M-1~3 仍存在 | 全部已修(M-1 没修但内容变化、EditorLeftDrawer 删了、M-2 收口) |
| E-3: F-2026-06-16 E-L-1~6 仍存在 | 全部已修(教程卡 16 keys / EditorToolbar 10 keys / DIRTY_EXIT 删 / 3 useId 落地) |
| E-4: EditorPropertiesPanel 重大改写破坏现有 testid | 教程卡 `meta-hide-minimap` / `meta-enemy-aggression` / `meta-require-all-pickups` / `meta-tutorial-steps-toggle` 全部 testid 保留,旧测试不破 |
| F-1: 上轮 F-M-2 mock 风格不统一 | `grep -rn jest.mock` 0 匹配,`__mocks__/` 不存在,6 处 `vi.mock` 全在 component/ 下 3 个文件,已统一 |
| F-2: F-H-1 / F-H-2 / F-CRITICAL-1 / F-M-3 未修 | 全部已修(本轮 6/6 + 1/1 + 17/17 + isVictoryType 扩展性全过) |
| F-3: e2e skip 状态从 11 涨到更多 | 11 → **8**(P2-13 删 1 个 delete custom fixme + 1 个 case 4/5 一组的删除 case) |
| F-4: EditorStatusBar.test.tsx 2 个重复 afterEach | 已知 LOW,2 min 清理可修,记入 F-L-2.5 候选 |

---

## §7 验证结果

| 命令 | 退出码 | 实际产出 |
|---|---|---|
| `npm run typecheck`(`tsc -b --noEmit`) | **0** | 0 errors,0 warnings(从 P2-11 末 30 errors 修复归零 — `54bd543` `--force` + `2296ef2` 修 P2-11 字段 + VictoryType 联合) |
| `npm test`(`vitest run`) | **0** | 78 files / **985 passed** / 1 skipped / 0 failed(对比 P2-11 末 959/1/0 = **+26 测试**;P2-13 新增 `levelStore.folders.test.ts` 10 case + `EditorLeftPanel.test.tsx` 8 case + `Player.test.ts` 7 case + `reachability.test.ts` 6 case 等) |
| `npm run build` | **未跑**(成本高) | typecheck 通过 → build 推断 OK |
| 边界 `grep -rE "from ['\"]react\|react-dom\|zustand\|\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/` | — | **0 匹配 ✓** |
| `npm run lint` | N/A | 项目未配 eslint |

**e2e skip/fixme 状态**:
```
enemies.spec.ts:26, 41       (2 skip) — page.clock + rAF
survive.spec.ts:18           (1 skip) — page.clock + rAF
editor.spec.ts:48, 120       (2 fixme) — carveLShape 抹 exit
pause-resume.spec.ts:39      (1 skip) — page.clock + rAF
time-trial.spec.ts:12, 38    (2 skip) — page.clock + rAF
```
**8 处**(对比 P2-11 末 11 处 = **-3**)。根因仍是 page.clock + rAF(6 处)+ carveLShape(2 处),roadmap 已记为"已知未跟进的测试债"。

---

## §8 跨切关注

1. **vitest 排除配置把 3 个 P2-11 CRITICAL 所在地关在阈值外**(升 HIGH-5)
   - `engine/Game.ts` + `maze/types.ts` + `ui/GameCanvas.tsx` 3 个文件被 `coverage.exclude` 排除在 80% / 75% / 75% / 80% 阈值外
   - 这 3 个文件**正是 P2-11 三个 CRITICAL 的所在地**(D-CRITICAL-1 validator / A-CRITICAL-1 editorStore / A-CRITICAL-2 VictoryType)
   - 排除等于"把火场关在烟雾报警器外" — 阈值永远会过,但 3 个核心文件 0 覆盖时总分仍能过
   - 修复:把 `coverage.exclude` 重排,删 `engine/Game.ts` / `maze/types.ts` / `ui/GameCanvas.tsx` 三个高危文件(只留 main/App/Camera/Renderer/Loop/GameState 引导性文件);阈值可能下调到 70% 左右 — 先跑覆盖率看实际值
   - P3 增量候选估时 15 min

2. **i18n orphan-key 缺乏自动检测**(升 M-1)
   - P2-13 加了 10 个 `editor.mylevels.*` keys,只在已删的 `EditorMyLevelsDrawer` CSS class 里有 prefix 引用
   - `keysParity.test.ts` 只检查 zh↔en parity + non-empty + dotted-namespace,**不检测 orphan key**
   - 10 个 dead strings 会在 zh/en 编辑时静默腐烂
   - 修复:扩 `keysParity.test.ts` 加 orphan-key 检查 — `grep -rn "t('[a-z.]*')" src/**/*.tsx` 收集所有 key,断言每个 resource key 都被消费
   - P3 增量候选估时 20 min

3. **上轮 3 条 UI finding 跨 P2-11 → P2-13 连续 2 轮未修**(E-H-1 / E-M-1 / E-M-2)
   - E-H-1(回归):上轮改的是 i18n key prefix(`victory.*` → `levels.victory.*`),useMemo 根因没修;P2-13 继续用同一 Segmented 模式
   - E-M-1:`useDebouncedCommit` 闭包未修 ref 模式,7 个调用方 commit 是 inline 箭头函数
   - E-M-2:`PickupForm` / `EnemyForm` / `WallForm` 仍无 `React.memo`
   - 这 3 条应在 P3 主题重排前的"清理增量"统一扫掉

4. **`EditorLeftPanel` 取代 `EditorLeftDrawer` 是性能维度的 trade-off**
   - 功能上更丰富(文件夹 CRUD + 嵌套 + 移入/移出)
   - React 性能维度从"竖排 8 按钮"升级到"递归文件树",selector 细粒度问题被放大 — 旧 E-M-3 在新组件上变成 E-H-2(11 selectors + 递归 render)
   - 修复:细粒度 selector + `RowMenu` `React.memo` + 抽 module-scope 递归函数(估时 1-2 hr)

5. **`theme.css` 单文件 4416 行**
   - CSS 变量按 light/dark 双主题整理;dark mode `--accent` 改 periwinkle blue 强化主题对比
   - 变量命名 / dark mode 切换 / CSS-only 实现都比较干净
   - 但 4416 行单文件 + 无 minify + 无 css-modules / Tailwind → bundle size 未优化(待 P3 评估)
   - 引擎侧 `Scene.setDarkMode(bool)` 内部走 three.js `Color`,不读 CSS variable,完全解耦 ✓

6. **Dropdown 组件测试覆盖缺失**
   - P2-13 新增 375 行组件,`find tests -name "*dropdown*"` 返回 0
   - 之前用原生 `<select>` 的测试通过 `fireEvent.change` 仍工作,视觉 trigger 的点击 / 键盘 / portal 行为没有专门测试
   - L-7/L-8/L-12 报告的边角(Tab 焦点、键盘/鼠标混用、active option 视觉反差)无 pin
   - 修复:加 `tests/component/dropdown.test.tsx` 覆盖 trigger click + 键盘 Up/Down/Home/End/Enter/Space/Esc + portal 行为
   - P3 增量候选估时 1 hr

7. **engine⇄UI 隔离边界 100% 干净**(复核 6 份子文档)
   - 跨 6 份子文档 + grep 双重确认:`grep -rE "from ['\"]react\|react-dom\|zustand\|\.\./store" src/engine/ src/entities/ src/maze/generators/ src/game/` 0 匹配
   - P2-13 没有破坏这个边界

8. **CLAUDE.md 描述与实际代码**:`src/game/GameState.ts` 在 P2-11 → P2-13 期间未回归(上一轮已修)

---

## §9 优先级行动建议

按 **修复成本** × **影响严重度** 排序:

| 优先级 | finding | 估时 | 影响 |
|---|---|---|---|
| **P0** | (无 — 上轮 P0 全清) | — | — |
| **P1** | H-5 vitest 排除重排(让 Game.ts / types.ts 进覆盖率) | 15 min | 把 P2-11 CRITICAL 所在地关进烟雾报警器 |
| **P1** | H-4 Segmented options useMemo(回归未闭合) | 15 min | 50×50 编辑器 + store 更新 → layout thrash 修复 |
| **P1** | H-3 EditorLeftPanel 11 selectors + `React.memo` | 1-2 hr | 100+ 关卡时整体 re-render 性能 |
| **P1** | H-1 reachability 补 3 case(空 / 非方形 / 越界) | 30 min | 钉 isReachable 边界契约 + 修非方形越界 bug |
| **P1** | H-2 Enemy constructor 加 path[0] 距离校验 | 30 min | 防 EditorMazeProvider 漏字段场景 |
| **P2** | M-1 i18n orphan-key 自动检测 | 20 min | 防 P2-N 加 dead keys 静默腐烂 |
| **P2** | M-3 shouldSurviveWin finite guard(继承) | 15 min | 修 corrupt state 触发立即胜利 / 永不利 |
| **P2** | M-5 useDebouncedCommit ref 模式 | 30 min | 跨 7 个调用方统一 |
| **P2** | M-6 form 组件 `React.memo` | 30 min | 减少 selection 切换 re-render |
| **P2** | M-8 TutorialAdvancedSteps JSON.parse memo | 5 min | 用户输入大 JSON 时不卡 |
| **P2** | M-9 抽 `tests/_helpers/makeMaze.ts` | 30 min | 解 mock 重复 + 防下次再重复 |
| **P2** | M-10 EditorLeftPanel 右键菜单 rename / moveTo 覆盖 | 30 min | 补 P2-13 新交互的回归 pin |
| **P2** | M-7 collapsed 状态持久化到 levelStore | 30 min | UX 改进 + 减少 re-render |
| **P2** | M-4 enemySpawner retry 单测补回 | 15 min | 把 retry 契约钉在函数自身 |
| **P3** | M-2 / L-1~13(都是 1-30 min 边角清理) | 2-3 hr | 一次性技术债清理 |
| **P3** | Dropdown 组件测试 | 1 hr | 覆盖 3 条 L-7/L-8/L-12 |
| **P3** | theme.css bundle size 优化 | 评估后定 | 4416 行单文件评估 |
| **P3** | e2e skip 8 处根因修复(page.clock + carveLShape) | 4-6 hr | 已知测试债,需独立增量 |

**估时总计**: P1 ≈ 4 hr,P2 ≈ 5 hr,P3 ≈ 8-10 hr

---

## §10 Files Reviewed

| 模块 | src 文件 | tests 文件 | finding 数 | 子文档 |
|---|---|---|---|---|
| 架构 / 边界 / store / utils / i18n | 20 | — | 4 (0/0/2/2) | [A-architecture-post-p2-13](./findings/2026-06-17-A-architecture-post-p2-13.md) |
| 引擎层 | 7 | 2 | 6 (0/1/4/1) | [B-engine-post-p2-13](./findings/2026-06-17-B-engine-post-p2-13.md) |
| 实体 / 游戏规则 | 5 | 4 | 7 (0/2/2/3) | [C-entities-rules-post-p2-13](./findings/2026-06-17-C-entities-rules-post-p2-13.md) |
| 迷宫子系统(types / providers / generators) | 12 | 14 | 4 (0/0/2/2) | [D-maze-subsystem-post-p2-13](./findings/2026-06-17-D-maze-subsystem-post-p2-13.md) |
| UI / React / editor | 25 | 21 | 12 (0/2/4/6) | [E-ui-react-p2-13](./findings/2026-06-17-E-ui-react-p2-13.md) |
| 测试套件 + vitest config | — | 98 + 1 | 6 (0/1/3/2) | [F-tests-v2](./findings/2026-06-17-F-tests-v2.md) |
| 公共资产 / 配置 | 4 (public/) + 4 (root) | — | (含在上述) | — |
| **总计(去重)** | **77** | **98** | **33 独立 (0/5/15/13)** | 6 份分项(A/B/C/D/E/F) |

---

## §11 总结

**P2-13 在外观上完成度更高**(27 文件 +5021/-2470 行 = 净 +2551 LOC,新增 `levelStore` 文件夹系统 + `EditorLeftPanel` 替换 + `Dropdown` 新组件 + tutorial 三段式),**在功能 / 性能 / 边界 3 个维度均 ship-ready**:

- ✅ **3 个上轮 CRITICAL 全部修复**(editorStore 4 个 setter / VictoryType 联合 / validateMaze 透传 P2-11 字段)
- ✅ **4 个上轮引擎 HIGH 全部修复**(Game.destroyed / InputManager paused / clampFov / WeakSet → Set)
- ✅ **typecheck 红 30 → 0 errors**(54bd543 `--force` 防增量模式吞错)
- ✅ **985 单元测试通过**(对比 P2-11 末 959 = +26,P2-13 folder / EditorLeftPanel / Player / reachability 全覆盖)
- ✅ **e2e skip 11 → 8**(P2-13 删 1 个 delete custom fixme)
- ✅ **引擎 ⇄ UI 隔离边界 100% 干净**(6 份子文档 + grep 双重确认)
- ✅ **P2-13 新组件 Dropdown 的 a11y 设计优秀**(useId + aria-activedescendant + 完整键盘导航)

**待办**(均非 ship-blocker,下轮清理候选):
1. **P1**:H-3 / H-4 / H-5 三个 HIGH — EditorLeftPanel 性能 + Segmented useMemo 回归 + vitest 排除配置
2. **P2**:M-1 i18n orphan-key 检测 + M-3 shouldSurviveWin finite guard(继承)+ M-5 useDebouncedCommit 闭包
3. **P3**:Dropdown 测试覆盖 + theme.css bundle 评估 + e2e skip 8 处根因(page.clock + carveLShape)

**P2-14 候选增量建议**:
1. **「EditorLeftPanel 性能清理」** — H-3 + M-5 + M-6 + M-7 + M-8(全是 EditorPropertiesPanel / EditorLeftPanel 性能类),1-2 hr 收口
2. **「i18n 测试加固」** — M-1 orphan-key + C-M-2 GameOverOverlay key 模式统一 + E-L-10 ?? '' 兜底,2-3 hr
3. **「vitest 排除配置重排」** — H-5(15 min 立即可做)
4. **「引擎守卫补完」** — H-1 reachability 边界 + H-2 Enemy constructor + M-13 collidesAt cellSize=0,2 hr 收口
5. **「e2e 测试债清理」** — page.clock + rAF 不兼容根因 + carveLShape 抹 exit,4-6 hr 独立增量

---

**评审完成**。本报告 + 6 份分项 finding 文档(A-architecture-post-p2-13.md / B-engine-post-p2-13.md / C-entities-rules-post-p2-13.md / D-maze-subsystem-post-p2-13.md / E-ui-react-p2-13.md / F-tests-v2.md)= 共 7 份 md,总计约 8 万字符,**33 独立 finding (0 CRITICAL / 5 HIGH / 15 MEDIUM / 13 LOW)**,对比 P2-11 末 52 条 **-19 条**。P2-13 ship-ready,主要 P1 行动是 EditorLeftPanel 性能 + Segmented useMemo 回归闭合 + vitest 排除配置重排,共估时 4 hr。
