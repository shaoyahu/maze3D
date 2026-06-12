# P2-2 — 深色模式 + 新 pickup 视觉 + UseItem 数字键（Code Review）

**Slug**: dark-mode-pickups
**评审范围**: git range `cf291b7~1..HEAD`（P2-2 全部 14 个任务 + 2 个 follow-up，26 文件 / +746 −316）
**评审时间**: 2026-06-08
**评审强度**: xhigh（5+4 角度 × 8 候选 → 1-vote 验证 → gap sweep → ≤15 发现）
**状态**: 13 个发现待处理（9 CONFIRMED + 4 PLAUSIBLE）

---

## 1. 评审方法

P2-2 增量包含 4 条独立特性线（深色模式 / pickup 多色 / 数字键 useItem / 引擎层去 store 化），加 2 个 follow-up（UI 对齐 + 补测 + 覆盖率门槛）。代码量适中但耦合面广（引擎 + store + UI + 主题 + 测试），适合 xhigh recall 模式评审。

**9 个独立 finder 角度**:
- A: 逐行 diff 扫描（line-by-line）
- B: 删除行为审计（removed-behavior auditor）
- C: 跨文件追踪（cross-file tracer）
- D: 语言/框架陷阱（TS + React + Three.js + Zustand）
- E: 包装/代理正确性（wrapper/proxy）
- F: 复用检查（reuse）
- G: 简化检查（simplification）
- H: 效率检查（efficiency）
- I: 高度检查（altitude，是否在合适抽象层）

**3 阶段流水线**:
1. 9 个 finder 各自返回 ≤8 候选
2. 去重后逐个 1-vote 验证（CONFIRMED / PLAUSIBLE / REFUTED）
3. 持验证列表的 fresh reviewer 做 gap sweep

**评级口径**:
- **CONFIRMED**: 能给出触发输入/状态 + 错误输出/崩溃，引用代码行
- **PLAUSIBLE**: 机制真实，触发不确定或仅在未来条件下成立
- **REFUTED**: 与代码不符或被别处保护（已排除）

---

## 2. 严重度排序的发现清单

按"对最终用户可见性 + 修复成本"加权排序。13 条全部为当前 ship 后仍存在的缺陷或契约 smell，不含已被验证 REFUTED 的项。

### F1 · 严重 · CONFIRMED
**Minimap 拾取色未与 3D 拾取色同步（per-type 着色半实现）**
- 文件: `src/ui/components/Minimap.tsx:25`
- 问题: Minimap 硬编码 `COLOR_PICKUP = 'rgba(255, 184, 77, 0.95)'` 用于所有拾取圆点；3D 场景通过 `src/entities/Pickup.ts` 的 `PICKUP_COLORS` 表（`time = 0xffd84d` = 255,216,77）渲染。同一拾取在 2D 地图和 3D 视图中显示两种不同的黄色。
- 触发: 玩家在深色房间接近 time 拾取。3D 八面体是柠檬黄，Minimap 点是金黄。后续任何对 `PICKUP_COLORS` 的调整都不会传播到 Minimap。
- 建议: 让 Minimap 从 `entities/Pickup.ts` 读取 PICKUP_COLORS（hex → rgba 转换），让 2D / 3D 共享同一调色板。

### F2 · 严重 · CONFIRMED
**首屏深色模式 FOUC（useEffect 应为 useLayoutEffect）**
- 文件: `src/App.tsx:59`
- 问题: `data-theme` 在 `useEffect` 中设置，运行时机晚于首次 paint。settingsStore 在模块加载时已同步从 localStorage 读取 darkMode，所以 React 第一次渲染时 darkMode 已经正确，但 useEffect 要等浏览器先画一帧默认（亮）主题才生效。
- 触发: 任何 darkMode=true 的用户每次刷新页面都会看到约 16ms 的亮主题闪烁。深色模式用户每次进游戏都被闪一下。
- 建议: 改为 `useLayoutEffect`，或在 `index.html` 顶部加一段内联 `<script>` 同步设置 `<html data-theme="...">`，在 CSS 评估前完成。

### F3 · 严重 · CONFIRMED
**暂停/Game-over 期间按 1/2 静默丢弃，无任何反馈**
- 文件: `src/ui/GameCanvas.tsx:71`（路径源头）+ `src/store/gameStore.ts:139`（guard 落地）
- 问题: InputManager → bridge.onUseItem → gameStore.useItem 链中，`useItem` action 第一行 `if (s.screen !== 'playing') return;` 静默 no-op。无 toast、无日志、无 UI 反馈。
- 触发: 玩家暂停中按 1 试图用物品，什么都不会发生。玩家以为是按键坏了。e2e `pickup-types.spec.ts` 在按 Digit1 前未暂停，所以这条路径未覆盖。
- 建议: guard 之后加一行 `console.debug('[useItem] ignored: screen =', s.screen)`，或在 InventoryBar 附近加一个"已暂停"提示。也可在 InputManager 层 gate Digit1/Digit2（与 setPaused 同步）。

### F4 · 中 · CONFIRMED
**每关开始 applyPalette 跑两次（潜在未来 1 帧闪烁）**
- 文件: `src/engine/Scene.ts:145` + `src/engine/Game.ts:131`
- 问题: `buildScene` 调用 `applyPalette(LIGHT_PALETTE, null)`（line 145），随后 `Game.startLevel` 调用 `sceneRefs.setDarkMode(bridge.getInitialDarkMode())`（line 131）再次触发 `applyPalette`。每关开始做两次 palette 应用；亮色模式下第二次纯浪费。
- 触发: 玩 10 关 darkMode=false，每关多一次 LIGHT→LIGHT。当前无用户可见缺陷（render loop 还没启动），但若未来在 buildScene 和 setDarkMode 之间插入 `await`（例如流式关卡数据），玩家会看到 1 帧亮色。
- 建议: 把 darkMode 传入 buildScene，一次性应用正确 palette，删除 startLevel 中的 setDarkMode 调用。

### F5 · 中 · CONFIRMED
**InventoryBar 空槽数字渲染两次（中心 + 角标）**
- 文件: `src/ui/components/InventoryBar.tsx:26` 和 `:30`
- 问题: 空槽用 `<span>{i+1}</span>` 作为中心占位（line 26），同时 `position: absolute, top:1, left:4` 的角标（line 30）无论槽位是否填充都渲染。两个 span 都显示数字。
- 触发: 玩家无物品时，slot 0 同时显示两个 "1"，slot 1 同时显示两个 "2"。已被 `tests/component/hud.test.tsx:36-37` 的 `getAllByText('1').length === 2` 断言记录。屏幕阅读器会读出两个 "1" / 两个 "2"，对盲人玩家尤其困扰。
- 建议: 删除空槽的中心占位（角标已足够标识位置），或删除角标（中心占位已有）。两者并存是冗余。

### F6 · 中 · CONFIRMED
**goToMenu 硬编码 `[null, null]`，INVENTORY_SIZE 未在所有重置路径消费**
- 文件: `src/store/gameStore.ts:159`
- 问题: `startLevel`（line 64）使用 `Array(INVENTORY_SIZE).fill(null)`，但 `goToMenu` 硬编码 `inventory: [null, null]`。`INVENTORY_SIZE = 2` 已被声明就是为了消除这种重复，但 goToMenu 没消费它。
- 触发: 未来把 INVENTORY_SIZE 改成 3 时，startLevel 正确生成 3 槽数组，goToMenu 还是 2 槽。胜利 → 退菜单 → 重新开始，inventory 是 [null, null] 而类型/UI/Rules 都假设 3 槽。任何 `inventory[2]` 读返回 undefined，未来的 Digit3 键会静默失效。
- 建议: 改为 `inventory: Array(INVENTORY_SIZE).fill(null)`，与 startLevel 对齐。

### F7 · 中 · CONFIRMED
**槽位类型 `0 | 1` 硬写在 6 个文件，INVENTORY_SIZE 未在类型层消费**
- 文件: `src/store/gameStore.ts:41`（常量定义处）+ 6 处硬写（Rules.ts:47, InputManager.ts:8/51, Game.ts:45, gameStore.ts:28/36）
- 问题: `INVENTORY_SIZE = 2` 常量存在但 `0 | 1` 字面量联合类型在 6 个签名中手写。未来从 2 改 3 时，常量改了但所有 `0 | 1` 注解继续撒谎，TypeScript 不会报错。
- 触发: F6 同 — INVENTORY_SIZE 升到 3，类型继续说"有效槽位是 0 或 1"。新增 Digit3 键在一个文件是类型错误，在另一个文件静默通过。
- 建议: `export type InventorySlot = 0 | 1;`（或 `0 | 1 | 2`）统一类型，从单一来源派生。

### F8 · 中 · CONFIRMED
**`useItem` action 忽略 `result.consumed`，未来 P2-4a 锁门 cell 落地时会埋雷**
- 文件: `src/store/gameStore.ts:137`
- 问题: `Rules.onUseItem` 返回 `{ flash, consumed }`，Rules.ts:36-40 注释明确说"未来 P2-4a 锁门 cell 落地时 `consumed` 翻为 true"。当前 store 只读 `result.flash`，完全忽略 `consumed`。
- 触发: P2-4a 上线时必须同步改 useItem 来清空 `inventory[slot]`。如果开发者忘了（而这个死字段已闲置一整个增量），一把钥匙会无限复用 — 每次 Digit1 都闪但不消耗钥匙，一把钥匙开所有门。
- 建议: 即便当前不需要消费，也加一个 `// TODO(P2-4a): clear inventory[slot] when consumed` 注释；或在 Rules 层就把 consumed 拼到 flash 一起返回，强迫 store 处理。

### F9 · 中 · CONFIRMED
**InputManager Digit1/Digit2 单测缺失（plan 自称"已有覆盖"）**
- 文件: `tests/unit/inputManager.test.ts`（缺失）
- 问题: plan.md Task 5 明确要求"单测 mock keydown 事件（inputManager.test.ts 已有覆盖）"，但文件里 12 个测试覆盖了 KeyW/ArrowDown/A+D/KeyP/mouse/sensitivity/pointerlock，**没有** Digit1/Digit2 用例。新的 `InputManager.ts:92-93` 监听器只被慢得多的 e2e `pickup-types.spec.ts` 覆盖。
- 触发: 未来 refactor 误删 Digit1/Digit2 上的 `!e.repeat` guard（退化为自动重复触发）或破坏监听器接线，e2e 简单"按一次 + 走到出口"流程仍能通过，但 bug 漏掉。plan 显式声明的验证步骤是谎言。
- 建议: 加两个 case：`it('Digit1 fires useItem with slot 0', ...)` 和 `it('Digit2 fires useItem with slot 1', ...)`，照搬 KeyP 用例的 mock 模式。

### F10 · 中 · PLAUSIBLE
**e2e `pickup-types.spec.ts` 按键时长处于能否触发的临界**
- 文件: `tests/e2e/pickup-types.spec.ts:15`
- 问题: 玩家速度 3 units/s；spec 按 4×(250ms down + 150ms up) = 1.0s 有效按压时间 → 移动 ~3 units。`level-tiny-pickups.json` 中 key 拾取在 cell 2（世界 x=5），距起点 x=1 共 4 units。玩家在 x=4.0 停下，刚好压在拾取格入口。`findPickupAt` 触发与否取决于帧时序。
- 触发: 慢 CI runner 或浏览器节流下减速到 x=3.8，pickup 未拾起，后续 Digit1 断言（在空 inventory 上）失败。
- 建议: 改为 4×(400ms down + 150ms up) 或更长，确保有 0.3+ unit 的余量越过 cell 中心。

### F11 · 低 · PLAUSIBLE
**`getInitialDarkMode` 命名 / 注释与实现不一致**
- 文件: `src/engine/Game.ts:36` + `src/ui/GameCanvas.tsx:68`
- 问题: `getInitial*` 前缀 + 注释"snapshotted at init / startLevel"暗示是快照；实现是 `() => useSettingsStore.getState().darkMode`，每次调用读**当前** store，不是快照。
- 触发: 当前无 crash（唯一调用点 `Game.startLevel:131` 的语义恰好是关卡开始时刻）。但名称误导未来维护者把 `getInitial*` 调用搬到 `update()` 每帧路径里，结果每帧读到的是当时 live 值而非关卡开始值，用户切设置时场景闪烁。
- 建议: 改名为 `getCurrentDarkMode`，或真在 startLevel 顶部 snap 一份。

### F12 · 低 · PLAUSIBLE
**`DARK_PALETTE.bg` 和 `fogColor` 重复 0x0a0a14**
- 文件: `src/engine/Scene.ts:128`
- 问题: 同一十六进制值在同一调色板对象的两个字段各存一次。修改背景色但忘了改 fog 会产生可见的地平线接缝。
- 触发: 设计师把 `bg` 调到 `0x0a0a20`（轻微蓝移）增强对比度，fog 留在 `0x0a0a14`。远景几何体雾化进纯深灰而天空偏蓝，地平线一条 1px 接缝。
- 建议: `fogColor: p.bg` 直接引用，或把 fogColor 从 palette 中删除、在 applyPalette 内部 `scene.fog.color.setHex(p.bg)`。

### F13 · 低 · PLAUSIBLE
**填充槽永久高亮，"刚用过"与"有物品"无视觉区分**
- 文件: `src/ui/components/InventoryBar.tsx:15`
- 问题: 填充槽 `borderColor = 'var(--accent)'` 绑定的是 `slot !== null`（有物品），不是"刚用过"瞬态。按 Digit1 后 0.4s flash overlay 播放，但槽位永久边框保持高亮。
- 触发: 玩家捡到 key（槽 0 高亮），按 Digit1（flash 闪一下），key 仍在槽里（当前 no-lock 世界的有意设计），边框继续高亮。"刚用过"与"一直有"无视觉差异 — 未来加 health 消耗品时玩家会困惑。
- 建议: 保留"有物品"高亮作为主信号，但 flash overlay 应该按 flash.version 短暂改边框色（如 `--accent-strong`），让"刚用过"那一帧与"一直有"明显不同。

---

## 3. 显式 REFUTED（不修但记录在案，便于回归时不重提）

| 候选 | 结论 | 引用 |
|---|---|---|
| `applyPalette` 泄漏 Fog/Color | REFUTED | Three.js FogExp2 与 Color 无 GPU 资源，标准替换模式，无泄漏 |
| `useItemFlash` 在 pause/win/game-over 后未清零导致可见 bug | REFUTED | InventoryBar 只在 HUD 挂载时渲染，HUD 在 menu/win/game-over 不挂载，stale 状态不可见 |
| InventoryBar 角标与中心 type 文字重叠 | REFUTED | flex 居中让中心文字在盒中点，距 top:1/left:4 角标 ~24px，无重叠 |
| HMR 时 useSettingsStore.subscribe 在 gameRef 清空后触发 | REFUTED | useEffect 有 `return () => { unsubStore(); unsubSettings(); }` 显式清理 |
| `settingsStore.subscribe` 中 `prev.pointerSensitivity` 可能 undefined | REFUTED | Zustand v4 subscribe 总是提供 prevState，仅在后续 mutation 时触发 |
| `sanitizeSettings` 因 darkMode 缺失而清空整个对象 | REFUTED | 该行为是 P2-2 之前的设计，非 P2-2 回归；plan 未承诺"缺失字段默认 false" |
| Layered scene-sync: subscribe 不触发首挂载 → 漏应用 darkMode | REFUTED | 首挂载由 `Game.startLevel → getInitialDarkMode` 覆盖，路径完整 |

---

## 4. 修复优先级建议

- **立即修（影响用户或易回归）**: F1, F2, F3, F5
- **下次改 inventory / settings 时修**: F6, F7, F8, F9
- **顺手清理**: F4, F10
- **设计层面讨论**: F11, F12, F13

修复 F6/F7 时建议一次提交，避免两次 `0 | 1` → `InventorySlot` 重构与 `[null, null]` → `Array(INVENTORY_SIZE).fill(null)` 重构互相干扰。
