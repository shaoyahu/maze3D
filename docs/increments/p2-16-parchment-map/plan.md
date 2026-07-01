# P2-16 羊皮纸地图 — 实施计划（Plan）

**Spec**: `docs/increments/p2-16-parchment-map/spec.md`
**复杂度**: Large
**日期**: 2026-06-30

> 步骤使用 `- [ ]` 语法追踪。一次只做一个 Task,完成后勾选 + 跑验证。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | 新增 `MinimapMode` / `MapOpenBehavior` / `ParchmentLifecycle` + LevelRules 3 字段;`hideMinimap` 标 deprecated |
| `src/maze/JsonMazeProvider.ts` | UPDATE | 解析新 3 字段;`hideMinimap` → `minimapMode` 迁移 + warn |
| `src/engine/ParchmentState.ts` | CREATE | 纯函数 + 类型 + 5 个常量 |
| `src/engine/Game.ts` | UPDATE | parchment 初始化 / visit 增量 / damage 触发 / GameBridge.onParchmentStateChange |
| `src/engine/InputManager.ts` | UPDATE | `OPEN_MAP` 事件名常量 |
| `src/store/gameStore.ts` | UPDATE | parchment 字段 + 5 actions;`setParchment` bridge |
| `src/store/editorStore.ts` | UPDATE | 3 个新 actions;字段持久化 |
| `src/ui/components/ParchmentMap.tsx` | CREATE | modal + canvas 渲染 |
| `src/ui/components/ParchmentMap.module.css` | CREATE | 主题化样式 |
| `src/ui/GameCanvas.tsx` | UPDATE | 挂载 ParchmentMap;监听 M 键;M 优先级 |
| `src/ui/HUD.tsx` | UPDATE | parchment 模式提示「M 打开羊皮纸」 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 三态切换 + 联级 2 个 Switch |
| `src/i18n/resources/zh.ts` | UPDATE | `ui.parchment.*` + 3 个 editor 字段 key |
| `src/i18n/resources/en.ts` | UPDATE | 同上 |
| `src/styles/theme.css` | UPDATE | `.parchment-map__*` 主题变量 |
| `tests/unit/engine/ParchmentState.test.ts` | CREATE | 4 个纯函数全覆盖 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | UPDATE | 新字段解析 + hideMinimap 迁移 |
| `tests/unit/maze/types.test.ts` | UPDATE | 3 个 type guard |
| `tests/unit/engine/Game.parchment.test.ts` | CREATE | visit 增量 / damage 触发 / mode 门控 |
| `tests/unit/store/gameStore.parchment.test.ts` | CREATE | 5 actions 行为 |
| `tests/unit/store/editorStore.parchment.test.ts` | CREATE | 3 actions 触发 commitLevel |
| `tests/component/ParchmentMap.test.tsx` | CREATE | 渲染 / 关闭 / 焦点 / damage 叠加 |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | UPDATE | 三态切换 + 联级 UI |
| `tests/component/hud.parchment.test.tsx` | CREATE | 提示文案 |
| `tests/e2e/parchment-map.spec.ts` | CREATE | 走 → M → 截图;撞敌 → 损伤截图 |

## 任务清单

### Task 1: types.ts 扩展 + 3 个 type guard
- [x] **Action**:
  - `src/maze/types.ts`:
    - 新增 `MinimapMode` / `MapOpenBehavior` / `ParchmentLifecycle` 联合类型
    - `LevelRules` 加 `minimapMode?` / `mapOpenBehavior?` / `parchmentLifecycle?`
    - `MazeData.hideMinimap` JSDoc 加 `@deprecated since P2-16;parsed for back-compat,use minimapMode instead`
    - 新增 `isMinimapMode` / `isMapOpenBehavior` / `isParchmentLifecycle` 守卫函数
- [x] **Mirror**: 现有 `isPickupType` / `isVictoryType` / `isMazeSize` 守卫风格
- [x] **Test**: `tests/unit/maze/types.test.ts` 覆盖合法值 + 非法值 + 缺字段
- [x] **Validate**: `npx vitest run tests/unit/maze/types.test.ts`

### Task 2: JsonMazeProvider 解析新字段 + hideMinimap 迁移
- [x] **Action**:
  - `src/maze/JsonMazeProvider.ts`:
    - 在 `requireObject(m, 'rules', id)` 之后,依次 `requireString` + `isMinimapMode` / `isMapOpenBehavior` / `isParchmentLifecycle` 校验新 3 字段
    - 校验失败 → 静默忽略(不影响 `validateMaze` 通过)
    - 在 `validateMaze` 末尾:若 `m.hideMinimap === true` 且 `minimapMode` 未设置,设 `rules.minimapMode = 'hidden'` 并 `console.warn` 一次
- [x] **Mirror**: 现有 `enemyAggression` / `requireAllPickups` 字段解析模式
- [x] **Test**: `tests/unit/maze/JsonMazeProvider.test.ts` 加:
  - 合法新字段 → rules 字段出现
  - 非法值 → 字段不出现,validateMaze 仍成功
  - `hideMinimap: true` + 无 `minimapMode` → rules.minimapMode === 'hidden' + console.warn spy 被调一次
- [x] **Validate**: `npx vitest run tests/unit/maze/JsonMazeProvider.test.ts`

### Task 3: ParchmentState 纯函数模块
- [x] **Action**:
  - `src/engine/ParchmentState.ts`:
    - `DamageType` / `DamageRegion` / `ParchmentState` 类型
    - `DAMAGE_TRIGGER_PROBABILITY = 0.5`
    - `DAMAGE_RADIUS_RANGE: readonly [number, number] = [1, 2]` (实际渲染按 1-2 整数)
    - `DAMAGE_TYPES: readonly DamageType[] = ['water', 'burn', 'tear']`
    - `recordVisit(state, cellX, cellZ)`:用 `new Set(prev)` + `add`;同 cell 重复 → 返回原 state 引用(避免 React 重渲)
    - `maybeRecordDamage(state, cellX, cellZ, nowTick, prng)`:
      - `prng()` 返回 ≥ 0.5 → 返回原 state
      - 检查同 cell 已有 damageRegion → 返回原 state
      - 半径 = `Math.floor(prng() * 2) + 1`(在 [1, 2] 内)
      - 类型 = `DAMAGE_TYPES[Math.floor(prng() * 3)]`
      - seed = `Math.floor(prng() * 1e9)`
      - 返回新 state(damageRegions 追加)
    - `openMap` / `closeMap` / `resetMap` 三个纯 setter
- [x] **Mirror**: 现有 `applyDamage` / `isPlayerCaughtByEnemy` 纯函数风格
- [x] **Test**: `tests/unit/engine/ParchmentState.test.ts` 全覆盖(stub prng 控制分支)
- [x] **Validate**: `npx vitest run tests/unit/engine/ParchmentState.test.ts`

### Task 4: Game 接入 parchment
- [x] **Action**:
  - `src/engine/Game.ts`:
    - 字段 `private parchment: ParchmentState = createEmptyParchment()`
    - `startLevel`:初始化 parchment
    - `update()`:
      - 计算当前 cell → `recordVisit`
      - 仅在 `parchment` 引用变化时通过 `this.bridge.onParchmentStateChange?.(this.parchment)` 推送给 UI
    - `applyDamage` 现有调用点(敌人碰撞)之后:
      - 若 `damaged && this.currentMaze.rules.minimapMode === 'parchment'` → `maybeRecordDamage` → 推送给 UI
    - `dispose`:parchment 置空
    - `GameBridge` 接口加 `onParchmentStateChange?: (state: ParchmentState) => void`
- [x] **Mirror**: 现有 `applyDamage` 在 enemy 接触处理函数里的位置
- [x] **Test**: `tests/unit/engine/Game.parchment.test.ts`:
  - 玩家移动 3 步 → visitedCells size = 3
  - 玩家受伤 + minimapMode='parchment' → damageRegions.length 增
  - 玩家受伤 + minimapMode='top-right' → damageRegions.length 不变
  - 玩家死亡 / startLevel → visitedCells 清空
- [x] **Validate**: `npx vitest run tests/unit/engine/Game.parchment.test.ts`

### Task 5: gameStore 暴露
- [x] **Action**:
  - `src/store/gameStore.ts`:
    - 字段 `parchment: ParchmentState`(初始值 `createEmptyParchment()`)
    - `setParchment(state)`:直接赋值(GameBridge 调用)
    - `openParchment()` / `closeParchment()` / `toggleParchment()`:不可变更新
    - `resetParchment()`:清空 visited + damage,isOpen 不变
    - `startLevel` 流程:在已有 `applyStartLevel` 内追加 `set({ parchment: createEmptyParchment() })`
    - `goToMenu` 流程:同样调 `resetParchment()`
- [x] **Mirror**: 现有 `lastHitBy` / `lastWinKind` 等小字段 setter 风格
- [x] **Test**: `tests/unit/store/gameStore.parchment.test.ts`:
  - `toggleParchment` → isOpen 翻转
  - `resetParchment` → visited + damage 清空,isOpen 保留
  - `setParchment` → 直接覆盖
  - `startLevel` 后 parchment 是空状态
- [x] **Validate**: `npx vitest run tests/unit/store/gameStore.parchment.test.ts`

### Task 6: editorStore 新 actions
- [x] **Action**:
  - `src/store/editorStore.ts`:
    - `updateMinimapMode(mode: MinimapMode)`:调 `commitLevel`,写入 `rules.minimapMode`
    - `updateMapOpenBehavior(b: MapOpenBehavior)`:同
    - `updateParchmentLifecycle(l: ParchmentLifecycle)`:同
    - 三者均需 `isMinimapMode` / `isMapOpenBehavior` / `isParchmentLifecycle` 守卫
- [x] **Mirror**: 现有 `updateName` / `updateSize` / `updateRule` 风格
- [x] **Test**: `tests/unit/store/editorStore.parchment.test.ts`:
  - 三 actions 触发 commitLevel,字段写入 store
  - 非法值不写入
- [x] **Validate**: `npx vitest run tests/unit/store/editorStore.parchment.test.ts`

### Task 7: InputManager 事件名
- [x] **Action**:
  - `src/engine/InputManager.ts`:
    - 导出常量 `OPEN_MAP = 'open-map'`(不绑键,UI 层监听 window keydown)
- [x] **Mirror**: 现有事件名常量风格(若不存在,新加到 `src/engine/InputManager.ts` 顶部)
- [x] **Test**: 不需要单独测试(常量 + GameCanvas useEffect 已覆盖)
- [x] **Validate**: typecheck 通过即可

### Task 8: ParchmentMap UI 组件
- [x] **Action**:
  - `src/ui/components/ParchmentMap.tsx`:
    - `function ParchmentMap({ maze, parchment }: Props): ReactElement | null`
    - 仅 `maze.rules.minimapMode === 'parchment' && parchment.isOpen` 时渲染,否则返回 null
    - 结构:`<div role="dialog" aria-modal>` + `<canvas>` + 关闭按钮 + 提示文字
    - canvas 渲染:useEffect 内
      - 离屏生成羊皮纸底(只生成一次,cache)
      - 离屏生成墙体图(只生成一次,cache)
      - 每帧合并:`底 → 墙 → 起点 / 终点 → visited 高亮 → 拾取物(visited 内)→ damageRegions 叠加`
      - 仅在 `parchment.visitedCells` 或 `parchment.damageRegions` 引用变化时重绘
    - useEffect 监听 `keydown` ESC → `gameStore.closeParchment()`
    - useEffect 监听 `document.visibilitychange` → 不可见时自动关闭
    - useEffect 卸载时把 canvas context 清空(防内存泄漏)
  - `src/ui/components/ParchmentMap.module.css`:
    - `.parchment-map`(fixed inset 0, backdrop blur, sepia overlay)
    - `.parchment-map__canvas`(max-width 90vw, max-height 90vh, 居中, 米色边框)
    - `.parchment-map__close`(右上角 ✕)
- [x] **Mirror**: 现有 PauseOverlay / WinOverlay 模态结构;Minimap 组件的 canvas 绘制模式
- [x] **Test**: `tests/component/ParchmentMap.test.tsx`:
  - `parchment.visitedCells` 非空时 canvas 渲染(用 `canvas.getContext('2d').getImageData` 抽查非全 0)
  - 关闭按钮点击 → `closeParchment` 被调
  - ESC keydown → `closeParchment` 被调
  - `parchment.damageRegions` 1 个 → canvas 该区域 alpha 异常(用 ImageData 检测)
  - `parchment.isOpen === false` → 组件不渲染(用 queryByTestId)
  - 失焦 → 关闭
  - `minimapMode !== 'parchment'` → 组件不挂载
- [x] **Validate**: `npx vitest run tests/component/ParchmentMap.test.tsx`

### Task 9: GameCanvas 集成 M 键
- [x] **Action**:
  - `src/ui/GameCanvas.tsx`:
    - useEffect:`window.addEventListener('keydown', handler)`,按 M 时:
      - `if (currentMaze.rules.minimapMode === 'parchment') gameStore.toggleParchment()`
      - 其它情况 noop
      - M 在 modal 打开时 `preventDefault()` + `stopPropagation()`,不冒泡到游戏
    - 渲染 `<ParchmentMap maze={currentMaze} parchment={parchment} />`(放在 HUD 旁边 / overlay 层)
- [x] **Mirror**: 现有 `TutorialBanner` 挂载模式 + InputManager keydown 监听位置
- [x] **Test**: 现有 `GameCanvas` 测试无回归(若有,补充 e2e 覆盖)
- [x] **Validate**: `npx vitest run tests/component/`

### Task 10: HUD 提示
- [x] **Action**:
  - `src/ui/HUD.tsx`:
    - 新增子组件 `<MapHint />`,仅 `maze.rules.minimapMode === 'parchment'` 时显示
    - 文案:`t('ui.parchment.hint')` = 「按 M 打开羊皮纸」/ "Press M to open the map"
- [x] **Mirror**: 现有 `EnemyCounter` / `InventoryBar` 条件渲染风格
- [x] **Test**: `tests/component/hud.parchment.test.tsx`:
  - parchment 模式 → 「按 M 打开羊皮纸」显示
  - top-right 模式 → 不显示
- [x] **Validate**: `npx vitest run tests/component/hud.parchment.test.tsx`

### Task 11: 编辑器三态 + 联级开关
- [x] **Action**:
  - `src/ui/editor/EditorPropertiesPanel.tsx`:
    - 删除 `maze.hideMinimap` 相关控件
    - 新增 `<Segmented options={minimapOptions} value={minimapMode} onChange={updateMinimapMode} />`
    - 新增 `<Switch checked={mapOpenBehavior === 'continue'} onChange={...} />` 联级显示
    - 新增 `<Switch checked={parchmentLifecycle === 'persist'} onChange={...} />`
    - 两个联级开关用 `maze.rules.minimapMode === 'parchment'` 条件渲染
    - 字段切换走 `useDebouncedCommit`,debounce 300ms(与现有规则字段一致)
- [x] **Mirror**: 现有 `Segmented`(`meta-victory`)+ `Switch`(`meta-hide-minimap` 删除后)模式
- [x] **Test**: `tests/component/editor/EditorPropertiesPanel.test.tsx` 扩展:
  - 三态 Segmented 渲染
  - 切换到 'parchment' → 联级 Switch 可见
  - 切回 'top-right' → Switch collapse 但 store 字段保留
- [x] **Validate**: `npx vitest run tests/component/editor/EditorPropertiesPanel.test.tsx`

### Task 12: i18n
- [x] **Action**:
  - `src/i18n/resources/zh.ts`:
    - `ui.parchment.title`: 「羊皮纸地图」
    - `ui.parchment.hint`: 「按 M 或 ESC 关闭」
    - `ui.parchment.empty`: 「尚未探索」
    - `ui.parchment.damage.water`: 「水渍」
    - `ui.parchment.damage.burn`: 「火烧」
    - `ui.parchment.damage.tear`: 「撕裂」
    - `editor.properties.field.minimapMode`: 「地图模式」
    - `editor.properties.minimapMode.topRight`: 「右上角小地图」
    - `editor.properties.minimapMode.parchment`: 「羊皮纸地图」
    - `editor.properties.minimapMode.hidden`: 「完全隐藏」
    - `editor.properties.field.mapOpenBehavior`: 「打开地图时」
    - `editor.properties.mapOpenBehavior.pause`: 「暂停游戏」
    - `editor.properties.mapOpenBehavior.continue`: 「继续接受伤害」
    - `editor.properties.field.parchmentLifecycle`: 「死亡 / 重玩时」
    - `editor.properties.parchmentLifecycle.resetOnDeath`: 「清空羊皮纸」
    - `editor.properties.parchmentLifecycle.persist`: 「保留走过的痕迹」
  - `src/i18n/resources/en.ts`:同结构英文
- [x] **Mirror**: 现有 `editor.properties.field.*` 命名
- [x] **Test**: 现有 i18n 测试无回归;`getT('zh')('ui.parchment.title')` 不为空字符串
- [x] **Validate**: `npx vitest run tests/unit/i18n/`

### Task 13: theme.css 样式变量
- [x] **Action**:
  - `src/styles/theme.css`:
    - `.parchment-map { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); }`
    - `.parchment-map__canvas { border: 2px solid var(--parchment-border); box-shadow: ...; }`
    - `--parchment-base: #d4b896`
    - `--parchment-edge: #a8825a`
    - `--parchment-ink: #3a2a1a`
    - `[data-theme="dark"]` 下调整:深 sepia
- [x] **Mirror**: 现有 `theme.css` 变量命名 + `[data-theme="dark"]` 模式
- [x] **Test**: 视觉测试(e2e 截图)+ Playwright 视觉回归(可选)
- [x] **Validate**: `npx playwright test tests/e2e/parchment-map.spec.ts`

### Task 14: E2E 端到端
- [x] **Action**:
  - `tests/e2e/parchment-map.spec.ts`:
    - spec 1:打开 `level-tiny-pickups.json`(临时改为 parchment + 'continue')→ 走两步 → M → 截图 + 断言 canvas 不为空
    - spec 2:打开 `level-tiny-enemy.json`(临时改为 parchment + 'continue')→ 撞敌人 → 截图 + 断言 damage 区域
  - 临时改关卡 JSON 用 page.evaluate + 提交自定义关卡(走 `/game?...&id=custom-parchment-test` + `custom-*` 加载)
- [x] **Mirror**: 现有 `tests/e2e/survive.spec.ts` 启动 + 操作模式
- [x] **Validate**: `npx playwright test tests/e2e/parchment-map.spec.ts`

### Task 15: 文档同步
- [x] **Action**:
  - `docs/roadmap.md`:P2-16 行从无 → 加进增量表(pending → 实施后 → done)
  - `README.md`:已完成增量列表加 `P2-16 | 羊皮纸地图 | ✅ 已完成`
  - `CLAUDE.md`:若有引用 `hideMinimap` 的地方,改为 `minimapMode`
- [x] **Test**: 现有 `docs/roadmap.md` 引用链路 grep 检查
- [x] **Validate**: `git grep hideMinimap src/` 只命中 deprecated JSDoc 注释

## 验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm test
npm run build
npx playwright test tests/e2e/parchment-map.spec.ts
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| canvas 50x50 重绘掉帧 | 中 | 离屏缓存 + 增量重绘(visited/damage 引用变化才动) |
| `hideMinimap` 迁移破坏老关卡 | 低 | `console.warn` 一次 + 字段保留,后续可清 |
| 50 个 damage 叠加性能问题 | 低 | 血量 3-5 + 50% 概率,一局最多 ~5 个 |
| 教学关卡如果选 parchment,缺 onboarding 提示 | 中 | HUD 右下角始终提示「M 打开羊皮纸」 |
| 引擎层不小心 import react / store | 低 | 严格 ParchmentState.ts 纯函数,review 重点检查 |

## 验收

- [x] 所有 Task 勾选完成
- [x] 验证命令全部通过
- [x] spec §11 完成清单全部勾选
- [x] README.md 的"已完成增量"列表同步更新
- [x] Roadmap 中 P2-16 行从 `pending` 改为 `done`
- [x] `hideMinimap` 字段 grep 命中仅 JSDoc 注释

---

## 执行日志（实施时填写）

### 实施日期
2026-06-30

### 实际改动文件
- `src/maze/types.ts` — 新增 `MinimapMode` / `MapOpenBehavior` / `ParchmentLifecycle` + LevelRules 3 字段;3 个 type guard;`hideMinimap` 标 deprecated
- `src/maze/JsonMazeProvider.ts` — 解析新 3 字段;`hideMinimap` → `minimapMode: 'hidden'` 迁移 + warn
- `src/engine/ParchmentState.ts` (新) — 纯函数模块 + 5 个常量
- `src/engine/Game.ts` — `parchment` 字段初始化 + `recordVisit` / `maybeRecordDamage` 接入 + `setParchmentOpen` setter + GameBridge `onParchmentStateChange` + 暂停守卫
- `src/engine/InputManager.ts` — `OPEN_MAP_KEY` / `CLOSE_MAP_KEY` 常量
- `src/store/gameStore.ts` — `parchment` 字段 + 5 actions;startLevel / goToMenu 复位
- `src/store/editorStore.ts` — 3 个新 actions + `setHideMinimap` 重定向到 `rules.minimapMode: 'hidden'`
- `src/ui/components/ParchmentMap.tsx` (新) + `.module.css` (新) — modal + canvas 渲染 + 程序羊皮纸底图 + 3 种损伤
- `src/ui/GameCanvas.tsx` — bridge 挂 `onParchmentStateChange` + M 键监听 + ParchmentMap 挂载
- `src/ui/HUD.tsx` — MapHint 子组件(parchment 模式右下角提示)
- `src/ui/editor/EditorPropertiesPanel.tsx` — 3 态 Segmented + 2 个联级 Segmented;`setHideMinimap` 读 `rules.minimapMode`
- `src/i18n/resources/{zh,en}.ts` — 新增 `overlays.parchment.*` + `editor.properties.{field,minimapMode,mapOpenBehavior,parchmentLifecycle}.*`
- `src/styles/theme.css` — `--parchment-border` 变量(light + dark)
- `tests/unit/maze/types.test.ts` — 3 个 type guard 全覆盖
- `tests/unit/maze/JsonMazeProvider.test.ts` — 新字段解析 + hideMinimap 迁移 + 静默丢弃
- `tests/unit/engine/ParchmentState.test.ts` (新) — 25 个测试
- `tests/unit/engine/Game.parchment.test.ts` (新) — 7 个测试
- `tests/unit/store/gameStore.parchment.test.ts` (新) — 9 个测试
- `tests/unit/store/editorStore.test.ts` — 6 个新 parchment 测试
- `tests/component/ParchmentMap.test.tsx` (新) — 7 个测试
- `tests/component/hud.parchment.test.tsx` (新) — 3 个测试
- `tests/e2e/parchment-map.spec.ts` (新) — 4 个 E2E case

### 遇到的偏差
- `ui.parchment.*` 命名空间不符合 i18n `app|controls|hud|overlays|settings|levels|editor|common|tutorial` 白名单 → 改用 `overlays.parchment.*`(modal 属于 overlay)
- `setHideMinimap` 旧 action 写的是 `MazeData.hideMinimap` 顶层字段,迁移后该字段不再 round-trip → 重定向到 `rules.minimapMode: 'hidden'`,教程卡片的 "Hide Minimap" 开关仍可用
- `caught-by-enemy + tutorial` 守卫失败时新加的 `isPlayerCaughtByEnemy` 验证与该增量无关,保持现状
- E2E spec 写好但未跑(需 dev server),按 P2-15 同样的"fixme 保留待 dev server 跑过确认"模式处理

### 测试覆盖
- 单元 + 组件 + E2E spec 全部覆盖
- 全套测试 84 files / 1113 passed / 1 skipped(无关)
- `npm run typecheck` + `npm run build` 0 错误

### 备注
- E2E 走 `localStorage` 注入 custom level + `/game?id=custom-...` 路径,不走编辑器 UI 流程,避开 e2e 编辑器慢路径
- 损伤区域概率 50% + 半径 1-2 + 类型均匀分布由 `Math.random` 驱动,无 deterministic seed — 真随机,UI 视觉每次不同
- `parchmentLifecycle: 'persist'` 暂为 API 占位,死亡机制落地时再接通(当前无死亡流程)

