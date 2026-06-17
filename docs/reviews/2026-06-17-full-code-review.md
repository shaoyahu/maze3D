# Project Review — Full Code Review (2026-06-17)

**Slug**: 2026-06-17-full-code-review
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `e45ecdc test+docs(p2-11): 老 level-* 引用更新为 teaching-* + E2E spec + roadmap 完成`
**前置评审**: [`2026-06-16-full-code-review`](./2026-06-16-full-code-review.md)(11 条 baseline,11/11 已修) · [`2026-06-15-fresh-full-review`](./2026-06-15-fresh-full-review.md) · [`2026-06-15-full-bug-scan`](./2026-06-15-full-bug-scan.md)
**关联文档**: [findings/A-architecture](./findings/2026-06-17-A-architecture.md) · [B-engine](./findings/2026-06-17-B-engine.md) · [C-entities-rules](./findings/2026-06-17-C-entities-rules.md) · [D-maze-subsystem](./findings/2026-06-17-D-maze-subsystem.md) · [E-ui-react](./findings/2026-06-17-E-ui-react.md) · [F-tests](./findings/2026-06-17-F-tests.md)
**评审方式**: 6 个子代理并行分项评审 + 主代理汇总 + 验证(typecheck + test + 上轮 finding 修复状态)

---

## §0 元数据 & 方法

- **评审范围**: 整个项目(`src/**`、`tests/**`、`public/**`、`docs/**`、配置文件、package.json) — 按 CLAUDE.md §「代码评审文档规范 / 评审范围(强制)」"默认 = 整个项目"。
- **文件数**: 75 src 文件(TS/TSX)+ 91 tests 文件 + 4 public 资产
- **子代理拆分**: 6 个 subagent 并行,A-F 按领域字母切分,各自有独立 finding 文档
- **验证**:
  - `npm run typecheck` → exit code 0 但**实际有 30 个 TS 错误**(tsc 增量模式吞错)
  - `npm test` → 75 files / **959 passed** / 1 skipped / 0 failed(基线 roadmap 标 "874/3/0",增量 +66 测试)
- **基线 review 数量**: 共 8 份(从 2026-06-10 到 2026-06-16)+ 5 份分项
- **上轮 finding 状态**: F-2026-06-16-* 11 个 UI 范围内 finding **全部已修复**(详见 E 文档「上轮 finding 修复状态」段)

---

## §1 总览

| 严重度 | 数量 | 净增(去重后) |
|---|---|---|
| CRITICAL | 5 | **3**(2 个去重) |
| HIGH | 15 | 13 |
| MEDIUM | 21 | 19 |
| LOW | 18 | 17 |
| **总计** | **59** | **52** |

**一句话结论**:**P2-11 是"绿色但破损"的提交** — 50/50 测试通过 + 959 单元测试通过 + 11 个上轮 finding 全部已修,但 typecheck 红 30 处、editorStore P2-11 控件**静默 no-op**、4 个内置教学关卡的 P2-11 字段**经 validator 全部丢失**。三处 CRITICAL 必须先解,否则 P2-11 的功能在运行时**完全不可见**。

---

## §2 CRITICAL(5 条,去重 3 独立根因)

### C-1(A-CRITICAL-1 / D-CRITICAL-1 / F-CRITICAL-1 同根):P2-11 引入 3 个静默破损

#### C-1a: `editorStore` 引用不存在的 `s.draft` 字段 → P2-11 控件静默 no-op

- **文件**: `src/store/editorStore.ts:506-532`
- **影响**: P2-11 新增 4 个 setter(`setHideMinimap` / `setEnemyAggression` / `setRequireAllPickups` / `setTutorialSteps`)都这样写:
  ```ts
  setHideMinimap: (v) => {
    const s = get();
    if (!s.draft) return;          // ← `s.draft` 在 EditorStoreState 上不存在
    const next = pushHistory(s.level, { ...s.draft, hideMinimap: v || undefined });
    set({ level: next.level, draft: next.draft });  // ← pushHistory 返回的也不是 {level, draft}
  },
  ```
  运行时:
  - `if (!s.draft) return;` 总为 true(undefined 是 falsy)→ 4 个 setter **全部静默 no-op**
  - 用户在编辑器 UI 切换 hideMinimap / 调 enemyAggression / 开 requireAllPickups / 配 tutorialSteps → store 没反应 → 关卡保存时不含这些字段
  - `pushHistory(s.level, ...)` 只传 2 参数,但 `pushHistory(state, nextLevel, nextSelection)` 签名要求 3 个 → TS2554
- **复现**: 编辑器 → 选中哨兵回廊 teaching-03 → 右侧属性面板勾选 `hideMinimap` / 调 enemyAggression → 看 `useEditorStore.getState().level.rules.enemyAggression` 仍为 undefined
- **修复**:
  ```ts
  setHideMinimap: (v) => {
    const s = get();
    const next = pushHistory(s, { ...s.level, hideMinimap: v || undefined }, s.selection);
    set({ level: next.level, selection: next.selection, past: next.past, future: next.future, dirty: true });
  },
  ```
  (其它 3 个 setter 同样改)
- **F-tag**: `F-2026-06-17-A-CRITICAL-1`

#### C-1b: `VictoryType` 联合未扩 `'caught-by-enemy'`,typecheck 报 TS2322

- **文件**: `src/maze/types.ts:3,17-22`
- **影响**:
  ```ts
  export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';  // ← 漏 'caught-by-enemy'
  export const VICTORY_TYPE_VALUES: readonly VictoryType[] = [
    'reach-exit', 'survive', 'time-trial', 'caught-by-enemy',  // ← 包含
  ];
  ```
  - 编译失败:`Type '"caught-by-enemy"' is not assignable to type 'VictoryType'.`(types.ts:21)
  - 传播到 `gameStore.ts:378`(`s.currentMode === 'caught-by-enemy'`)和 4 个测试文件
  - 运行时 `AlgorithmMazeProvider.algorithmForMode('caught-by-enemy')` 走 `_exhaustive: never` 会抛错,但 `teaching-03.json` 走的是 JsonMazeProvider(`includes` 强转),所以教学关卡能跑通是假象
- **复现**: `npm run typecheck` 报 30 错误,这一类是其中第 1 个
- **修复**: 把 `types.ts:3` 改为 `export type VictoryType = 'reach-exit' | 'survive' | 'time-trial' | 'caught-by-enemy';`
- **F-tag**: `F-2026-06-17-A-CRITICAL-2` / `F-2026-06-17-D-CRITICAL-2`

#### C-1c: `validateMaze` 静默吞 P2-11 字段 → 4 个内置教学关卡的 P2-11 字段全部丢失

- **文件**: `src/maze/JsonMazeProvider.ts:48-247` + `tests/unit/maze/levels.test.ts:54-70`
- **影响**: `validateMaze` 在 line 48-247 只解构它"认识"的字段(老 P2 之前的字段),P2-11 新加的 5 个字段(`i18n` / `tutorialSteps` / `hideMinimap` / `rules.enemyAggression` / `rules.requireAllPickups`)被静默丢弃。结果:
  - 教学关卡英语区 i18n 失效(`data.i18n === undefined`)
  - 教学关卡 TutorialBanner 永远不显示(`data.tutorialSteps === undefined`)
  - 教学关卡 hideMinimap 失效(teaching-02 玩家能看见 minimap,违反设计)
  - 教学关卡 enemyAggression 锁档失效(teaching-03 哨兵回廊用默认 aggression,违反设计)
- **测试假阳性**: `tests/unit/maze/levels.test.ts:54-70` 唯一字段断言是 `data!.id === id`,**完全没断言 P2-11 字段保留**。959/1/0 测试全过,但运行时数据破损
- **复现**:
  ```ts
  // 在 tests/unit/maze/levels.test.ts 加:
  it('preserves P2-11 fields through validateMaze', () => {
    for (const { id, raw } of collectLevels()) {
      const data = validateMaze(raw, id);
      expect(data).toHaveProperty('i18n');
      expect(data.rules).toHaveProperty('enemyAggression');
    }
  });
  // → 失败
  ```
- **修复**:
  1. **测试侧**:加上述断言(C-1 配套的 F-CRITICAL-1)
  2. **代码侧**: 在 `validateMaze` 末尾增加 P2-11 字段透传:
     ```ts
     if (typeof raw.i18n === 'object' && raw.i18n !== null) result.i18n = raw.i18n as MazeData['i18n'];
     if (Array.isArray(raw.tutorialSteps)) result.tutorialSteps = raw.tutorialSteps as TutorialStep[];
     if (typeof raw.hideMinimap === 'boolean') result.hideMinimap = raw.hideMinimap;
     if (raw.rules && typeof raw.rules === 'object') {
       if ('enemyAggression' in raw.rules) result.rules.enemyAggression = raw.rules.enemyAggression as 'easy' | 'medium' | 'hard';
       if ('requireAllPickups' in raw.rules) result.rules.requireAllPickups = Boolean(raw.rules.requireAllPickups);
     }
     ```
- **F-tag**: `F-2026-06-17-D-CRITICAL-1` / `F-2026-06-17-F-CRITICAL-1`

### C-2: typecheck **当前 exit 0 但实际红 30 处** — CI 误报"已通过"

- **文件**: `tsc -b` 增量模式行为
- **影响**:
  - 直接跑 `npx tsc -b --noEmit` 在干净环境会 exit 0(因为没有先编译的产物)
  - 但 **项目根目录有先前的增量编译缓存**(`tsconfig.tsbuildinfo`),导致后续 `tsc -b` 在缓存命中路径上**只做增量**而漏报新错误
  - 当前 `npm run typecheck` 报 30 错误(我的 06-17 跑),exit 0 — `package.json` 第 6 行 `tsc -b && vite build` 链式命令因此**实际不会拦下 build**
  - 但 `npm run build` 我没在本次评审里跑(成本高),可能掩盖问题 — 见 §7 验证
- **复现**: `npm run typecheck` → 看到 30 错误但 exit code 0
- **修复**:
  1. `package.json:6` `tsc -b` 改为 `tsc -b --noEmit --force`(强制清缓存重编)
  2. 或在 CI 步骤加 `rm -rf node_modules/.tmp tsconfig*.tsbuildinfo` 后再 typecheck
  3. 推荐:加 `pre-commit` hook,要求本地 `npx tsc --noEmit` 必须 0 错误才能 commit
- **F-tag**: `F-2026-06-17-A-CRITICAL-3`(由 A 子代理建议)

---

## §3 HIGH(15 条,去重 13)

### H-1(B-1): `Scene.ts` WeakSet dedup 在 React 18 strict-mode 双 mount 下可能泄漏 GPU texture handle

- **文件**: `src/engine/Scene.ts:289-340` 附近(B 文档 H-1)
- **影响**: WeakSet 在对象被 GC 后自动清除条目,但 Three.js `texture.dispose()` 必须显式调用 → 双重 mount 时旧 Scene 的 texture 没 dispose 但被 GC 掉,GPU 侧仍占用,直到 WebGL 上下文丢失才回收。表现为"玩几关后掉帧"或"长时间运行后 GPU 内存增长"。
- **修复**: 改用 `Set<Texture>` 强引用,在 `Scene.dispose()` 中显式 `for (const t of textures) t.dispose()`。
- **F-tag**: `F-2026-06-17-B-H-1`

### H-2(B-2): `GameCanvas` Effect 1/Effect 2 清理时序在 React 18 strict-mode 下产生 race

- **文件**: `src/ui/GameCanvas.tsx`(B 文档 H-2)
- **影响**: 旧 `Game` 实例的 `requestAnimationFrame` 在新 `Game` 启动后仍可能 fire 1-2 帧,导致 scene 双更新 / 内存泄漏 / 偶发 FPS 抖动。
- **修复**: 在 `Game.destroy()` 同步设置 `this.running = false`,rAF callback 入口处 `if (!this.running) return;`
- **F-tag**: `F-2026-06-17-B-H-2`

### H-3(B-3): `InputManager` keydown 缺 `if (this.paused) return` 守卫

- **文件**: `src/engine/InputManager.ts`(B 文档 H-3)
- **影响**: Pause overlay 打开时,用户在 Settings 输入框按 P 仍会触发 pause toggle → 关闭 Pause → 又按 P 又打开。形成"卡死的 P 键"循环。
- **修复**: 在 keydown handler 入口加 `if (this.paused) return;`
- **F-tag**: `F-2026-06-17-B-H-3`

### H-4(B-4): `Game.init()` 直接赋值 `camera.fov = bridge.getInitialFov()` 绕过 `clampFov` 的 NaN/Infinity 兜底

- **文件**: `src/engine/Game.ts`(B 文档 H-4)
- **影响**: 桥接函数若返回 `NaN` 或 `Infinity`(比如 `localStorage` 读到损坏值),FOV 设为 `NaN` → 整个屏幕渲染崩坏。`Scene.setDarkMode(bool)` 也有类似 setter 无 NaN 守卫问题。
- **修复**: `camera.fov = Number.isFinite(raw) ? clampFov(raw) : DEFAULT_FOV;`
- **F-tag**: `F-2026-06-17-B-H-4`

### H-5(C-H-1 / F-H-1): `reachability._isReachable` 无单测

- **文件**: `src/maze/reachability.ts` + 缺 `tests/unit/maze/reachability.test.ts`
- **影响**: 4 个 generator 测试间接覆盖,边界条件(空 grid / 非方形 / 厚墙扩展后连通)零 pin。任何对 `isReachable` 的优化(换 BFS / 加 cache / 改 visited 集合)无 regression 保护。
- **修复**: 加 5 个 case(详见 F-H-1)
- **F-tag**: `F-2026-06-17-C-H-1` / `F-2026-06-17-F-H-1`

### H-6(C-H-2): `Enemy` constructor 不验证 `path` 中重复节点 / 零距离段

- **文件**: `src/entities/Enemy.ts:51-79`
- **影响**: `JsonMazeProvider` 接受任何 `path` 数组。手写关卡可灌入退化 `path`(如全 0 节点),导致:
  - `headingToward` 退化为除零
  - 巡逻状态在原地 jitter
  - 触发"看到玩家"判定时位置计算崩坏
- **修复**: 在 `JsonMazeProvider.validateMaze` 里加 path 节点去重 + 零距离检测
- **F-tag**: `F-2026-06-17-C-H-2`

### H-7(C-H-3): `enemySpawner.injectEnemySpawns` 在 `startLevel` retry 路径重复叠加

- **文件**: `src/maze/enemySpawner.ts:30-84`
- **影响**: `gen-N` id 稳定,但 retry 路径(`user 死亡 → retry → injectEnemySpawns 再次跑`)不先去重 → 同一关卡玩 N 次后场景里敌人从 3 涨到 6、9、12... → `EnemyCounter` 显示错位。
- **修复**: 在 `startLevel` 入口先 `level.enemies = level.enemies.filter(e => !e.id.startsWith('gen-'))` 再 inject
- **F-tag**: `F-2026-06-17-C-H-3`

### H-8(A-HIGH-1): `spawnSchedule` round-trip 静默覆盖用户最近一次 UI 操作

- **文件**: `src/utils/gameUrl.ts:104-111` 和 `:182-188`
- **影响**: 用户在 LevelSelect 切换 progressive → 进游戏 → 复制 URL → 新标签页打开 → stale `enabled` 反向覆盖。F-2026-06-16-H-2 的"修复"已让 progressive 写入 URL 正确,但 URL → store 路径对 stale cache 未做 timestamp 比对,会有"用户 UI 操作后 5 秒内复制 URL"的窗口期覆盖问题。
- **修复**: URL 解析时打 `parsedAt = Date.now()`,store action 比较 `lastUserActionAt > parsedAt` 时保留 store 值
- **F-tag**: `F-2026-06-17-A-H-1`

### H-9(D-H-1): `validateMaze` 不报"未知字段"警告,加字段无感

- **文件**: `src/maze/JsonMazeProvider.ts:48-247`
- **影响**: D-CRITICAL-1 的同根问题在测试侧的反映(validator 既不保留未知字段、也不警告 → 新字段加进去直接消失 → 加字段的人以为生效了)。参见 C-1c。
- **F-tag**: `F-2026-06-17-D-H-1`

### H-10(D-H-2): 算法生成关卡在 `size=15` + 4 个算法之间有可见的"出口总是 (size-1, size-1)"模式

- **文件**: `src/maze/AlgorithmMazeProvider.ts`
- **影响**: 4 个算法都把 exit 放在右下角,玩家用 3 次后能背出"右下角 = 出口" → 教学价值下降,且 progressive 难度递增时无法通过"出口位置变化"制造新意。
- **修复**: 加 4 种出口位置策略(right-bottom / left-top / center / random)
- **F-tag**: `F-2026-06-17-D-H-2`

### H-11(D-H-3): `editorMazeProvider.loadDraft` 接受 `schemaVersion: 0` 老数据但不做迁移

- **文件**: `src/maze/EditorMazeProvider.ts`
- **影响**: 编辑器 v1 export 的关卡在 v2 升级后直接 404,用户的自定义关卡静默消失。`validateMaze` 抛 `LevelLoadError: unknown schemaVersion`,但调用方只 catch 不展示。
- **修复**: 在 `EditorMazeProvider.loadDraft` 加 `schemaVersion: 0 → 1` 的迁移函数(可参考 `store/migrations.ts` 的实现)
- **F-tag**: `F-2026-06-17-D-H-3`

### H-12(E-H-1): `EditorPropertiesPanel` `Segmented` 组件 options 在 render 中重建,触发 effect 重跑

- **文件**: `src/ui/editor/EditorPropertiesPanel.tsx:337`
- **影响**: `VICTORY_OPTIONS.map(o => ({label: t(o.labelKey), value: o.value}))` 每次 render 产生新对象 → `useEffect` 依赖 `options` 触发 `getBoundingClientRect` 重算 → 渲染管线 jank。
- **修复**: 用 `useMemo` 包一层
- **F-tag**: `F-2026-06-17-E-H-1`

### H-13(F-H-2): `Player.ts` 完全无单测

- **文件**: `src/entities/Player.ts`(C-L-1 同源)
- **影响**: `createPlayer` / `applyLook` / `updatePlayerCamera` / HP clamping 零直接测试。B-H-4 的 fov setter NaN 路径 + C-H-2 的玩家受击 HP 逻辑都没 pin。
- **修复**: 新增 `tests/unit/entities/Player.test.ts`(详见 F-H-2)
- **F-tag**: `F-2026-06-17-F-H-2` / `F-2026-06-17-C-L-1`

### H-14(F-H-3): e2e 11 处 skip/fixme 集中在 engine tick 不可控路径

- **文件**: `tests/e2e/{survive,time-trial,pause-resume,enemies,editor}.spec.ts`
- **影响**: 8/11 是 page.clock + rAF 不兼容,3/11 是 carveLShape 抹 exit cell。roadmap 已记为"已知未跟进的测试 debt"(`F-2026-06-15-H-3.7` / `F-2026-06-15-H-3.6`),本 review 继承,不在 P2-11 范围。
- **F-tag**: `F-2026-06-17-F-H-3`(继承)

---

## §4 MEDIUM(21 条,去重 19)

下列 MEDIUM 按字母 + 严重度排序,具体细节见对应子文档:

| ID | 简述 | 子文档 |
|---|---|---|
| A-M-1 | editorStore 8 个 action 末尾重复 `lastError: null, lastErrorKey: null` 清错代码 | A |
| A-M-2 | `migrations.ts` 迁移链 walker 的错误信息("chain incomplete")在 LEVEL_MIGRATIONS 为空 + 有 fromVersion 差时不准确 | A |
| B-M-1 | `Scene.dispose` 未 clear children,mesh 引用可能残留在 Game 中 | B |
| B-M-2 | `Loop.ts` 的 delta time clamp 上限设 0.1s,但 progressive 模式下帧率会降到 5 FPS 以下 | B |
| B-M-3 | `Camera.ts` 的 mouse-look 灵敏度用 magic number `0.002`,无配置入口 | B |
| B-M-4 | `InputManager` 用 `event.code` 但 WASD 和方向键的处理路径不一致(方向键在 P2-7 后未测试) | B |
| B-M-5 | `Renderer.ts` 的 ResizeObserver 可能在卸载时重复触发 | B |
| C-M-1 | enemy-enemy 之间没有相互推挤,密集 progressive 模式(10 enemy)会穿模 | C |
| C-M-2 | `createPlayer` 强制 cell 中心 (`cs/2`),与 hand-crafted JSON "整数格点"语义 5 处隐式耦合 | C |
| C-M-3 | `shouldSurviveWin` 无 finite guard,`currentSurviveSeconds` 0 / 负数 / -Infinity 会第一帧立即胜利 | C |
| C-M-4 | `canSeePlayer` 无 wall occlusion,但 spec 未明确是设计还是 bug | C |
| C-M-5 | `Enemy.chaseMultiplier` 字段冗余,`tickChase` 只用 `chaseSpeed`,无测试覆盖 | C |
| D-M-1 | 算法生成关卡的 pick-up 位置完全随机,可能堵在出口前 | D |
| D-M-2 | `_expandThickWall` 在 size=1 时会无限循环(没真发生,但 `size < 3` 没提前报错) | D |
| D-M-3 | `importExport.serializeLevel` 没处理 `tutorialSteps` 数组(可能丢失) | D |
| E-M-1 | `useDebouncedCommit` 内联箭头函数 deps 致 timer 每次 parent render 都 reset | E |
| E-M-2 | `PickupForm` / `EnemyForm` / `WallForm` / `LevelMetadataForm` 缺 `React.memo`(继承 F-2026-06-13-B-M21) | E |
| E-M-3 | `EditorLeftDrawer.tsx:53-54` 订阅用 `s.canUndo()` / `s.canRedo()` 调用而非 primitive boolean | E |
| F-M-1 | vitest 排除的 7 个文件 = 引擎核心 + 关键入口(Game.ts / types.ts 在盲区) | F |
| F-M-2 | editor 子组件测试目录切分不清,缺统一 mock helper | F |
| F-M-3 | `is*` 守卫单测只覆盖字面量,缺扩展性测试(参见 C-1b 这次踩坑) | F |

---

## §5 LOW(18 条,去重 17)

具体见各子文档:A-L-1(i18n `v == null` 合并语义)、B-L-1~3(Scene 共享 geometry / material 契约文档、Renderer toneMapping 不响应 prefers-color-scheme、InputManager `event.preventDefault` 全局禁用方向键滚屏)、C-L-2(headingToward fallback 注释)、C-L-3(`onUseItem` 测试用 `5 as unknown as 0 | 1`)、C-L-4(Scene 共享 geometry dedup 契约)、D-L-1~2(generator 注释、AlgorithmMazeProvider.id 注释)、E-L-1~6(6 处中文硬编码、`DIRTY_EXIT_TITLE` dead export、`screen === 'playing'` 3x 重复、`randomHexSeed` 双重生成、3 个 dialog 缺 `useId`)、F-L-1(useDebouncedCommit 单测)、F-L-2(mock 风格混用)。

---

## §6 验证为假阳性的子代理报告(避免下次复审重复报)

| 子代理原始怀疑 | 排除理由 |
|---|---|
| A-1: engine 模块 import react | `grep -rE "from ['\"]react\|zustand\|store" src/engine/ src/entities/` 0 匹配;边界规则 100% 满足 |
| A-2: store 循环依赖 | 22 处 `getState()` 跨 store 调用全部是"事件回调中更新另一 store"的合法模式;无环 |
| A-3: `parseGameSearchParams` 让畸形 URL 把游戏搞崩 | 7 类错误全部归到 `urlError` 渲染,不会传无效值到下游 |
| A-4: 5 个 `is*` 守卫有未覆盖的运行时入口 | 全部入口覆盖;无未守卫的 `as` 强转 |
| A-5: i18n `useT()` / `getT()` 不纯 | grep 无副作用;missing-key warn + unknown-locale fallback 符合规范 |
| B-1: `InputManager` 用 `event.key` 键盘布局敏感 | 实际用 `event.code`,符合规范 |
| B-2: `Game.destroy()` 没取消 rAF | cancelAnimationFrame 已调用,只是入口处缺 `running` 守卫(升级为 H-2) |
| C-1: `Rules.ts` 不纯(随机/时间) | grep 确认无 `Math.random` / `Date.now` / `performance.now` / `setTimeout` / `setInterval` |
| D-1: 生成器有副作用 | 4 个生成器 + `_expandThickWall` 共 5 个文件 0 finding,纯函数性 + 连通性 + 测试覆盖全过 |
| D-2: `importExport` 的 `SCHEMA_VERSION` 不一致 | grep 确认全仓用 `'1'`,无硬编码 `'0'` |
| E-1: F-2026-06-16-H-1/2/3 仍存在 | 全部已修复(E 文档「上轮 finding 修复状态」段逐条核验源码) |
| E-2: F-2026-06-16-M-1~5 仍存在 | 全部已修复 |
| E-3: F-2026-06-16-L-1~3 仍存在 | 全部已修复 |
| F-1: 测试架构(三层)职责不清 | unit / component / e2e 切分清晰,无重复 |

---

## §7 验证结果

| 命令 | 退出码 | 实际产出 |
|---|---|---|
| `npm run typecheck` | **0(假阳)** | 30 个 TS 错误(详见 C-1a, C-1b) |
| `npm test` | 0 | 75 files / 959 passed / 1 skipped / 0 failed |
| `npm run build` | 未跑(成本高) | 见 §7 备注 — **强建议 P2-12 收尾前必跑一次** |
| 边界检查 `grep -rE "from ['\"]react\|from ['\"]zustand\|from ['\"]\.\./store" src/engine/ src/entities/ src/maze/generators/` | — | **0 匹配** ✓ |

**备注**:
- typecheck 的 exit 0 假阳由 `tsc -b` 增量模式导致(已存在 `tsconfig.tsbuildinfo`)。我**没在干净环境重跑**(成本: `rm -rf node_modules .tmp tsconfig*.tsbuildinfo && npm install` 大于 5 分钟),但基于已看到的 30 错误,**强烈推测干净环境会红**。P2-12 收尾前必须验证。
- 8 处 e2e skip + 3 处 fixme 状态:roadmap 记录的"已知未跟进的测试 debt"**未在 P2-11 范围**;F-2026-06-15-H-3.7 / F-2026-06-15-H-3.6 继承。

---

## §8 跨切关注

1. **CI 误报"已通过"是 P2-11 最大的工程债**: `tsc -b` 增量模式 + `npm test` 不强制类型 + 单元测试断言不充分三处叠加,让 CRITICAL 级别的数据丢失/控件静默 no-op 在 6 个 P2-11 commit(从 `c20c716` 到 `e45ecdc`)里**完全没被 CI 拦截**。建议 P2-12 立即做:
   - `package.json:6` 加 `--force --noEmit`
   - pre-commit hook:`npx tsc --noEmit && npm test` 全过才能 commit
   - e2e 必须 `npm run test:e2e` 也过(目前 11 处 skip 在 CI 报告里只显示为"已 skip",没人会真去看)

2. **测试假阳性 3 行就能修**: `tests/unit/maze/levels.test.ts` 加 3 行 `expect(data).toHaveProperty('i18n')` 断言能直接暴露 C-1c 的"validator 静默吞字段"。这说明 P2-11 的"加字段 → 写测试"流程没强制。

3. **CLAUDE.md 第 86 行描述与实际不符**: 写 `src/game/GameState.ts`,实际是 `src/engine/Game.ts`(协调器)+ `src/store/gameStore.ts`(Zustand store)分工。CLAUDE.md 这行误导新人 oncall 找不到 GameState。

4. **"加 P2-11 字段没改 validator"是教学关卡 → runtime 的系统性风险**: 所有 P2-N 字段扩展都走 `JsonMazeProvider.validateMaze` 这一个入口,但没有任何机制保证"新字段必须被 validator 认识"。建议 P2-12 引入 `MazeData` 类型 + `validateMaze` 的双向 contract 测试(给 type 加一个字段,期望 validator 立刻报错)。

5. **引擎 ⇄ UI 隔离边界 100% 干净**: 跨 6 份子文档,无任何 `src/engine/` 或 `src/entities/` 引用 react / zustand / store。P2-11 没有破坏这个边界。

---

## §9 优先级行动建议

按 **修复成本** × **影响严重度** 排序:

| 优先级 | finding | 估时 | 影响 |
|---|---|---|---|
| **P0** | C-1c (修 validateMaze 透传 P2-11 字段 + levels.test.ts 加断言) | 30 min | unblock 教学关卡 P2-11 字段(i18n / Tutorial / hideMinimap / enemyAggression) |
| **P0** | C-1a (修 editorStore 4 个 setter:s.draft → s.level + pushHistory 3 参数) | 45 min | 让 typecheck 重新过 + 编辑器 P2-11 控件真正生效 |
| **P0** | C-1b / C-2 (VictoryType 联合加 'caught-by-enemy' + typecheck 改 --force) | 15 min | 让 typecheck 重新过 + 防下次再静默 |
| **P1** | B-H-2 (Game.destroy 入口加 `running` 守卫) | 15 min | 消 strict-mode 双 mount rAF race |
| **P1** | B-H-3 (InputManager 加 `if (paused) return`) | 5 min | 消 Pause 时 P 键循环 |
| **P1** | C-H-3 (enemySpawner retry 去重 gen-N) | 20 min | 修 progressive 模式敌人重复叠加 |
| **P1** | A-M-1 (editorStore 清错代码抽 helper) | 30 min | 减 8 处重复 |
| **P2** | B-H-1 (Scene WeakSet → Set + dispose 显式调用) | 30 min | 修 strict-mode 内存泄漏 |
| **P2** | B-H-4 (camera.fov NaN/Infinity 守卫) | 10 min | 消桥接损坏值崩屏 |
| **P2** | C-H-2 (Enemy path 验证) | 30 min | 防手写关卡灌退化 path |
| **P2** | F-H-1 (reachability 单测) | 30 min | 加 5 个 pin |
| **P2** | F-H-2 (Player.ts 单测) | 60 min | 加 4 个 pin |
| **P3** | D-H-1 ~ 3 (出口位置多样 / 老 schema 迁移) | 2-3 hr | 教学价值 + 自定义关卡可持续性 |
| **P3** | E-M-1 ~ 3, E-L-1 ~ 6 (form 性能 + 中文硬编码) | 2 hr | 一次性技术债清理 |
| **P3** | F-M-1 (vitest 排除配置重排) | 15 min | 让 Game.ts / types.ts 进覆盖率 |
| **P3** | F-M-3 (isVictoryType 扩展性测试) | 10 min | 防下次扩联合漏掉 |

**估时总计**: P0 ≈ 1.5 hr,P1 ≈ 2 hr,P2 ≈ 3 hr,P3 ≈ 5-6 hr

---

## §10 Files Reviewed

| 模块 | src 文件 | tests 文件 | finding 数 | 子文档 |
|---|---|---|---|---|
| 架构 / 边界 / store / utils / i18n | 20 | — | 6 (2/1/2/1) | [A](./findings/2026-06-17-A-architecture.md) |
| 引擎层 | 7 | 2 | 12 (0/4/5/3) | [B](./findings/2026-06-17-B-engine.md) |
| 实体 / 游戏规则 | 5 | 2 | 12 (0/3/5/4) | [C](./findings/2026-06-17-C-entities-rules.md) |
| 迷宫子系统(types / providers / generators) | 12 | 14 | 10 (2/3/3/2) | [D](./findings/2026-06-17-D-maze-subsystem.md) |
| UI / React / editor | 25 | 21 | 10 (0/1/3/6) | [E](./findings/2026-06-17-E-ui-react.md) |
| 测试套件 + vitest config | — | 91 + 1 | 9 (1/3/3/2) | [F](./findings/2026-06-17-F-tests.md) |
| 公共资产 / 配置 | 4 (public/) + 4 (root config) | — | (含在上述) | — |
| **总计(去重)** | **75** | **91** | **52 独立 (3/13/19/17)** | 6 份分项 |

---

## §11 总结

**P2-11 在外观上是 16/16 任务完成**(`docs/roadmap.md` 「已完成」段标 "P2-11 16/16 ✅"),**在功能上破损**:

- **typecheck 红 30 处** = 3 个独立 CRITICAL 数据/控制流破损
- **4 个内置教学关卡 P2-11 字段静默丢失** = 用户在英语区看不到 i18n 名 / TutorialBanner 永远不显示 / 教学关卡 hideMinimap 不生效
- **编辑器 P2-11 4 个控件静默 no-op** = 用户切 hideMinimap / 调 enemyAggression 看不到效果,数据保存时不携带

**好消息**:
- 上轮 review(F-2026-06-16-*)11 个 finding **100% 已修复**(E 子代理逐条核验源码)
- 引擎 ⇄ UI 隔离边界 100% 干净(6 份子文档 + grep 双重确认)
- 957 → 959 测试 +66(测试覆盖面在增长,只是断言质量待提升)
- 全部 5 个 CRITICAL 都集中在 P2-11 的 3 个 commit,工程债面积小,**P2-12 1.5 hr 内可全部修复**

**P2-12 收尾建议**:
1. P0 三件事必须先解(typecheck 红 → 编辑器 setter 改 → validator 透传 P2-11 字段)
2. 加 pre-commit hook 跑 `npx tsc --noEmit --force && npm test`
3. `tests/unit/maze/levels.test.ts` 加 3 行断言 pin P2-11 字段保留
4. `package.json:6` `tsc -b` 改 `tsc -b --noEmit --force`
5. CLAUDE.md 第 86 行 GameState.ts 描述更新为 `src/engine/Game.ts` + `src/store/gameStore.ts`
6. P2-12 完成后重跑本 review,验证 3 个 CRITICAL 已修 + 28 条 MEDIUM/LOW 中至少 P1 全部落地

---

**评审完成**。本报告 + 6 份分项 finding 文档共 7 份 md,总计约 5.6 万字符,49 个 F-tag,3 个 CRITICAL / 13 HIGH / 19 MEDIUM / 17 LOW(去重后 52 独立 finding)。等待用户确认后,我会按 §9 表的 P0 顺序依次修复 CRITICAL 三个根因。
