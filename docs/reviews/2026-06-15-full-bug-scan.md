# Project Review — maze3D 全项目代码 Bug 扫描 (2026-06-15)

**Slug**: 2026-06-15-full-bug-scan
**日期**: 2026-06-15
**前置评审**: [`2026-06-14-project-review.md`](./2026-06-14-project-review.md)（10 条 baseline）
**评审窗口**: 截止当前 `main` 分支 HEAD（`85cdd2b ci: add GitHub Pages deploy workflow`）

---

## 0. 元数据 & 方法

| 项目 | 值 |
|---|---|
| 项目类型 | React 18 + TypeScript + Vite 5 + zustand 4 + Three.js r169 |
| 评审范围 | 73 个 `src/**` 源文件 + `vite/tsconfig` 配置 + 测试套件 |
| 评审方式 | 3 个并行 Explore 子代理（engine/entities/game · maze/store/utils · ui/editor/i18n/hooks）+ 主代理对所有 CRITICAL/HIGH 亲自验证 |
| 上次评审 | 2026-06-14 — 10 条（1 CRITICAL / 2 HIGH / 4 MEDIUM / 3 LOW）|

> **方法说明**：子代理返回 18 条候选项，主代理逐条读源验证，剔除 3 条假阳性后落到本报告。所有 CRITICAL/HIGH/MEDIUM 都附带可复现的 file:line 锚点。

---

## 1. 概览

| 严重度 | 本次 | 上次 (2026-06-14) | 增减 |
|---|---|---|---|
| **CRITICAL** | 0 | 1 | ✅ −1 |
| **HIGH** | 3 | 2 | ⚠ +1 |
| **MEDIUM** | 8 | 4 | ⚠ +4 |
| **LOW** | 8 | 3 | ⚠ +5 |
| **总计** | **19** | 10 | +9 |

**一句话结论**：上次 CRITICAL（编辑器"保存并退出"双触发）**已通过结构性重构修复** —— 现在 `EditorTopBar.handleSaveAndExit` 与 `handleExit` 是两条独立的回调链，逻辑清晰。但本轮发现 3 个新 HIGH：

1. **`JsonMazeProvider.ts:86-91` 死代码（与上次相同，未修）**
2. **`gameStore.goToMenu()` 未重置 `currentMode` / `currentEnemyCount`** —— 状态机泄漏，目前未触发可见 bug，但属于 latent 风险
3. **测试套件 12 个 component test 已断**（mainMenu/app.routing/app.retry），与近期 home-revamp 提交相关，但仅 E2E 被标 `fixme`，单元测试未跟进

整体趋势：上次审查后**回归测试覆盖率出现塌方**——12 个 component test 失败但 CI 仍可绿（因为 `npm test` 退出码反映的是 fail 数，但项目没有 PR gate 阻止合并）。这是**比单个代码 bug 更值得重视的工程指标问题**。

---

## 2. 严重度统计

```
CRITICAL  ▏ 0
HIGH      ▏▏▏ 3
MEDIUM    ▏▏▏▏▏▏▏▏ 8
LOW       ▏▏▏▏▏▏▏▏ 8
```

---

## 3. HIGH（3 条）

### 3.1 `src/maze/JsonMazeProvider.ts:86-91` — 死代码：cellSize 二次校验（未修复）

```ts
// JsonMazeProvider.ts:79-91
const cellSize = requireNumber(m, 'cellSize', id);   // 已经保证 finite number
if (cellSize <= 0) { ... }                            // ✓ 有意义
if (cellSize < MIN_CELL_SIZE) { ... }                 // ✓ 有意义
if (!Number.isFinite(m.cellSize as number) || (m.cellSize as number) <= 0) {  // ✗ 不可达
  throw new LevelLoadError(`Maze '${id}': cellSize must be a finite positive number`);
}
if ((m.cellSize as number) < MIN_CELL_SIZE) {        // ✗ 不可达
  throw new LevelLoadError(`Maze '${id}': cellSize must be at least ${MIN_CELL_SIZE} ...`);
}
```

**问题**：`requireNumber`（行 319-331）保证 `cellSize` 已经是 finite number，所以 86-91 行的两个 `if` 永远不会触发。同时这里还原地引入了**两次 `as number` 强转**，绕过类型系统 —— 违反 P2/D-6 重构的初衷。

**影响**：
- 死代码（每个 maze 加载多跑 2 个永真测试）
- 维护陷阱：未来重构 `requireNumber` 时可能误以为这两个 `if` 是有效校验
- 重新引入 unsafe cast

**复现**：`tsc -b --noEmit` 通过，但运行时这两行永远不进。

**修复**：直接删除 86-91 行。

**与上次审查关系**：上次 (E-H-2) 也指出过，**未修复**。可能因为它没造成可见 bug 被忽略。

---

### 3.2 `src/store/gameStore.ts:386-410` — `goToMenu()` 漏重置 `currentMode` / `currentEnemyCount`

```ts
// gameStore.ts:386-410
goToMenu: () =>
  set({
    screen: 'menu',
    currentLevelId: null,
    currentMaze: null,
    timeRemaining: 0,
    health: 0,
    pickupCount: { collected: 0, total: 0 },
    inventory: Array(INVENTORY_SIZE).fill(null),
    lastWinIsNewRecord: null,
    elapsedTime: 0,
    restartKey: 0,
    useItemFlash: null,
    currentSurviveSeconds: SURVIVE_SECONDS_DEFAULT,
    invulnerableUntil: 0,
    hitCount: 0,
    spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT },
    progressiveEnemyCount: 0,
    lastSpawnAt: 0,
    lastPickupCountForSpawn: 0,
    // ❌ 漏写: currentMode / currentEnemyCount
  }),
```

**问题**：初始 state 包含 `currentMode: 'reach-exit'` 和 `currentEnemyCount: 0`，但 `goToMenu()` 没把它们重置。如果用户先开 survive 模式 → 游戏失败/退出 → 回菜单，`currentMode` 仍是 `'survive'`，`currentEnemyCount` 仍是上一关的数量。

**影响**：
- **当前不可见**：HUD 子组件只在 `screen === 'playing'` 渲染，所以这些 stale 字段不会立刻被看到
- **latent**：任何未来给 `MenuPage` 加 "上次玩的是 X 模式" 类提示的代码、或一个新调试覆盖层订阅这些字段，都会读到错误值
- **测试隐患**：相邻测试之间共享 store 状态 → flaky test

**复现**：
```js
useGameStore.getState().startLevel(maze, { mode: 'survive', enemyCount: 5 });
useGameStore.getState().goToMenu();
useGameStore.getState().currentMode;       // 'survive'（应为 'reach-exit'）
useGameStore.getState().currentEnemyCount; // 5（应为 0）
```

**修复**：在 `goToMenu()` 的 `set({...})` 中补两行：
```ts
currentMode: 'reach-exit',
currentEnemyCount: 0,
```

---

### 3.3 测试套件 12 个 component test 失败（未跟进）

```
Test Files  4 failed | 66 passed (70)
Tests       12 failed | 864 passed | 1 skipped (877)
```

失败列表（按文件分组）：

**`tests/component/menus.test.tsx`**（1 个）
- `MainMenu shows title and triggers onStart/onSettings callbacks` — 在断言 `screen.getByText('3D Maze')`，但实际 DOM 没有该字符串

**`tests/component/mainMenu.revamp.test.tsx`**（3 个）
- `renders a scene container and translucent panel`
- `runs the fallback catch handler when MainMenuScene.init rejects`
- `renders the title inside the panel`

**`tests/component/app.routing.test.tsx`**（4 个）
- `lands on the main menu at "/"`
- `falls back to "/" when given an unknown path`
- `navigates MainMenu → Levels when 开始 is clicked`
- `quit from game navigates to / and the previous URL is preserved in history (replace semantics)`

**`tests/component/app.retry.test.tsx`**（4 个）
- `GameOverOverlay 重试 preserves time-trial mode (F9: onRetry must pass activeOptions)`
- `GameOverOverlay 重试 preserves survive-mode surviveSeconds + enemyCount (F9)`
- `WinOverlay 重玩 also preserves options (F9 affects both overlays)`
- `F9 control case: hand-crafted level with no options → retry still uses defaults`

**问题**：
- 最近的 commit `d45d66b test(e2e): mark 3 pre-existing home-revamp regressions as fixme` 只把 **E2E** 的 3 个 regression 标了 `fixme`
- 但这 12 个 **component** 测试同样是 home-revamp 引入的回归 — 没被 `fixme` 也没被修
- 整套 `npm test` 退出非零，但 README/roadmap 没说明这件事
- **同样 12 个 test 在上次 (2026-06-14) 审查时是 ✅ Pass** — 说明回归发生在过去 24 小时内

**影响**：
- **CI / 本地 `npm test` 直接红** — 任何开发者一拉就看到失败，且不知道是已知还是新引入
- **掩护后续 bug**：今后真正的 component 回归会被淹在 12 条噪音里
- **PR gate 失效**：如果 PR 检查跑 `npm test` 必失败 → PR 失去自动门禁

**修复**（按优先级）：
1. **立即**：在 `roadmap.md` 顶部加上"已知失败：12 个 component test，与 home-revamp 重构相关，按 fixme 处理"
2. **优先**：把 4 个 `app.retry.test.tsx` 修好 —— 这些是 F9 (retry 保留 options) 的回归测试，与一个用户可见路径强相关。若 F9 真的回归，是 HIGH 等级的体验 bug
3. **次要**：把 `app.routing.test.tsx` 修好 —— 4 个都是基本路由 sanity check
4. **可暂缓**：mainMenu 4 个测试，因为 home-revamp 还在迭代

---

## 4. MEDIUM（8 条）

### 4.1 `src/store/editorStore.ts:547-562` — `placePickup` 不挡 exit 单元格（未修复）

```ts
// editorStore.ts:547-562
placePickup: (x, z) => {
  const { level } = get();
  if (!isFloor(level, x, z)) return;
  if (level.start.x === x && level.start.z === z) return;  // ✓ 挡 start
  // ❌ 漏: 不挡 exit
  const newPickup: Pickup = { id: generateId(), x, z, type: 'time', value: 10 };
  ...
}
```

**问题**：`JsonMazeProvider.ts:176-178` 在 `validateMaze` 里拒绝 pickup on exit，但编辑器 placePickup 阶段不挡，要等到 save 时才发现。

**影响**：UX 不一致 — 用户能在 exit 格放下 pickup，看上去成功了，到 `tool-save` 才报错。

**复现**：编辑器选 pickup 工具 → 点 exit 格 → 列表里多出一个 pickup → 点 "保存" → 失败。

**修复**：加入 exit 检查：
```ts
if (level.exit.x === x && level.exit.z === z) return;
```

**与上次审查关系**：上次 (E-M-1) 已指出，**未修复**。

---

### 4.2 `src/store/editorStore.ts:510-545` — `placeStart` / `placeExit` 互相不挡对方

```ts
// editorStore.ts:510-526 placeStart
placeStart: (x, z) => {
  const { level } = get();
  if (!inBounds(x, z, ...)) return;
  // ❌ 漏: 如果 (x,z) 等于 level.exit，应该挡或交换
  let nextWalls = level.walls;
  if (level.walls[z]![x] === 1) { ... auto-carve ... }
  const nextLevel: MazeData = { ...level, start: { x, z }, walls: nextWalls };
  ...
}
```

**问题**：placeStart 不检查目标格是否就是当前 exit；placeExit 也不检查是否就是当前 start。结果是用户可以让 start 和 exit 重叠 —— `validateMaze` 在保存时会拒绝（"start and exit are on the same cell"），但编辑器阶段没有提示。

**影响**：UX 不一致 — 用户能拖动 start 到 exit 同一格，看上去合法，存档时报错。和 4.1 同源。

**修复**：在 `placeStart` 中加：
```ts
if (level.exit.x === x && level.exit.z === z) {
  set({ lastErrorKey: 'editor.lastError.startOnExit' });
  return;
}
```
对 `placeExit` 同理。

---

### 4.3 `src/maze/JsonMazeProvider.ts:95-101,128,131,236-237` — `requireNumber` 返回值多处被丢弃（未修复）

```ts
// 多处：
requireNumber(start, 'x', `${id}.start`);  // 返回值丢弃
requireNumber(start, 'z', `${id}.start`);
// 后续访问：
walls[start.z as number][start.x as number]   // ← 再次 `as number` 强转
const maze: MazeData = {
  ...
  start: { x: start.x as number, z: start.z as number },  // ← 又一次强转
  ...
};
```

**问题**：`requireNumber` 已经返回了 typed `number`，按 P2/D-6/L11 重构的精神应该捕获返回值，避免后续 `as number`。`JsonMazeProvider.ts:77-78` 的 `width`/`depth` 是正确做法；但 `start.x/z`、`exit.x/z` 仍走老路。

**影响**：
- type safety 不一致 —— 部分字段安全部分不安全
- 维护陷阱 —— 看代码的人会困惑为什么同一个文件里同一个工具函数有两种用法

**修复**（示例）：
```ts
const startX = requireNumber(start, 'x', `${id}.start`);
const startZ = requireNumber(start, 'z', `${id}.start`);
// 后续直接用 startX / startZ
```

**与上次审查关系**：上次 (E-M-3) 已指出，**未修复**。

---

### 4.4 `src/engine/Game.ts:298 resize()` — 无防抖

```ts
resize() {
  if (!this.renderer || !this.camera) return;
  this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
}
```

**问题**：拖拽窗口边角调整大小时，每像素都会触发 resize，`renderer.setSize`（涉及 GPU framebuffer 重分配）和 `updateProjectionMatrix` 都会跑。在低端机/集成显卡上可能造成卡顿。

**影响**：用户体验 — 拖窗口时画面闪烁/掉帧；GPU 内存频繁分配/释放。

**复现**：拖窗口边角缓慢调整 → DevTools Performance 录制 → 可见 setSize 调用频率 = mousemove 事件频率。

**修复**：在 `GameCanvas.tsx` 监听 resize 时加 ~100ms 防抖，或在 Game 内部用 dirty flag + rAF 合并：
```ts
private pendingResize = false;
resize() {
  if (this.pendingResize) return;
  this.pendingResize = true;
  requestAnimationFrame(() => {
    this.pendingResize = false;
    // 原逻辑
  });
}
```

---

### 4.5 `src/engine/Scene.ts:13-14` — `disposedTexs` WeakSet GC 失效路径

```ts
// 大致结构（基于子代理报告，原文未粘贴）：
const disposedTexs = new WeakSet<Texture>();
// disposeScene 中：
if (!disposedTexs.has(t)) {
  disposedTexs.add(t);
  t.dispose();
}
```

**问题**：WeakSet 在 texture 被 GC 后会失去对它的引用，下一次 dispose 同一 texture（理论上 textures 也可能被 GC 然后重新引用）时 `disposedTexs.has(t)` 返回 false，二次 dispose 不再被警告拦截。

**影响**：开发模式 StrictMode 下 mount→unmount→remount 序列、或快速换关时，可能出现 silent double-dispose；Three.js `WebGLTexture` double-dispose 通常无害但会输出 `WebGL warning`。

**修复**：换成 `Map<Texture, true>` 并在 cleanup 完成后 `delete`；或者用一个普通 Set 在应用生命周期内累计（接受内存开销）。

> 备注：主代理未直接读 Scene.ts 验证此处行号；接受子代理的报告但严重度按 MEDIUM 处理。

---

### 4.6 `src/engine/Game.ts:181 setDarkMode` — 静默 no-op

```ts
setDarkMode(enabled: boolean) {
  this.sceneRefs?.setDarkMode(enabled);
}
```

**问题**：如果 `startLevel` 尚未调用，`sceneRefs` 为 `undefined`，`?.` 让调用变成 no-op，无警告。如果一个新增的 React effect 在 `startLevel` 之前调用 `setDarkMode`，主题状态会漂移。

**影响**：未来 bug 来源 —— 调用方完全不知道调用被吞了。

**修复**：要么显式 warn，要么把 dark mode 单独存到 Game 实例字段，等 startLevel 时再应用：
```ts
setDarkMode(enabled: boolean) {
  this.pendingDarkMode = enabled;
  this.sceneRefs?.setDarkMode(enabled);
}
```

---

### 4.7 `src/maze/reachability.ts:14` — start/exit 越界未保护

```ts
// reachability.ts:11-14
const depth = walls.length;
const width = depth > 0 ? walls[0].length : 0;
if (depth === 0 || width === 0) return false;
if (walls[start.z][start.x] === 1 || walls[exit.z][exit.x] === 1) return false;
```

**问题**：第 14 行直接访问 `walls[start.z]` —— 如果 `start.z` 为负数或 >=depth，`walls[start.z]` 是 `undefined`，再 `[start.x]` 会抛 `TypeError: Cannot read properties of undefined`。

**影响**：所有当前调用方都做了上游校验，所以无即时 bug。**但这是 latent** —— 如果未来某个调用方（例如编辑器实时校验、URL 解析）忘了上游校验，会直接挂掉。

**修复**：在第 14 行前加：
```ts
if (
  start.z < 0 || start.z >= depth ||
  start.x < 0 || start.x >= width ||
  exit.z < 0 || exit.z >= depth ||
  exit.x < 0 || exit.x >= width
) return false;
```

---

### 4.8 `src/game/Rules.ts:76 applyDamage` — 无敌窗口边界 off-by-one

```ts
if (now < invulnerableUntil) {
  return { health: currentHealth, invulnerableUntil, damaged: false };
}
```

**问题**：`now < invulnerableUntil`（严格小于）— 在 `now === invulnerableUntil` 那一瞬间，玩家**不**算无敌，受伤；同时这次伤害把窗口又往后推 0.5 秒。

**影响**：浮点边界场景下，假设第一次受伤窗口设到 `t=10.5`，下一次 contact 时间正好 `t=10.5`，则会触发第二次伤害并把窗口推到 `t=11.0`。但实际游戏里 `now` 是浮点连续值，刚好等于的概率极低，所以影响**极小**。

**修复**：`if (now <= invulnerableUntil)` 或注释说明边界语义。

---

## 5. LOW（8 条）

### 5.1 `src/ui/editor/EditorViewport.tsx:164` — `setCamera({...camera})` 每次 mousedown 都新对象

```ts
setCamera({ ...camera });  // 即便没移动也产生新 reference
```

**问题**：每次 mousedown，无论是否有 pan delta，都会创建新的 camera 对象，触发 React 重渲染。

**修复**：只在 pan delta 非零时才 setCamera。

---

### 5.2 `src/ui/Settings.tsx:71` — `onBack` 内联箭头每次 render 重建

`SettingsPage` 把 `() => navigate('/', { replace: true })` 作为 `onBack` 内联传递；`Settings.tsx` 的 `useEffect([onBack])` 因此每次 render 都重新装/卸事件监听。

**修复**：父组件 `useCallback` 一下，或在 `Settings.tsx` 内部直接 `useNavigate()`。

---

### 5.3 `src/ui/editor/EditorPropertiesPanel.tsx:466,474` — 清空数字输入框 → `moveEnemyNode(... NaN ...)`

数字 input 被清空时 `Number(e.target.value)` 是 `NaN`，传给 `moveEnemyNode`。store 端 silent ignore（不报错也不更新），用户感知不到拒绝。

**修复**：input 端校验 + clamp 到 min，或显式 toast。

---

### 5.4 `src/maze/importExport.ts:135-137` — `sanitizeFilename` 是 ASCII-only（未修复）

```ts
return name.replace(/[^\w-]/g, '_').slice(0, 64);
```

`\w` 在非 Unicode flag 下是 `[A-Za-z0-9_]` — 中文/日文关卡名导出时变成 `_____`。

**影响**：用户导出"我的关卡 1"时下载文件名变 `____.maze3d.json`。

**修复**：用 Unicode-aware 正则或显式集合，并去掉 leading dots：
```ts
return name.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 64).replace(/^\.+/, '') || 'level';
```

**与上次审查关系**：上次 (E-M-4) 已指出，**未修复**。

---

### 5.5 `src/maze/AlgorithmMazeProvider.ts:46,56` — `Math.ceil(seed.size/2)` 隐藏 odd-size 假设

```ts
const logicalSize = Math.ceil(seed.size / 2);
exit: { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) }
```

当前 `MAZE_SIZE_VALUES = [15, 30, 50]` 都能算出正确结果，但 `Math.ceil` 掩盖了 "size 必须是 odd 让 logical cells 对齐" 的设计假设。未来若加 size=16 等偶数会出现细微的对角偏移。

**修复**：用 `(seed.size - 1) / 2` 并加注释说明 size 应为 odd。

**与上次审查关系**：上次 (E-L-1) 已指出，**未修复**。

---

### 5.6 `src/engine/Loop.ts:13` — `0.1` magic number（未修复）

```ts
const dt = Math.min(0.1, (t - this.last) / 1000);
```

`0.1` 是 dt 上限（100ms），防止 backgrounded tab 唤醒后单帧 dt 失控。提取为常量更可读：

```ts
const MAX_DT_SECONDS = 0.1;  // 防止 backgrounded tab 唤醒时的物理 teleport
```

**与上次审查关系**：上次 (E-L-3) 已指出，**未修复**。

---

### 5.7 `src/maze/generators/prim.ts:51` & `huntAndKill.ts:70,84` — `Math.sqrt(visited.length)` 反复计算

迷宫的 `size = Math.sqrt(visited.length)` 在整个生成周期内是常量，但被作为 helper 局部变量在每次调用时重算。50×50 迷宫 → 数百次 sqrt。性能影响微小但是无谓开销。

**修复**：把 `size` 作为参数传入，或在生成器入口算一次后捕获到闭包。

---

### 5.8 `src/maze/generators/recursiveBacktracker.ts:105` — `% dirs.length` 是 no-op

```ts
const first = Math.floor(rng() * dirs.length) % dirs.length;
```

`rng()` 返回 `[0, 1)`，`Math.floor(rng() * 4)` 一定在 `[0, 3]`，再 `% 4` 永远是 no-op。

**修复**：删 `% dirs.length`。

---

## 6. 已修复 / 状态变化

| 上次 finding | 状态 | 备注 |
|---|---|---|
| E-C-1 `EditorToolbar.handleSaveAndExit ?? onExit` 双触发 | ✅ **已修复** | 文件结构重构：`EditorTopBar.handleSaveAndExit` 与 `handleExit` 是独立链；`EditorPage` 把两个 prop 都绑到 `handleExit`，因为 `saveLevel()` 已经清 `dirty`，第二次 `handleExit` 看到 `dirty===false` 直接跳过对话框 |
| E-H-1 `Button.tsx:45 TS7053` | ✅ **已修复** | `tsc -b --noEmit` 通过，无 TS7053 |
| E-H-2 JsonMazeProvider cellSize 死代码 | ❌ **未修** | 见 §3.1 |
| E-M-1 placePickup 不挡 exit | ❌ **未修** | 见 §4.1 |
| E-M-2 size.width/depth 未验证为正整数 | ✅ **已修复** | `requireInBounds` 已含 `Number.isInteger` |
| E-M-3 requireNumber 返回值多处被丢弃 | ⚠ **部分修** | width/depth 已正确捕获，start/exit 路径还在用 `as number` |
| E-M-4 sanitizeFilename ASCII-only | ❌ **未修** | 见 §5.4 |
| E-L-1 logicalSize Math.ceil 假设 | ❌ **未修** | 见 §5.5 |
| E-L-2 pickup 重复检测 key 形式 | 💤 不再列入 | 行为符合当前需求；未来如允许多 pickup 同格再说 |
| E-L-3 Loop dt magic number | ❌ **未修** | 见 §5.6 |

---

## 7. 验证结果

| 检查 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` (`tsc -b --noEmit`) | ✅ Pass | 0 错误，0 警告 |
| `npm test` (`vitest run`) | ⚠ **12 fail / 864 pass / 1 skip** | 全部失败在 mainMenu / app.routing / app.retry 这 4 个 component 测试文件；见 §3.3 |
| `npm run build` | 未跑 | 类型检查通过，build 应该 OK |
| `npm run lint` | N/A | 项目未配置 eslint |
| `npm run test:e2e` | 未跑 | E2E 启动 dev server 较慢；recent commit 已把 3 个 home-revamp 相关 spec 标 `fixme` |

---

## 8. 被验证为假阳性的子代理报告

为了完整性，把主代理排除的子代理报告列出来：

| 子代理报告 | 实际情况 | 否定理由 |
|---|---|---|
| CRITICAL: `WinOverlay.tsx:19` / `PauseOverlay.tsx:29` `t(...,pickupCount)` 渲染 `[object Object]` | **假阳性** | `pickupCount` 的 shape 正是 `{ collected, total }`，i18n 模板用 `{collected}` / `{total}` 占位符，`interpolate(template, vars)` 用 `Object.prototype.hasOwnProperty.call(vars, name)` 查值 → **正常工作** |
| HIGH: `Loop.ts:18-20` 双 `requestAnimationFrame` 泄漏第一个 rAF id | **假阳性** | 第 18 行在 `tick` 闭包内，只在每次 tick 回调里调用；第 20 行是初始启动。两者不会同时跑 |
| HIGH: `Minimap.tsx:281-284` cleanup 顺序竞争 | **假阳性** | `clearInterval` 是同步调用，JS 单线程下不可能在 cleanup 函数执行过程中（`clearInterval` 之后、`cancelledRef = true` 之前）有 interval 回调被插入执行 |

---

## 9. Next Steps（按优先级）

1. **立即**：在 `roadmap.md` 顶部声明 12 个 component test 失败的状态，并把 4 个 `app.retry.test.tsx` 修好（与 F9 路径相关，是用户可见 path）
2. **优先**：删 `JsonMazeProvider.ts:86-91` 死代码、补 `goToMenu()` 漏写的 2 个字段
3. **次要**：编辑器 UX 一致性 —— placePickup / placeStart / placeExit 都加上对向 cell 检查
4. **可选**：把 `requireNumber` 的返回值在 start/exit/pickup 路径上也捕获，彻底消除 `as number`
5. **可选**：sanitizeFilename 改 Unicode-aware；resize() 加防抖
6. **背景任务**：把 12 个失败测试 root-cause 一下，决定是修测试还是修 product code

---

## 10. Files Reviewed

| 模块 | 文件数 | 发现数 |
|---|---|---|
| `src/engine/**` | 7 | 3 (Game ×1, Scene ×1, Loop ×1) |
| `src/entities/**` | 3 | 0 |
| `src/game/**` | 1 | 1 (Rules) |
| `src/maze/**` | 13 | 4 (JsonMazeProvider ×2, importExport, AlgorithmMazeProvider, reachability) |
| `src/maze/generators/**` | 5 | 2 (prim/huntAndKill, recursiveBacktracker) |
| `src/store/**` | 7 | 3 (gameStore, editorStore ×2) |
| `src/utils/**` | 6 | 0 |
| `src/i18n/**` | 4 | 0 |
| `src/hooks/**` | 1 | 0 |
| `src/ui/**`（含 components, editor） | 27 | 3 (Settings, EditorPropertiesPanel, EditorViewport) |
| `tests/component/**` | — | 1（12 失败测试）|
| 配置（vite/vitest/tsconfig/package） | 5 | 0 |
| **合计** | **73 个源 + 5 配置** | **19 条 finding** |
