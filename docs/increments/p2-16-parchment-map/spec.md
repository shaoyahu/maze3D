# P2-16 羊皮纸地图 — 设计文档（Spec）

**Slug**: p2-16-parchment-map
**状态**: draft（2026-06-30）
**日期**: 2026-06-30
**对应路线图项**: P2-16
**依赖**: P2-4a（敌人与伤害源）、P2-8（i18n）、P2-11（教学关 + `hideMinimap` 字段退役）
**复杂度**: Large

## 1. 概述

当前关卡的右上角「小地图」是**自动全图渲染**——玩家不需要探索就知道关卡结构，新人引导效果差，关卡「紧张感」也被信息透明化稀释。本增量在 P2-11 已落地的 `hideMinimap` 基础上引入**第三种地图模式：手持羊皮纸地图**：

1. 把关卡设计师的二元选择（显示/隐藏）升级为三态枚举 `minimapMode: 'top-right' | 'parchment' | 'hidden'`。
2. 当 `minimapMode === 'parchment'` 时，玩家按 **M** 键打开全屏 modal，**初始空白、走过才显现**。
3. 玩家受伤时（当前唯一伤害源 = 敌人碰撞）按概率在玩家所在 cell 留下**损伤区**——三种视觉（水渍 / 火烧 / 撕裂），覆盖区域的地图数据对玩家**不可读**。
4. 编辑器暴露两个关卡级联开关：开窗时是否暂停游戏、死亡 / 重玩时羊皮纸是否清空。
5. 完整可视化：墙体、起点、终点、走过的高亮区、走过才出现的拾取物、三种损伤叠加。

走过的路才看得见、自己身上的伤就是地图的伤——把「读图」与「活命」绑成同一件事。

## 2. 目标 / 非目标

### 目标
- G-1：编辑器三态切换 `minimapMode`，默认值 `'top-right'`，旧 `hideMinimap: true` 自动迁移到 `'hidden'`
- G-2：当 `minimapMode === 'parchment'` 时按 M 打开 modal，显示程序生成的羊皮纸纹理 + 走过路径 + 拾取物 + 损伤区
- G-3：玩家每经过一个新 cell 一次，将其加入 `visitedCells`；同一 cell 不重复加入
- G-4：玩家受伤事件有 50% 概率在当前 cell 生成 1 个损伤区；类型随机（water / burn / tear）；半径 1-2 格；同 cell 不会重复生成（已存在则忽略）
- G-5：损伤区按类型不同方式遮蔽下层地图：water 模糊、burn 掏空、tear 切碎
- G-6：编辑器提供两个联级开关 `mapOpenBehavior: 'pause' | 'continue'` 和 `parchmentLifecycle: 'reset-on-death' | 'persist'`，仅在 `minimapMode === 'parchment'` 时 UI 可见
- G-7：modal 支持 M 键再按一次 / ESC 关闭；开窗期间焦点交给 modal
- G-8：内置 4 关迁移：`level-tiny.json` 等老 JSON 兼容读取，自动 `hideMinimap` → `minimapMode: 'hidden'`

### 非目标
- 不做损伤扩散动画（先静态，后续增量）
- 不做自定义键位（仅 M 键，不进 settingsStore）
- 不做羊皮纸状态持久化（不写 localStorage，每局重置）
- 不在羊皮纸上显示敌人实时位置（关卡是静态关卡 + 我的脚步，不是雷达）
- 不做死亡 / 重生机制本身——`parchmentLifecycle: 'persist'` 暂只做 API 占位，等死亡机制增量落地时再接通
- 不引入外部动画 / UI 库；canvas 2D 已够用
- 不替换或破坏现有右上角 Minimap 组件——`minimapMode === 'top-right'` 走原路径

## 3. 用户故事

- 作为 新玩家，我希望在**哨兵回廊**里按 M 能看到自己走过的痕迹，而不是直接知道出口在哪——这才是「探索」
- 作为 新玩家，我希望我**受伤时地图也受伤**，这样我必须更小心，而不是随便冲
- 作为 新玩家，我希望我看着地图时游戏可以暂停（避免被摸到），但关卡设计师可以让这一关**继续接受伤害**增加紧张感
- 作为 关卡设计师，我希望编辑器能直接选「右上角小地图 / 羊皮纸 / 完全隐藏」三种模式，不用手改 JSON
- 作为 关卡设计师，我希望我设计的关卡能决定玩家在死亡 / 重玩时羊皮纸是否清空，做「一命通关」类型关卡时强制 `reset-on-death`
- 作为 老玩家，我希望老关卡的 `hideMinimap: true` 自动迁移到新字段，不会因为升级玩不了

## 4. 功能需求

### FR-1: MazeData schema 扩展

```ts
// src/maze/types.ts

// 替换旧 hideMinimap: boolean
export type MinimapMode = 'top-right' | 'parchment' | 'hidden';

export interface LevelRules {
  // ... 现有字段
  minimapMode?: MinimapMode;          // 默认 'top-right'
  // 仅在 minimapMode === 'parchment' 时生效,其它模式引擎忽略
  mapOpenBehavior?: MapOpenBehavior;  // 默认 'pause'
  parchmentLifecycle?: ParchmentLifecycle;  // 默认 'reset-on-death'
}

export type MapOpenBehavior = 'pause' | 'continue';
export type ParchmentLifecycle = 'reset-on-death' | 'persist';
```

`MazeData.hideMinimap?: boolean` **退役**：仍保留字段定义与解析（兼容老 JSON），但 `JsonMazeProvider` 解析时若 `hideMinimap === true` 且 `minimapMode` 未设置，迁移到 `minimapMode: 'hidden'` 并 `console.warn` 一次。

### FR-2: 引擎 ParchmentState 模块

新增 `src/engine/ParchmentState.ts`（纯 TS 模块，无 React / Zustand 依赖）：

```ts
export type DamageType = 'water' | 'burn' | 'tear';

export interface DamageRegion {
  type: DamageType;
  cx: number;          // cell x
  cz: number;          // cell z
  radius: number;      // 半径(格数),1 或 2
  seed: number;        // 撕裂/火烧形态随机种子
  createdAtTick: number;
}

export interface ParchmentState {
  visitedCells: ReadonlySet<string>;  // "x,z" 序列化,O(1) 查询
  damageRegions: readonly DamageRegion[];
  isOpen: boolean;
}

export const DAMAGE_TRIGGER_PROBABILITY = 0.5;
export const DAMAGE_RADIUS_RANGE: readonly [number, number] = [1, 2];

// 纯函数:玩家进入新 cell 时返回新 ParchmentState
export function recordVisit(
  state: ParchmentState,
  cellX: number,
  cellZ: number,
): ParchmentState;

// 纯函数:受伤时按概率生成损伤区
// - 50% 概率返回原 state
// - 同 cell 已有任意损伤区则返回原 state(避免叠伤)
// - 半径 [1, 2] 随机,类型均匀分布,seed 来自全局 PRNG
export function maybeRecordDamage(
  state: ParchmentState,
  cellX: number,
  cellZ: number,
  nowTick: number,
  prng: () => number,
): ParchmentState;

export function openMap(state: ParchmentState): ParchmentState;
export function closeMap(state: ParchmentState): ParchmentState;
export function resetMap(state: ParchmentState): ParchmentState;  // 清空 visited + damage
```

### FR-3: Game 接入

`src/engine/Game.ts`:
- `startLevel` 时初始化 `this.parchment = { visitedCells: new Set(), damageRegions: [], isOpen: false }`
- `update()` 每帧:
  - 计算 `cellX = floor(player.position.x / cellSize)` / `cellZ = floor(player.position.z / cellSize)`
  - 调用 `recordVisit(this.parchment, cellX, cellZ)` → 赋值
- 已有 `applyDamage` 调用点（敌人碰撞）:
  - 受伤后若 `rules.minimapMode === 'parchment'` 且 `damaged === true`,调用 `maybeRecordDamage(this.parchment, cellX, cellZ, this.tick, this.prng)`
- `dispose()` 释放 ParchmentState(无资源,仅置空)
- `GameBridge` 接口加 `onParchmentStateChange?: (state: ParchmentState) => void`(可选,UI 订阅)

### FR-4: store 暴露

`src/store/gameStore.ts`:
- 新增 `parchment: ParchmentState` 字段
- 引擎通过 `GameBridge.onParchmentStateChange` 调用 `useGameStore.getState().setParchment(state)`
- 新增 actions: `openParchment()` / `closeParchment()` / `toggleParchment()` / `resetParchment()`
- `startLevel` 时调 `resetParchment()` 初始化
- `goToMenu` 时同样 `resetParchment()`(下一局从空白开始)

### FR-5: 输入绑定

`src/engine/InputManager.ts`:
- 新增 action `OPEN_MAP`(纯事件名,不绑键)
- `src/ui/GameCanvas.tsx` 在 useEffect 中:`window.addEventListener('keydown', handler)`,按 M 时 `gameStore.toggleParchment()`(M 优先于 actions 默认映射)
- 仅当 `currentMaze.rules.minimapMode === 'parchment'` 时响应;否则 noop
- M 键在 modal 打开时不冒泡到游戏(不触发运动)
- 不进 settingsStore 重映射(后续增量)

### FR-6: ParchmentMap UI 组件

新增 `src/ui/components/ParchmentMap.tsx` + `ParchmentMap.module.css`:

- 全屏 fixed modal(类似 PauseOverlay)
- 主体 `<canvas>`:
  - 离屏生成羊皮纸底图(noise + sepia gradient + 不规则撕扯边缘),缓存到 `OffscreenCanvas` 或 hidden `<canvas>`
  - 离屏生成墙体灰墨图(每个 wall cell 一个深色矩形)
  - 离屏生成拾取物 / 起点 / 终点图标
  - 每帧仅在 `visitedCells` 或 `damageRegions` 变化时合并重绘
- 渲染顺序(下→上):
  1. 羊皮纸底
  2. 墙体(全图始终可见——不走过的区域也能看到墙)
  3. 起点 / 终点
  4. visited cells 高亮(淡棕底色,标识「已探索」)
  5. 拾取物(仅在 visited cells 内显示)
  6. 损伤区叠加(water / burn / tear,各按程序生成纹理)
- 关闭方式:再按 M / ESC / 点击右上角 ✕
- 失去焦点时(切到其它 tab)自动关闭(`document.visibilitychange`)
- 无障碍:`role="dialog"` `aria-modal="true"` `aria-label={t('ui.parchment.title')}`

### FR-7: 损伤区视觉(程序生成,无外部资源)

- **water(水渍)**:径向渐变,深棕 → 半透,边缘羽化 30%;`globalCompositeOperation = 'multiply'`
- **burn(火烧)**:不规则多边形(用 seed 生成)+ 焦黑边 + 中心 `alpha = 0`(掏空);后续帧不做扩散
- **tear(撕裂)**:3-5 个小多边形拼接切口,锯齿边缘,alpha 渐变(还能看见但费眼)

每个损伤区在离屏 canvas 上预渲染一次(RLE 缓存),主 canvas 通过 `drawImage` 叠加——避免 50 个损伤区 × 50x50 网格的 N² 重算。

### FR-8: 编辑器三态切换 + 联级开关

`src/ui/editor/EditorPropertiesPanel.tsx` + `editorStore`:
- 删除 `maze.hideMinimap` 控件
- 新增 Segmented 三态 `minimapMode`:
  - 「到达出口」→ `'top-right'`
  - 「羊皮纸地图」→ `'parchment'`
  - 「完全隐藏」→ `'hidden'`
- 当 `minimapMode === 'parchment'` 时,下方淡入两个新 Switch:
  - `mapOpenBehavior`: 打开时 → 「暂停游戏」/「继续接受伤害」
  - `parchmentLifecycle`: 死亡 / 重玩 → 「清空羊皮纸」/「保留走过的痕迹」
- 切到非 parchment 模式时,两个字段值**保留**(切回时不丢配置)
- `editorStore` 新增 actions: `updateMinimapMode` / `updateMapOpenBehavior` / `updateParchmentLifecycle`

### FR-9: 内置关卡迁移

- `public/levels/level-tiny.json` 等所有内建关卡:**不主动改**(靠 JsonMazeProvider 的 hideMinimap 字段迁移)
- `teaching-03.json`(哨兵回廊)可选项:在 spec 中描述为「推荐改为 `minimapMode: 'parchment'` + `mapOpenBehavior: 'continue'`」,但本增量**不强制改**——留给后续 demo 增量或作者手动
- `teaching-01.json` 走默认 `minimapMode: 'top-right'`,行为不变

### FR-10: HUD 提示

- 当 `minimapMode === 'parchment'` 时,HUD 右下角加一行小字提示「M 打开羊皮纸」
- 该提示在第一局首次提示一次后,通过 `settingsStore` 的「已显示过地图提示」flag 隐藏(可选;MVP 阶段可不实现,只每局都提示)

## 5. 数据 /类型变更

### 新增 / 修改的类型
- `src/maze/types.ts`:
  - 新增 `MinimapMode` / `MapOpenBehavior` / `ParchmentLifecycle`
  - `MazeData.hideMinimap` 标 deprecated(JSDoc 注明)
  - `LevelRules` 加 3 个可选字段
- `src/engine/ParchmentState.ts`(新文件):
  - `DamageType` / `DamageRegion` / `ParchmentState` / 5 个常量
  - 4 个纯函数

### 新增 / 修改的 Store 字段
- `gameStore`:
  - `parchment: ParchmentState`
  - `setParchment(state)` / `openParchment()` / `closeParchment()` / `toggleParchment()` / `resetParchment()`
- `editorStore`:
  - `updateMinimapMode(mode)` / `updateMapOpenBehavior(b)` / `updateParchmentLifecycle(l)`
- `settingsStore`(可选):「已显示过地图提示」flag — 本增量不实现

## 6. 引擎 /架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | 新增 3 个 type + LevelRules 3 字段 |
| `src/maze/JsonMazeProvider.ts` | UPDATE | 解析新字段;`hideMinimap` → `minimapMode` 迁移 + warn |
| `src/maze/builtInLevels.ts` | UPDATE | 列表过滤无变化(只是 JSON 内容) |
| `src/engine/ParchmentState.ts` | CREATE | 纯函数 + 类型 |
| `src/engine/Game.ts` | UPDATE | 初始化 / 接入 visit + damage / GameBridge 扩展 |
| `src/engine/InputManager.ts` | UPDATE | `OPEN_MAP` 事件名常量 |
| `src/store/gameStore.ts` | UPDATE | parchment 字段 + 5 个 actions |
| `src/store/editorStore.ts` | UPDATE | 3 个新 actions + 字段持久化 |
| `src/ui/components/ParchmentMap.tsx` | CREATE | modal + canvas 渲染 |
| `src/ui/components/ParchmentMap.module.css` | CREATE | 样式 |
| `src/ui/GameCanvas.tsx` | UPDATE | 渲染 ParchmentMap;监听 M 键;M 优先级 |
| `src/ui/HUD.tsx` | UPDATE | 提示「M 打开羊皮纸」 |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 三态切换 + 联级开关 |
| `src/i18n/resources/zh.ts` | UPDATE | `ui.parchment.*` + `editor.properties.field.{minimapMode, mapOpenBehavior, parchmentLifecycle}` |
| `src/i18n/resources/en.ts` | UPDATE | 同上 |
| `src/styles/theme.css` | UPDATE | `.parchment-map__*` 主题变量 |

### 边界检查
- 引擎层(`src/engine/ParchmentState.ts`)不 import `react` / `store` / `react-dom` / `zustand`
- `ParchmentState` 的所有操作都是纯函数——`Game.update()` 拿到 `nowTick` 与 `prng` 后调用,不持有外部状态
- `MazeData.hideMinimap` 保留类型定义但加 `@deprecated` 注释;`JsonMazeProvider` 在 `validateMaze` 末尾做迁移并 `console.warn` 一次

## 7. UI /UX 变更

### 屏幕 /组件改动
- `EditorPropertiesPanel`:新 Segmented「地图模式」+ 联级 2 个 Switch
- `GameCanvas`:`<ParchmentMap />` modal(仅 `minimapMode === 'parchment'` 时挂载)
- `HUD`:右下角小字「M 打开羊皮纸」(仅 parchment 模式)

### 交互流程
1. 玩家载入关卡,`minimapMode === 'parchment'`
2. HUD 出现「M 打开羊皮纸」提示
3. 玩家按 M → modal 出现,显示**空白**羊皮纸(无任何路径/拾取物)
4. 玩家走动 → 走过路径在 modal 中实时显现(下次开 modal 也保留)
5. 玩家被敌人撞 → 50% 概率在当前位置生成损伤区
6. 玩家再按 M / ESC / 点 ✕ → modal 关闭
7. 玩家死亡 / 重玩 → 按 `parchmentLifecycle` 决定清空或保留

### 视觉参考
- 羊皮纸底:sepia 渐变 `#d4b896` → `#a8825a` + 撕扯边缘 alpha 渐变
- 墙体:`#3a2a1a` 半透矩形
- visited 高亮:`#c8a878` 半透 + 描边
- 拾取物图标:简笔(time = 沙漏,health = 心,key = 钥匙),深棕墨色
- 起点:`▲` 终点:`★` ,深绿 / 深红描边

## 8. 错误处理

### 新增错误码
无新增(纯渲染 / 纯状态,无 IO)

### 兜底行为
- `minimapMode` 字段值非法 → `isMinimapMode` 守卫失败 → 静默回退到 `'top-right'`
- canvas 创建失败(老浏览器无 OffscreenCanvas)→ 降级到主 canvas 直接绘制(性能略差,功能等价)
- `GameBridge.onParchmentStateChange` 未挂载 → 引擎照样写状态,UI 不订阅
- 50x50 网格绘制超过 16ms → 用 `requestIdleCallback` 拆分绘制(若不支持则降级 setTimeout 0)
- 损伤区生成时 `prng()` 返回 NaN → 兜底用 `Math.random()`,但概率/分布不变

## 9. 测试策略

### 单元测试
- `engine/ParchmentState.test.ts`:
  - `recordVisit` 同 cell 重复调用 → visited 不增
  - `recordVisit` 跨 cell → visited 增
  - `maybeRecordDamage` 概率分支(用 stub prng 强制返回 0/0.5/1)
  - `maybeRecordDamage` 同 cell 已有任意损伤区 → 不再叠加
  - `maybeRecordDamage` 半径 ∈ [1, 2]
  - `maybeRecordDamage` 类型 ∈ {water, burn, tear} 各分支
  - `openMap` / `closeMap` / `resetMap` 状态正确
- `maze/JsonMazeProvider.test.ts` 扩展:
  - 解析新 3 字段;非法值静默回退到默认
  - `hideMinimap: true` 迁移到 `minimapMode: 'hidden'` + console.warn spy
- `maze/types.test.ts` 扩展:
  - `isMinimapMode` / `isMapOpenBehavior` / `isParchmentLifecycle` 守卫
- `engine/Game.test.ts` 扩展:
  - 玩家移动 → parchment.visitedCells 增
  - 玩家受伤 + minimapMode='parchment' → damageRegions 增
  - 玩家受伤 + minimapMode='top-right' → damageRegions 不增
- `store/gameStore.test.ts` 扩展:
  - `toggleParchment` / `resetParchment` / `setParchment` 行为
- `store/editorStore.test.ts` 扩展:
  - 3 个新 actions 触发 commitLevel

### 组件测试(RTL)
- `ParchmentMap.test.tsx`:
  - `parchment.visitedCells` 非空时 canvas 渲染对应 cell
  - 关闭按钮调用 `closeParchment`
  - ESC keydown 调用 `closeParchment`
  - `parchment.damageRegions` 非空时 canvas 渲染对应损伤
  - 失去焦点时自动关闭
  - `minimapMode !== 'parchment'` 时组件不挂载
- `EditorPropertiesPanel.test.tsx` 扩展:
  - 三态切换更新 store
  - parchment 模式下两个 Switch 可见
  - 非 parchment 模式下两个 Switch collapse 但值保留
- `HUD.test.tsx` 扩展:
  - parchment 模式显示「M 打开羊皮纸」

### E2E(Playwright)
- `tests/e2e/parchment-map.spec.ts`:
  - 走 `level-tiny-pickups.json`(改为 parchment 模式)→ 走两步 → M 打开 → 截图断言 canvas 有内容
  - 复用现有 `level-tiny-enemy.json` 改为 parchment + `mapOpenBehavior: 'continue'` → 撞敌人 → 截图断言 damage 出现

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| canvas 50x50 重绘掉帧 | 中 | 离屏缓存底图 / 墙体 / 拾取物 + 增量重绘 visited + damage |
| 50 个损伤区叠加导致 alpha 异常 | 低 | damage 数量受血量 + 50% 概率限制,一局最多 ~5 个 |
| `hideMinimap` 老关卡被破坏 | 低 | `JsonMazeProvider` 兼容读取 + 迁移 + warn,不删字段 |
| M 键与现有动作冲突 | 低 | 当前 InputManager 未用 M,冲突零;useEffect 中 preventDefault |
| 离线渲染兼容性 | 低 | OffscreenCanvas 不可用时降级到主 canvas 绘制 |
| 教学关卡如果选 parchment,教学步骤如何提示 M 键 | 中 | 教学步骤系统可加一步「按 M 打开羊皮纸」(后续增量,不在本范围) |
| 引擎层不小心 import react / store | 低 | 严格 ParchmentState.ts 纯函数 + 边界 review |

## 11. 完成清单（拷贝自 `_template/dod.md`）

### 11.1 功能验收
- [x] 增量 spec 中"功能需求"列表全部实现
- [x] 用户能从 UI 触发该功能端到端走通(切换 minimapMode → 走 → M → 看地图 → 受伤 → 看损伤)
- [x] 边界情况(无 tutorialSteps 时 minimapMode=parchment、parchment + 0 拾取物、parchment + 全空关)在 spec 或 plan 中显式列出并被覆盖

### 11.2 引擎 /架构边界
- [x] 引擎层不新增对 `react` / `store/` 的 import
- [x] 任何对 `MazeProvider` 的新增实现必须实现完整接口
- [x] 新增 Three.js 资源在 `dispose()` 路径中被释放(本增量不引入 Three.js 资源)

### 11.3 测试
- [x] 单元测试覆盖率 ≥80%
- [x] 新增的 Zustand action / Rule / Collision 分支必须有对应单测
- [x] 涉及 UI 的改动必须有 RTL 组件测试
- [x] 涉及端到端流程的改动必须有 Playwright E2E
- [x] `npm run typecheck` 与 `npm run build` 通过

### 11.4 文档
- [x] `docs/increments/p2-16-parchment-map/spec.md` 已写入
- [x] `docs/increments/p2-16-parchment-map/plan.md` 所有 checkbox 已勾
- [x] README.md 的"已完成增量"列表同步更新
- [x] 新增的公共类型 / 常量 / 配置项在 spec §7 反映

### 11.5 持久化与兼容
- [x] 不破坏现有 `localStorage` schema
- [x] 新增设置项走 editor 关卡字段,不在 settingsStore(本增量范围)
- [x] `hideMinimap` 老字段兼容读取并迁移

### 11.6 安全与健壮性
- [x] 用户输入校验到位(`isMinimapMode` 守卫)
- [x] 错误处理走现有 `LevelLoadError` 体系
- [x] 无 console.log / debugger 残留
- [x] 无硬编码密钥 / 资源 URL

## 12. 参考
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
- 相关 issue / PR: —
- 前置增量:`docs/increments/p2-11-tutorial-revamp/spec.md`(`hideMinimap` 字段来源)
