# P2-11 教学关卡重设计 — 设计文档（Spec）

**Slug**: p2-11-tutorial-revamp
**状态**: in-progress（draft 2026-06-16）
**日期**: 2026-06-16
**对应路线图项**: P2-11
**依赖**: P2-3（算法关卡）、P2-4a（敌人）、P2-8（i18n）
**复杂度**: Medium

## 1. 概述

现有 4 个教学关卡（空庭 / 补给线 / 哨兵走廊 / 试炼场）只关地形、不带教程引导；新人第一关只能靠自己摸索。本增量：
1. 重命名 4 关并按学习曲线重排顺序。
2. 新建 `回字形` 迷宫（手写 7×7 JSON）替代 3×3 单格的"哨兵走廊"，让玩家能真正体验被敌人追逐。
3. 引入**教学步骤系统**（屏幕底部 HUD 横幅 + 事件驱动推进 + 超时兜底）。
4. 扩展 MazeData 三类新字段：`tutorialSteps`、`hideMinimap`、`rules.{enemyAggression, requireAllPickups}`。
5. 扩展 VictoryType 新增 `caught-by-enemy`（哨兵回廊：被敌人追上 = 教学完成，触发"教程通关"路径而非 GameOver）。

完成后 4 关可作为新人引导闭环：基础操作 → 拾取操作 → 体验追逐 → 收集门控通关。

## 2. 目标 / 非目标

### 目标
- G-1：4 关按学习曲线排序（基础 → 拾取 → 追逐 → 综合）
- G-2：每关有关键操作的教学步骤（屏幕底部 HUD 横幅）
- G-3：教学步骤基于事件驱动推进（mouse-look / key-pressed / pickup-collected / reached-exit / timeout）
- G-4：哨兵回廊有专门的回字形迷宫 + 1.5x 敌人速度 + 隐藏地图
- G-5：最终试炼强制"必须收集全部拾取才能在终点通关"
- G-6：编辑器支持 4 个新字段的可视化编辑（tutorialSteps 用 JSON textarea，其它 3 个用结构化控件）

### 非目标
- 不改敌人追击倍率全局默认值（保持 medium = 1.5x）
- 不改 reach-exit / survive / time-trial 三种现有 victory 语义
- 不改 Minimap 渲染逻辑（仅按 `hideMinimap` 跳过渲染）
- 不改输入系统（InputManager 仍只发原生事件，教程 store 自己监听 store 派生）
- 不重做教程 store 与现有 gameStore 的关系（教程 store 独立，gameStore 不感知）
- 不引入外部动画/UI 库
- 不做教程"完成进度"持久化（重启游戏不记忆第几步）

## 3. 用户故事

- 作为 新玩家，我希望第一关能告诉我**移动鼠标**是干什么的，而不是让我猜
- 作为 新玩家，我希望操作有即时反馈（鼠标转动了 → 下一条提示出现）
- 作为 新玩家，我希望明确知道**地上的东西可以拾取**，否则我可能走过去忽略它
- 作为 新玩家，我希望体验一次"被敌人追"的紧张感，作为进入正式关卡前的预演
- 作为 新玩家，我希望"最终试炼"的"必须收集全"规则是显式告知的，否则我在终点才发现不能通关会很困惑
- 作为 关卡设计师，我希望编辑器的 properties panel 暴露新字段，我能直接在 UI 里勾选 / 输入，不用手改 JSON
- 作为 关卡设计师，我希望 `tutorialSteps` 可以以 JSON 形式编辑，能即时看到 schema 校验错误

## 4. 功能需求

### FR-1：4 关重命名 + 重排
- 原 `level-tiny.json` → `teaching-01.json`，`name: "基础教学"`
- 原 `level-tiny-pickups.json` → `teaching-02.json`，`name: "路过拾遗"`（**缩为 1 个拾取，放在路中间**）
- 原 `level-tiny-enemy.json` → **删除**，被新建 `teaching-03.json` 取代
- 原 `level-small.json` → `teaching-04.json`，`name: "最终试炼"`
- 文件名 `teaching-NN.json` 字典序即为关卡顺序；`JsonMazeProvider.list()` 过滤改为 `teaching-*.json`

### FR-2：MazeData 新字段

```ts
// src/maze/types.ts

export interface MazeData {
  // ... 现有字段
  hideMinimap?: boolean;          // 哨兵回廊：true
  tutorialSteps?: TutorialStep[]; // 仅 teaching 关配置
}

export interface LevelRules {
  // ... 现有字段
  enemyAggression?: EnemyAggression;  // 哨兵回廊：'medium'；缺失时用 settings
  requireAllPickups?: boolean;        // 最终试炼：true
}

export interface TutorialStep {
  id: string;
  messageKey: string;  // i18n key: 'tutorial.teaching01.step1'
  trigger: TutorialTrigger;
}

export type TutorialTrigger =
  | { type: 'mouse-look'; timeoutSec?: number }
  | { type: 'key-pressed'; keys: string[]; timeoutSec?: number }
  | { type: 'pickup-collected'; count?: number; timeoutSec?: number }
  | { type: 'reached-exit'; timeoutSec?: number }
  | { type: 'timeout'; timeoutSec: number };
```

### FR-3：VictoryType 新增 `caught-by-enemy`

```ts
export type VictoryType =
  | 'reach-exit'
  | 'survive'
  | 'time-trial'
  | 'caught-by-enemy';
```

`caught-by-enemy` 语义：
- 触发条件：`currentHealth === 0` **且** 最后一击来自敌人（命中是普通"击中扣血"，与 reach-exit 等关卡的伤害逻辑一致）
- 触发后走 `WinOverlay` 的"教程通关"分支（而非 GameOverOverlay）：
  - 标题：「被追上了 — 教学完成」/ "Caught — Tutorial Complete"
  - 副标题：「你体验了一次敌人的追逐。下一关：最终试炼」/ "You experienced the chase. Next: Final Trial"
  - 显示「下一关」按钮（最后一关时按钮变"完成"）
- 真实"被敌人击杀但非教学关"的 GameOver 路径保持不变（哨兵回廊 不会触发 GameOver）

### FR-4：Tutorial 事件总线

引擎 ↔ UI 通信沿用 `GameBridge` 回调模式（参考 `GameCanvas.tsx` 中已存在的桥接）：

```ts
// src/engine/Game.ts（扩展 GameBridge 配置，不在引擎内 import store）
interface GameBridge {
  // ... 现有回调
  onTutorialEvent?: (event: TutorialEvent) => void;
}

export type TutorialEvent =
  | { kind: 'mouse-look'; deltaYaw: number; deltaPitch: number }
  | { kind: 'key-pressed'; key: string }
  | { kind: 'pickup-collected'; total: number; expected: number }
  | { kind: 'reached-exit' };
```

新增 `src/store/tutorialStore.ts`（Zustand）：
- `steps: TutorialStep[]`、`currentStepId: string | null`
- `start(steps: TutorialStep[])` — 进入关卡时调用，重置
- `dispatch(event: TutorialEvent)` — 接收到事件后推进到下一个匹配步骤
- 内部用 ref 持 timer id（避免 StrictMode 双触发）；每个步骤独立 setTimeout
- `mouse-look` 累计：`Math.abs(deltaYaw) + Math.abs(deltaPitch)` 超过 ~0.3 rad 视为"已转动"

### FR-5：TutorialBanner 组件

- `src/ui/components/TutorialBanner.tsx`
- 仅当 `maze.tutorialSteps?.length > 0` 时由 `GameCanvas` 渲染
- 位置：屏幕底部居中，宽度 ≤ 600px，距底部 60px（在 HUD 上方）
- 视觉：半透明深底 + 圆角 + 进度条（步数 / 总步数）
- 文案走 `useT()` + 当前步骤 `messageKey`
- `data-testid="tutorial-banner"`

### FR-6：4 关教学步骤设计

#### teaching-01 基础教学（3×3，地图不动）
| Step | messageKey | trigger |
|---|---|---|
| 1 | `tutorial.teaching01.step1` "移动鼠标转动视角" | `mouse-look` |
| 2 | `tutorial.teaching01.step2` "按 WASD 键移动" | `key-pressed` keys=['w','a','s','d'] |
| 3 | `tutorial.teaching01.step3` "走到出口即可通关" | `reached-exit` |

#### teaching-02 路过拾遗（5×1，**地图改为 1 个拾取，放在中间 x=2 z=0**）
- 原 3 个 pickup 缩为 1 个 health 拾取，放在路中央
- victory 仍为 reach-exit，不强制全收集（教程只演示"可以拾取"）

| Step | messageKey | trigger |
|---|---|---|
| 1 | `tutorial.teaching02.step1` "地上的物品可以拾取，靠近自动获取" | `pickup-collected` count=1 |
| 2 | `tutorial.teaching02.step2` "现在可以走向出口了" | `reached-exit` |

#### teaching-03 哨兵回廊（**新建 7×7 回字形**，enemyAggression='medium'，hideMinimap=true，victory='caught-by-enemy'）
- 7×7 迷宫布局：外圈 7×7 含 start 在 (0,0) + 外圈通道；内圈 3×3 围一个 3×3 中央广场；外圈与内圈之间通过 4 个开口连通
- 单敌人 path 沿外圈巡逻，速度 1.5x；玩家只在外圈跑，外圈长度让敌人约 8-12s 内追上
- victory: `caught-by-enemy`（玩家血量归零且最后一击来自敌人 → 教程通关；每次敌人命中正常扣 1 血，与现有 damage 系统一致）

| Step | messageKey | trigger |
|---|---|---|
| 1 | `tutorial.teaching03.step1` "敌人在巡逻 — 绕回廊跑" | `timeout` 1.5s |
| 2 | `tutorial.teaching03.step2` "它们比你快 — 被追上即通关" | `timeout` 4s |

> 教程步骤到此为止；之后由敌人追击决定结局。

#### teaching-04 最终试炼（10×10，地图不动，2 个 time pickup，requireAllPickups=true）
| Step | messageKey | trigger |
|---|---|---|
| 1 | `tutorial.teaching04.step1` "这是最终试炼 — 必须收集全部物品才能在终点通关" | `timeout` 2s |
| 2 | `tutorial.teaching04.step2` "已收集全部 — 前往出口" | `pickup-collected` count=2 |
| 3 | `tutorial.teaching04.step3` "通关！" | `reached-exit` |

`requireAllPickups` 行为：
- 玩家在终点时若拾取进度 < 100% → `crossesExit` 返回 false，WinOverlay 不触发
- 此时由 TutorialBanner 显示条件提示文案 "还差 N 个收集物"
- HUD pause overlay 也显示当前进度

### FR-7：编辑器属性面板 4 个新字段
- `EditorPropertiesPanel.tsx` 增加 4 个新控件：
  - `Hide minimap`：checkbox（写入 `hideMinimap: boolean`）
  - `Enemy aggression`：select（`easy`/`medium`/`hard`/`<inherit from settings>`，写入 `rules.enemyAggression`，特殊选项 null = 删除字段）
  - `Require all pickups`：checkbox（写入 `rules.requireAllPickups: boolean`）
  - `Tutorial steps`：JSON textarea（带 schema 校验；合法时显示步骤数预览）

### FR-8：editor store 持久化兼容
- `JsonMazeProvider` sanitize：读取旧关卡 JSON（无新字段）时全部 undefined；写入新字段时不丢
- 编辑器导出时：新字段在 JSON 中按字母序排在 `rules` 内部；未知字段保留

## 5. 数据 / 类型变更

### 新增 / 修改的类型
- `src/maze/types.ts`:
  - `TutorialStep` / `TutorialTrigger`
  - `VictoryType` 加 `'caught-by-enemy'`
  - `MazeData` 加 `hideMinimap?`、`tutorialSteps?`
  - `LevelRules` 加 `enemyAggression?`、`requireAllPickups?`
- `src/utils/tutorialValidator.ts`（新建）：纯函数 `validateTutorialSteps(unknown): { ok: true; steps: TutorialStep[] } | { ok: false; error: string }`

### 新增 / 修改的 Store
- `src/store/tutorialStore.ts`（新建 Zustand）：
  ```ts
  interface TutorialStoreState {
    steps: TutorialStep[];
    currentStepId: string | null;
    start(steps: TutorialStep[]): void;
    dispatch(event: TutorialEvent): void;
    reset(): void;
  }
  ```

## 6. 引擎 / 架构影响

### 受影响文件
| 文件 | 改动类型 | 说明 |
|---|---|---|
| `public/levels/level-tiny.json` → `teaching-01.json` | RENAME + UPDATE | name 改"基础教学" + 加 tutorialSteps |
| `public/levels/level-tiny-pickups.json` → `teaching-02.json` | RENAME + UPDATE | name 改"路过拾遗" + 缩为 1 个 pickup + tutorialSteps |
| `public/levels/level-tiny-enemy.json` | DELETE | 被 teaching-03 取代 |
| `public/levels/level-small.json` → `teaching-04.json` | RENAME + UPDATE | name 改"最终试炼" + requireAllPickups + tutorialSteps |
| `public/levels/teaching-03.json` | CREATE | 新建 7×7 回字形 JSON |
| `src/maze/types.ts` | UPDATE | TutorialStep / TutorialTrigger / VictoryType / 4 个新字段 |
| `src/utils/tutorialValidator.ts` | CREATE | 校验 tutorialSteps JSON |
| `src/maze/builtInLevels.ts` | UPDATE | glob 过滤 `teaching-*.json` |
| `src/store/tutorialStore.ts` | CREATE | Zustand 教学 store |
| `src/ui/components/TutorialBanner.tsx` | CREATE | 屏幕底部横幅 |
| `src/ui/GameCanvas.tsx` | UPDATE | 渲染 TutorialBanner；GameBridge 接 onTutorialEvent |
| `src/engine/Game.ts` | UPDATE | 发送 tutorial events；`caught-by-enemy` 胜利路径 |
| `src/game/Rules.ts` | UPDATE | `crossesExit` 支持 `requireAllPickups` 门控；新增 `isPlayerCaughtByEnemy` |
| `src/ui/overlays/WinOverlay.tsx` | UPDATE | caught-by-enemy 文案 + "下一关"按钮 |
| `src/ui/overlays/GameOverOverlay.tsx` | UPDATE | 区分"被追上（教程）"与"真失败"（不应出现） |
| `src/ui/components/Minimap.tsx` | UPDATE | `maze.hideMinimap` 时返回 null |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE | 4 个新字段控件 |
| `src/store/editorStore.ts` | UPDATE | `setHideMinimap` / `setEnemyAggression` / `setRequireAllPickups` / `setTutorialSteps` actions |
| `src/i18n/resources/zh.ts` | UPDATE | 新增 `tutorial.*` 8 条 + 新关名 i18n |
| `src/i18n/resources/en.ts` | UPDATE | 同上 |
| `src/styles/theme.css` | UPDATE | 新增 `.tutorial-banner__*` 样式 |
| `tests/unit/store/tutorialStore.test.ts` | CREATE | step 推进 / 超时 / 重置 |
| `tests/unit/utils/tutorialValidator.test.ts` | CREATE | schema 校验 |
| `tests/unit/maze/types.test.ts` | UPDATE | 守卫覆盖 `caught-by-enemy` |
| `tests/unit/game/Rules.test.ts` | UPDATE | requireAllPickups 门控、isPlayerCaughtByEnemy |
| `tests/component/TutorialBanner.test.tsx` | CREATE | 当前步骤渲染 / 隐藏 |
| `tests/component/Minimap.test.tsx` | CREATE / UPDATE | hideMinimap → null |
| `tests/component/editor/EditorPropertiesPanel.test.tsx` | UPDATE | 4 个新字段控件断言 |
| `tests/e2e/teaching-flow.spec.ts` | CREATE | 端到端跑过 4 关教程 |

### 边界检查
- 引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import（tutorialStore 是 UI store，引擎只通过 GameBridge 回调通信）✓
- `tutorialStore` 不引用 `gameStore`（独立 store，由 GameCanvas 在 startLevel 时显式调用 `start()`）
- 新增 `caught-by-enemy` VictoryType 仅在哨兵回廊使用，不影响其他关胜利逻辑
- 现有 editor 旧自定义关卡 JSON 不含新字段 → sanitize 时 undefined，不报错

## 7. UI / UX 变更

### 屏幕 / 组件改动
- **GameCanvas**：当 `maze.tutorialSteps?.length > 0` 时渲染 `<TutorialBanner>`
- **新增 TutorialBanner**：
  - 位置：`position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%)`
  - 视觉：黑底 70% 透明 + 圆角 8px + 内边距 16px 24px；当前步骤文字白色 16px；右上角进度 chip "2/3"
  - 进场：fade-in 200ms；步骤切换：fade-out 100ms + fade-in 200ms
- **Minimap**：`maze.hideMinimap === true` 时整个 `<Minimap>` 不渲染
- **WinOverlay**：
  - `victory === 'caught-by-enemy'` → 标题"被追上了 — 教学完成" / "Caught — Tutorial Complete"
  - 显示「下一关」按钮（最后一关时按钮变"完成"）
- **GameOverOverlay**：保持不变（哨兵回廊 不触发此路径）
- **EditorPropertiesPanel**：底部加 4 个新 Card（折叠默认展开）：
  - 「HUD」Card（hideMinimap）
  - 「难度」Card（enemyAggression）
  - 「胜利条件」Card（requireAllPickups）
  - 「教学步骤」Card（JSON textarea + 步骤数预览）

### 交互流程（哨兵回廊 示例）
1. 玩家从 LevelSelect 进入「哨兵回廊」
2. 引擎 `Game.startLevel(maze)` → 触发 GameBridge.onStart → `tutorialStore.start(maze.tutorialSteps)`
3. TutorialBanner 显示 step 1「敌人在巡逻 — 绕回廊跑」
4. 1.5s 后 timeout 推进 → 显示 step 2「它们比你快 — 被追上即通关」
5. 玩家绕外圈跑，敌人追击
6. 敌人命中玩家 → 扣 1 血；命中第二次 → 血量归零 → 引擎判定 `caught-by-enemy`
7. WinOverlay 显示「被追上了 — 教学完成」+「下一关 → 最终试炼」按钮

## 8. 错误处理

### 新增错误码
- `tutorial.invalidJson`: "教学步骤 JSON 不合法：{msg}" / "Tutorial steps JSON invalid: {msg}"
- `tutorial.missingField`: "教学步骤缺少 {field}" / "Tutorial step missing {field}"

### 兜底行为
- 编辑器读取 `tutorialSteps` 时若 JSON 非法 → textarea 高亮红 + status bar 显示 `tutorial.invalidJson`
- 引擎接收 `tutorialSteps` 字段时若 schema 校验失败 → 当作 `[]` 处理（不抛错，不显示 banner）
- `mouse-look` 阈值在 60 FPS 下约 0.3 rad（≈17°），避免静止鼠标误触发
- `timeout` 类型步骤缺失 `timeoutSec` → validator 拒绝

## 9. 测试策略

### 单元测试（vitest）
- `tutorialStore.test.ts`（新建）：
  - `start(steps)` 重置 + 步骤 0 设为 current
  - `dispatch({ kind: 'key-pressed', key: 'w' })` 匹配 keys=['w'] → advance
  - `dispatch` 不匹配的 event → no-op
  - `tick(deltaMs)` 触发 timeout → advance
  - `reset()` 清空 current + steps
- `tutorialValidator.test.ts`（新建）：
  - 合法 steps → ok
  - 缺 id / messageKey / trigger.type → error
  - mouse-look 无 timeoutSec（可选）→ ok
  - timeout 缺 timeoutSec → error
- `Rules.test.ts`：
  - `crossesExit` + requireAllPickups=true + 收集全 → true
  - `crossesExit` + requireAllPickups=true + 未收集全 → false
  - `isPlayerCaughtByEnemy`：health=0 + lastHitBy='enemy' → true；lastHitBy='fall' → false
- `maze/types.test.ts`：isVictoryType guard 覆盖 `caught-by-enemy`

### 组件测试（RTL）
- `TutorialBanner.test.tsx`（新建）：
  - 不渲染当 `maze.tutorialSteps` 为空
  - 渲染当前步骤文案（用 mock i18n）
  - 步骤切换时显示新文案
  - 进度 chip 正确显示 "N/M"
- `Minimap.test.tsx`（新建）：`hideMinimap=true` → 组件返回 null
- `EditorPropertiesPanel.test.tsx`：
  - 新增 4 个字段的存在性
  - checkbox toggle 后 store 更新
  - JSON textarea 非法 → lastErrorKey 设置

### E2E 测试（Playwright）
- `teaching-flow.spec.ts`（新建）：
  - 进入 teaching-01 → 等 tutorial banner 出现 → 触发 mouse + WASD → 通关 → 看到「下一关」
  - 进入 teaching-02 → 拾取 → 通关
  - 进入 teaching-03 → 等 banner → 故意不动 → 几秒后被追上 → WinOverlay 文案校验
  - 进入 teaching-04 → 不拾取直奔出口 → 不通关 → 拾取后再通关

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `caught-by-enemy` 路径与 GameOver 路径在 health=0 时冲突 | 高 | 引擎层先判定"最后一击来自敌人"；GameOver 仅在 health=0 且非 enemy 时触发 |
| tutorial store setTimeout 在 React StrictMode 下双触发 | 中 | 用 ref 持 timer id；组件 unmount 时 cleanup；单元测试覆盖 |
| 回字形 7×7 几何可能让玩家跑不掉或秒死（数值调参） | 中 | 提供敌人 path / dwellTime / 速度的可调参数；E2E 跑多次取中位时间 |
| `requireAllPickups` 触发后 WinOverlay 已渲染，会复现 | 中 | 状态机：拾取完成前 crossesExit 返回 false；UI 层单次渲染 |
| 编辑器新字段影响老自定义关卡 JSON | 中 | JsonMazeProvider sanitize：未知字段保留并由 is* 守卫过滤；新字段缺失当 undefined |
| `mouse-look` 阈值在不同 DPI / 鼠标灵敏度下不一致 | 中 | 阈值用 yaw+pitch 累计 rad，不用 px；E2E 跑两步验证 |
| `tutorialSteps` schema 扩展后老 teaching-01..04 JSON 不兼容 | 低 | 本次就是重写 4 个 JSON，不存在老 JSON 兼容 |
| VictoryType 加成员影响 `isVictoryType` guard 与现有 decode | 中 | 同步更新 `VICTORY_TYPE_VALUES` 白名单；`Rules.ts` switch 加 default → unreachable 分支 |
| 教程步骤的 i18n key 与现有 key 冲突 | 低 | 全部前缀 `tutorial.teaching0N.stepM` |

## 11. 完成清单（拷贝自 `docs/increments/_template/dod.md`）

### 11.1 功能验收
- [ ] FR-1 ~ FR-8 全部实现
- [ ] 4 关按 teaching-01..04 顺序出现在 LevelSelect
- [ ] 用户能从 UI 端到端走通：① 进入基础教学 → 看到 banner 步骤 → 操作推进 → 通关；② 进入哨兵回廊 → 看到 banner → 几秒后被追上 → WinOverlay 教程文案 → 下一关；③ 进入最终试炼 → 不收集直奔出口 → 不通关 → 收集后再通关
- [ ] 边界情况：timeout 兜底、StrictMode 双触发、JSON 非法、enemyAggression 缺失 → 全部覆盖

### 11.2 引擎 / 架构边界
- [ ] 引擎层不新增对 `react` / `store/` 的 import
- [ ] `caught-by-enemy` 仅在 victory type 启用，不影响其他关
- [ ] `tutorialStore` 独立 store，不耦合 gameStore

### 11.3 测试
- [ ] 单元测试覆盖率 ≥80%（`src/**`）
- [ ] 新增的 tutorialStore / tutorialValidator / Rules 新分支全部有单测
- [ ] 涉及 UI 改动有 RTL 组件测试（TutorialBanner / Minimap / EditorPropertiesPanel）
- [ ] 涉及端到端流程改动有 Playwright E2E（teaching-flow）
- [ ] `npm run typecheck` 与 `npm run build` 通过

### 11.4 文档
- [ ] `docs/increments/p2-11-tutorial-revamp/spec.md` 已写入
- [ ] `docs/increments/p2-11-tutorial-revamp/plan.md` 所有 checkbox 已勾
- [ ] `docs/roadmap.md` 注册 P2-11 行（in-progress → done）

### 11.5 持久化与兼容
- [ ] 老 `level-tiny*.json` / `level-small.json` rename 不影响 `localStorage`（这些关卡无 best record）
- [ ] 老自定义关卡 JSON（无新字段） sanitize 后仍可加载
- [ ] 不修改任何 seed 编码

### 11.6 安全与健壮性
- [ ] 用户输入校验到位（tutorialSteps JSON / enemyAggression 枚举 / hideMinimap 布尔）
- [ ] 错误处理走 `lastErrorKey` + `t()` 翻译通道
- [ ] 无 console.log / debugger 残留

## 12. 参考
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
- 相关 F-tag：暂无（本次为新功能）
- 上一个增量：`docs/increments/p2-10-review-fixes/plan.md`