# P2-6: LevelSelect 级联重构 — 设计文档 (Spec)

**Slug**: `level-select-cascading-redesign`
**状态**: approved (待实施)
**日期**: 2026-06-12
**对应路线图项**: P2-6
**依赖**: P2-5（UI 改版，留下的「程序生成设置孤立在左上」问题）
**复杂度**: Medium
**相关文件**: `src/ui/LevelSelect.tsx`, `src/maze/types.ts`, `src/styles/theme.css`, `tests/component/levelSelect.uiRevamp.test.tsx`, `tests/component/levelSelect.custom.test.tsx`, `docs/increments/_template/roadmap.md`

> 详细 step-by-step + 行号见 `plan.md`；owner / 工时 / DoD 见 `task-list.md`。本文档聚焦 **what** 与 **why**。
>
> **范围声明**：本次只动 UI 层（`LevelSelect.tsx` + `theme.css` chip 样式 + `types.ts` 新增 4 个常量）。游戏运行时、`gameStore.startLevel`、`engine/Game.ts` 注入逻辑、敌人 AI、关卡编辑器 一律不改。

---

## 1. 概述

P2-5（2026-06-11）把 LevelSelect 改成两列布局 + 原生 select + 进阶折叠后，用户复盘发现**还有第二版设计更顺**：

1. **入口收敛**：4 个并列入口（固定 / 随机 / 指定种子 / 我的）收为「**主 dropdown 选关卡源 + 级联二级控件 + 单一「进入游戏」按钮**」，避免玩家在多个并列 start 按钮间犹豫。
2. **存活模式设置成组**：把分散在程序生成设置里的 4 个存活模式相关项（存活秒数 + 敌人数量 + 渐进生成 + 渐进上限）从「按 `mode === 'survive'` 硬门」改为「**视觉上成组、语义上独立**」，让 4 个设置成为一个连贯的子面板（含 30/60/90/120 预设 chip + 自由输入 + clamp 到 [10, 600]）。
3. **关键老 testid 兼容**：保留 P2-5 的所有老 testid（`level-select-root` / `procedural-controls` / `mode-select` / `size-select` / `enemy-count-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section`），让 5 个老 e2e spec（survive / time-trial / procedural / pause-resume / persistence）零回归。

> 与 P2-5 的关系：P2-5 把"4 控件变 select + 折叠 seed"做了；P2-6 把"4 入口变 1 主下拉 + 1 进入游戏按钮 + 存活模式成组"做了。两次都是纯 UI 重构，不动引擎契约。

## 2. 目标 / 非目标

### 2.1 目标

- G1. 让玩家 2 秒内能定位入口（4 选项 dropdown）而不是解析 4 个并列 section。
- G2. 让「进入游戏」成为唯一的下一步动作；不让玩家在「随机关卡按钮」/「开始（指定种子）」/「custom 关卡名」之间选。
- G3. 让存活模式玩家能在 1 屏内调完 4 个设置（秒数 chip + 自由输入 + 敌人数量 + 渐进上限），不用在 4 个分散位置找。
- G4. 保留 P2-5 全部老 testid，老 e2e 零修改通过。
- G5. seed 输入失焦时自动 strip 空白 + 验证 16 hex，错误状态加 `aria-invalid="true"`（P2-5 只有 error 文案，缺 ARIA 信号）。
- G6. 提取 `validateSelection()` 纯函数，让 start-button 的 `disabled` 状态与 onClick 走同一份校验逻辑（避免「视觉允许但点了报错」）。

### 2.2 非目标

- N1. **不新增迷宫生成算法。** 沿用 P2-3 的 4 种，按 `algorithmForMode(mode)` 锁死。
- N2. **不新增敌人 AI 行为。** 存活模式敌人逻辑已在 P2-4a + P2-5 落地，UI 只是入口。
- N3. **不重做主菜单。** MainMenu 视觉改版是 P2-5 的范围。
- N4. **不重做编辑器。** `EditorMazeProvider` 已经在 P2-4b 落地，custom levels 数据流不变。
- N5. **不引入新的状态管理库。** 沿用 `useState` + 现有 zustand store。
- N6. **不新增主题变量。** 复用现有 `--accent` / `--border` / `--bg` / `--muted` / `--danger`。
- N7. **不做完整 WCAG 2.2 AA 审计。** 本次只补 `aria-invalid` + `aria-label` + 自然 `<button>` 元素；完整审计排队 P2-7。
- N8. **不写 e2e 专用 helper。** 沿用 `levelSelect.uiRevamp.test.tsx` 的 `tagName` + `within()` 风格。

## 3. 用户故事

- 作为休闲玩家，我希望入口少而清晰，让我 2 秒内知道「先选关卡源，再点进入游戏」，不要解析 4 个并列 section。
- 作为存活模式玩家，我希望 4 个相关设置（秒数 / 敌人 / 渐进 / 上限）成组出现，让我能 1 屏内调完，不用在程序生成设置里找。
- 作为新玩家，我希望「指定种子」像其他入口一样是主 dropdown 的一项，而不是藏在「进阶」折叠里（让我知道这个功能存在）。
- 作为种子分享玩家，我希望点 chip（30/60/90/120）能快速选秒数，但也能自由输入（45 秒、180 秒），不让我被 4 个预置锁死。
- 作为存活模式调参玩家，我希望把秒数输入越界（5 秒、999 秒）时自动 clamp 到合法范围（10–600）并给视觉反馈（红框），不要静默吞错。
- 作为关卡编辑器用户，我希望 LevelSelect 的「我的关卡」入口和 P2-5 时一样能从主菜单直接进，不要再被藏到二级菜单。
- 作为回归玩家，我希望 P2-5 时常玩的 4 个关卡源（固定 / 随机 / 指定种子 / 我的）都还在，只是入口合并了；不要为了「更好看」删功能。

## 4. 功能需求

### 4.1 主入口收敛 (FR-1 ~ FR-4)

- **FR-1.** `LevelSelect` 顶部必须新增一个 **主 dropdown**（`data-testid="level-source-select"`），4 个 `<option>`：
  - `teaching` — 教学关卡（label: "教学关卡"）
  - `random` — 随机关卡（label: "随机关卡"）
  - `custom` — 我的关卡（label: "我的关卡"）
  - `seed` — 指定种子（label: "指定种子"）

  每个 `<option>` 上挂 `data-testid="level-source-{teaching,random,custom,seed}"`。

- **FR-2.** 主 dropdown 的默认值必须是 `teaching`（保留 P2-5 「首先看到的就是固定关卡」的用户习惯）。

- **FR-3.** 主 dropdown 变化必须驱动二级控件条件渲染（**级联**）：
  - `teaching` → 渲染 `sublevel-select`（二级 dropdown 列出 `available`，`available=[]` 时 disabled + 「暂无固定关卡」提示）
  - `random` → 隐藏 `sublevel-select`；显示 `mode-select` + `size-select`
  - `custom` → 渲染 `sublevel-select`（二级 dropdown 列出 `customLevels`，空时 disabled + 「暂无我的关卡」提示）
  - `seed` → 隐藏 `sublevel-select`；显示 `seed-input` + `reuse-last-seed` 按钮

- **FR-4.** 4 个独立 start 按钮（"随机关卡" / "开始（指定种子）" / 固定关卡每个名字的 Button / 我的关卡每个名字的 Button）**全部移除**；改为单一 `<Button data-testid="start-button" hoverStyle="lift">进入游戏</Button>`，固定在右下。点击行为由 `validateSelection()` 决定：
  - 通过 → `onPick(id, options)`
  - 失败 → `disabled`（hover 提示 "请先..." 文案，aria-disabled="true"）

### 4.2 存活模式设置成组 (FR-5 ~ FR-9)

- **FR-5.** 当 `mode === 'survive'` 时，必须渲染一个语义子面板 `<fieldset data-testid="survive-settings-group">`，包含 4 个设置：
  1. 存活秒数（`<input data-testid="survive-seconds-input">` + 4 个 chip）
  2. 敌人数量（`enemy-count-select`，沿用 P2-5）
  3. 渐进生成勾选（`progressive-spawn`，沿用 P2-5）
  4. 渐进上限（`<input data-testid="progressive-max-input">`，仅 progressive 勾选时渲染）

- **FR-6.** 4 个 chip 必须是 `<button type="button" data-testid="survive-chip-{30,60,90,120}">`，点击后：
  - 把对应秒数同步到 `survive-seconds-input.value`
  - 给被点的 chip 加 `survive-chip--active` className（去激活其他 3 个）
  - 不阻止输入框的 onChange（用户可继续手输）

- **FR-7.** `survive-seconds-input` 是 `<input type="number">`：
  - 范围：`[SURVIVE_SECONDS_MIN=10, SURVIVE_SECONDS_MAX=600]`
  - 越界（`onChange` 时）→ clamp 到合法范围 + 加 `aria-invalid="true"` + input 边框变 `var(--danger)`
  - 合法 → 移除 `aria-invalid`，边框恢复 `var(--border)`

- **FR-8.** `progressive-max-input` 是 `<input type="number">`：
  - 仅当 `progressive === true` 时渲染（取消勾选时整段消失）
  - 默认值 `SPAWN_PROGRESSIVE_MAX_DEFAULT = 10`
  - 最小值 `SPAWN_PROGRESSIVE_MAX_MIN = 1`（onChange 时强制 `>= 1`）

- **FR-9.** 当 `mode !== 'survive'` 时，整个 `survive-settings-group` 隐藏（包括其 4 个子控件），但 `mode-select` 本身始终显示。

### 4.3 Seed 输入改进 (FR-10 ~ FR-12)

- **FR-10.** `seed-input`（仅 `levelSource === 'seed'` 时渲染）：
  - `onBlur` 时自动 strip 首尾空白（保留 P2-5 的 onChange 即时 strip）
  - 16 hex 验证失败 → `aria-invalid="true"` + 显示错误文案（沿用 P2-5 `setSeedError` 模式）
  - 验证通过 → `aria-invalid` 移除，错误文案清空

- **FR-11.** `reuse-last-seed` 按钮（沿用 P2-5 行为）：从 `localStorage.maze3d.lastSeed` 读上次成功的 seed，写入 `seed-input`。

- **FR-12.** 进入游戏成功（`validateSelection` 通过 + 调用 `onPick`）时，**只有 seed 模式下**才把 `seedInput` 写回 `localStorage.maze3d.lastSeed`（沿用 P2-5 L-2 修复，Safari 隐私模式用 `isStorageAvailable()` 守卫）。

### 4.4 校验逻辑 (FR-13 ~ FR-15)

- **FR-13.** 必须提取纯函数 `validateSelection(): { valid: true; id: string; options: StartLevelOptions } | { valid: false; reason: string } | null`，作为单一 source of truth：
  - `teaching` + `available=[]` → `{ valid: false, reason: 'no_teaching_levels' }`
  - `teaching` + `sublevelId=null` → `{ valid: false, reason: 'no_sublevel_selected' }`
  - `custom` + `customLevels={}` → `{ valid: false, reason: 'no_custom_levels' }`
  - `custom` + `sublevelId=null` → `{ valid: false, reason: 'no_sublevel_selected' }`
  - `seed` + `!HEX_RE.test(seedInput)` → `{ valid: false, reason: 'invalid_seed' }`
  - 其余 → `{ valid: true, id, options }`（options 含 `mode` / `enemyCount` / `spawnSchedule` / `surviveSeconds` / `seed` / `progressiveMax`）

- **FR-14.** `start-button` 的 `disabled` 属性必须由 `validateSelection()` 决定（不是各 state 局部判断），保证「视觉与行为一致」。

- **FR-15.** 重复点击 `start-button` 必须在 onClick 内做幂等保护（`if (!result.valid) return`），防止 validation 在两 tick 之间翻转时多次 `onPick`。

### 4.5 老 testid 兼容 (FR-16 ~ FR-19)

- **FR-16.** P2-5 全部老 testid 必须保留（容器元素可空 children 占位）：
  - `level-select-root` / `level-select-centered-container`
  - `procedural-controls` / `procedural-grid`
  - `mode-select` / `mode-{value}`
  - `enemy-count-select` / `enemy-count-{n}`
  - `progressive-spawn`
  - `size-select`
  - `custom-levels-group` / `custom-level-{id}` / `delete-custom-{id}`
  - `specified-seed-section`
  - `advanced-toggle`（语义改为「主关卡 dropdown」，4 选项）

- **FR-17.** `survive-seconds-select` 语义改为「chip 容器」（4 个 chip 的 wrapper），但 DOM 里仍存在该 testid（保 P2-5 老断言不红）。

- **FR-18.** 5 个老 e2e spec（`survive.spec.ts` / `time-trial.spec.ts` / `procedural.spec.ts` / `pause-resume.spec.ts` / `persistence.spec.ts`）**不修改**也能跑通。

- **FR-19.** `tests/component/hud.test.tsx` 沿用 P2-5 的 `currentMode: 'survive'` opt-in 模式，**不修改**。

### 4.6 视觉与可访问性 (FR-20 ~ FR-22)

- **FR-20.** chip 选中态对比度必须 >= 4.5:1（WCAG AA 正文）：`background: var(--accent)` + `color: var(--bg)` 在浅色 + 深色主题下都需验证。

- **FR-21.** chip / start-button / seed-input / survive-seconds-input 必须是原生 `<button>` / `<input>` 元素（不用 div + onClick），保证键盘 Enter / Space 触发与 Tab 焦点顺序。

- **FR-22.** 720px 以下视口：chip 容器自动 wrap；start-button 占满宽度；sublevel-select 占满宽度。

## 5. 数据 / 类型变化

### 5.1 新增 / 修改的类型

- `src/maze/types.ts`:
  - **新增** 4 个常量（**不**新增类型联合）：
    ```ts
    export const SURVIVE_SECONDS_MIN = 10;
    export const SURVIVE_SECONDS_MAX = 600;
    export const SPAWN_PROGRESSIVE_MAX_DEFAULT = 10;
    export const SPAWN_PROGRESSIVE_MAX_MIN = 1;
    ```
  - **不**修改 `StartLevelOptions` 形状（FR-13 的 `options` 复用现有字段；新增 `progressiveMax` 走 `spawnSchedule` 扩展或新字段，待 T3 实施时定）

- `src/ui/LevelSelect.tsx`:
  - **新增** 局部类型 `type LevelSource = 'teaching' | 'random' | 'custom' | 'seed'`（不导出，组件内 private）
  - **新增** 局部类型 `type ValidationResult = { valid: true; id: string; options: StartLevelOptions } | { valid: false; reason: string }`

### 5.2 新增 / 修改的 Store 字段

- `gameStore`: **不修改**。P2-5 已经在 `startLevel` 把 `requestedEnemyCount` 按 `mode === 'survive'` 硬门；本次 UI 只是入口。
- `levelStore`: **不修改**。`customLevels` 契约稳定。
- `settingsStore`: **不修改**。

### 5.3 常量

- 沿用 `types.ts:110-112` 的 `ENEMY_COUNT_MIN/MAX/DEFAULT` 命名风格写 4 个新常量
- 沿用 `types.ts:118-122` 的 `SPAWN_SCHEDULE_DEFAULT = { intervalSec: 15, ... }` 写法，渐进上限走 `progressiveMax: number`（不破坏 SpawnSchedule shape）

## 6. 引擎 / 架构影响

### 6.1 受影响的文件

| 文件 | 变更 | 说明 |
|------|------|------|
| `src/maze/types.ts` | 修改 | 新增 4 个常量（§5.1）|
| `src/ui/LevelSelect.tsx` | 重写 | 主 dropdown + 级联二级 + 单一 start-button + 存活子面板 |
| `src/styles/theme.css` | 修改 | 新增 `.survive-chip` + `.survive-chip--active` 样式 |
| `tests/component/levelSelect.uiRevamp.test.tsx` | 重写 | 替换 P2-5 9 case → 12 case（覆盖新结构）|
| `tests/component/levelSelect.custom.test.tsx` | 修改 | 适配「主 dropdown=我的 → sublevel」新路径 |
| `tests/e2e/level-select-cascading.spec.ts` | **新增** | e2e 覆盖主 dropdown 4 项切换 + 1 个综合 journey |
| `docs/increments/level-select-cascading-redesign/{spec,plan,task-list,review}.md` | **新增/已存在** | 增量四件套 |
| `docs/increments/_template/roadmap.md` | 修改 | 新增 P2-6 行 + 详细任务表 |

### 6.2 边界检查 (DoD §14.2)

- `src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/` **不**新增对 `react` / `store/` 的 import
- `LevelSelect.tsx` 是 UI 组件，可继续 import `react` + `store/`
- 不新增 `MazeProvider` 实现
- 不新增 Three.js 资源

### 6.3 关键不变量

- **不变量 1**: `validateSelection()` 必须是无副作用的纯函数（输入 = props + state，输出 = result，不调 setState / 不读 localStorage / 不调 onPick）
- **不变量 2**: 老 testid 容器元素**必须**存在（即使内部 children 为空），保证 `getByTestId` 不抛
- **不变量 3**: `seed` 模式的 `maze3d.lastSeed` 写路径**只在 onPick 成功后**触发，**不**在 seed-input onChange 触发（沿用 P2-5 FR-20）

## 7. UI / UX 变更

### 7.1 组件变化

- `LevelSelect`:
  - 删：4 个 section（固定 / 随机 / 指定种子 / 我的） + 各自的 start 按钮
  - 删：进阶 ▾ 折叠（FR-1 把"指定种子"提升为主 dropdown 第 4 项）
  - 新增：主 dropdown `level-source-select`
  - 新增：二级控件 `sublevel-select`（条件渲染：teaching / custom）
  - 新增：种子输入区 `seed-input` + `reuse-last-seed`（条件渲染：seed）
  - 新增：存活模式子面板 `survive-settings-group`（条件渲染：mode === survive）
  - 改：单一 start-button（右下，hoverStyle="lift"）
  - 改：`validateSelection()` 决定 start-button `disabled` 态
  - 保留：所有 P2-5 老 testid 容器元素（可空 children）
- `theme.css`:
  - 新增 `.survive-chip` / `.survive-chip--active` 样式

### 7.2 视觉风格

- chip：圆角 4px、`padding: 4px 10px`、选中态 `background: var(--accent)` + `color: var(--bg)`、transition 150ms
- start-button：`hoverStyle="lift"`（沿用 P2-5）+ `width: 100%`（移动端占满）
- aria-invalid 态：input 边框 `var(--danger)` + 错误文案 `color: var(--danger)`

### 7.3 交互流程

**新玩家首次进入 LevelSelect**:
1. 看到主 dropdown 默认「教学关卡」+ 二级 dropdown 列出 `available`（空时 disabled）
2. 选「随机关卡」→ mode + size 下拉出现；二级 dropdown 消失
3. 切到「存活模式」→ 出现 4 chip + 自由输入 + 敌人数量 + 渐进 checkbox
4. 点 chip 60 → input 同步 60，chip 60 加 active；再点 chip 90 → input 同步 90，chip 90 active
5. 点「进入游戏」→ onPick(id, options) 触发，路由进游戏

**老玩家指定种子**:
1. 主 dropdown 选「指定种子」
2. seed-input 出现；可手输 / 粘贴 / 点「使用上次 seed」
3. 失焦时自动 strip 空白 + 验证 16 hex
4. 不合法 → 红框 + 「请输入 16 位小写 hex（例如 0123456789abcdef）」
5. 合法 → start-button 可点
6. 点「进入游戏」→ 写回 localStorage + onPick

**存活模式调参**:
1. mode=survive + 主 dropdown=teaching/random/seed（任一）
2. 在存活子面板调 4 个设置
3. 切到非 survive 模式 → 子面板整段消失
4. 切回 survive → 子面板恢复，**保留**之前填的值（state 不重置）

## 8. 错误处理

### 8.1 新错误场景

- **validation 失败** → start-button disabled + hover 提示（FR-14）
- **seed-input 越界 / 不合法** → aria-invalid + 错误文案（FR-10）
- **survive-seconds-input 越界** → onChange 时 clamp + aria-invalid（FR-7）
- **progressive-max < 1** → onChange 时强制 `>= 1`（FR-8）

### 8.2 兜底行为

- `available=[]` 且 levelSource=teaching → sublevel-select disabled + 「暂无固定关卡，可以试试上方随机关卡」+ start-button disabled
- `customLevels={}` 且 levelSource=custom → sublevel-select disabled + 「暂无我的关卡」+ start-button disabled
- `localStorage` 不可用（Safari 隐私模式）→ `reuse-last-seed` 静默不响应（沿用 P2-5）

## 9. 测试策略

### 9.1 单元测试 (Vitest)

- 不新增 unit test（纯 UI 改动，无 pure function 需要单测；`validateSelection()` 走 T2 case 10/11 覆盖）

### 9.2 组件测试 (React Testing Library)

- `tests/component/levelSelect.uiRevamp.test.tsx`（**重写**）— 12 case：
  1. 主 dropdown 4 选项各自 testid
  2. 默认「教学」+ sublevel-select 渲染（available=[] 时 disabled）
  3. 切到「随机」→ mode+size 出现，sublevel-select 消失
  4. 切到「我的」→ sublevel-select 显示 customLevels
  5. 切到「指定种子」→ seed-input 渲染 + reuse-last-seed 可见
  6. mode=survive → 4 设置（input + 4 chip + checkbox + max-input）全在
  7. 点 chip 60 → input value=60 + chip 激活
  8. 越界 clamp + aria-invalid
  9. 渐进 checkbox 取消 → progressive-max-input 消失或 disabled
  10. start-button 点击 → onPick 调一次 + options 字段正确
  11. validation 失败 → start-button disabled + onPick 未调
  12. 关键老 testid 兼容

- `tests/component/levelSelect.custom.test.tsx`（**修改**）— 6 case 适配新路径

### 9.3 E2E 测试 (Playwright)

- `tests/e2e/level-select-cascading.spec.ts`（**新增**）— 1 个综合 journey：
  1. 加载 `/` → 点「开始」→ 进入 LevelSelect
  2. 断言主 dropdown 4 项 testid
  3. 切到「随机关卡」→ 断言 mode+size 出现
  4. 切到「存活模式」→ 断言 4 chip 出现
  5. 点 chip 60 → 断言 input value=60
  6. 切回「指定种子」→ 断言 seed-input 出现
  7. 输入 "bad" → 断言 aria-invalid=true
  8. 输入 "0123456789abcdef" → 断言 aria-invalid=false
  9. 点「进入游戏」→ 断言路由到游戏

- 5 个老 e2e spec（`survive` / `time-trial` / `procedural` / `pause-resume` / `persistence`）**不修改**，跑通即视为兼容成功（FR-18）

## 10. 风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 12 case RED 漏写一个，GREEN 时才发现 | 中 | 返工 | T2 完成后 dev-B 跑一遍 + dev-A review 后再开 T3 |
| 老 e2e 用了「指定种子 进阶 toggle」路径 | 中 | e2e 红 | T7 单独留时间，**禁止**在 T3 回退 UI |
| 关键老 testid 移除导致 P2-5 e2e 雪崩 | 高 | 大面积红 | T2 case 12 显式断言 + 实施时保留容器元素（可空 children）|
| `validateSelection()` 纯化不彻底 | 低 | 测试假阳/假阴 | T3 第 3 步单独 commit 方便 review 隔离 |
| chip 选中态对比度不达 WCAG AA | 中 | 视觉验收打回 | T1 写完后跑 `axe-core` 自动扫描 |
| start-button 缺键盘可达性 | 中 | a11y | 用自然 `<button>` 元素（FR-21）|
| 用户反复点 start-button 触发多次 onPick | 中 | 状态错乱 | onClick 内 `if (!result.valid) return`（FR-15）|
| 新 chip 容器在 480px 横屏溢出 | 低 | 移动端体验 | chip 容器加 `flex-wrap: wrap`（FR-22）|

> 详细风险登记表见 `task-list.md` § 5（含 R1–R8 owner 分配）。

## 11. 完成清单 (DoD)

### 11.1 功能验收
- [ ] 增量 spec 中"功能需求"列表（FR-1 ~ FR-22）全部实现
- [ ] 用户能从 UI 触发该功能端到端走通（点主 dropdown → 选二级 → 点进入游戏）
- [ ] 边界情况（available=[] / customLevels={} / seed 非法 / 越界）显式覆盖

### 11.2 引擎 / 架构边界
- [ ] 引擎层（`src/engine/` / `src/maze/` / `src/entities/` / `src/game/` / `src/utils/`）不新增对 `react` / `store/` 的 import
- [ ] 不新增 `MazeProvider` 实现
- [ ] 不新增 Three.js 资源

### 11.3 测试
- [ ] 单元测试覆盖率 ≥ 80%（沿用 P2-5 基线）
- [ ] `validateSelection()` 纯函数走 T2 case 10/11 覆盖
- [ ] 12 case 新增 RTL 组件测试全绿（T2 任务）
- [ ] 6 case 适配 RTL 组件测试全绿（T4 任务）
- [ ] 1 case 新增 E2E 综合 journey 全绿（T7 任务）
- [ ] 5 个老 e2e spec 不修改通过
- [ ] `npm run typecheck` / `npm run test` / `npm run build` / `npx playwright test` 4 项全绿

### 11.4 文档
- [ ] `docs/increments/level-select-cascading-redesign/spec.md` 已写入（本文件）
- [ ] `docs/increments/level-select-cascading-redesign/plan.md` 已写入
- [ ] `docs/increments/level-select-cascading-redesign/task-list.md` 已写入
- [ ] `docs/increments/level-select-cascading-redesign/review.md` 收尾时写
- [ ] `docs/increments/_template/roadmap.md` P2-6 行 + 详细任务表同步更新
- [ ] 视觉截图归档到 `docs/increments/level-select-cascading-redesign/screenshots/`（360 / 480 / 720 / 1280px 4 张）

### 11.5 持久化与兼容
- [ ] 不破坏 `maze3d.lastSeed` / `maze3d.customLevels.v1` / `maze3d.editorDraft.v1` 现有 schema
- [ ] 浏览器刷新后状态合理恢复（主 dropdown 默认值恢复为 `teaching`）

### 11.6 安全与健壮性
- [ ] 用户输入校验到位（seed hex / survive-seconds / progressive-max）
- [ ] 错误处理走 `aria-invalid` + 文案提示（**不**用 `window.alert` / `confirm`）
- [ ] 无 console.log / debugger 残留
- [ ] 无硬编码密钥 / 资源 URL

## 12. 参考

- 前置增量 P2-5 spec：`docs/increments/p2-5-ui-and-rebalance/spec.md`
- 前置增量 P2-5 plan：`docs/increments/p2-5-ui-and-rebalance/plan.md`
- 详细实施 plan：`docs/increments/level-select-cascading-redesign/plan.md`
- 任务卡 + DoD：`docs/increments/level-select-cascading-redesign/task-list.md`
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/increments/_template/roadmap.md`
- 现有 `LevelSelect.tsx`：`src/ui/LevelSelect.tsx`
- 现有 `types.ts`：`src/maze/types.ts`
- 现有 `theme.css`：`src/styles/theme.css`
- P2-4a FR-20 (seed localStorage) — 已被本次沿用：`docs/increments/enemies-editor/spec.md`
