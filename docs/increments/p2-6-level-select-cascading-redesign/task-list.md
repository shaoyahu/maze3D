# LevelSelect 级联重构 — 任务规划 (Task List)

**Spec**: `docs/increments/level-select-cascading-redesign/spec.md`
**Plan**: `docs/increments/level-select-cascading-redesign/plan.md`
**Roadmap**: `docs/increments/_template/roadmap.md` § LevelSelect Cascading Redesign
**复杂度**: Medium (3–4 天)
**日期**: 2026-06-12
**执行人**: TBD
**代码评审**: TBD
**PR 目标分支**: `main`

---

## 0. TL;DR

把 LevelSelect 从 4 个并列入口（固定 / 随机 / 指定种子 / 我的）+ 多个 start 按钮，重构为「**主 dropdown 选关卡源 + 级联二级控件 + 单一「进入游戏」按钮**」。同时把存活模式相关的存活秒数、敌人数量、渐进生成、渐进上限 4 个设置收进同一个语义区。**只动 UI 层**，游戏运行时 / `gameStore` / `Game` / 敌人逻辑 / 关卡编辑器一律不改。

> 详细 step-by-step + 行号 + 代码片段见 `plan.md`。本文件聚焦 **why**、**who**、**when**、**acceptance**，便于 sprint 排期与 code review。

---

## 1. 目标 / 非目标

### 1.1 目标 (In-scope)

| # | 目标 | 验收信号 |
|---|------|---------|
| G1 | 4 关卡源（教学 / 随机 / 我的 / 指定种子）收为单一主 dropdown | 4 个 `<option data-testid="level-source-{teaching,random,custom,seed}">` 可见 |
| G2 | 主选项变化驱动二级控件条件渲染 | 切到「教学」/「我的」→ `sublevel-select` 渲染；切到「随机」→ 消失；切到「指定种子」→ `seed-input` 渲染 |
| G3 | 4 个独立 start 按钮合并为单一「进入游戏」 | `<Button data-testid="start-button">` 唯一存在 |
| G4 | 存活模式 4 个设置（秒数 / 敌人 / 渐进 / 上限）视觉上成组 | `mode='survive'` 时 4 个 testid 同容器渲染；其他模式隐藏 |
| G5 | 4 个预设 chip（30/60/90/120 秒）点击即同步输入框 | 点 `survive-chip-60` → `survive-seconds-input` value=60 + chip 加 active className |
| G6 | 关键老 testid 全部保留（P2-5 e2e 兼容） | `level-select-root` / `procedural-controls` / `mode-select` / `size-select` / `enemy-count-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section` 扫描全绿 |

### 1.2 非目标 (Out-of-scope)

| 类别 | 内容 | 原因 |
|------|------|------|
| 引擎层 | `gameStore.startLevel` 行为 | 存活模式逻辑已在 P2-5 落地，UI 只是入口 |
| 引擎层 | `Game.ts` 敌人注入 | 同上 |
| 数据层 | `customLevels` localStorage 协议 | 已经是稳定契约 |
| 编辑器 | `EditorMazeProvider` / 编辑器 UI | 独立的 spec 范围 |
| 视觉系统 | 全局主题变量重做 | 复用现有 `--accent` / `--border` / `--bg` |
| i18n | 多语言支持 | 沿用现有中文文案 |
| 可访问性深水区 | 完整 WCAG 2.2 AA 审计 | 本次只加 `aria-invalid` + `aria-label`；完整审计排队 P2-7 |

---

## 2. 阶段划分

```
Sprint 1 (Day 1)        Sprint 2 (Day 1-2)        Sprint 3 (Day 2-3)        Sprint 4 (Day 3-4)
─────────────────       ────────────────────      ────────────────────      ───────────────────
T0  常量扩展            T2  RED 12 case            T3  GREEN 实施           T5  重构清理
T1  chip 样式           T2  适配 custom 测试         T4  适配老测试            T6  完整回归
                                                                       T7  e2e 兼容扫描
                                                                       验收 + 文档收尾
```

每个阶段交付（Definition of Done）：
- **代码**: lint 干净 + tsc 干净
- **测试**: 新增 case 100% 通过，**老 case 0 回归**
- **commit**: conventional commits 格式
- **可视化**: 浏览器或 Storybook 截图留档（存活模式 4 设置区 + chip 选中态）

---

## 3. 详细任务卡

> 每张卡片可作为单独 PR 提交，也可合并提交。建议 T2-T3 拆 2 个 PR（先 RED 后 GREEN），便于 code review 聚焦。

### T0 · 类型常量扩展  *(0.5h, owner: dev-A)*

**前置依赖**: 无

**交付物**:
- `src/maze/types.ts` 新增 4 个常量：
  ```ts
  export const SURVIVE_SECONDS_MIN = 10;
  export const SURVIVE_SECONDS_MAX = 600;
  export const SPAWN_PROGRESSIVE_MAX_DEFAULT = 10;
  export const SPAWN_PROGRESSIVE_MAX_MIN = 1;
  ```
- 命名风格沿用同文件 `ENEMY_COUNT_MIN/MAX/DEFAULT` (types.ts:110-112)

**验收**:
- [ ] `npx tsc --noEmit` 通过
- [ ] 4 个常量可在 LevelSelect.tsx 导入

**不写单测**: 数值类常量由 T2 case 8（input 越界 clamp）隐式覆盖

---

### T1 · theme.css chip 样式  *(0.5h, owner: dev-A)*

**前置依赖**: 无（与 T0 并行）

**交付物** (`src/styles/theme.css`):
```css
.survive-chip {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out;
}
.survive-chip--active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
```

**验收**:
- [ ] 浅色 + 深色主题下选中态对比度 >= 4.5:1（WCAG AA 正文）
- [ ] transition 150ms 与 `.level-select-select` 视觉节奏一致

---

### T2 · 写测试 12 case (RED 优先)  *(2h, owner: dev-B)*

**前置依赖**: T0 完成（chip 数值需要 `SURVIVE_SECONDS_MIN/MAX`）

**交付物** (`tests/component/levelSelect.uiRevamp.test.tsx`, 替换 P2-5 9 case):

| # | Case 描述 | 关键断言 |
|---|-----------|---------|
| 1 | 主 dropdown 4 选项各自 testid | `getByTestId('level-source-teaching')` 等 4 个 |
| 2 | 默认「教学」+ `sublevel-select` 渲染 | `available=[]` 时 `sublevel-select` disabled |
| 3 | 切到「随机」→ mode+size dropdown 出现 | `sublevel-select` query 返回 null |
| 4 | 切到「我的」→ `sublevel-select` 显示 customLevels | 含 1 个 `sublevel-option-{id}` |
| 5 | 切到「指定种子」→ `seed-input` 渲染 + `reuse-last-seed` 可见 | 两者都在 DOM |
| 6 | mode='survive' → 4 个设置（input + 4 chip + checkbox + max-input） | 6 个 testid 全在 |
| 7 | 点 `survive-chip-60` → input value=60 + chip 激活 | input value + className 含 `survive-chip--active` |
| 8 | 越界 clamp + `aria-invalid` | `aria-invalid="true"` + 实际值在 [10, 600] |
| 9 | 渐进 checkbox 取消 → `progressive-max-input` 消失或 disabled | query 不到或属性 disabled |
| 10 | `start-button` 点击 → `onPick` 调一次 + options 字段正确 | spy 收到 `(id, { mode, size, seed, surviveSeconds, enemyCount, progressive })` |
| 11 | validation 失败 → start-button disabled + onPick 未调 | 教学+available=[]、指定种子+seed 非 16hex |
| 12 | 关键老 testid 兼容 | `level-select-root` / `procedural-controls` / `mode-select` / `enemy-count-select` / `size-select` / `progressive-spawn` / `custom-levels-group` / `specified-seed-section` 全部存在 |

**断言风格**: 沿用 `levelSelect.uiRevamp.test.tsx:36-37` 的 `tagName` + `within(grid)` 模式

**验收**:
- [ ] `npx vitest run tests/component/levelSelect.uiRevamp.test.tsx` **12 failed** (RED)
- [ ] commit message: `test(level-select): RED 12 case for cascading redesign`
- [ ] **不**实施任何生产代码（这一步只写测试）

---

### T3 · LevelSelect.tsx 实施 (GREEN)  *(3h, owner: dev-A)*

**前置依赖**: T1 + T2 完成

**交付物** (`src/ui/LevelSelect.tsx` 重写):

| 步骤 | 操作 | 关键点 |
|------|------|--------|
| 1 | 引入 `levelSource: 'teaching' \| 'random' \| 'custom' \| 'seed'` state | 替代 P2-5 的 4 个独立区块 |
| 2 | 引入 `sublevelId: string \| null` state | 跟踪二级选择 |
| 3 | 提取 `validateSelection(): { valid, id, options } \| null` 纯函数 | 供 start-button `disabled` + onClick 共用 |
| 4 | 单一 `<Button data-testid="start-button">进入游戏</Button>` 固定右下 | `hoverStyle="lift"` (主操作) |
| 5 | chip 用 `<button type="button" data-testid="survive-chip-{n}">` | 选中态加 `survive-chip--active` |
| 6 | `progressive-max-input` 仅在 `progressive === true` 时渲染 | 取消时整段消失 |
| 7 | seed-input 失焦时 strip 空白 + 验证 16 hex | 沿用 P2-5 `setSeedError` 模式 |
| 8 | 保留所有 P2-5 老 testid 容器元素 | 可空 children 占位 |

**命名约定**:
```ts
const LEVEL_SOURCE_OPTIONS: ReadonlyArray<{ value, label, testId }> = [
  { value: 'teaching', label: '教学关卡', testId: 'level-source-teaching' },
  { value: 'random',   label: '随机关卡', testId: 'level-source-random' },
  { value: 'custom',   label: '我的关卡', testId: 'level-source-custom' },
  { value: 'seed',     label: '指定种子', testId: 'level-source-seed' },
];
```

**验收**:
- [ ] `npx vitest run tests/component/levelSelect` **全部通过** (GREEN)
- [ ] `npx tsc --noEmit` 干净
- [ ] 浏览器手动验证 4 个 mode 切换、chip 选中、validation 错误提示
- [ ] commit message: `feat(level-select): cascading 4-source dropdown with single start button`

---

### T4 · levelSelect.custom.test.tsx 适配  *(1h, owner: dev-B)*

**前置依赖**: T3 完成

**问题**: 老测试依赖「直接点固定关卡 Button」的路径，新设计要求「主 dropdown=我的 → sublevel dropdown 选 → start」

**交付物** (`tests/component/levelSelect.custom.test.tsx`):

- 把 6 case 的固定关卡入口改为级联路径
- 复用 T2 写测试时提取的 helper（如果抽了 `renderWithSource(source, ...)` 之类）

**验收**:
- [ ] `npx vitest run tests/component/levelSelect.custom.test.tsx` 6 case 全绿
- [ ] 0 老 case 删除（全部映射到新路径或加 skip+reason）

---

### T5 · 重构清理  *(1h, owner: dev-A)*

**前置依赖**: T3 + T4 绿

**检查项**:
- [ ] 重复的 inline style 块抽到 `theme.css` 或组件内 const
- [ ] 抽常量：`PROGRESSIVE_PROMPT_INTERVAL = 15` 沿用 `SPAWN_SCHEDULE_DEFAULT.intervalSec` (types.ts:119)
- [ ] 删未用 import（如 `Button` 仍需确认；`algorithmForMode` 视情况）
- [ ] `validateSelection()` 是否能进一步纯化（无副作用 / 引用透明）
- [ ] `mode === 'survive'` 分支长度，必要时抽 `<SurviveSettingsPanel>` 子组件

**验收**:
- [ ] `npx tsc --noEmit` 仍干净
- [ ] 改动 commit message: `refactor(level-select): extract SurviveSettings + dedupe styles`

---

### T6 · 完整回归  *(0.5h, owner: dev-A + dev-B 双方确认)*

**前置依赖**: T5 完成

**验证命令（全部必须绿）**:
```bash
npx tsc --noEmit
npx vitest run
npx vite build
```

**验收**:
- [ ] 三项 0 error 0 warning（warning 包括 vitest 的 "test not found" / vite 的 "bundle > 500kb" 之类）
- [ ] 单元覆盖率 ≥ 80%（沿用 P2-5 基线）

---

### T7 · e2e 兼容扫描  *(1h, owner: dev-B)*

**前置依赖**: T6 绿

**已知风险**: 老 e2e 用了「指定种子 进阶 toggle」路径

**动作**:
- [ ] 跑 `npx playwright test` 全套
- [ ] 任何 testid 断裂按新路径修复，**禁止** 回退 UI 设计
- [ ] 失败 e2e 标 `test.skip()` + JIRA-style reason（"老 testid 弃用，等 P2-7 重写"），不允许静默删除

**验收**:
- [ ] e2e 全绿（或只剩显式 skip + reason）
- [ ] `tests/e2e/` 新增 1 个 `level-select-cascading.spec.ts`，覆盖主 dropdown 4 项切换（防止以后再回归）

---

## 4. 依赖图

```
T0 (常量) ──────────────┐
                         ├─→ T2 (RED) ──→ T3 (GREEN) ──→ T4 ──→ T5 ──→ T6 ──→ T7
T1 (chip CSS) ───────────┘                                              ↑
                                                                     验收
```

- T0 + T1 可并行
- T2 依赖 T0（数值常量），**不**依赖 T1（CSS 不影响 testid 断言）
- T3 依赖 T1 + T2
- T4-T7 严格串行
- 关键路径：T0 → T2 → T3 → T6 → T7（~5.5h 净工作量 + 1h 缓冲 = 6.5h 实际 = 1 工作日）

---

## 5. 风险登记册

> 详细风险见 `plan.md` § 风险。本表只列**缓解动作**有变化的项 + 新增项。

| ID | 风险 | 可能性 | 影响 | 缓解动作 | Owner |
|----|------|--------|------|---------|-------|
| R1 | 12 case RED 时漏写一个，GREEN 阶段才发现 | 中 | 返工 | T2 完成后 dev-B 跑一遍 + dev-A code review T2 commit 之前不开始 T3 | dev-B |
| R2 | 老 e2e 用了「指定种子 进阶 toggle」路径 | 中 | e2e 红 | T7 单独留时间，**禁止**在 T3 回退 UI | dev-B |
| R3 | 关键老 testid 移除导致 P2-5 e2e 雪崩 | 高 | 大面积红 | T2 case 12 显式断言 + 实施时保留容器元素（可空 children）| dev-A |
| R4 | `validateSelection()` 纯化不彻底，触发副作用导致 T2 case 10 误判 | 低 | 测试假阳/假阴 | T3 第 3 步单独 commit 方便 review 隔离 | dev-A |
| R5 | chip 选中态对比度不达 WCAG AA | 中 | 视觉验收打回 | T1 写完后跑 `axe-core` 自动扫描 | dev-A |
| **R6** | **新增**: start-button 缺键盘可达性（Enter 触发） | 中 | a11y | 实施时 `type="button"` + 自然 `<button>` 元素（不用 div）| dev-A |
| **R7** | **新增**: 用户反复点 start-button 触发多次 onPick | 中 | 状态错乱 | 实施时 start-button `disabled={!validating || loading}` 或 onClick 内 `if (disabled) return` | dev-A |
| **R8** | **新增**: P2-5 视觉塌缩测试用 maxWidth 720px，新 chip 容器在 480px 横屏溢出 | 低 | 移动端体验 | T6 后 dev-A 在 360px / 480px / 720px 各截 1 张图归档 | dev-A |

---

## 6. 验收门槛 (Definition of Done)

整个增量完成必须**全部**满足：

- [ ] T0–T7 8 张任务卡勾选完成
- [ ] 验证命令 4 项全绿：`tsc` / `vitest` / `vite build` / `playwright`
- [ ] 测试统计:
  - T2 新增 12 case 全绿
  - T4 6 case 适配全绿
  - 老 case **0 回归**（`git diff main -- tests/` 扫描）
- [ ] 关键老 testid 全部存在（自动化脚本扫一遍；R3 防线）
- [ ] 视觉: 360 / 480 / 720 / 1280px 各 1 张截图，存在 `docs/increments/level-select-cascading-redesign/screenshots/` （R8 防线）
- [ ] PR 描述含：spec 链接 / 任务勾选截图 / 验证日志 / 风险缓解确认
- [ ] Code review 至少 1 人 LGTM（推荐 dev-B review T3，dev-A review T2）
- [ ] `docs/increments/level-select-cascading-redesign/review.md` 写完（事后回顾）

---

## 7. 沟通 / Checkpoint

| Checkpoint | 时间 | 内容 | 参与者 |
|------------|------|------|--------|
| 启动会 | Day 1 上午 | 过 spec + plan + 任务卡，认领 owner | dev-A, dev-B |
| T2 RED 完成 | Day 1 下午 | 12 case 全 RED 截图，确认无遗漏 | dev-B |
| T3 GREEN 第一个可运行版本 | Day 2 上午 | 浏览器手动验证 + 4 mode 切换录屏 | dev-A, dev-B |
| T6 全套绿 | Day 3 中午 | 跑完整 4 项验证命令 | dev-A, dev-B |
| Code review | Day 3 下午 | PR 提交 + reviewer 分配 | dev-B review dev-A |
| 合并 + 收尾 | Day 4 | 合并到 main，写 review.md | dev-A |

---

## 8. 文档/工件

| 工件 | 路径 | 状态 |
|------|------|------|
| Spec | `docs/increments/level-select-cascading-redesign/spec.md` | ✅ done |
| Plan | `docs/increments/level-select-cascading-redesign/plan.md` | ✅ done |
| **Task List (本文件)** | `docs/increments/level-select-cascading-redesign/task-list.md` | ✅ done |
| 截图 | `docs/increments/level-select-cascading-redesign/screenshots/` | ⏳ T6 后补 |
| Review | `docs/increments/level-select-cascading-redesign/review.md` | ⏳ 收尾时写 |
| Roadmap 更新 | `docs/increments/_template/roadmap.md` § LevelSelect Cascading Redesign 行 | ⏳ 收尾时改 |

---

## 9. 执行日志（实施时填写）

### 实际开始日期
YYYY-MM-DD

### 实际完成日期
YYYY-MM-DD

### 实际工时（与计划对比）
| 任务 | 计划 | 实际 | 偏差原因 |
|------|------|------|---------|
| T0   | 0.5h |  |  |
| T1   | 0.5h |  |  |
| T2   | 2h   |  |  |
| T3   | 3h   |  |  |
| T4   | 1h   |  |  |
| T5   | 1h   |  |  |
| T6   | 0.5h |  |  |
| T7   | 1h   |  |  |

### 偏差记录
- spec 中计划 ..., 实际做了 ..., 原因 ...

### 测试覆盖
- 单元覆盖率: ...%
- 新增 case: ...
- 适配 case: ...
- 0 回归 case: ...

### Reviewer 反馈摘要
- LGTM / Changes Requested / Comments

### 给后续增量的建议
- ...
