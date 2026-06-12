# LevelSelect 级联重构 — 实施计划 (Plan)

**前置增量**: `docs/increments/p2-5-ui-and-rebalance/` (2026-06-11 done)
**复杂度**: Medium
**日期**: 2026-06-12

> 本 plan 是 P2-5 UI 改版后用户提出的第二版 LevelSelect 设计:把 4 个并列入口(固定关卡 / 随机关卡 / 指定种子关卡 / 我的关卡)合并为「主下拉 + 级联二级控件 + 单一进入游戏按钮」,并把存活模式相关设置统一收纳。
>
> **范围声明**:本次只动 `LevelSelect.tsx` + `theme.css`(仅 chip 样式)+ `types.ts`(新增几个常量)+ 2 个组件测试文件。游戏运行时、`gameStore`、`Game`、敌人逻辑、关卡编辑器一律不动。
>
> **设计基线**:
> - 主 dropdown 4 选项 = 教学 / 随机 / 我的 / 指定种子
> - 二级控件按主选项条件渲染
> - 单一「进入游戏」按钮,统一入口(替代原 4 个独立 start 按钮)
> - 存活模式专用设置区(存活秒数 + 敌人数量 + 渐进生成 + 渐进上限)
>
> **用户澄清记录**(已通过 AskUserQuestion 确认):
> 1. 「教学 / 我的 怎么挑具体关卡」→ **级联二级下拉框**
> 2. 「指定种子按钮点击后 seed 输入框怎么呈现」→ **下拉框增加「指定种子」选项**(语义并入主 dropdown 第 4 项)
> 3. 「存活秒数怎么同时支持预置 + 自由输入」→ **数字输入 + 预置 chip 按钮**

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | 新增 `SURVIVE_SECONDS_MIN/MAX` 常量、新增 `SPAWN_PROGRESSIVE_MAX_DEFAULT/MIN` 常量 |
| `src/ui/LevelSelect.tsx` | UPDATE | 重构为级联结构:4 选项主 dropdown + 条件二级控件 + 单一「进入游戏」按钮 + 存活设置区(chip + input + 渐进上限) |
| `src/styles/theme.css` | UPDATE | 新增 `.survive-chip` + `.survive-chip--active` 样式(选中态用 `--accent` 背景 + `--bg` 前景) |
| `tests/component/levelSelect.uiRevamp.test.tsx` | UPDATE | 替换/新增 12 case 覆盖新结构(见「任务清单 · Task 2」) |
| `tests/component/levelSelect.custom.test.tsx` | UPDATE | 适配新布局(关卡=我的 时 sublevel dropdown 路径) |

## testid 清单

**保留**(兼容老 e2e 与组件测试):`level-select-root`, `level-select-centered-container`, `procedural-controls`, `procedural-grid`, `mode-select`, `mode-{value}`, `survive-seconds-select`(语义改为「chip 容器」), `enemy-count-select`, `enemy-count-{n}`, `progressive-spawn`, `size-select`, `advanced-toggle`(语义改为「主关卡 dropdown」,值为 4 项), `reuse-last-seed`, `custom-level-{id}`, `delete-custom-{id}`, `custom-levels-group`, `specified-seed-section`(保留以满足 P2-5 兼容断言)

**新增**:
- `level-source-select` — 4 选项主下拉
- `level-source-{teaching,random,custom,seed}` — 各 `<option>` testid
- `sublevel-select` — 二级 dropdown(教学 / 我的 模式)
- `sublevel-option-{id}` — 二级 `<option>` testid
- `seed-input` — 指定种子 时的输入框
- `survive-seconds-input` — 存活秒数自由输入框
- `survive-chip-{n}` — 4 个预设 chip(30/60/90/120)
- `progressive-max-input` — 渐进上限 input
- `start-button` — 右下角「进入游戏」

## 任务清单

### Task 0: 类型常量扩展
- [ ] **Action**: 在 `src/maze/types.ts` 导出:
  - `SURVIVE_SECONDS_MIN = 10` / `SURVIVE_SECONDS_MAX = 600`
  - `SPAWN_PROGRESSIVE_MAX_DEFAULT = 10` / `SPAWN_PROGRESSIVE_MAX_MIN = 1`
- [ ] **Mirror**: 沿用文件内已有 `ENEMY_COUNT_MIN/MAX/DEFAULT` 命名模式(`types.ts:13-15`)
- [ ] **Test**: 不单独加单测,由 Task 2 的输入 clamp 用例覆盖
- [ ] **Validate**: `npx tsc --noEmit`

### Task 1: theme.css chip 样式
- [ ] **Action**: 新增 `.survive-chip` + `.survive-chip--active`:
  - 默认: `padding: 4px 10px`、`border: 1px solid var(--border)`、`border-radius: 4px`、`background: transparent`、`color: var(--fg)`、`font-size: 13px`、`cursor: pointer`
  - 选中: `background: var(--accent)`、`color: var(--bg)`、`border-color: var(--accent)`
  - transition 150ms ease-out
- [ ] **Mirror**: 沿用 `.level-select-select`(theme.css:68-84)的过渡时长与色板用法
- [ ] **Validate**: 视觉检查(浏览器或 Storybook)

### Task 2: LevelSelect.tsx 重构 — TDD(RED 优先)
- [ ] **Action**: 先在 `tests/component/levelSelect.uiRevamp.test.tsx` 写以下 12 case,确认全部失败(RED):
  1. 主 dropdown 含 4 选项,各自 `level-source-{teaching,random,custom,seed}` testid
  2. 默认选「教学」时:`sublevel-select` 渲染 + `available` 列表(空时 disabled)
  3. 切到「随机」:mode+size dropdown 出现,`sublevel-select` 消失
  4. 切到「我的」:`sublevel-select` 渲染 + customLevels 列表
  5. 切到「指定种子」:`seed-input` 渲染,`reuse-last-seed` 可用
  6. mode='survive' 时:出现 `survive-seconds-input` + 4 chip + `progressive-spawn` + `progressive-max-input`
  7. chip 点击:同步到 `survive-seconds-input` 值 + active className
  8. input 越界(`<10` 或 `>600`):clamp 到合法范围 + `aria-invalid="true"`
  9. 渐进 checkbox 取消:`progressive-max-input` 消失或 disabled
  10. `start-button` 点击:调用 `onPick(id, options?)`,options 含正确 mode / size / seed / surviveSeconds / enemyCount / progressive
  11. validation 失败(选教学但 available=[],或选指定种子但 seed 不合法):`start-button` disabled,onPick 不被调
  12. 老 testid 兼容断言:`level-select-root` / `procedural-controls` / `mode-select` / `enemy-count-select` / `size-select` 仍存在(扫描 P2-5 兼容 case 不回归)
- [ ] **Mirror**: 沿用现有测试断言风格(行 36-37、51-58、73-77、85-92 等)
- [ ] **Test**: 12 case 全部失败(RED)
- [ ] **Validate**: `npx vitest run tests/component/levelSelect.uiRevamp.test.tsx` 显示 12 failed

### Task 3: LevelSelect.tsx 实现 — 让测试转绿(GREEN)
- [ ] **Action**: 重写 `LevelSelect.tsx`:
  1. 引入 `levelSource: 'teaching' | 'random' | 'custom' | 'seed'` state(替代原 4 个独立区块)
  2. 引入 `sublevelId: string | null` state 跟踪二级选择
  3. 提取纯函数 `validateSelection()`:`{ valid, id, options } | null`,供 `start-button` 决定 disabled
  4. 单一 `<Button data-testid="start-button" onClick={...}>进入游戏</Button>`,固定在右下
  5. chip 用 `<button type="button" data-testid="survive-chip-{n}" onClick={...}>` + 选中态 className
  6. `progressive-max-input` 仅在 `progressive === true` 时渲染
  7. seed-input 失焦时 strip 空白 + 验证格式
  8. 保留所有 P2-5 老 testid 的容器元素(可空 children)
- [ ] **Mirror**:
  - 命名:沿用 `MODE_OPTIONS` 数组 `{ value, label, testId }` 结构(行 25-29)
  - 错误:沿用 `setSeedError(string)` + JSX 显示(行 124-131)
  - 持久化:沿用 `isStorageAvailable()` 守卫(行 92-96, 133-135)
- [ ] **Validate**: `npx vitest run tests/component/levelSelect` 全部通过(GREEN)

### Task 4: levelSelect.custom.test.tsx 适配
- [ ] **Action**: 把依赖固定关卡列表的旧断言,改为「主 dropdown=我的 → 二级 dropdown 选 custom level → 进入游戏」的新路径
- [ ] **Test**: 6 case 全部通过
- [ ] **Validate**: `npx vitest run tests/component/levelSelect.custom.test.tsx`

### Task 5: 重构 + 重复利用检查
- [ ] **Action**: 检查 `LevelSelect.tsx` 内重复的样式块、抽离常量(如 `PROGRESSIVE_PROMPT_INTERVAL = 15` 沿用 `SPAWN_SCHEDULE_DEFAULT.intervalSec`)、清理未用 import
- [ ] **Mirror**: 沿用 P2-5 重构后留下的「小函数 + 纯函数」风格
- [ ] **Validate**: `npx tsc --noEmit` 仍干净

### Task 6: 回归
- [ ] **Action**: 跑完整套件
- [ ] **Validate**:
  ```bash
  npx tsc --noEmit
  npx vitest run
  npx vite build
  ```
  三项全绿

### Task 7: e2e 兼容扫描
- [ ] **Action**: 跑 e2e 套件,标记任何 testid 断裂;老 e2e 用了已删除的「指定种子 进阶 toggle」路径则按需补
- [ ] **Validate**: `npx playwright test` 全绿(或标记 known-good skips)

## 验证

```bash
# 增量完成判定 — 必须全部通过
npx tsc --noEmit
npx vitest run
npx vite build
npx playwright test
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 老 e2e 用了已删除的「指定种子 进阶 toggle」路径,点击开始后页面无 seed 输入框 | 中 | `advanced-toggle` testid 保留,语义改为「主关卡 dropdown」;指定种子的 seed 输入框改挂 `seed-input` testid。e2e 单独按新路径修复 |
| `available=[]` 时关卡=教学无法选,玩家卡死 | 中 | 教学选项 `disabled` + 灰显 + 「暂无固定关卡」提示;`start-button` 在 sublevel 缺失时 disabled |
| `customLevels={}` 时关卡=我的无法选 | 中 | 同上,disabled + 提示 |
| 存活秒数自由输入越界(`<10` 或 `>600`) | 中 | `onChange` 时 clamp 到 `[SURVIVE_SECONDS_MIN, SURVIVE_SECONDS_MAX]`,加 `aria-invalid` |
| 渐进上限 = 0 时整条逻辑无意义 | 低 | `progressive` 取消时 `progressive-max-input` 消失;勾上时强制 `>= SPAWN_PROGRESSIVE_MAX_MIN` |
| 单一「进入游戏」按钮遗漏校验(选了 mode 但 size 未选) | 中 | 提取 `validateSelection()` 纯函数,先 Task 2 测试覆盖,再串到 onClick |
| 老 testid 移除导致 P2-5 兼容 case 雪崩 | 高 | Task 2 第 12 case 显式断言关键老 testid 仍在;实施时保留容器元素 |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过(`tsc` / `vitest` / `vite build` / `playwright`)
- [ ] 12 case 新测试 + 6 case 适配测试 全绿
- [ ] 关键老 testid(`level-select-root` / `mode-select` / `size-select` / `enemy-count-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section`)全部保留
- [ ] 视觉:主 dropdown / 二级 dropdown / chip / 「进入游戏」按钮 在 720px 以下都能正常塌缩

## 模式对齐(从现有代码)

| 类别 | 源 | 模式 |
|---|---|---|
| 命名 | `LevelSelect.tsx:25-29` `MODE_OPTIONS` | 新 `LEVEL_SOURCE_OPTIONS` 同样 `{ value, label, testId }` 结构 |
| 错误 | `LevelSelect.tsx:124-131` `setSeedError` | validation 失败沿用同模式,加 `aria-invalid` 提示 |
| 持久化 | `LevelSelect.tsx:92-96, 133-135` | 读写都 `isStorageAvailable()` 守卫 |
| 样式 | `theme.css:68-84` `.level-select-select` | 新 chip 沿用 `--accent` / `--border` / 150ms transition |
| 测试 | `levelSelect.uiRevamp.test.tsx:36-37, 51-58` | grid/select 测试用 `tagName` + `within()` 断言,继续沿用 |
| 按钮 | `Button.tsx`(P2-5 hoverStyle='lift'/'glow'/'fade') | 「进入游戏」用 `hoverStyle="lift"`(主操作)+ `width` 固定宽度 |

---

## 执行日志(实施时填写)

### 实施日期
YYYY-MM-DD

### 实际改动文件
(与上面「文件改动总览」对照,列出真实改动的文件)

### 遇到的偏差
- spec 中计划 ...,实际做了 ...,原因 ...

### 测试覆盖
- 单元覆盖率:...%
- 新增 / 修改测试:...

### 备注
(任何给后续增量有参考价值的发现)
