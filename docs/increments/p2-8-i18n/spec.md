# P2-8: 第二语言支持（English）— 设计文档 (Spec)

**Slug**: `p2-8-i18n`
**状态**: draft（待用户确认后转 in-review）
**日期**: 2026-06-15
**对应路线图项**: P2-8
**依赖**: 无（独立 UI 改进，仅复用 settingsStore）
**复杂度**: Medium
**相关文件**: `src/i18n/*` (新建), `src/store/settingsStore.ts` (扩字段), `src/ui/Settings.tsx` (新增控件), `src/ui/*.tsx` + `src/ui/components/*.tsx` + `src/ui/editor/*.tsx` (字符串迁移), `src/store/editorStore.ts` (lastError 文案), `src/App.tsx` (错误兜底), `tests/**` (新增 + 迁移)

> 详细 step-by-step + 行号见 `plan.md`。本文档聚焦 **what** 与 **why**。

---

## 1. 概述

maze3D 当前所有面向用户的 UI 字符串硬编码中文（扫了 28 个 tsx/ts 文件、约 338 行包含 CJK 字符；测试侧另 279 行）。这意味着任何非中文用户从一开始就被拒之门外。本次增量引入一个最小化的 i18n 抽象层，把 UI 字符串迁出到独立资源文件，玩家在 `/settings` 实时切换「中文 / English」，切换后整个游戏（菜单 / 设置 / 关卡选择 / 编辑器 / HUD / 暂停 / 通关 / 失败 / 系统提示）立即重新渲染为目标语言。

## 2. 目标 / 非目标

### 2.1 目标

- 提供一个轻量的 `getT(locale)(key, vars?)` 纯函数 + `useT()` React hook
- 把约 200+ 条面向用户的中文字符串迁出到 `src/i18n/resources/{zh,en}.ts`，按 `app.* / settings.* / levels.* / overlays.* / editor.* / common.* / persist.*` 分组
- `useSettingsStore` 新增 `language: 'zh' | 'en'` 字段，持久化到 `maze3d.settings.v1`，沿用 lenient 迁移（旧 record 无字段 = `'zh'`，零破坏）
- Settings 页 `display` 分组新增「语言 / Language」segmented 二态控件（中文 / English）
- 切换后 React 立即重渲染（同步 import，无 async init），Three.js canvas 不卸载
- **翻译 4 个内置关卡的 `name`**：`空庭` → `Empty Court`，`补给线` → `Supply Line`，`哨兵走廊` → `Sentry Corridor`，`试炼场` → `Proving Grounds`；通过 `MazeData.i18n?: { en?: string }` 可选字段承载，缺失时降级到 `name`（spec §5.1）
- 提供 `getDisplayName(maze, locale)` 纯函数；所有 `MazeData.name` 消费者（`LevelSelect.tsx` 卡片标题 + 删除确认 message 等）改走该函数
- 既有测试 100% 仍绿（默认语言 = `'zh'`，旧中文字面量断言继续命中）
- 新增 `tests/component/settings.test.tsx` 切换断言 + `tests/e2e/locale-switch.spec.ts` 端到端验证
- 单元覆盖率 ≥ 80%

### 2.2 非目标

- 不引入第三方 i18n 库（无 i18next / react-intl / FormatJS）
- 不实现 ICU plurals；用简单 `{count}` 插值（两种语言的简单 plura l 都能直接拼出来）
- 不支持第三种语言 / RTL；架构允许未来扩展
- 编辑器关卡元数据表单**不**新增「英文名称」输入框——editor 创建的自定义关卡暂只持 `name`，英文模式下降级显示中文名（这是可接受的退化，未来若用户有需求再扩展表单）；4 个内置关卡在 JSON 里硬写 `i18n.en`
- 不动服务器侧（无服务器）
- 不做运行时语言检测（`navigator.language`）；首次访问默认 `'zh'`，玩家手动切换即生效

## 3. 设计决策

### 3.1 抽象层：自研轻量 hook（不引第三方）

对比 3 种方案后选自研：

| 方案 | 优点 | 缺点 | 选定 |
|---|---|---|---|
| **A. 自研 `getT` + `useT`** | 零依赖；与项目"小依赖、校验在边界"风格一致；同步 import；与 Zustand 模式天然契合 | 需自行实现插值 + missing-key 策略 | ✅ |
| B. i18next + react-i18next | 行业标准；namespace / lazy load / 检测齐备 | ~30KB；async init；与项目极简风格不合 | |
| C. react-intl / FormatJS | ICU MessageFormat 强大 | 重；ICU 语法对 2 种语言过设计 | |

> 项目无 i18n 抽象（已确认 `src/i18n/`、`src/locale/`、`src/translation/` 不存在；`package.json` 无 i18n 依赖）。本方案新建这一层。

### 3.2 状态归属：复用 `settingsStore.language`

- 复用现有持久化通道（`maze3d.settings.v1`），避免新增 localStorage key
- `sanitizeSettings` 对未知 `language` 值 lenient 回退 `'zh'`，与 `enemyAggression` 模式一致（`src/store/settingsStore.ts:39-43`）
- language 是低频切换，**不**为它新增 debounce 分支——`set('language', ...)` 走现有 `saveJSONDebounced` 即可（已是统一入口）
- 默认 `'zh'`——中文用户零感知；英文用户首次切换即生效

### 3.3 缺失 key 策略：`console.warn` + 返回 key 字符串

不抛错、不返回 `"[zh]"` 之类的标签，直接返回 `key`。开发者一眼看到的就是 `"settings.title"` 而不是 `"[zh] settings.title"`，调试效率更高。与 `settingsStore.set` 的 warn-but-accept 模式（`src/store/settingsStore.ts:83-86`）一致。

### 3.4 占位符：`{name}` 简单插值（不带 ICU）

- 资源里：`'用时 {time}'` / `'Time: {time}'`
- 调用：`t('overlay.win.timeUsed', { time: '01:23' })`
- 不支持的占位符（如 `{0}` 数字下标）原样保留 + warn
- 范围与本项目已有的"简单字符串拼接"复杂度匹配；未来如需 ICU，可平滑升级

### 3.5 `editorStore.lastError` 的 i18n 归属：store 不 import i18n

**决策**：保留 `lastError: string` 但写入时由调用方（hook / 组件）传 `t()` 调用结果。Store 内的 `unavailable / too-large / quota / serialization` 默认文案改为由 store 接受一个 `message: string` 参数写入（`editorStore.persistUnavailable(message: string)`），调用方负责 `t('editor.persist.reason.unavailable')` 后传入。**store 不 import i18n**，关注点分离。

### 3.6 LevelSelect 数据数组改造

`LEVEL_SOURCE_OPTIONS` / `MODE_OPTIONS` / `SECTIONS_BY_SOURCE` 等数据数组的 `label` 从字符串改为 `(t) => string` 函数。组件渲染时 `opt.label(t)`。这样数据驱动列表与 i18n 解耦。

### 3.7 测试侧 279 行中文断言的影响

- 默认语言 = `'zh'`，所以 `getByText('设置')` 这类断言继续命中，**绝大多数测试不动**
- 仅当某个测试**必须**在两种语言下都跑时，使用新增的 `renderWithLocale(locale?)` helper（`tests/component/_helpers/renderWithLocale.tsx`）注入 `useSettingsStore.setState({ language })`
- 这是关键决策点——见 §6 风险 1

## 4. 文件清单

| 文件 | 操作 |
|---|---|
| `src/i18n/types.ts` | CREATE |
| `src/i18n/resources/zh.ts` | CREATE |
| `src/i18n/resources/en.ts` | CREATE |
| `src/i18n/index.ts` | CREATE |
| `src/i18n/__tests__/getT.test.ts` | CREATE |
| `src/i18n/__tests__/keysParity.test.ts` | CREATE |
| `src/maze/types.ts` | UPDATE（`MazeData.i18n?: { en?: string }` 可选字段） |
| `src/utils/getDisplayName.ts` | CREATE（纯函数 `getDisplayName(maze, locale)`） |
| `src/utils/__tests__/getDisplayName.test.ts` | CREATE（5 case：zh 命中 / en 命中 / 缺失降级 / 空对象降级 / 未知 locale 降级） |
| `public/levels/level-tiny.json` | UPDATE（新增 `"i18n": { "en": "Empty Court" }`） |
| `public/levels/level-tiny-pickups.json` | UPDATE（`"Supply Line"`） |
| `public/levels/level-tiny-enemy.json` | UPDATE（`"Sentry Corridor"`） |
| `public/levels/level-small.json` | UPDATE（`"Proving Grounds"`） |
| `src/store/settingsStore.ts` | UPDATE（新增 `language` 字段） |
| `src/store/settingsStore.language.test.ts` | CREATE（追加到既有 settingsStore 测试文件） |
| `src/ui/Settings.tsx` | UPDATE（新增 `display` 分组 segmented 控件） |
| `src/ui/App.tsx` | UPDATE（错误兜底 banner） |
| `src/ui/MainMenu.tsx` | UPDATE |
| `src/ui/LevelSelect.tsx` | UPDATE |
| `src/ui/PauseOverlay.tsx` | UPDATE |
| `src/ui/WinOverlay.tsx` | UPDATE |
| `src/ui/GameOverOverlay.tsx` | UPDATE |
| `src/ui/GameCanvas.tsx` | UPDATE（`pointerLockError`） |
| `src/ui/components/ControlHints.tsx` | UPDATE |
| `src/ui/components/EnemyCounter.tsx` | UPDATE |
| `src/ui/editor/EditorTopBar.tsx` | UPDATE |
| `src/ui/editor/EditorPropertiesPanel.tsx` | UPDATE |
| `src/ui/editor/EditorStatusBar.tsx` | UPDATE |
| `src/ui/editor/EditorPage.tsx` | UPDATE（`DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 走 i18n） |
| `src/store/editorStore.ts` | UPDATE（`lastError` 改由调用方传 message；`persist reason` map 改成可注入） |
| `tests/component/_helpers/renderWithLocale.tsx` | CREATE |
| `tests/component/settings.test.tsx` | UPDATE（新增切换断言） |
| `tests/unit/i18n/getT.test.ts` | CREATE |
| `tests/unit/i18n/keysParity.test.ts` | CREATE |
| `tests/e2e/locale-switch.spec.ts` | CREATE |
| `README.md` | UPDATE（第 8 节「设置」加一行；`maze3d.settings.v1` schema 说明） |
| `docs/roadmap.md` | UPDATE（增 P2-8 行；活跃锚点切到 P2-8） |

## 5. 数据 / 类型变更

### 5.1 新增类型

- `src/i18n/types.ts`:
  ```ts
  export type Locale = 'zh' | 'en';
  export type Translations = Readonly<Record<string, string>>;
  export type TFunction = (key: string, vars?: Record<string, string | number>) => string;
  ```

- `src/maze/types.ts` 扩展 `MazeData`：
  ```ts
  export interface MazeData {
    // ...现有字段...
    name: string;                              // 规范中文名（URL/seed 索引也用它，**不**参与 i18n 切换）
    i18n?: { en?: string };                    // P2-8 新增：可选其它 locale 显示名；缺失则降级到 name
  }
  ```

- `src/utils/getDisplayName.ts` 新建：
  ```ts
  export function getDisplayName(maze: MazeData, locale: Locale): string {
    if (locale === 'zh') return maze.name;
    return maze.i18n?.[locale] ?? maze.name;
  }
  ```

### 5.2 新增 / 修改 store 字段

- `settingsStore`:
  - `language: Locale`（默认 `'zh'`）
  - `sanitizeSettings`：未知值 lenient 回退 `'zh'`（与 `enemyAggression` 模式一致）
  - `isValidSetting`：新增 `language` 分支（仅接受 `'zh' | 'en'`）

### 5.3 持久化 schema 演进

- `maze3d.settings.v1` 新增 `language: 'zh' | 'en'`
- **forward-compat**：旧 record 无 `language` 字段 → sanitize 时回退 `'zh'`，零破坏
- **backward-compat**：新 record 用旧版 settingsStore 读取 → 该字段被忽略，无影响

## 6. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 现有测试断言硬编码中文（279 行 / 28 文件），迁移 i18n 时大面积失败 | **高** | 默认 locale=`'zh'`，断言不破；只新增 helper，不改既有断言的语义（§3.7） |
| LevelSelect 的 `LEVEL_SOURCE_OPTIONS`/`MODE_OPTIONS` 是数据数组+JSX混合，需把 label 改成函数 | 中 | 改为 `label: (t: TFunction) => t('levels.source.teaching')`；签名变化测试可能爆，grep 可定位 |
| `LevelSelect` 中 `s === 'teaching' ? '任务简报' : ...` 三元，抽取成 `t(key by s)` 表 | 中 | 用 `Record<SourceKey, string>` 在资源里建表，组件内 `t(table[s])` |
| `editorStore.lastError` 在 store 层产出消息，违反"store 不依赖 i18n" | 中 | §3.5：store 接受 message 参数，调用方传 `t()` 结果（关注点分离） |
| 切换语言时整页 re-render 导致编辑器未保存状态丢失 | 低 | 仅 React 层重渲染，zustand store 不变；编辑器的 `editorStore` 数据完全独立 |
| 关卡 JSON 的 `name`（4 个）是中文 → 英文切换后仍是中文 | **N/A** | **已纳入本增量**（§2.1 目标）：`MazeData.i18n?: { en?: string }` 可选字段 + `getDisplayName(maze, locale)` 工具函数；4 个内置关卡在 JSON 里写 `i18n.en`，消费者统一改走 `getDisplayName`（§5.1） |
| `aria-label` 等无障碍属性仍写死中文 | 中 | Task 5 同步处理所有 `aria-label="中文"` |
| `npm run build` 通过但运行时语言切换瞬间白屏 | 低 | 翻译文件是同步 import，无 async init；切换只触发 React reconcile，不卸载 Three.js canvas |

## 7. 用户澄清记录

已通过 `AskUserQuestion`（口头）确认（2026-06-15）：

1. **`editorStore.lastError` 的 i18n 归属** → ✅ **采用 spec §3.5 方案**（store 接 `t()` 调用结果作为参数，关注点分离；store 不 import i18n）
2. **关卡 JSON `name` 是否在 MVP 内翻译** → ✅ **纳入本增量**：4 个内置关卡写 `i18n.en`，新增 `MazeData.i18n?: { en?: string }` + `getDisplayName(maze, locale)` 工具函数；编辑器创建关卡的 i18n 输入表单本期**不**做（仅给已存在的 4 个内置关卡加 JSON 字段；编辑器创建的无 `i18n` 则降级显示中文）

## 8. 验收

### 8.1 功能验收

- [ ] 增量 spec 中"功能需求"列表全部实现
- [ ] 用户能从 UI 触发该功能端到端走通（点击 → 生效 → 状态正确）
- [ ] 边界情况在 spec 或 plan 中显式列出并被覆盖

### 8.2 引擎 / 架构边界

- [ ] 引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import
- [ ] `editorStore` 不 import `src/i18n`（关注点分离）
- [ ] 新增 Three.js 资源在 `dispose()` 路径中被释放（本增量无新增 3D 资源）

### 8.3 测试

- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 新增的 `getT` 纯函数 / `useT` hook / `settingsStore.language` 字段必须有对应单测
- [ ] 涉及 UI 的改动必须有 RTL 组件测试
- [ ] 涉及端到端流程的改动必须有 Playwright E2E
- [ ] `npm run typecheck` 与 `npm run build` 通过

### 8.4 文档

- [ ] `docs/increments/p2-8-i18n/spec.md` 已写入（本文件）
- [ ] `docs/increments/p2-8-i18n/plan.md` 所有 checkbox 已勾
- [ ] README.md 第 8 节加入「语言」一行 + `maze3d.settings.v1` schema 增字段说明
- [ ] `docs/roadmap.md` P2-8 行存在（实施完成后状态从 `pending` 改为 `done`）

### 8.5 持久化与兼容

- [ ] 不破坏现有 `localStorage` schema（旧 record 无 `language` 字段回退 `'zh'`）
- [ ] 新增设置项使用 `settingsStore` 并在 settings UI 可调
- [ ] 浏览器刷新后状态合理恢复

### 8.6 安全与健壮性

- [ ] 用户输入校验到位（`isValidSetting` 严格 type guard）
- [ ] 错误处理走已有 `PersistResult` 体系
- [ ] 无 console.log / debugger 残留
- [ ] 无硬编码密钥 / 资源 URL

### 8.7 验收清单（grep 命令）

- [ ] `grep -rn "window\.\(confirm\|alert\|prompt\)" src/` → 0 命中（无新增原生对话框）
- [ ] `grep -rn -P '[\x{4e00}-\x{9fff}]' src/` 排除 `src/i18n/resources/zh.ts` + 注释后 → 业务代码 0 命中
- [ ] `grep -rn "aria-label=\"中文" src/` → 0 命中（aria-label 全部走 i18n）

## 9. 参考

- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD 模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/roadmap.md`
- 类似增量：`docs/increments/p2-2-dark-mode-pickups/`（settingsStore 新增字段 + lenient 迁移模式的最佳范例）
- 类似增量：`docs/increments/p2-7-custom-dialog/`（UI 改动总览 + plan 任务编号风格参考）