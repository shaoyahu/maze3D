# maze3D 全项目 Fresh Bug Review (2026-06-15)

**Slug**: 2026-06-15-fresh-full-review
**日期**: 2026-06-15
**评审窗口**: `main` HEAD = `85cdd2b ci: add GitHub Pages deploy workflow`
**评审方式**: 从零开始(无历史 baseline 参照)。6 个并行 Explore 子代理 分别覆盖 engine/entities/game、maze/utils、store/hooks、ui/i18n、editor 全套、测试与配置。主代理对所有 CRITICAL/HIGH 候选项亲自读源验证。

---

## 0. 范围与文件清单

| 类别 | 数量 |
|---|---|
| 源代码文件 (`src/**/*.{ts,tsx}`) | **73** |
| 测试文件 (`tests/**`) | **71**(unit 36 + component 22 + e2e 13) |
| 配置文件 | **5** (`vite/vitest/playwright/tsconfig × 3`) |
| 内置关卡 JSON | **4** (`public/levels/level-*.json`) |
| CI workflow | **1** (`.github/workflows/deploy.yml`) |

**审查维度**(11 个):正确性 · 类型安全 · 资源 / 内存泄漏 · 并发 / 异步 · 数学与物理 · 安全 / 输入校验 · 架构边界 · 性能 · 可访问性 · 测试覆盖 · 工程债。

---

## 1. 总览

| 严重度 | 数量 |
|---|---|
| **CRITICAL** | **4** |
| **HIGH** | **9** |
| **MEDIUM** | **13** |
| **LOW** | **9** |
| **合计** | **35** |

**严重度分布**

```
CRITICAL  ▏▏▏▏ 4
HIGH      ▏▏▏▏▏▏▏▏▏ 9
MEDIUM    ▏▏▏▏▏▏▏▏▏▏▏▏▏ 13
LOW       ▏▏▏▏▏▏▏▏▏ 9
```

**5 行结论**:

1. **编辑器有 3 个 CRITICAL 等级的"放置工具互斥缺失"**: `placeStart` / `placeExit` / `placePickup` 可让 start = exit、pickup = exit 同格 — 等保存时才被 `validateMaze` 拒绝。
2. **gameStore.goToMenu 漏重置 `currentMode` / `currentEnemyCount`** — 状态泄漏到下一关。
3. **持久化静默丢失**: `levelStore.record / saveCustom` 用 `saveJSON`,quota 满时 console.warn 后丢弃,用户看不到任何错误。
4. **测试套件 12 个 component test 失败**(全部在 mainMenu / app.routing / app.retry),`app.retry` 4 个是 F9(retry 保留 options) 的关键路径回归。
5. **e2e 套件 8 处 skip/fixme**: survive(2)、time-trial(2)、pause-resume(1)、enemies(2)、editor(3 fixme),覆盖率塌方,P2-4a/P2-5 核心特性 e2e 未验证。

---

## 2. CRITICAL(4 条)

### 2.1 `src/store/editorStore.ts:510-526` — `placeStart` 不挡 exit cell

```ts
placeStart: (x, z) => {
  const { level } = get();
  if (!inBounds(x, z, level.size.width, level.size.depth)) { ... return; }
  // ❌ 漏: 如果 (x,z) 就是当前 exit 位置,没拦截
  let nextWalls = level.walls;
  if (level.walls[z]![x] === 1) { /* auto-carve */ }
  set({ ...commitLevel(get(), { ...level, start: { x, z }, walls: nextWalls }), lastError: null });
},
```

**影响**: start 与 exit 重叠 → `validateMaze` 在保存时抛 "start and exit are on the same cell",但编辑器阶段毫无提示。用户以为放置成功。
**复现**: 选 start 工具 → 点击当前 exit 所在格 → start 标记移到 exit 格上,无任何报错;直到点 "保存" 才看到错误。
**修复**: 在 `inBounds` 检查后立即加:
```ts
if (level.exit.x === x && level.exit.z === z) {
  set({ lastErrorKey: 'editor.lastError.startOnExit' });
  return;
}
```

---

### 2.2 `src/store/editorStore.ts:529-545` — `placeExit` 不挡 start cell(对称)

同 2.1 镜像 bug;`placeExit` 也不检查 (x,z) 是否就是当前 start。
**修复**: 同 2.1 加守卫。

---

### 2.3 `src/store/editorStore.ts:547-562` — `placePickup` 不挡 exit cell

```ts
placePickup: (x, z) => {
  const { level } = get();
  if (!isFloor(level, x, z)) return;
  if (level.start.x === x && level.start.z === z) return;  // ✓ 挡 start
  // ❌ 漏: 不挡 exit
  const newPickup: Pickup = { id: generateId(), x, z, type: 'time', value: 10 };
  ...
}
```

**影响**: pickup 放在 exit 上时,`JsonMazeProvider:176-178` 在 `validateMaze` 抛错。编辑器侧没有阻拦,UX 不一致。
**复现**: 选 pickup 工具 → 点 exit 格 → pickup 落下、显示在列表里 → 保存 → 失败。
**修复**:
```ts
if (level.exit.x === x && level.exit.z === z) return;
```

---

### 2.4 `src/store/gameStore.ts:386-410` — `goToMenu()` 漏重置 `currentMode` / `currentEnemyCount`

```ts
goToMenu: () =>
  set({
    screen: 'menu',
    /* ...其他字段全部重置... */
    currentSurviveSeconds: SURVIVE_SECONDS_DEFAULT,
    /* ❌ 漏写 */
    // currentMode: 'reach-exit',
    // currentEnemyCount: 0,
  }),
```

初始 state 包含 `currentMode: 'reach-exit'`、`currentEnemyCount: 0`,但 `goToMenu` 没把它们重置回去。

**影响**:
- 用户先玩 survive 模式 → 失败/退出 → 回菜单 → `currentMode === 'survive'`、`currentEnemyCount === 上一关数量` 仍然挂在 store
- 任何订阅 `currentMode` 的未来 UI(如菜单显示 "上次玩的是 X 模式")会读到错误值
- `gameStore.tick` 内部的 `if (s.currentMode === 'survive')` 分支(line 199)在下次 `startLevel` 之前若被触发,会走错代码路径
- 测试间共享 store 状态,容易出 flaky

**复现**:
```js
useGameStore.getState().startLevel(maze, { mode: 'survive', enemyCount: 5 });
useGameStore.getState().goToMenu();
useGameStore.getState().currentMode;       // 'survive'(应为 'reach-exit')
useGameStore.getState().currentEnemyCount; // 5(应为 0)
```

**修复**: 在 `set({...})` 中补两行:
```ts
currentMode: 'reach-exit',
currentEnemyCount: 0,
```

---

## 3. HIGH(9 条)

### 3.1 `src/store/levelStore.ts:259, 272` — `record()` / `saveCustom()` 在 quota 满时静默丢失

```ts
record: (r) => {
  ...
  saveJSON(STORAGE_KEY, next);   // ← saveJSON 在失败时只 console.warn,silent fall-through
  set({ bestByLevel: next });
},

saveCustom: (level) => {
  ...
  saveJSON(CUSTOM_STORAGE_KEY, next);   // ← 同样
  set({ customLevels: next });
},
```

`persist.ts:103-108`:
```ts
export function saveJSON(key: string, value: unknown): void {
  const result = safeSetItem(key, value);
  if (!result.ok) {
    console.warn('persist: failed to save', key, result.reason);
  }
}
```

**影响**: 当 localStorage 满(或私密浏览模式下被禁),用户完成关卡破纪录、或编辑器保存自定义关卡 — 都会 **silent loss**。Win overlay 仍然显示 "新纪录!",但 `bestByLevel` 在下次 reload 后没有这条记录。
**复现**: DevTools 把 localStorage 填到 ~5MB → 完成一关 → 重新打开浏览器 → 记录消失,无任何用户提示。
**修复**:`record` / `saveCustom` 应改用 `safeSetItem` 并把 `result.ok=false` 的情况通过 `lastLoadSummary` 类似机制 surface 给 UI(toast)。

---

### 3.2 `src/maze/JsonMazeProvider.ts:254` — 缺 `enemies` 字段被静默 coerce 为 `[]`

```ts
function parseEnemies(raw: unknown, ...): EnemySpawn[] {
  if (!Array.isArray(raw)) return [];   // ← 缺 enemies 字段 → undefined → []
  ...
}
```

而 `MazeData` 在 `types.ts` 定义 `enemies: EnemySpawn[]`(必填)。`validateMaze` 没有显式检查 `'enemies' in m`,直接进入 `parseEnemies(m.enemies, ...)`,缺字段的 JSON 通过校验。
**影响**: 手写关卡漏写 `enemies` 字段时,无错误提示直接静默变成 0 敌人。schema 与实现不一致。
**复现**: 删除 `public/levels/level-tiny-enemy.json` 中的 `"enemies"` 键 → 加载成功、survive 模式 0 敌人。
**修复**: 在 `validateMaze` 中加:
```ts
if (!('enemies' in m)) throw new LevelLoadError(`Maze '${id}': missing 'enemies' field`);
```

---

### 3.3 `src/maze/JsonMazeProvider.ts:262-265` — Enemy spawn 坐标不校验是否在墙上

```ts
requireString(ee, 'id', `${id}.enemies[${i}]`);
requireNumber(ee, 'x', `${id}.enemies[${i}]`);
requireNumber(ee, 'z', `${id}.enemies[${i}]`);
requireInBounds(ee, 'x', 'z', `${id}.enemies[${i}]`, width, depth);
// ❌ 缺: walls[ee.z][ee.x] === 1 检查
```

注释(line 249-252)明确说 "Spawn x/z and every patrol-path node must be in-bounds **and on a walkable cell**",但代码只对 path 节点(line 283-286)做了 wall 检查,**spawn 本身没有**。
**影响**: 手写关卡可以把敌人 spawn 在墙里 → 加载成功 → 运行时 Enemy mesh 卡在墙内,患者(被 `resolveMove` 卡住)无法移动,巡逻立刻失效。
**复现**: 把某个 enemy 的 `x/z` 改成一个 `walls[z][x]===1` 的格 → 不报错 → 进游戏看到敌人卡在墙里。
**修复**: 在 line 265 后加:
```ts
if (walls[ee.z as number][ee.x as number] === 1) {
  throw new LevelLoadError(`Maze '${id}': enemy ${clampErrorValue(ee.id)} spawn is on a wall`);
}
```

---

### 3.4 `src/maze/JsonMazeProvider.ts:86-91` — `cellSize` 死代码 + 重新引入 `as` 强转

```ts
const cellSize = requireNumber(m, 'cellSize', id);   // 已保证 finite number
if (cellSize <= 0) { ... }              // ✓ 有意义
if (cellSize < MIN_CELL_SIZE) { ... }   // ✓ 有意义
if (!Number.isFinite(m.cellSize as number) || (m.cellSize as number) <= 0) { ... }  // ✗ 不可达 + as 强转
if ((m.cellSize as number) < MIN_CELL_SIZE) { ... }                                  // ✗ 不可达 + as 强转
```

**影响**: 死代码,且原地引入 4 处 `as number` 绕过类型系统,违反 F-D-quality-D-6 重构的初衷。
**修复**: 删除 line 86-91。

---

### 3.5 `src/store/editorStore.ts:687-717` — `updateSize` 不清理越界的 selection

```ts
updateSize: (width, depth) => {
  /* 重建 walls 数组,clamp start/exit */
  set(commitLevel(get(), nextLevel));
  // ❌ 漏: 当前 selection 若指向被裁掉的 pickup/enemy,留下 orphan ref
},
```

**影响**: 用户选中 (10,10) 的 pickup → 调用 `updateSize(5, 5)` → 该 pickup 已不存在,但 `selection` 仍指向它 → properties panel 渲染错乱,后续 `deleteSelected` 静默 no-op。
**复现**: 在 15×15 关卡 (10,10) 放 pickup → 选中它 → 缩小到 5×5 → properties panel 失效。
**修复**: 在 `updateSize` 完成后检查 selection 是否仍在新 bounds 内,否则 `clearSelection()`。

---

### 3.6 测试套件 12 个 component test 失败(未跟进)

```
Test Files  4 failed | 66 passed (70)
Tests       12 failed | 864 passed | 1 skipped (877)
```

按文件:
- `tests/component/menus.test.tsx` — 1 个(找 `screen.getByText('3D Maze')`,DOM 已无)
- `tests/component/mainMenu.revamp.test.tsx` — 3 个(scene container / 翻转面板 / 标题)
- `tests/component/app.routing.test.tsx` — 4 个(`/` 落地、未知路径回 `/`、`开始` 按钮、quit 历史 replace)
- `tests/component/app.retry.test.tsx` — **4 个 关键路径**(F9 — GameOver/Win 的 retry 必须保留 `activeOptions`)

最近 commit `d45d66b` 仅把 3 个 **e2e** spec 标 fixme,**component 测试无任何标记/跟进**。
**影响**:`npm test` 直接红;CI 若 gate 在 `npm test` 上会持续失败;后续真正的 component 回归被噪音淹没;**`app.retry` 4 个失败若是真回归,玩家 retry 后 mode/enemyCount 会被悄悄重置回默认值**。
**修复**(优先级):
1. 先 root-cause `app.retry.test.tsx` 4 个 — 真回归就修 product code,假阳性就更新断言
2. `app.routing.test.tsx` 4 个 — 路由 sanity,应快速修
3. `mainMenu` 4 个 + `menus.test.tsx` 1 个 — home-revamp 进行中,可暂标 `fixme` 但要记入 `roadmap.md` 顶部

---

### 3.7 8 处 e2e skip/fixme(P2-4a / P2-5 核心特性 e2e 未验证)

| 文件 | 类型 | 测试 |
|---|---|---|
| `survive.spec.ts:18` | `test.skip` | survive 30s 触发 win |
| `time-trial.spec.ts:12,38` | `test.skip` | time-trial 180s 超时;win 显示 mm:ss |
| `pause-resume.spec.ts:39` | `test.skip` | survive 模式暂停冻结 elapsedTime |
| `enemies.spec.ts:26,41` | `test.skip` | 敌人接触掉血;invuln 窗口内第二次接触 no-op |
| `editor.spec.ts:48,110,169` | `test.fixme` | 保存自定义关卡、删除、export/import roundtrip |

**根因**(根据注释): `page.clock.fastForward()` 与程序生成关卡的 `requestAnimationFrame` 时钟交互不兼容;`editor.spec.ts` 因 `carveLShape` 帮手把 stale `lastError` 透出到 save 结果。
**影响**: P2-4a 全部 survive/time-trial/invuln/敌人接触路径在 e2e 层 **完全未验证**,只有 store unit test 覆盖。整条"用户点击 → 渲染 → overlay"链路无 e2e。
**修复**:
- `page.clock` 问题: 把 spec 改成用 teaching 关卡(确定性几何)以实时跑,或在 engine 加一个测试 hook 让 e2e 能驱动 tick
- `carveLShape` 问题: 修 helper 让它保留 exit cell 为 floor

---

### 3.8 `playwright.config.ts:5-7` — `retries: 0` + `workers: 1` + `fullyParallel: false`

```ts
fullyParallel: false,
workers: 1,
retries: 0,
```

**影响**: 任何一次浏览器 flake、网络抖动、CI 资源争用 → 整个 e2e 套件红。30+ spec 串行跑 ≈ 5 分钟,零容错。
**修复**: CI 设 `retries: process.env.CI ? 1 : 0`;视测试隔离情况开 `workers: 2`。

---

### 3.9 `src/engine/Game.ts:184-204` — `requestPointerLock` 拒绝时 throw 后可能 unhandled

```ts
return p.then(
  () => undefined,
  (e: unknown) => {
    console.warn('Game.requestPointerLock: pointer lock request rejected', e);
    throw e;   // ← re-throw,完全依赖调用者(GameCanvas)catch
  },
);
```

**影响**: 若 GameCanvas 调用 `.catch(...)` 缺漏(或未来重构忘记),浏览器 console 出现 `Uncaught (in promise)`,某些 telemetry 工具会把它当成 error 上报。
**修复**: 既然 `console.warn` 已经做了,可以选择不 throw,或者让函数返回 `Promise<{ ok: boolean }>` 让调用者显式处理。

---

## 4. MEDIUM(13 条)

### 4.1 `src/App.tsx:325-340` — `GamePage` useEffect 内的 loadToken 时序

```ts
useEffect(() => {
  if (!parsed.ok) {
    setUrlError(...);
    return;
  }
  startLevel(parsed.parsed.id, parsed.parsed.options);
  return () => { loadTokenRef.current++; };   // ← cleanup 才 bump
}, [parsed, startLevel]);
```

若旧 effect 已结束(`return ()=>...` 内的 cleanup 还没跑)、新 effect 已进入 `startLevel`,会出现两个并发 load。当前因 `startLevel` 内 `++loadTokenRef.current` 立刻 bump,理论上是安全的,但**bump 时机依赖 React effect 顺序契约**,脆弱。
**影响**: 快速切换关卡可能短暂显示错误关卡。
**修复**: useEffect 体首行先 `loadTokenRef.current++`。

---

### 4.2 `src/ui/editor/editorValidation.ts:18-77` — 不检查 `LevelRules` 范围

`validateDesign` 不检查 `initialTime / maxHealth / timeOnPickup` 的范围。属性面板可以输入负数 → 编辑器无警告 → save 时 `validateMaze` 拒绝。
**修复**: `validateDesign` 加 `level.rules.initialTime >= 0 && maxHealth >= 1 && timeOnPickup >= 0` 检查。

---

### 4.3 `src/ui/editor/EditorPage.tsx:31-37` — Cmd+Z 吞掉 textarea / input 原生 undo

```ts
function isUndoRedoTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  ...
}
```

逻辑实际是 **正确** 的(返回 `false` 表示不处理),但 `EditorPropertiesPanel` 的某些自定义 input 控件可能没用原生 `<input>` 元素 → 命中 `return true` 路径,Cmd+Z 触发编辑器 undo 而非控件原生 undo。
**修复**: 评审 `EditorPropertiesPanel` 中所有可编辑控件是否都是原生元素。

---

### 4.4 `src/store/editorStore.ts:769-787` — `removeEnemyNode` 不检查 `nodeIndex` 越界

`filter` 会静默 no-op,UI 无反馈。虽然 panel 用 `path.length <= 2` 隐藏删除按钮,但 store action 应自防御。
**修复**: 入口加 `if (nodeIndex < 0 || nodeIndex >= target.path.length) return;`。

---

### 4.5 `src/ui/editor/EditorViewport.tsx:99-133` — 没有 Esc 全局快捷键

没有键盘路径来"取消选择 / 切回 select 工具",用户卡在某个工具时只能点 toolbar。
**修复**: 加全局 `keydown` 监听 `Escape` → `clearSelection() + setTool('select')`。

---

### 4.6 `src/engine/Scene.ts:291-305` — Pickup sibling 各自创建 `OctahedronGeometry`

```ts
const pickupGeom = new THREE.OctahedronGeometry(0.25);
/* ... 对每个 pickup: */
const sib1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), pickupMat);   // ❌ 重新 new
const sib2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), pickupMat);   // ❌ 重新 new
```

(具体 line 由子代理报告,待行级核对)
**影响**: 每个 pickup 浪费 2 倍 geometry GPU 内存;大关卡(几十 pickup)累积 GC 压力。
**修复**: sibling 复用 `pickupGeom`。

---

### 4.7 `src/engine/Scene.ts:171-179` — `applyDarkMode` 切换时 FogExp2 累积

每次切换主题都创建新的 `FogExp2` 实例,旧的不 dispose 也不复用,可能在 GC 之前累积。
**影响**: 频繁切换主题(测试 / 用户作死)会导致 fog 实例堆积。
**修复**: 切换前 `scene.fog?.dispose?.()` 或缓存两份 fog 实例切换 `scene.fog = which`。

---

### 4.8 `src/ui/Settings.tsx:107-114` — nav `<a href="#section-...">` 向 history push entry

```ts
<a href="#section-display">...</a>
```

每次点导航锚都 push 一条 history → ESC 一次只回到上一个锚点,与 `SettingsPage` `onBack: navigate('/', { replace: true })` 设计意图冲突。
**影响**: 用户点了 3 个导航锚点后需按 4 次 ESC 才到主菜单。
**修复**: 改用 `<button type="button">` + `el.scrollIntoView()`,或捕获 click 并 `e.preventDefault()`。

---

### 4.9 `src/ui/LevelSelect.tsx:659` — CSS class 名拼错

```ts
{best ? ' console-card__stat-value--accent' : ' console-card--muted'}
//                                                  ↑ 应为 console-card__stat-value--muted
```

**影响**: 无最优成绩时 stat value 样式漂移到卡片级 modifier。
**修复**: `' console-card--muted'` → `' console-card__stat-value--muted'`。

---

### 4.10 `src/ui/LevelSelect.tsx:280-282` — source 切换后 sublevelId 重置不一致

useEffect 重置 `sublevelId` 为 `lastSublevelBySourceRef.current[levelSource] ?? null`,但 `effectiveSublevelId` 会 fallback 到 `sublevelOptions[0]?.id` → 两个 state 不一致。
**影响**: 切换 source 再回到原 source 时,选中的 sublevel 可能跳到列表第一个。
**修复**: 缓存命中失败时保持当前值,或与 `effectiveSublevelId` 同步。

---

### 4.11 `src/engine/Game.ts:248` — 注释引用不存在的 `getInitialDarkMode`

实际 bridge 方法名是 `getCurrentDarkMode`。注释误导未来维护。
**修复**: 改注释。

---

### 4.12 `src/engine/Loop.ts:7-20` — `stop()` 在 `update()` 中触发后,本帧 rAF 仍可能 fire

调用栈: `update` 内某个 bridge 回调触发 `pauseLoop()` → `stop()` 设 `this.stopped = true`、`cancelAnimationFrame`。`update()` 返回后 line 17 又会 `if (this.stopped) return;`,**实际是安全的**(已有 line 17 guard)。结论: 此项偏 paranoid。

---

### 4.13 `src/engine/Scene.ts:13-14` — `disposedTexs` WeakSet 在 GC 后失效路径

`WeakSet` 在 texture 被 GC 后会自动清掉,如果某 texture 被反复 dispose,GC 时机决定是否触发双重 dispose。Three.js 的 `WebGLTexture` 双重 dispose 通常无害但有 console warning。
**修复**: 改用普通 `Set<Texture>`(接受少量内存) 或 `Map<Texture, true>`。

---

## 5. LOW(9 条)

### 5.1 `src/ui/components/Button.tsx:46-68` — 缺 `type="button"`

```ts
<button onClick={onClick} disabled={disabled} ...>
```

当前项目 `grep <form` 无结果,即 **没有 form 元素**,故无即时 bug。但若未来引入 `<form>`,默认 `type="submit"` 会引发非预期表单提交。
**修复**:`<button type="button" ...>` 作为防御。

---

### 5.2 `src/entities/Player.ts:29-30` — yaw 在 2π 精确边界归一化漂移

`applyLook` 的归一化在 yaw 恰好为 2π 时输出 −2π(IEEE-754 边界)。实际需要 ~1 亿次鼠标旋转才能命中。
**修复**:`yaw = ((yaw % TWO_PI) + TWO_PI) % TWO_PI`。

---

### 5.3 `src/engine/InputManager.ts:44-55` — `dispose()` 不清 `this.keys`

当前 InputManager 不复用,无影响。但未来若做 InputManager 池化,持有的 key 会作为幽灵输入泄漏。
**修复**: dispose 加 `this.keys.clear();`。

---

### 5.4 `src/engine/Loop.ts` — `stop()` 在 update 内调用时本帧 rAF 仍可能短暂排队

已有 line 17 guard,实际安全。仅是契约脆弱。
**修复**: 注释说明边界。

---

### 5.5 `src/maze/generators/{prim,huntAndKill}.ts` — `Math.sqrt(visited.length)` 反复算

`size` 是常量,被在 helper 内反复 `Math.sqrt`。50×50 关卡数百次无谓 sqrt。
**修复**: size 作为参数传入或在生成器入口算一次。

---

### 5.6 `src/maze/generators/recursiveBacktracker.ts:105` — `% dirs.length` 永远 no-op

`Math.floor(rng() * 4) % 4` 在 `rng() ∈ [0, 1)` 时 `Math.floor` 已经 ∈ [0,3]。
**修复**: 删 `% dirs.length`。

---

### 5.7 `src/maze/importExport.ts:86` — `detail` 未 clamp

```ts
const detail = e instanceof Error ? e.message : String(e);
```

未来若 `validateMaze` 抛出超长 message,会原样进入 ImportError → 编辑器 toast。
**修复**:`const detail = clampErrorValue(e instanceof Error ? e.message : String(e));`。

---

### 5.8 `tsconfig.app.json:19` — `esModuleInterop: true` 与 `module: ESNext` 重复

风格债;`module: ESNext` 已隐含 interop。
**修复**: 删冗余。

---

### 5.9 `.github/workflows/deploy.yml:52-58` — 过期 actions 版本

`actions/upload-pages-artifact@v3` / `actions/deploy-pages@v4` 不是当前最新。
**修复**: 升级到 `@v4` / `@v5`。

---

## 6. 验证为假阳性的子代理报告

| 子代理 finding | 实际情况 | 否定理由 |
|---|---|---|
| CRITICAL `Enemy.ts:116` FOV 因子 2 错误 | **假阳性** | `(fovAngleDeg * π) / 360` = 半角弧度;`fovAngleDeg=60` → 半角 30° → 全锥 60° 正是设计 |
| CRITICAL `Rules.ts:22-24` crossesExit 单帧穿越 exit | **假阳性** | `dt` 由 `Loop.ts:13` 上限 0.1s,玩家速度 ~5m/s → 单帧 ≤0.5m;`cellSize ≥ 0.6m`(MIN);start+midpoint+end 三采样足以覆盖,无 tunnel 路径 |
| CRITICAL `JsonMazeProvider.ts:302-310` 可选 enemy 字段不校验 finite | **假阳性** | 实际有 `&& Number.isFinite(ee.dwellTime)` 等检查 |
| HIGH `Minimap.tsx:281-284` cleanup race | **假阳性** | `clearInterval` 同步,JS 单线程无 race 窗口 |
| HIGH `i18n moreSuffix` en 暴露 `{more}` 字面量 | **假阳性** | zh + en 模板都只用 `{count}`,`{more}` 不是占位符;App 传 `{count, more}` 时 `more` 字段被 i18n 忽略 |
| HIGH `i18n levels.action.hint` 大小写不匹配 | **假阳性** | 模板和调用方都是小写 `{enter}` / `{esc}`,匹配 |
| MEDIUM `EditorPage.handleExit:138` `choice === null` fallthrough | **假阳性** | line 138 有 `if (choice === 'cancel' \|\| choice === null) return;`,正确处理 |
| HIGH `Game.ts:206-287 startLevel consumeMouseDelta 多余` | **假阳性** | `onLockChange` 与 `consumeMouseDelta` 互补;startLevel 在 lock acquire 之前/之后都可能调用,两个都是必要的 |

---

## 7. 验证结果

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck`(`tsc -b --noEmit`) | ✅ Pass | 0 errors |
| `npm test`(`vitest run`) | ⚠ **12 fail / 864 pass / 1 skip / 877 total** | 失败均在 mainMenu/app.routing/app.retry 4 个 component 文件;见 §3.6 |
| `npm run build` | 未跑 | typecheck 通过,build 应 OK |
| `npm run lint` | N/A | 项目无 eslint 配置 |
| `npm run test:e2e` | 未跑 | dev server 启动慢;8 处 skip/fixme 见 §3.7 |
| 架构边界(`src/engine/**` 不 import react/zustand) | ✅ 完全合规 | 子代理对所有 engine 文件检查无违规 |

---

## 8. 跨切关注

### 8.1 持久化与用户反馈

- `safeSetItem` 已正确实现 PersistResult 型 — **但 `levelStore` 没用上**(§3.1)
- `editorStore.saveDraft` 用了 `safeSetItem` 是正确的;但 `record` / `saveCustom` 是 best-effort `saveJSON`
- `loadJSON` 在 JSON 损坏时静默 fallback,无 toast(子代理 LOW)

### 8.2 验证一致性(`validateMaze` vs `validateDesign`)

- `validateMaze` 在 `JsonMazeProvider.ts` 用于运行时入口校验
- `validateDesign` 在 `editorValidation.ts` 用于编辑器实时 UI 提示
- **两者范围不一致**: `validateDesign` 不检查 rules 范围(§4.2);`validateMaze` 不检查 enemy spawn 是否在墙上(§3.3)
- 建议: 把 `validateMaze` 的部分检查提到共用 helper,两者复用

### 8.3 测试塌方

- 12 个 component test 失败 + 8 处 e2e skip/fixme = 大约 20+ 个本应跑绿的测试在哑火
- `roadmap.md` 顶部没有 "已知失败" 区块,新接手者无法快速判断
- 建议: 在 CI 加 `npm test` gate,并在 README/roadmap 顶部声明当前已知失败

---

## 9. 优先级行动建议

| # | 任务 | 严重度 | 工作量估计 |
|---|---|---|---|
| 1 | 修 3 个编辑器 placement 互斥(§2.1-2.3) | CRITICAL | 30 分钟,3 处加 if + 1 个 i18n key |
| 2 | `gameStore.goToMenu` 补 2 个字段(§2.4) | CRITICAL | 5 分钟 |
| 3 | `levelStore.record` / `saveCustom` 改 `safeSetItem` + toast(§3.1) | HIGH | 1-2 小时(需要新 store 字段 + UI) |
| 4 | `JsonMazeProvider` 加 enemies 必填、spawn 墙体校验(§3.2-3.3) | HIGH | 30 分钟 |
| 5 | `JsonMazeProvider:86-91` 死代码(§3.4) | HIGH | 5 分钟 |
| 6 | `editorStore.updateSize` 清 orphan selection(§3.5) | HIGH | 15 分钟 |
| 7 | 修 `app.retry.test.tsx` 4 个失败(§3.6) — root-cause 决定是修 product 还是修测试 | HIGH | 1-3 小时 |
| 8 | 修 playwright `retries` 配置(§3.8) | HIGH | 5 分钟 |
| 9 | LevelSelect CSS class 拼错(§4.9) | MEDIUM | 1 分钟 |
| 10 | `editorValidation` 加 rules 范围检查(§4.2) | MEDIUM | 15 分钟 |
| 11 | 其余 MEDIUM 11 项 | MEDIUM | 5-8 小时 |
| 12 | 其余 LOW 9 项 | LOW | 2-3 小时 |

**先做 #1-2 + #9**,大约 30 分钟可消化 4 个 CRITICAL + 1 个低工作量 MEDIUM,显著降低用户感知 bug。

---

## 10. Files Reviewed

| 模块 | 文件数 | 主要 finding 数 |
|---|---|---|
| `src/engine/**` | 7 | 3 (Game, Loop, Scene) |
| `src/entities/**` | 3 | 1 (Player yaw 边界) |
| `src/game/**` | 1 | 0 |
| `src/maze/**`(含 generators) | 13 | 5 (JsonMazeProvider ×3, prim, huntAndKill, recursiveBacktracker, importExport) |
| `src/store/**` | 7 | 6 (editorStore ×4, gameStore, levelStore ×2) |
| `src/utils/**` | 6 | 0 |
| `src/hooks/**` | 1 | 0 |
| `src/i18n/**` | 4 | 0(子代理报告均为假阳性) |
| `src/ui/**`(含 components, editor) | 27 | 6 (App, EditorPage, EditorViewport, editorValidation, Settings, LevelSelect ×2) |
| `tests/**` | 71 | 2 块(12 component fail + 8 skip/fixme) |
| 配置 | 5 | 3 (playwright, tsconfig, deploy.yml) |
| **合计** | **144 文件** | **35 条 finding** |
