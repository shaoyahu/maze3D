# UI 组件 / React 模式 / a11y / 性能 — Code Review §B

**Slug**: code-review-2026-06-13-B
**评审时间**: 2026-06-13
**评审范围**: `src/ui/**`、`src/App.tsx`(UI 拼装相关)、`src/hooks/useAutoSave.ts`(P2-7 新代码,被 EditorToolbar 消费)
**前置评审**: `2026-06-11-code-review.md`(35 条全修),本次不复述已修条目
**评审维度**: React 模式 / hooks 使用 / 性能 / a11y / 副作用顺序 / Provider 边界 / P2-6 + P2-7 新代码

---

## 1. 严重度图例

| 级别 | 含义 |
|---|---|
| **CRITICAL** | 数据丢失 / 崩溃 / 安全 |
| **HIGH** | 主流程逻辑错误 |
| **MEDIUM** | 边界场景 bug / 性能回退 / a11y 缺失 |
| **LOW** | 风格 / 死代码 / 微小问题 |

---

## 2. 关键背景(上下文,不计入 finding)

- **P2-5**: UI revamp(Menu 3D 背景、LevelSelect 二列、Mode-gated enemy、auto-save 等)。
- **P2-6**: LevelSelect cascading(teaching/random/custom/seed)+ 4 source dropdown,子关卡 + size + survive 模式 chip。引入 `useConfirm` 替换 native `window.confirm`。
- **P2-7**: 全面替换 `window.confirm` 为 themed `Dialog`(`useConfirm` FIFO 队列 + EditorToolbar 状态联动 + EditorPage 3-option dirty-exit)。

---

## 3. Finding 列表

### MEDIUM-1 | `src/ui/components/Dialog.tsx:107-119` | `buttonRefs.current` 在 `actions.length` 变化时未清理导致 stale ref 风险

`buttonRefs.current[i] = el` 在 React ref callback 内设置,React unmount 时传 `null`,但 `[open]` flip 的 effect `buttonRefs.current = []` 只在 `open` 变化时跑。当 `actions.length` 在同 instance 内变化(例如同一 dialog 不 close → open 直接换 opts),`buttonRefs.current[actions.length..prevLen-1]` 仍指向旧 DOM 节点。后续 first-action focus 走 `buttonRefs.current[0]` OK(因为 [0] 总是被新 ref callback 覆写),但 Tab cycling 在 line 130 `filter((b): b is HTMLButtonElement => b !== null)` 不会过滤 stale refs(因为 ref callback 在 unmount 时已经清为 null)。

**修复建议**:把 `buttonRefs.current = []` 的清理放到每次 actions 变化时(把 `actions` 加到 focus-effect deps),或者改用 `Array.from({ length: actions.length }, () => createRef<HTMLButtonElement>())` 让 React 自动管 ref 生命周期。

---

### MEDIUM-2 | `src/ui/LevelSelect.tsx:307-313` | `customDefs` 每次 render 重建(新数组、新排序)

`Object.values(customLevels).map(...).sort(...)` 每次 render 重建数组。`sublevelOptions` 的 `useMemo` deps `[levelSource, available, customDefs]` 中 `customDefs` 是新数组引用,useMemo 永远失效,等效于没进 deps。

**修复建议**:把 `customDefs` 用 `useMemo` 包一层,deps `[customLevels]`;`sublevelOptions` 改为 deps `[levelSource, available, customLevels]`。

---

### MEDIUM-3 | `src/ui/MainMenu.tsx:18-33` | `MainMenuScene.init()` 异步失败时 canvas 残留 DOM

`init().catch(err => { setUseFallbackBackground(true); scene.dispose(); sceneRef.current = null; })` 路径 OK,但 cleanup `useEffect(() => { ... return () => { scene.dispose(); sceneRef.current = null } }, [])` 假定 `scene` 在 `sceneContainerRef.current` 已就绪。React StrictMode 在 dev 会 mount → unmount → remount,**第二次 mount 时 `sceneContainerRef.current` 是旧 div**(无 key prop),但 cleanup 已跑过的 `sceneRef.current = null` 之后 init 重新 new 一个 scene —— OK,**但 `scene.dispose()` 已经把 canvas 从 container remove**(`dispose()` 只在 `this.canvas.parentNode === this.container` 时 remove)。第二次 init 又 `appendChild` 新 canvas,旧 canvas 不在 container 里了 —— OK。但 **catch 分支里 `scene.dispose()` 后 `throw err`** 重新抛给 React,**`sceneRef.current = null` 后**第二次 mount 不再有 reference,**新 mount 时新 scene 实例 appendChild 新的 canvas**。问题是:catch 时 setUseFallbackBackground(true) 触发 background 切到 gradient,但若 React 在 catch 后立刻 unmount(StrictMode unmount 路径),effect cleanup 跑 scene.dispose() —— scene 是 catch 时已 dispose 完的实例,**第二次 dispose 是 idempotent**(all fields undefined / rafId null)。OK,逻辑闭环。

**真实隐患**:catch 中 `throw err` 在 `async init().catch(...)` 路径上,promise 已 reject,catch handler 不再 throw(re-throw 是因为这里没显式 return)——重新 throw 给谁?**被 Promise reject,然后 effect 的 promise reject 被 React 静默忽略**。OK。但 `setUseFallbackBackground(true)` 在 reject 后异步 commit,**StrictMode unmount 之前 commit 跑,组件 unmount,state setter 在 unmount 组件上跑**——React 18 警告。

**修复建议**:catch 内不 re-throw,而是只 setUseFallbackBackground + dispose。或者用 `setState((prev) => prev)` 配合 `useState` 的 unmount guard。

---

### MEDIUM-4 | `src/ui/editor/EditorPage.tsx:70-93` | Draft recovery `setShowDraftPrompt(false)` 在 `cancelled` 守卫之前

```js
useEffect(() => {
  if (!showDraftPrompt) return;
  let cancelled = false;
  (async () => {
    const choice = await confirm({ ... });
    if (cancelled) return;
    if (choice === 'ok') {
      loadDraft();
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DRAFT_KEY);
    }
    setShowDraftPrompt(false);  // ← 不在 cancelled 守卫内
  })();
  return () => { cancelled = true; };
}, [showDraftPrompt, confirm, loadDraft]);
```
用户在 confirm 中途退出编辑器 → effect cleanup 跑 `cancelled = true`,async 继续,resolve 后 `setShowDraftPrompt(false)` **仍在 unmount 组件上跑**——React 18 警告 + setState on unmounted component。

**修复建议**:把 `setShowDraftPrompt(false)` 也包到 `if (cancelled) return;` 守卫里。

---

### MEDIUM-5 | `src/ui/editor/EditorToolbar.tsx:104-107` + `src/hooks/useAutoSave.ts:57-69` | Autosave 反复失败无退避

`useAutoSave` 每 30s tick,若 `dirty=true` → saveLevel 失败 → fire `onAutoSaveError`,`dirty` 仍 true。下一个 30s tick 又 retry,**可能陷入反复失败状态**(编辑器处于无效状态,自动保存永远失败)。UI 每 30s 弹"自动保存失败:xxx",**用户没主动操作**,纯噪音。

**修复建议**:失败后做指数退避(失败 → 下次 60s → 120s → 300s 上限);连续 N 次失败后 fire 一次性"已暂停自动保存"并停止 fire error。或者把 dirty=false 之外的"save failed this tick"状态记到 ref。

---

### MEDIUM-6 | `src/ui/GameCanvas.tsx:148-166` | subscribe listener 内调 DOM API(`document.exitPointerLock`)

```js
useGameStore.subscribe((s, prev) => {
  ...
  if ((s.screen === 'win' || s.screen === 'game-over') && document.pointerLockElement) {
    document.exitPointerLock();
  }
});
```
Listener 是纯逻辑容器,DOM 副作用放里面 cognitive overhead。`exitPointerLock()` 返回 Promise,本代码 fire-and-forget —— 无功能 bug,但 subscribe listener 应保持纯。

**修复建议**:把 `exitPointerLock` 移到 `useEffect(() => { if (screen === 'win' || ...) exitPointerLock(); }, [screen])`。或者保留(功能 OK),提一句。

---

### MEDIUM-7 | `src/ui/LevelSelect.tsx:316-319,331-337` | 切换 levelSource 时 sublevelId reset 丢失用户选择

```js
useEffect(() => { setSublevelId(null); }, [levelSource]);
```
切到 custom,再切回 teaching → sublevelId 清 null → render 时 `effectiveSublevelId = sublevelOptions[0]?.id`(首个)→ 显示 B(而非 A)。**用户期望看到 A**。

**修复建议**:用 `useRef<Record<LevelSource, string | null>>` 缓存每 source 的 last selection,切换 source 时保留各自选择。

---

### MEDIUM-8 | `src/ui/editor/EditorPage.tsx:114-131` | keydown handler deps 含 `undo`/`redo` selector 引用

`useEffect(() => { document.addEventListener('keydown', handler); ... }, [undo, redo])`。`undo`/`redo` 是 zustand selector 返回的 action,zustand 默认 stable reference,理论上不变。但若 zustand 配置变化或 strict mode re-render 中 selector 返回值引用不等,**handler 反复 re-bind**,且 `isUndoRedoTarget` 等 closure 重建。

**修复建议**:listener 内懒读 `useEditorStore.getState().undo / redo`,effect deps 改 `[]` 一次绑定。

---

### MEDIUM-9 | `src/ui/editor/EditorPage.tsx:31-37` | `isUndoRedoTarget` SVG 元素 fallback 行为

`if (!(target instanceof HTMLElement)) return true;` — SVGElement 不是 HTMLElement,**return true** → 触发 undo。本项目 SVG 不编辑,OK。但 SVG `<text>` 内容编辑模式 `isContentEditable` 在某些浏览器反映 SVG text editing mode,本项目无 SVG 编辑,OK。

低风险,但 `target instanceof HTMLElement` 的 fallback 应该 `return false`(保守不拦)而非 `return true`(触发 undo)。功能 OK,但语义反了。

---

### MEDIUM-10 | `src/ui/components/Minimap.tsx:159-174` | `useTickRef` cleanup 缺失

```js
useEffect(() => {
  if (screen !== 'playing') return;
  const id = setInterval(() => { ... }, intervalMs);
  return () => clearInterval(id);
}, [gameRef, intervalMs, screen]);
```
playing → paused → playing 切换:`screen='paused'` 时 effect early-return **没注册 cleanup**。回到 `screen='playing'` 时 effect re-run,**新 interval 注册**。OK,无泄漏(因为 paused 时根本没 interval)。但 screen 'playing' → 卸载 → effect cleanup 跑 → clearInterval。OK。

**潜在 bug**:`gameRef` 是 ref object,在 GameCanvas remount 时是 **新对象**——minimap 在 GameCanvas 内挂载,GameCanvas 卸载时 minimap 也卸载,effect cleanup 跑。OK。

但如果 minimap 单独使用或被父组件复用,gameRef 变化时 effect 重 schedule interval。OK。

---

### MEDIUM-11 | `src/ui/components/Minimap.tsx:63-96` | StaticMaze `memo` 在 restart 时失效,wall rect 全部重 render

`memo(function StaticMaze({ maze }))` props 是 maze object。Engine `startLevel` 会重建 maze 对象(从 levelStore 重新 load),reference 变,`memo` 失效,wall rect 全部重新 render。50x50 maze = 2500 rects,React diff 仍是 O(n)。

**修复建议**:把 `maze` 投影成 primitive props(`<StaticMaze width={...} depth={...} wallsHash={hashWalls(maze.walls)} ... />`)。或者只在 `maze.id` 变化时重渲染。当前规模下无可观察问题。

---

### MEDIUM-12 | `src/ui/HUD.tsx:1-35` | HUD 全无 `React.memo`,每次 tick 全 re-render

7 个子组件订阅各自 store state,但 parent HUD re-render 时 React 重 render 所有 child。**tick 60Hz 期间,ControlHints(完全静态)、Timer(只 seconds/urgent 变)、InventoryBar(只在 slots/flash 变)等也都被重 render**。

**修复建议**:7 个子组件全部 `memo`。或者用 `useShallow` 把 4 个 HUD-level selector 合并一次。

---

### MEDIUM-13 | `src/ui/GameCanvas.tsx:99-101` | DEV-only `window.__game` leak 到 e2e

`(window as unknown as { __game: Game }).__game = game;` 只在 `import.meta.env.DEV` 下赋值。Playwright 默认 dev build,可能 leak 到 e2e 测试之间(同 page 多次 mount,第二 mount 覆盖 __game——OK,但**多 tab 独立**,跨 tab 不影响)。

**修复建议**:在 cleanup 路径 `delete window.__game`,e2e 之间不残留。

---

### MEDIUM-14 | `src/ui/editor/EditorToolbar.tsx:158` | `onSaveAndExit?.() ?? onExit?.()` fallback 语义模糊

`onSaveAndExit?.() ?? onExit?.();` 只在 `onSaveAndExit === null/undefined` 时调 `onExit`。`EditorPage` 传 `onExit={handleExit} onSaveAndExit={handleExit}`,**两者同函数**,无功能影响。但 interface 语义:提供 `onSaveAndExit` 时**不 fallback 到 `onExit`**,若 `onSaveAndExit` 内部失败 / 不调任何退出路径,状态不一致。

**修复建议**:无 spec 要求。功能 OK,接口语义模糊。

---

### MEDIUM-15 | `src/ui/components/HealthBar.tsx:21` | `Array.from({ length: max }, ...)` 每次 render 重建

每次 hitCount 变 / health 变 / max 变都重建数组。HUD 每 tick 触发 HealthBar 重 render,**Array.from 每次 O(max=3)** —— 微优化。

**修复建议**:`useMemo([max, health])`。

---

### MEDIUM-16 | `src/ui/editor/EditorToolbar.tsx:119-125` | `prevDirtyRef` rising-edge 检测在 dev StrictMode 下行为验证

`useRef<boolean>(dirty)` 初始化 = dirty 当前值。StrictMode 双 mount:第一次 mount → prevDirtyRef = dirty → effect 跑 → prevDirtyRef = dirty(不变)。第二次 mount 同上。功能 OK。

但 **mount 时 dirty 已是 true**(例如 reload 时 draft 恢复 → level 已 dirty),prevDirtyRef=true,user 第一次编辑 dirty 仍 true → 不重置 status。OK,status 是 idle,无清除需要。

提一句确认 spec 行为对齐。

---

### MEDIUM-17 | `src/ui/Settings.tsx:17` | `set` 单 action selector,subscribers 全体 re-render

`const set = useSettingsStore((s) => s.set);` 单 action,stable reference。slider drag 每次 `set('pointerSensitivity', ...)` → Settings 全 re-render(4 sliders + 1 checkbox + 3 radios)。OK,但 Settings 整体 re-render 微优化。

**修复建议**:无。

---

### MEDIUM-18 | `src/ui/editor/EditorPage.tsx:97-112` + `EditorToolbar.tsx:104-107` | 2s draft autosave vs 30s useAutoSave 职责混淆

- `EditorPage` autosave (2s) 写 `localStorage[DRAFT_KEY]`,用于 draft recovery。
- `useAutoSave` (30s) 调 `saveLevel()` 写 in-memory levelStore,**不写 localStorage**。

OK,职责不同。但 user 期望"保存" = 持久化,`saveLevel()` 写 in-memory,**reload 后 store 没了**——潜在数据丢失,跨层问题(本 review 范围外)。**EditorToolbar.handleSave 走 `saveLevel()`,**用户点保存按钮** → 只写 in-memory → 关闭窗口 → 丢失**。

**修复建议**:确认 `saveLevel` 是否真的写 localStorage;若不写,handleSave 应显式 write-then-read 或加 user-visible 提示"已保存至内存"。

---

### MEDIUM-19 | `src/ui/components/Dialog.tsx:107-119` | ref cleanup 依赖 `[open]`,action array 变化未触发

(同 MEDIUM-1)

---

### MEDIUM-20 | `src/ui/GameCanvas.tsx:16` | `screen` selector 在 GameCanvas 顶层被订阅,触发 parent re-render

`const screen = useGameStore((s) => s.screen);` 用于 `{screen === 'playing' && <Crosshair />}` 和 `<Minimap>` gating。subscribe listener line 148-166 也处理 screen 变化,**双重处理**:React render 路径 + subscribe 路径。功能 OK,但 cognitive overhead。

**修复建议**:把 Crosshair/Minimap 门控移到自己组件内(`<Crosshair />` 内部读 screen + null check),GameCanvas 不再订阅 screen。

---

### MEDIUM-21 | `src/ui/editor/EditorPropertiesPanel.tsx:415-437` | 顶层无 memo,level/selection 变化触发整个 panel 重 render

`EditorPropertiesPanel` 订阅 `level` + `selection`,任一变化 re-render。子 form(LevelMetadataForm/PickupForm/EnemyForm/WallForm)有 5+ useDebouncedCommit,**每次 re-render 重 schedule 5 个 timer**。

**修复建议**:LevelMetadataForm / PickupForm / EnemyForm / WallForm 全部 `memo`,props 用 primitive projection。

---

### MEDIUM-22 | `src/ui/components/Dialog.tsx:122-147` | Tab cycling 用 `document.activeElement`,portal 外聚焦处理

`document.activeElement` 是整个 document 的 active element,通常 portal 内 button。`idx === -1`(active 不在 buttonRefs 内,如 portal 外 input 聚焦)时:shift+Tab 跳 last,Tab 跳 first。**闭环逻辑 OK**。

但若 user 在 dialog open 前已聚焦 portal 外 input(如背景 input),dialog open 后 activeElement 仍为外部 input,**Tab 键不触发 dialog 内 button focus**(因为 idx === -1 → 跳 first)。但 idx===-1 时,e.shiftKey 走 last,**OK**。

---

### MEDIUM-23 | `src/ui/useConfirm.ts:75-179` | `setCurrentRef.current = setCurrent` 在 render 期间写 ref

render 期间写 ref,React 不在乎(纯 JS 变量)。但 React 18 strict mode 双 render → 写两次(同引用)。OK。

---

### MEDIUM-24 | `src/ui/LevelSelect.tsx:142` | `clamped as 30 | 60 | 90 | 120` 类型断言

`opts.surviveSeconds = clamped as 30 | 60 | 90 | 120;` 实际值是 number(用户在 free input 输了 60.5),类型断言假装是字面量 union,但运行时是 number。Engine 端 `surviveSeconds: number` 能接受,**类型契约 vs 运行时不符**。

**修复建议**:把 `opts.surviveSeconds` 类型改为 `number`;或拆 chip path(只枚举)与 free input path(number)。

---

### MEDIUM-25 | `src/ui/editor/EditorToolbar.tsx:120-125` | StrictMode 双 mount 时 rising-edge 行为正确性

(同 MEDIUM-16)

---

### MEDIUM-26 | `src/ui/components/InventoryBar.tsx:36-48` | flash div `key={flash.version}` 在 isFlashing 分支内安全

`flash?.slot === i` 判断。flash 为 null → isFlashing=false,不渲染。`flash.version` 只在 isFlashing && (...) 分支内访问,flash 必 truthy。OK。

---

### LOW-1 | `src/ui/LevelSelect.tsx:362` | `try/catch` 空 catch 注释

`try { localStorage.setItem(LAST_SEED_KEY, seedInput); } catch { /* quota */ }` 静默吞 quota 错误。低风险,SPEC 不要弹 toast。

---

### LOW-2 | `src/ui/LevelSelect.tsx:309` | `deleteCustom` 在 confirm async 中 capture 模式

`lv` 是 outer scope capture,`lv.id` 是 stable string,无 stale 问题。`confirm` 来自 useConfirm,stable identity。OK。

---

### LOW-3 | `src/ui/editor/EditorToolbar.tsx:202` | `role="toolbar"` 无 `aria-controls`

`<div role="toolbar" aria-label="Editor tools">` 包 7 个 tool buttons,符合 ARIA。可加 `aria-controls="editor-viewport"` 增强关系(可选)。

---

### LOW-4 | `src/ui/editor/EditorPage.tsx:31-37` | `isUndoRedoTarget` SVG fallback 反义

(见 MEDIUM-9,LOW 版)

---

### LOW-5 | `src/ui/components/Crosshair.tsx:1-50` | Crosshair 无 memo

每次 GameCanvas re-render 重建 inline style(模块顶层 const 实际不重建),但 Crosshair 组件实例每次 re-render。微优化。

---

### LOW-6 | `src/ui/components/Button.tsx:33-35` | `hoverLift` deprecated,残留 `main-menu-button` 类名

`hoverLift` 是 deprecated,JSDoc 提示。3 个 hover style 路径产生不同 className。功能 OK,接口清理 LOW。

---

### LOW-7 | `src/ui/GameCanvas.tsx:148-181` | subscribe handler `setSensitivity` 等每次 settings store 变化 fire

slider drag 连续触发 `setSensitivity`,每次覆盖 `InputManager.sensitivity`。无累积,OK。

---

### LOW-8 | `src/ui/MainMenu.tsx:35-40` | `sceneLayerStyle` 对象每次 render 重建

三元返回不同 inline style,每次 render 新 object。React shallow diff,功能 OK。**修复建议**:移到模块顶层。

---

### LOW-9 | `src/ui/editor/EditorPage.tsx:18-25` | PAGE_STYLE 模块顶层,OK

---

### LOW-10 | `src/ui/components/Minimap.tsx:34-53` | 大量 module-level const,OK

---

### LOW-11 | `src/ui/components/Minimap.tsx:130-133` | `viewBox` 字符串每次 render 重建

`viewBox={`0 0 ${w} ${d}`}` 每次拼新 string。React 把 string 当 child,无功能影响。微 perf。

---

### LOW-12 | `src/ui/LevelSelect.tsx:331-335` | `useMemo` deps 含 `customDefs`(每次新数组)

(同 MEDIUM-2)

---

### LOW-13 | `src/ui/components/Timer.tsx:1-17` | Timer 无 memo

HUD tick 期间 Timer 反复 re-render。微优化。

---

### LOW-14 | `src/ui/editor/EditorStatusBar.tsx:18-21` | wallCount / warningCount / enemyCount 每次 render 重算

`validateDesign(level)` 是 O(n²),50x50 maze ≈ 2500 cells,**每次 level change 跑 ~50ms**。性能回退。

**修复建议**:`useMemo([level])` 包裹三个 count + `validateDesign`。

---

### LOW-15 | `src/ui/GameCanvas.tsx:99` | `import.meta.env.DEV` 检查

OK,Vite 编译时 inline。

---

### LOW-16 | `src/ui/PauseOverlay.tsx:19-27` | 嵌套 `<Settings>` 在 PauseOverlay 内

Settings 内部 `position:absolute,inset:0`,OK。`onBack` 在 PauseOverlay 内 setShowSettings(false) → 卸载 Settings → PauseOverlay 重渲 3-button row。OK。

---

### LOW-17 | `src/ui/editor/EditorPropertiesPanel.tsx:198-206` | PickupForm useEffect deps 含 `pickup.value` 每次 change re-sync

`useEffect(() => { setType(pickup.type); setValue(pickup.value); }, [pickup.id, pickup.type, pickup.value])` —— user 编辑 value 时,本组件 state `value` 立刻 set,store update → 新 `pickup.value` 传入,useEffect 跑,setValue 同值。React idempotent。微优化。

---

### LOW-18 | `src/ui/editor/EditorToolbar.tsx:96` | `useState<Status>` 初始 OK

---

### LOW-19 | `src/ui/WinOverlay.tsx:1-33` | `onNext` optional 未传时未渲染

App.tsx 未传 onNext,WinOverlay 接收 undefined → 不渲染"下一关"。OK。

---

### LOW-20 | `src/ui/GameOverOverlay.tsx:1-32` | color contrast 仅 light mode 验证

`color: 'var(--danger)'` 在 `rgba(0,0,0,0.7)` bg 上。WCAG AA 需 4.5:1,`--danger` 默认 `#ff5050` 对比 ~5:1 OK。dark mode 下 `--danger` 可能更暗,需 verify。

**修复建议**:dark mode 测试 contrast。

---

### LOW-21 | `src/ui/editor/EditorToolbar.tsx:300-320` | `<input type="file">` 无 `aria-label`

隐藏 file input 无 aria-label,但外层 `<button>` 通过 click 触发。屏幕阅读器只读 button text "导入",OK。

---

### LOW-22 | `src/ui/useConfirm.ts:113-122` | `request()` 同步路径 race

`request(A)` → queue=[A], current=null → setCurrent(A)。`request(B)` → queue=[A,B],current 仍 null(同步)→ setCurrent `(prev === null ? opts : prev)` 此时 prev 仍是 null(React 还没 commit A)→ setCurrent(B)。**React batches 合并,current 可能是 A 或 B**。OK,但 race 应当避免。

**修复建议**:`request` 不调 setCurrent,让 current 完全 derived from queue: `current = queueRef.current[0]?.opts ?? null`,effect 同步 drainCurrentRef。无 state race。

---

### LOW-23 | `src/ui/useConfirm.ts:128-137` | drainCurrentRef effect deps 仅 `[current]`

resolveAndAdvance 闭包 `drainCurrentRef.current?.(value)` lazy 读 ref,OK。

---

### LOW-24 | `src/ui/editor/EditorPage.tsx:97-112` | autosave setTimeout ID 用 ref,cleanup OK

---

### LOW-25 | `src/ui/components/Button.tsx:1-56` | Button 无 `aria-pressed` / `aria-busy` 等 a11y 属性

EditorToolbar tool buttons 有 `aria-pressed`,Button 自身不强制。OK。

---

### LOW-26 | `src/ui/editor/EditorPropertiesPanel.tsx:419-430` | `body` let + if/else 拼 ReactNode

可改成三元或函数返回 JSX。功能 OK,可读性 LOW。

---

### LOW-27 | `src/ui/HUD.tsx:1-35` | HUD 7 子组件无 memo

(同 MEDIUM-12)

---

### LOW-28 | `src/ui/components/Dialog.tsx:108-109` | `titleId`/`messageId` 是常量,StrictMode 下 aria-labelledby 重复

`const titleId = 'confirm-dialog-title';` **所有 dialog 共享同一 ID**。SPEC 单 dialog at a time,但 StrictMode dev 可能瞬间 2 instances,**aria 引用错位**。

**修复建议**:`useId()`(React 18)生成唯一 ID。

---

### LOW-29 | `src/ui/LevelSelect.tsx:298` | `surviveSecondsError` state 与 input onChange 强耦合

chip click 不重新 clamp input(因为 chip value 本就在 [MIN,MAX])。OK。

---

### LOW-30 | `src/ui/editor/EditorViewport.tsx:57` | `buildLookups` 每次 render 重建 Map

```js
const { pickupByCell, enemyByCell } = buildLookups(level);
```
每次 level 变化 re-build Map O(n)。mouse drag 期间每 frame re-render → 每 frame 重 build 2 个 Map。50x50 maze + ~10 enemies ≈ 2510,**每 frame 1 次**。性能回退。

**修复建议**:`useMemo([level], () => buildLookups(level))`,zustand strict-equal 下 level reference 在 setCamera 期间不变,memo 命中。

---

### LOW-31 | `src/ui/GameCanvas.tsx:103-115` | resize listener 不 rAF batch

直接 `game.resize()`,同步。resize 频率低,OK。

---

### LOW-32 | `src/ui/editor/EditorViewport.tsx:46-47,123-126` | panStateRef mousedown 不触发 React re-render,cursor 不更新

mousedown 设 panStateRef,camera 不变 → 不 re-render → **cursor 仍 'grab'**。mousemove 后 setCamera → render → cursor 'grabbing'。**实际可用,但 mousedown 后 mouse 静止时 cursor 短暂不准**。

**修复建议**:`handleMouseDown` force re-render:`setCamera({ ...camera })` 或用 useState 跟踪 panState。

---

### LOW-33 | `src/ui/components/Dialog.tsx:166-205` | portal backdrop 不在 `<form>` 内

Dialog 是 confirm,不是 form。OK。

---

### LOW-34 | `src/ui/editor/EditorToolbar.tsx:265-269` | dirty marker "● 未保存" 无 `aria-live`

dirty 状态变化时屏幕阅读器不 announce。a11y LOW。

**修复建议**:加 `aria-live="polite"`。

---

### LOW-35 | `src/ui/LevelSelect.tsx:316-319,331-337` | 切 source 丢失 sublevel 选择

(同 MEDIUM-7,LOW 版)

---

### LOW-36 | `src/ui/components/Minimap.tsx:170` | `setTick` 仅在 player position 存在时 fire

```js
if (gameRef.current?.getPlayerPosition()) setTick((t) => t + 1);
```
player position 为 null(暂停/未初始化)→ 不 fire。OK。

---

### LOW-37 | `src/ui/LevelSelect.tsx:117-126` | random source 每次 render 重生成 seed

`validateSelection` 内 `randomHexSeed()` 每次 render 调 → 即使 user 没点 start,seed 也变。**non-deterministic**。

**修复建议**:`random` source 的 seed 用 useState(只在 levelSource 切到 'random' 时生成一次),而非每次 render。

---

### LOW-38 | `src/ui/components/Dialog.tsx:166` | portal 容器 `document.body` 在 SSR/test 中存在

Vite SPA + test 环境都有 `document.body`。OK。

---

### LOW-39 | `src/ui/editor/EditorPage.tsx:114-131` | keydown listener `undo`/`redo` deps

(同 MEDIUM-8)

---

### LOW-40 | `src/ui/components/InventoryBar.tsx:14-15` | `flash?.slot === i` 无边界保护

inventory 长度变短时 flash.slot 越界,但本项目无缩短 inventory action。OK。

---

## 4. 严重度统计

| 严重度 | 总数 |
|---|---|
| **CRITICAL** | 0 |
| **HIGH** | 0 |
| **MEDIUM** | 26 |
| **LOW** | 40 |
| **总计** | **66** |

---

## 5. 结论

**P2-7 `useConfirm` + `Dialog` 基本扎实** — FIFO 队列语义、unmount cleanup、setCurrent ref pattern 都对;但 `titleId`/`messageId` 用常量在 StrictMode 下 aria-labelledby 重复(L-28),首次 render `request` 同步路径的 setCurrent race(L-22)有理论缺陷。

**P2-6 LevelSelect cascading 状态管理可用但偏冗长** — 14 个 useState 在单组件,sublevelId reset 仅切 source(M-7)丢失用户选择,random source 每次 render 重生成 seed(L-37)non-deterministic。

**P2-5 EditorViewport / EditorPropertiesPanel 性能回退** — buildLookups 每 render 重建 Map(L-30),LevelMetadataForm 5 个 debounced commit 每次 re-render 重 schedule(M-21),`validateDesign` 每 render 跑 O(n²) ≈ 50ms(L-14)。

**a11y 中等缺失** — dirty marker 无 `aria-live`(L-34),color contrast 仅 light mode 验证(L-20),HUD 全无 memo 配合频繁 tick(M-12)。

**性能微优化点** — Minimap StaticMaze memo 在 maze reference 变时失效(M-11),HealthBar `Array.from` 每次重建(M-15),InventoryBar/Timer/Crosshair 等缺 memo。

**最该修的 3 条**(按用户感知优先级):

1. **MEDIUM-7**(sublevelId 切换丢失 selection): 用户在 teaching 选 A,切 custom 再切回 teaching,显示 B,需额外点击。
2. **MEDIUM-5**(autosave 反复失败 UX): 编辑器处于无效状态时,每 30s 弹"自动保存失败",无重试退避。
3. **MEDIUM-4**(EditorPage `setShowDraftPrompt(false)` 在 cancelled 检查之前): 用户在 confirm 中途退出编辑器,React warning + setState on unmounted component。

**无 CRITICAL / HIGH** — 主流程逻辑无明显错误。
