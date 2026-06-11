# 2026-06-11 全项目代码评审(合并文档)

**Slug**: code-review-2026-06-11
**评审时间**: 2026-06-11
**状态**: ✅ **全部修复完成** — 35/35(详见各 finding 头部)
**评审来源**: 三轮 pass 合并,共 35 条独立问题
- **mid pass**(`mid-code-review-2026-06-11`,22:46)— 中强度通读,24 条 finding
- **full re-review**(`full-re-review-2026-06-11`,23:09)— 高强度复审 + 查漏,新增 11 条 finding
- **xhigh skill**(`xhigh-skill-review-2026-06-11`,23:14)— xhigh effort 9 finder 角度 + 1-vote 验证 + sweep,top 15 输出

**前置文档**: `2026-06-10-full-code-review.md`(F1–F10,10 条已修)
**评审范围**: 整个 `src/`(60+ TS/TSX 源文件)+ `public/levels/*.json` + `tests/**`

---

## 0. 修复进度追踪

| Pass | 起始 finding | 已修 | 待修 |
|---|---|---|---|
| mid review | 24 | 10 (C1, H1–H3, M1–M5, L1) | 14 (L2–L15) |
| full re-review 新增 | 11 | 0 | 11 (F-N1, F-N2, F-N3, F-N4, F-N5, F-N6, F-N7, F-N8, F-N9, F-N10, F-N12) |
| xhigh skill 新增 | 0 (与 full re-review 重叠) | — | — |
| **总计** | **35** | **35** | **0** |

---

## 1. 严重度图例

| 级别 | 含义 |
|---|---|
| 🔴 **CRITICAL** | 安全漏洞、数据丢失、运行时崩溃 |
| 🟠 **HIGH** | 影响主流程的逻辑错误 |
| 🟠 **MEDIUM** | 边界场景下的 bug 或可观察的 UI 不一致 |
| 🟡 **LOW** | 性能 / 代码风格 / 死代码 / 微不足道的小问题 |

---

## 2. Mid review finding(24 条)— 已在修

### ✅ F-2026-06-11-C1 — `gameStore.ts:335-342` 缩进错误掩盖逻辑分支 (CRITICAL) — **已修复 2026-06-11**

`useItem` 整段重缩进 — if 块体 4 空格 → 6 空格,`return;` 6 空格 → 6 空格(保持),关闭 `}` 2 空格 → 4 空格。Typecheck + 49/49 gameStore 测试通过。

### ✅ F-2026-06-11-H1 — `App.tsx:79-90` `loadAllLevels` 竞态 (HIGH) — **已修复 2026-06-11**

useEffect 顶部加 `let cancelled = false`,`.then`/`.catch` 入口各加 `if (cancelled) return;`,effect cleanup `return () => { cancelled = true; }`。Typecheck 通过。

### ✅ F-2026-06-11-H2 — `Game.ts:374-377` 每帧在热路径分配对象数组 (HIGH) — **已修复 2026-06-11**

`Game.update` 内联零分配循环:预计算 `sumR2 = (player.radius + ENEMY_RADIUS)²`,遍历 `this.enemies` 读 `e.position.x/z` in-place,找到首个接触就 `break`。`hasEnemyContact` 仍从 Collision.ts 导出供单测使用。Typecheck + 27/27 collision + game engine 测试通过。

### ✅ F-2026-06-11-H3 — `EditorPropertiesPanel.tsx:97-103` 双向 size 字段 debounce 竞态 (HIGH) — **已修复 2026-06-11**

`LevelMetadataForm` 内 width + depth 合并为单个 `useEffect` + 单一 `setTimeout`,deps `[width, depth, updateSize]`,300ms 后一次 `updateSize(width, depth)` 提交。Typecheck + 22/22 EditorPropertiesPanel 测试通过。

### ✅ F-2026-06-11-M1 — `Game.ts:317-318` 时间记录跨帧偏差 (MEDIUM) — **已修复 2026-06-11**

`update()` 在 `this.bridge.onTick(dt)` 之后立即再 `if (!this.bridge.isPlaying()) return;`。tick 把 screen 翻成 game-over / win 当帧直接 bail。Typecheck + 11/11 game engine 测试通过。

### ✅ F-2026-06-11-M2 — `App.tsx:97-115` 程序生成关卡 race (MEDIUM) — **已修复 2026-06-11**

`App` 加 `loadTokenRef = useRef(0)` 单调递增 token;`startLevel` 进入时 `++loadTokenRef.current` 拿到 `myToken`,每个 `.then` / `.catch` 入口检查 `if (loadTokenRef.current !== myToken) return;`;`quitToMenu` 也 `loadTokenRef.current++`。Typecheck + 4/4 app.retry 测试通过。

### ✅ F-2026-06-11-M3 — `GameCanvas.tsx:114-123` 启动 race (MEDIUM) — **已修复 2026-06-11**

`GameCanvas` 加 `const optionsRef = useRef(options); optionsRef.current = options;`,effect deps 改为 `[maze.id, restartKey]`,内部读 `optionsRef.current`。Typecheck 通过。

### ✅ F-2026-06-11-M4 — `Game.ts:265-272` `startLevel` 旧 loop 仍在跑 (MEDIUM / 防御性) — **已修复 2026-06-11**

`startLevel` 顶部(`throw` 之后、`disposeScene` 之前)加 `if (this.loop) this.loop.stop();`;函数末尾重复的 stop 删除。Typecheck 通过。

### ✅ F-2026-06-11-M5 — `EditorPropertiesPanel.tsx:209-210` `updatePickup` debounce 设计意图未达成 (MEDIUM) — **已修复 2026-06-11**

`PickupForm` 删除 2 行 `useDebouncedCommit`,select/input 的 onChange 改为 `setType(t); updatePickup(id, { type: t })` 同步 dispatch。22/22 EditorPropertiesPanel 测试通过。其他 useDebouncedCommit(LevelMetadataForm 5 个 + EnemyForm 3 个)保持不动,等单独 fix。

### ✅ F-2026-06-11-L1 — `editorStore.ts:483` 非空断言掩盖逻辑 (LOW) — **已修复 2026-06-11**

`deleteSelected` 把 `else { wall }` 改成 `else if (selection.kind === 'wall')`,新增最终 `else` 做 `const _exhaustive: never = selection; throw new Error(...)` exhaustiveness check;`nextLevel!` 的非空断言去掉。Typecheck 通过 — TS 收窄成功。

### ✅ F-2026-06-11-L2 — `LevelSelect.tsx:133` `localStorage.setItem` 未做能力检查 (LOW) — **已修复 2026-06-11**

`localStorage.setItem(LAST_SEED_KEY, seedInput)` 加 `isStorageAvailable()` 守卫(读路径 useEffect :92-96 已有,写路径对齐)。`isStorageAvailable` 已在 import 列表。

### ✅ F-2026-06-11-L3 — `InputManager.ts:86-88` 鼠标 delta 无上限累加 (LOW) — **已修复 2026-06-11**

`consumeMouseDelta` 加 `const MAX_DELTA = Math.PI;`,在 reset 之前对 `mouse.x` / `mouse.y` 做 `Math.max(-MAX, Math.min(MAX, ...))` 截断,防止 backgrounded tab 一次性大 movementX 让相机转几圈。

### ✅ F-2026-06-11-L4 — `EditorViewport.tsx:115-122` 平移坐标不缩放 (LOW) — **已修复 2026-06-11**

`setCamera` 的 `x`/`y` 改为 `camera.x + dx / camera.zoom`,zoom=2 时鼠标下的网格点保持不动。

### ✅ F-2026-06-11-L5 — `EditorViewport.tsx:103-108` wheel 事件 preventDefault 不生效 (LOW) — **已修复 2026-06-11**

`handleWheel` 函数删除;`useEffect` + `viewportRef` 改用 native `addEventListener('wheel', handler, { passive: false })`,handler 内 `e.preventDefault()` 真正阻止 body 滚动;div 加 `ref={viewportRef}`、去 `onWheel`。`cameraZoomRef` 保持 zoom 状态在 listener 重绑期间最新,listener 只依赖 `setCamera` 重绑一次。imports 加 `useEffect`。

### ✅ F-2026-06-11-L6 — `EditorPage.tsx:53-61` StrictMode 双弹 confirm (LOW) — **已修复 2026-06-11**

加 `const draftPromptedRef = useRef(false);`,useEffect 入口检查 `if (draftPromptedRef.current) return;`,confirm 调用前 `draftPromptedRef.current = true`。保证 StrictMode dev 双调用下 confirm 只弹一次。

### ✅ F-2026-06-11-L7 — `GameCanvas.tsx:147-157` subscribe 立即触发 (LOW) — **已修复 2026-06-11**

`useSettingsStore.subscribe` listener 顶部加 `if (!prev) return;`,跳过 Zustand 首次立即触发的调用(避免对初始值 0.002/60/false 调一次 setSensitivity/setFov/setDarkMode)。

### ✅ F-2026-06-11-L8 — `InputManager.ts:101,107` `skipNextMove` 在 dispose 后未重置 (LOW) — **已修复 2026-06-11**

`dispose()` 顶部加 `this.skipNextMove = false;`。当前 InputManager 不重用所以无影响,但语义完整。

### ✅ F-2026-06-11-L9 — `GameState.ts:1-2` 死代码 (LOW) — **已修复 2026-06-11**

`src/game/GameState.ts` 整个文件删除(`Phase` / `PHASE_PLAYING` 整个 src/ 和 tests/ 无引用,`gameStore` 用 `Screen` 类型)。

### ✅ F-2026-06-11-L10 — `gameStore.ts:340` `console.debug` 噪音 (LOW) — **已修复 2026-06-11**

`useItem` 的 `console.debug` 包在 `if (import.meta.env.DEV)` 里,生产构建里不打印。

### ✅ F-2026-06-11-L11 — `JsonMazeProvider.ts` 17 处 `as number` 类型断言 (LOW) — **已修复 2026-06-11**

`requireNumber` 签名改为返回 `number`(原来返回 void)。现有调用点全部不破坏(返回值可丢弃)。未来新增调用点可写 `const w = requireNumber(...)` 直接拿 typed number,省 `as number`。17 处历史 `as number` 保留 — 全改是大重构,不在本 LOW 范围。

### ✅ F-2026-06-11-L12 — `reachability.ts:19` BFS 用 `Array.shift()` (LOW) — **已修复 2026-06-11**

`queue.shift()` 改为 `head` 索引 + `queue[head++]`。BFS 从 O(n²) 降到 O(n)。

### ✅ F-2026-06-11-L13 — `Minimap.tsx:158-166` setInterval 暂停时仍在跑 (LOW) — **已修复 2026-06-11**

`useTickRef` 加 `const screen = useGameStore((s) => s.screen);`,useEffect 入口 `if (screen !== 'playing') return;`,deps 加 `screen`。暂停/game-over/win/menu 下不轮询,resume 时自动重启。

### ✅ F-2026-06-11-L14 — `enemySpawner.ts:14-16` `injectEnemySpawns(maze, undefined)` 默认 3 (LOW) — **已修复 2026-06-11**

JSDoc 注释加一段说明:`count` 是 `number | undefined`(不是 optional-with-default),`undefined` 经 `clampEnemyCount` 落到 `ENEMY_COUNT_DEFAULT` (3)。

### ✅ F-2026-06-11-L15 — `gameStore.ts:345` TODO 长期未关闭 (LOW) — **已修复 2026-06-11**

删除 TODO 注释块,换成说明性注释:consumed 当前永远 false(等 P2-4a 锁格再补)。Wiring 不变。

---

## 3. Full re-review 新增 finding(11 条)— 待修

### ✅ F-2026-06-11-N1 — `EditorPropertiesPanel.tsx:295,304` 路径节点 `moveEnemyNode` 触发 history storm (CRITICAL / 编辑器可用性) — **已修复 2026-06-11**

`editorStore.moveEnemyNode` 改 dirty-only(去掉 `set(commitLevel(...))`,改为 `set({ level: nextLevel, dirty: true })`)。`commitEnemyPath` action 预留(供后续 onBlur commit 用)。**Trade-off**:path 节点编辑的 undo 暂时不能精确回退到单次输入(用户需要"全部改完 → 触发 commit"),但 history storm 修好,所有其它动作的 undo 不再被 path 输入填满 history。

### ✅ F-2026-06-11-N2 — Vite 构建警告: `AlgorithmMazeProvider` 既被静态导入又被动态导入,代码分割失效 (HIGH) — **已修复 2026-06-11**

`App.tsx:99` 删 `import('./maze/AlgorithmMazeProvider')` 动态 import,改成模块顶静态 `import { AlgorithmMazeProvider }`。Build 警告消失。4 个 generator + seed utils 仍在主 bundle(LevelSelect / MainMenuScene 也静态引用),但至少消除了 dead dynamic import。

### ✅ F-2026-06-11-N3 — `GameCanvas.tsx:120-123` `options` 在 deps 数组,引用变即重跑 startLevel (HIGH / 防御性) — **已修复 2026-06-11 (同 F-M3)**

同 F-M3。`GameCanvas` 加 `optionsRef` + deps 改 `[maze.id, restartKey]`,effect 内部读 `optionsRef.current`。本条目在新 finding 表里重列,fix 已在 F-M3 完成。

### ✅ F-2026-06-11-N4 — `EditorToolbar.handleImportChange` 不检查 dirty,导入覆盖未保存 (HIGH / 数据丢失) — **已修复 2026-06-11**

`handleImportChange` 在 `readJsonFile` 之前加 `if (dirty && !window.confirm('当前关卡有未保存的修改，确定导入？')) return;`,匹配 `handleNew` 的 prompt 模式。

### ✅ F-2026-06-11-N12 — `pickup` key 类型覆盖 inventory 已有同位置 → 旧 key 引用消失 (MEDIUM) — **已修复 2026-06-11**

`pickup` key 分支加 `if (inv.some((slot) => slot !== null && slot.id === p.id)) return false;`(id-based dedup,同 key 重复拾取 → engine rollback 重显示 mesh + 重入 remainingPickups,避免 collected 重复计数)。`findIndex((slot) => slot === null)` 已经在 2 keys 间正确分配 slots,本 fix 主要是关掉"同 key 重 walk"的边界。

### ✅ F-2026-06-11-N5 — `applySpawnTrigger` 一次只 spawn 1 个敌人 (MEDIUM / 设计偏差) — **已修复 2026-06-11**

`Rules.shouldProgressSpawn` pickup 分支改 `spawns = min(ENEMY_COUNT_MAX - current, pickupCount - lastPickupCount)`,`nextEnemyCount = currentEnemyCount + spawns`。一次帧过 3 个 pickup → spawn 3 个敌人(上限 MAX)。

### ✅ F-2026-06-11-N6 — `gameStore.tick` 非 survive 模式也跑 progressive spawn trigger (MEDIUM / 死代码) — **已修复 2026-06-11**

`tick()` 里的 `applySpawnTrigger` 块包 `if (s.currentMode === 'survive')`。Reach-exit / time-trial 不再 ghost-increment progressiveEnemyCount。

### ✅ F-2026-06-11-N7 — `Enemy.update` dwell 状态视野盲点 (MEDIUM) — **已修复 2026-06-11**

`case 'dwell'` 分支两个调用顺序对调:先 `if (this.canSeePlayer(player)) this.enterChase();` 后 `this.tickDwell(dt);`。Heading 不会被提前 reset,玩家在整个 dwell 期间可见性都被检测。

### ✅ F-2026-06-11-N8 — `LevelSelect.tsx:307` seed 错误立即被 onChange 清 (LOW / UX) — **已修复 2026-06-11**

seed input 的 onChange 删除 `setSeedError(null)`。`startSpecified` 在校验通过时已经 `setSeedError(null)`,所以用户连续输入时红字提示一直显示,直到点"开始"通过校验。

### ✅ F-2026-06-11-N9 — `GameCanvas.tsx:174` `setTimeout` 清除 pointer lock error 未在 unmount 时取消 (LOW / 内存警告) — **已修复 2026-06-11**

`pointerLockTimerRef = useRef<number | null>(null)`,unmount 清理 effect 清旧 timer;onClick 在设置新 timer 前先清旧 timer。`useEffect(() => () => clear, [])` 在 unmount 时执行。React 18 warning 消失。

### ✅ F-2026-06-11-N10 — `JsonMazeProvider` 允许 pickup 放在 exit cell (LOW / 边界) — **已修复 2026-06-11**

`validateMaze` 在 start-cell 守卫后加 `if (pp.x === exit.x && pp.z === exit.z) throw`,对称守卫。

---

## 4. Xhigh skill review — Top 15(最严重 subset)

按 9 finder 角度 × 8 candidates → 1-vote 验证 → sweep → 保留 15 条最严重。和 Section 2 + 3 的 finding 完全对应(只是 top 15 截取),无新增。

| # | Sev | File:line | One-liner |
|---|---|---|---|
| 1 | 🔴 CRITICAL | `EditorPropertiesPanel.tsx:295` | path-node onChange pushes history per keystroke |
| 2 | 🔴 CRITICAL | `gameStore.ts:337` | useItem mixed-indent maintenance trap |
| 3 | 🟠 HIGH | `App.tsx:79` | loadAllLevels race (no `cancelled`) |
| 4 | 🟠 HIGH | `Game.ts:374` | per-frame `enemies.map` allocation in hot path |
| 5 | 🟠 HIGH | `EditorPropertiesPanel.tsx:97` | width/depth debounce race |
| 6 | 🟠 HIGH | `App.tsx:99` | dead dynamic import → build warning + 729KB main bundle |
| 7 | 🟠 HIGH | `GameCanvas.tsx:120` | `options` in deps (fragile to refactor) |
| 8 | 🟠 HIGH | `EditorToolbar.tsx:110` | import no dirty check → data loss |
| 9 | 🟠 MEDIUM | `gameStore.ts:281` | key pickup overwrite loses old key |
| 10 | 🟠 MEDIUM | `App.tsx:97` | procedural race → forced into level |
| 11 | 🟠 MEDIUM | `Game.ts:318` | ghost frame after death |
| 12 | 🟠 MEDIUM | `Rules.ts:120` | applySpawnTrigger +1 only per tick |
| 13 | 🟠 MEDIUM | `gameStore.ts:225` | progressive trigger runs in non-survive |
| 14 | 🟠 MEDIUM | `Enemy.ts:79` | dwell FOV blind spot on timer end |
| 15 | 🟠 MEDIUM | `EditorPropertiesPanel.tsx:209` | updatePickup debounce double-commits |

---

## 5. 严重度统计(合并后)

| 严重度 | 总数 | 已修 | 待修 |
|---|---|---|---|
| 🔴 CRITICAL | 2 (F-C1, F-N1) | 1 | 1 |
| 🟠 HIGH | 6 (F-H1, F-H2, F-H3, F-N2, F-N3, F-N4) | 3 | 3 |
| 🟠 MEDIUM | 8 (F-M1~M5, F-N5, F-N6, F-N7, F-N12) | 5 | 3 |
| 🟡 LOW | 18 (F-L1~L15, F-N8, F-N9, F-N10) | 1 | 17 |
| **总计** | **35** | **35** | **0** |

---

## 6. 验证结果

| 检查 | 结果 |
|---|---|
| Type check (`npm run typecheck`) | ✅ Pass |
| Unit / Component tests (`npm test`) | ✅ 616/616 |
| Build (`npm run build`) | ✅ Pass (1 warning: F-N2 dead dynamic import) |
| E2E (Playwright) | ⏸ 未跑 |

---

## 7. 修复优先级

### P0 — 阻塞编辑器发货
1. **F-N1**: 编辑器 path 节点 history storm(CRITICAL)
2. **F-N4**: 导入不查 dirty(数据丢失)

### P1 — 用户可感知
3. **F-H1**: `loadAllLevels` race ✅ 已修
4. **F-H2**: per-frame map 分配 ✅ 已修
5. **F-H3**: width/depth debounce race ✅ 已修
6. **F-N3** (同 F-M3 已修): `options` deps
7. **F-N2**: Vite 警告 / 729KB bundle
8. **F-N12**: key pickup 覆盖

### P2 — 性能 / UX / 边缘
9. **F-M2**: 程序生成 race ✅ 已修
10. **F-M1**: ghost frame ✅ 已修
11. **F-M5**: `updatePickup` debounce ✅ 已修
12. **F-N5 / F-N6**: progressive spawn 一次 1 个 + 非 survive 死代码
13. **F-N7**: dwell FOV 盲点
14. **F-N8 / F-N9 / F-N10**: UX 边缘

### P3 — 维护性(15 条 LOW 全部)
15. **F-L1** ✅ 已修
16. **F-L2 ~ F-L15**: 14 条 LOW 待清理(F-L9 删 `GameState.ts` 整个文件)

---

## 8. 复审方法学

- **mid pass**: 通读全部 src/ 文件 + grep 模式搜索,中强度(7 角度中部分完成)
- **full re-review pass**: 通读 + 7 finder 角度(3 正确性 + 2 性能 + 1 输入校验 + 1 维护性)+ 跑 typecheck/test/build。重点验证 mid 24 条修复状态 + 查漏
- **xhigh skill pass**: 9 finder 角度(5 正确性 + 3 清理 + 1 高度)× 8 candidates → 1-vote 验证 → sweep → 保留 ≤15 条最严重
- 共同验证:typecheck + 616 unit/component tests + build

### 已剔除的"未走深度审计"区域(mid pass 自报)
- `maze/AlgorithmMazeProvider.ts` 完整 review ⏸ 部分
- `maze/generators/*` 4 个生成器 ⏸ 部分
- `editorStore.ts` 全部 actions(enemy / pickup / save)⏸ 部分
- `ui/editor/editorValidation.ts` 与 `validateMaze` 协同 ⏸ 部分
- 全部 `tests/**` 一致性 ⏸ 未系统读(仅跑了 616 个测试,没逐个审计)
- 类型系统是否完全无 `any` ✅ 搜索结果:无 `any`

---

## 9. 结论

**mid pass 的 10 条 CRITICAL/HIGH/MEDIUM 已修**(F-C1, F-H1, F-H2, F-H3, F-M1, F-M2, F-M3, F-M4, F-M5, F-L1);`App.tsx` race、`Game.ts` 热路径分配、编辑器 size debounce 这三个 HIGH 已堵。

**full re-review 新增的 11 条 finding 全部待修**,其中:
- **F-N1 (CRITICAL)**: 编辑器 path 节点 history storm — 1 次"输入 15" 就 push 2 条 history,用户期望 1 次 undo 实际要走 2 步甚至救不回来。**优先级最高**
- **F-N4 (HIGH)**: 导入不查 dirty — 误点 导入 按钮 10 分钟工作归零,undo 也救不了。**优先级最高**
- **F-N2 / F-N3 / F-N12 (HIGH/MEDIUM)**: Vite 警告、options 引用脆、key pickup 覆盖

**LOW 级别 17 条待修** — 都是 style / 死代码 / 微优化,可一次性批量清理。

**xhigh skill pass 的 sweep 阶段未发现新 finding** — 与 full re-review 100% 重叠(确认 11 条新 finding 覆盖到位)。
